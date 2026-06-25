import { json, requireUser } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireRole } from "../_lib/rbac";
import { requireAdminRequest } from "../_lib/admin_guard";
import {
  type SupportAttachmentBucket,
  inlineAttachmentBytes,
  parseAttachmentsJson,
  type SupportAttachmentRecord,
} from "../_lib/support_attachments";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string; SUPPORT_ATTACHMENTS?: SupportAttachmentBucket };

function safeFileName(name: string) {
  return name.replace(/["\\]/g, "_").slice(0, 120) || "attachment";
}

function attachmentHeaders(attachment: SupportAttachmentRecord, fileName: string) {
  const headers = new Headers();
  headers.set("content-type", attachment.mime || "application/octet-stream");
  headers.set("content-disposition", `inline; filename="${safeFileName(fileName)}"`);
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  return headers;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
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

  const row = await db.prepare(
    `SELECT id, user_id
     FROM support_feedback
     WHERE id = ?
     LIMIT 1`
  ).bind(ticketId).first<any>();
  if (!row) return json({ error: "NOT_FOUND", message: "ticket not found" }, 404);
  if (!isAdmin && row.user_id !== user.sub) return json({ error: "FORBIDDEN" }, 403);

  let attachmentsJson: string | null | undefined;
  if (messageId) {
    const messageRow = await db.prepare(
      `SELECT attachments_json
       FROM support_feedback_messages
       WHERE id = ? AND ticket_id = ?
       LIMIT 1`
    ).bind(messageId, ticketId).first<any>();
    if (!messageRow) return json({ error: "NOT_FOUND", message: "message not found" }, 404);
    attachmentsJson = messageRow.attachments_json;
  } else {
    const ticketRow = await db.prepare(
      `SELECT attachments_json
       FROM support_feedback
       WHERE id = ?
       LIMIT 1`
    ).bind(ticketId).first<any>();
    attachmentsJson = ticketRow?.attachments_json;
  }

  const attachments = parseAttachmentsJson(attachmentsJson);
  const attachment = attachments[index];
  if (!attachment) return json({ error: "NOT_FOUND", message: "attachment not found" }, 404);

  if (attachment.storage_key && env.SUPPORT_ATTACHMENTS) {
    const stored = await env.SUPPORT_ATTACHMENTS.get(attachment.storage_key);
    if (!stored) return json({ error: "NOT_FOUND", message: "attachment not found" }, 404);
    const headers = attachmentHeaders(attachment, attachment.name);
    stored.writeHttpMetadata?.(headers);
    const etag = (stored as any).httpEtag as string | undefined;
    if (etag) headers.set("etag", etag);
    return new Response(stored.body, { status: 200, headers });
  }

  const inline = inlineAttachmentBytes(attachment);
  if (!inline) return json({ error: "NOT_FOUND", message: "attachment data unavailable" }, 404);
  const headers = attachmentHeaders(attachment, attachment.name);
  const body = inline.bytes.buffer.slice(inline.bytes.byteOffset, inline.bytes.byteOffset + inline.bytes.byteLength) as ArrayBuffer;
  return new Response(body, { status: 200, headers });
};
