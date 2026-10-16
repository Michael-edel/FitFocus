import { json, requireUser } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireRole } from "../_lib/rbac";
import { requireAdminRequest } from "../_lib/admin_guard";
import {
  type SupportAttachmentBucket,
  isSafeInlineAttachmentMime,
  inlineAttachmentBytes,
  normalizeAttachmentMime,
  type SupportAttachmentRecord,
} from "../_lib/support_attachments";
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';
import { readSupportAttachmentRecord } from '../_lib/support_attachment_read';

type Env = { DB: D1Database; AUTH_JWT_SECRET: string; SUPPORT_ATTACHMENTS?: SupportAttachmentBucket };
function safeFileName(name: string) {
  return name.replace(/["\\\r\n]/g, "_").slice(0, 120) || "attachment";
}

function attachmentHeaders(attachment: SupportAttachmentRecord, fileName: string) {
  const headers = new Headers();
  const mime = normalizeAttachmentMime(attachment.mime);
  const inline = isSafeInlineAttachmentMime(mime);
  headers.set("content-type", inline ? mime : "application/octet-stream");
  headers.set("content-disposition", `${inline ? "inline" : "attachment"}; filename="${safeFileName(fileName)}"`);
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-security-policy", "default-src 'none'; sandbox");
  return headers;
}

const handleSupportAttachmentGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const db = requireDB(env);
  let isAdmin = false;
  try { requireRole(user, "admin"); isAdmin = true; } catch {}
  if (isAdmin) {
    await requireAdminRequest(user, request, db);
  }

  const url = new URL(request.url);
  const ticketId = String(url.searchParams.get("id") || "").trim();
  const messageId = String(url.searchParams.get("messageId") || "").trim();
  const index = Number(url.searchParams.get("index") || "-1");
  if (!ticketId || !Number.isInteger(index) || index < 0) {
    return json({ error: "BAD_REQUEST", message: "id and index are required" }, 400);
  }

  const result = await readSupportAttachmentRecord(db, {
    userId: user.sub,
    isAdmin,
    ticketId,
    messageId: messageId || undefined,
    index,
  });
  if (result.kind === "ticket-not-found") return json({ error: "NOT_FOUND", message: "ticket not found" }, 404);
  if (result.kind === "forbidden") return json({ error: "FORBIDDEN" }, 403);
  if (result.kind === "message-not-found") return json({ error: "NOT_FOUND", message: "message not found" }, 404);
  if (result.kind === "attachment-not-found") return json({ error: "NOT_FOUND", message: "attachment not found" }, 404);
  const { attachment } = result;

  if (attachment.storage_key && env.SUPPORT_ATTACHMENTS) {
    const stored = await env.SUPPORT_ATTACHMENTS.get(attachment.storage_key);
    if (!stored) return json({ error: "NOT_FOUND", message: "attachment not found" }, 404);
    const headers = attachmentHeaders(attachment, attachment.name);
    const etag = stored.httpEtag;
    if (etag) headers.set("etag", etag);
    return new Response(stored.body, { status: 200, headers });
  }

  const inline = inlineAttachmentBytes(attachment);
  if (!inline) return json({ error: "NOT_FOUND", message: "attachment data unavailable" }, 404);
  const headers = attachmentHeaders(attachment, attachment.name);
  const body = inline.bytes.buffer.slice(inline.bytes.byteOffset, inline.bytes.byteOffset + inline.bytes.byteLength) as ArrayBuffer;
  return new Response(body, { status: 200, headers });
};

/** Correlates attachment delivery outcomes without logging ticket, file or user identifiers. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await handleSupportAttachmentGet(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('support.attachment.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
