import { asFiniteNumber, asOptionalString, asString, isJsonObject, safeJsonParse } from "./json";

export type SupportAttachmentKind = "photo" | "video" | "voice" | "file";

export type SupportAttachmentObject = {
  body: ReadableStream<Uint8Array>;
  httpEtag?: string;
  writeHttpMetadata?(headers: Headers): void;
};

export type SupportAttachmentBucket = {
  put(
    key: string,
    value: BodyInit,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    }
  ): Promise<unknown>;
  get(key: string): Promise<SupportAttachmentObject | null>;
  delete?(key: string | string[]): Promise<unknown>;
};

export type SupportAttachmentRecord = {
  name: string;
  mime: string;
  size: number;
  kind: SupportAttachmentKind;
  data_url?: string;
  storage_key?: string;
};

const INLINE_ATTACHMENT_LIMIT = 2 * 1024 * 1024;

const SAFE_INLINE_MIME_TYPES = new Set([
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "text/plain",
]);

export class SupportAttachmentTooLargeError extends Error {
  constructor() {
    super("SUPPORT_ATTACHMENT_TOO_LARGE");
    this.name = "SupportAttachmentTooLargeError";
  }
}

export function normalizeAttachmentMime(value: unknown): string {
  const mime = String(value || "").trim().toLowerCase();
  return mime && /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(mime)
    ? mime
    : "application/octet-stream";
}

export function isSafeInlineAttachmentMime(mime: string): boolean {
  return SAFE_INLINE_MIME_TYPES.has(normalizeAttachmentMime(mime));
}

function isSupportAttachmentKind(value: unknown): value is SupportAttachmentKind {
  return value === "photo" || value === "video" || value === "voice" || value === "file";
}

export function kindFromMime(mime: string): SupportAttachmentKind {
  if (mime.startsWith("image/")) return "photo";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "voice";
  return "file";
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function parseDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1], bytes: base64ToBytes(match[2]) };
}

export function sanitizeFileName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, "_").replace(/[^\w.\-]+/g, "_");
  return trimmed.slice(0, 80) || "attachment";
}

export function buildAttachmentRoute(ticketId: string, index: number, messageId?: string) {
  const messageParam = messageId ? `&messageId=${encodeURIComponent(messageId)}` : "";
  return `/api/support/attachment?id=${encodeURIComponent(ticketId)}${messageParam}&index=${index}`;
}

export function parseAttachmentsJson(value: unknown): SupportAttachmentRecord[] {
  if (!value) return [];
  const parsed = safeJsonParse(String(value));
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => {
      if (!isJsonObject(item)) return null;
      const name = asString(item.name, "attachment");
      const mime = normalizeAttachmentMime(item.mime);
      const kind = isSupportAttachmentKind(item.kind) ? item.kind : kindFromMime(mime);
      const size = asFiniteNumber(item.size);
      const record: SupportAttachmentRecord = {
        name,
        mime,
        size: size && size > 0 ? size : 0,
        kind,
      };
      const dataUrl = asOptionalString(item.data_url);
      const storageKey = asOptionalString(item.storage_key);
      if (dataUrl) record.data_url = dataUrl;
      if (storageKey) record.storage_key = storageKey;
      return record;
    })
    .filter((item): item is SupportAttachmentRecord => Boolean(item));
}

export async function fileToAttachment(
  file: File,
  options: {
    bucket?: SupportAttachmentBucket;
    ticketId?: string;
    messageId?: string;
    index?: number;
  } = {}
): Promise<SupportAttachmentRecord> {
  if (file.size > INLINE_ATTACHMENT_LIMIT && !options.bucket) {
    throw new SupportAttachmentTooLargeError();
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const mime = normalizeAttachmentMime(file.type);
  const kind = kindFromMime(mime);
  const baseName = sanitizeFileName(file.name || "attachment");
  const name = file.name || "attachment";

  if (options.bucket && options.ticketId && typeof options.index === "number") {
    const storageKeyPrefix = options.messageId
      ? `support/${options.ticketId}/messages/${options.messageId}`
      : `support/${options.ticketId}`;
    const storageKey = `${storageKeyPrefix}/${String(options.index).padStart(2, "0")}-${baseName}`;
    try {
      const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      await options.bucket.put(storageKey, body, {
        httpMetadata: { contentType: mime },
        customMetadata: {
          name,
          kind,
          size: String(file.size),
          ticketId: options.ticketId,
          ...(options.messageId ? { messageId: options.messageId } : {}),
          index: String(options.index),
        },
      });
      return {
        name,
        mime,
        size: file.size,
        kind,
        storage_key: storageKey,
      };
    } catch {
      // Inline D1 storage is limited; do not turn an R2 outage into a huge row.
      if (file.size > INLINE_ATTACHMENT_LIMIT) {
        throw new SupportAttachmentTooLargeError();
      }
    }
  }

  return {
    name,
    mime,
    size: file.size,
    kind,
    data_url: `data:${mime};base64,${bytesToBase64(bytes)}`,
  };
}

export function attachmentResponseUrl(ticketId: string, index: number, messageId?: string) {
  return buildAttachmentRoute(ticketId, index, messageId);
}

export function inlineAttachmentBytes(attachment: SupportAttachmentRecord) {
  if (!attachment.data_url) return null;
  const parsed = parseDataUrl(attachment.data_url);
  if (!parsed) return null;
  return parsed;
}
