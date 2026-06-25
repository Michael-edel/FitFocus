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
  try {
    const arr = JSON.parse(String(value));
    if (!Array.isArray(arr)) return [];
    return arr
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const raw = item as Partial<SupportAttachmentRecord>;
        const name = String(raw.name || "").trim() || "attachment";
        const mime = String(raw.mime || "").trim() || "application/octet-stream";
        const kind = raw.kind === "photo" || raw.kind === "video" || raw.kind === "voice" || raw.kind === "file"
          ? raw.kind
          : kindFromMime(mime);
        const size = Number(raw.size || 0);
        const record: SupportAttachmentRecord = { name, mime, size: Number.isFinite(size) && size > 0 ? size : 0, kind };
        if (typeof raw.data_url === "string" && raw.data_url.trim()) record.data_url = raw.data_url.trim();
        if (typeof raw.storage_key === "string" && raw.storage_key.trim()) record.storage_key = raw.storage_key.trim();
        return record;
      })
      .filter((item): item is SupportAttachmentRecord => Boolean(item));
  } catch {
    return [];
  }
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
    throw new Error(`FILE_TOO_LARGE:${file.name}`);
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const mime = file.type || "application/octet-stream";
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
      // Fallback to inline storage below.
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
