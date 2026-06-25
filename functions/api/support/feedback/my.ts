import { json, requireUser } from "../../_lib/auth";
import { nowMs, requireDB, uuid } from "../../_lib/db";
import {
  attachmentResponseUrl,
  fileToAttachment,
  parseAttachmentsJson,
  type SupportAttachmentBucket,
  type SupportAttachmentRecord,
} from "../../_lib/support_attachments";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string; SUPPORT_ATTACHMENTS?: SupportAttachmentBucket };

function mapAttachments(records: SupportAttachmentRecord[], scope: { ticketId: string; messageId?: string }) {
  return records.map((attachment, index) => ({
    ...attachment,
    data_url: attachment.data_url || attachmentResponseUrl(scope.ticketId, index, scope.messageId),
  }));
}

async function loadMessages(db: D1Database, ticketId: string) {
  const { results } = await db.prepare(
    `SELECT id, ticket_id, author_user_id, author_role, message, attachment_count, attachments_json, created_at
     FROM support_feedback_messages
     WHERE ticket_id = ?
     ORDER BY created_at ASC`
  ).bind(ticketId).all<any>();

  return (results || []).map((row) => ({
    ...row,
    attachment_count: Number(row.attachment_count || 0),
    attachments: mapAttachments(parseAttachmentsJson(row.attachments_json), { ticketId, messageId: row.id }),
  }));
}

async function appendMessage(
  db: D1Database,
  id: string,
  ticketId: string,
  userId: string,
  message: string,
  attachments: SupportAttachmentRecord[],
) {
  const createdAt = nowMs();
  await db.prepare(
    `INSERT INTO support_feedback_messages (
      id, ticket_id, author_user_id, author_role, message, attachment_count, attachments_json, created_at
    ) VALUES (?, ?, ?, 'user', ?, ?, ?, ?)`
  ).bind(
    id,
    ticketId,
    userId,
    message.trim(),
    attachments.length,
    attachments.length ? JSON.stringify(attachments) : null,
    createdAt,
  ).run();
  return createdAt;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const db = requireDB(env);
  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "").trim();

  if (id) {
    const ticket = await db.prepare(
      `SELECT *
       FROM support_feedback
       WHERE id = ? AND user_id = ?
       LIMIT 1`
    ).bind(id, user.sub).first<any>();
    if (!ticket) return json({ error: "NOT_FOUND", message: "ticket not found" }, 404);
    return json({
      ticket: {
        ...ticket,
        attachment_count: Number(ticket.attachment_count || 0),
        attachments: mapAttachments(parseAttachmentsJson(ticket.attachments_json), { ticketId: ticket.id }),
        messages: await loadMessages(db, ticket.id),
      },
    });
  }

  const { results } = await db.prepare(
    `SELECT id, created_at, updated_at, category, section, subject, message, status, priority,
            attachment_count, app_version, last_reply_at, last_reply_by, resolved_at, closed_at
     FROM support_feedback
     WHERE user_id = ?
     ORDER BY COALESCE(last_reply_at, updated_at, created_at) DESC
     LIMIT 100`
  ).bind(user.sub).all<any>();

  return json({
    tickets: (results || []).map((row) => ({
      ...row,
      attachment_count: Number(row.attachment_count || 0),
    })),
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const db = requireDB(env);
  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: "BAD_REQUEST", message: "form data required" }, 400);

  const ticketId = String(form.get("ticket_id") || "").trim();
  const message = String(form.get("message") || "").trim();
  if (!ticketId) return json({ error: "BAD_REQUEST", message: "ticket id required" }, 400);
  if (!message && !form.getAll("attachments").length) {
    return json({ error: "BAD_REQUEST", message: "message required" }, 400);
  }

  const ticket = await db.prepare(
    `SELECT id, status
     FROM support_feedback
     WHERE id = ? AND user_id = ?
     LIMIT 1`
  ).bind(ticketId, user.sub).first<any>();
  if (!ticket) return json({ error: "NOT_FOUND", message: "ticket not found" }, 404);
  if (ticket.status === "closed") return json({ error: "BAD_REQUEST", message: "ticket closed" }, 400);

  const files = form.getAll("attachments").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length > 3) return json({ error: "BAD_REQUEST", message: "Too many attachments" }, 400);

  const messageId = uuid();
  const attachments: SupportAttachmentRecord[] = [];
  try {
    for (const [index, file] of files.entries()) {
      attachments.push(await fileToAttachment(file, {
        bucket: env.SUPPORT_ATTACHMENTS,
        ticketId,
        messageId,
        index,
      }));
    }
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg.startsWith("FILE_TOO_LARGE:")) {
      return json({ error: "BAD_REQUEST", message: `Файл ${msg.split(":")[1]} слишком большой. Прикрепите файл до 2 MB.` }, 400);
    }
    return json({ error: "BAD_REQUEST", message: "Не удалось обработать вложение" }, 400);
  }

  const createdAt = await appendMessage(db, messageId, ticketId, user.sub, message, attachments);
  await db.prepare(
    `UPDATE support_feedback
     SET updated_at = ?, status = ?, last_reply_at = ?, last_reply_by = ?
     WHERE id = ?`
  ).bind(createdAt, "new", createdAt, user.sub, ticketId).run();

  const refreshed = await db.prepare(`SELECT * FROM support_feedback WHERE id = ? LIMIT 1`).bind(ticketId).first<any>();
  return json({
    ok: true,
    ticket: refreshed ? {
      ...refreshed,
      attachment_count: Number(refreshed.attachment_count || 0),
      attachments: mapAttachments(parseAttachmentsJson(refreshed.attachments_json), { ticketId: refreshed.id }),
      messages: await loadMessages(db, refreshed.id),
    } : null,
  });
};
