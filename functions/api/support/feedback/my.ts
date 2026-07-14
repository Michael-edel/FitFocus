import { json, requireUser } from "../../_lib/auth";
import { nowMs, requireDB, uuid } from "../../_lib/db";
import {
  readFormDataRequest,
  RequestBodyTooLargeError,
  SUPPORT_FORM_BODY_LIMIT_BYTES,
} from "../../_lib/request_body";
import {
  attachmentResponseUrl,
  fileToAttachment,
  parseAttachmentsJson,
  SupportAttachmentTooLargeError,
  type SupportAttachmentBucket,
  type SupportAttachmentRecord,
} from "../../_lib/support_attachments";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string; SUPPORT_ATTACHMENTS?: SupportAttachmentBucket };
type ChangesResult = {
  meta?: { changes?: number } | null;
  changes?: number;
};
type SupportTicketRow = {
  id: string;
  created_at?: number | null;
  updated_at?: number | null;
  category?: string | null;
  section?: string | null;
  subject?: string | null;
  message?: string | null;
  status?: string | null;
  priority?: string | null;
  attachment_count?: number | null;
  attachments_json?: string | null;
  app_version?: string | null;
  last_reply_at?: number | null;
  last_reply_by?: string | null;
  resolved_at?: number | null;
  closed_at?: number | null;
  [key: string]: unknown;
};
type SupportMessageRow = {
  id: string;
  ticket_id: string;
  author_user_id: string;
  author_role: "user" | "admin";
  message: string;
  attachment_count: number;
  attachments_json?: string | null;
  created_at: number;
};

const PUBLIC_TICKET_COLUMNS = `
  id, created_at, updated_at, category, section, subject, message, status, priority,
  attachment_count, attachments_json, app_version, last_reply_at, last_reply_by, resolved_at, closed_at
`;

function publicMessageText(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  const marker = "\n\n---\nСистемная диагностика\n";
  const index = text.indexOf(marker);
  return (index >= 0 ? text.slice(0, index) : text).trim();
}

function mapAttachments(records: SupportAttachmentRecord[], scope: { ticketId: string; messageId?: string }) {
  return records.map((attachment, index) => ({
    ...attachment,
    data_url: attachment.data_url || attachmentResponseUrl(scope.ticketId, index, scope.messageId),
  }));
}

async function publicTicket(db: D1Database, ticket: SupportTicketRow, includeMessages: boolean) {
  const attachments = mapAttachments(parseAttachmentsJson(ticket.attachments_json), { ticketId: ticket.id });
  return {
    id: ticket.id,
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
    category: ticket.category,
    section: ticket.section,
    subject: ticket.subject,
    message: publicMessageText(ticket.message),
    status: ticket.status,
    priority: ticket.priority,
    attachment_count: Number(ticket.attachment_count || 0),
    app_version: ticket.app_version,
    last_reply_at: ticket.last_reply_at,
    last_reply_by: ticket.last_reply_by,
    resolved_at: ticket.resolved_at,
    closed_at: ticket.closed_at,
    ...(includeMessages ? { attachments } : {}),
    ...(includeMessages ? { messages: await loadMessages(db, ticket.id) } : {}),
  };
}

function changedRows(result: ChangesResult | null | undefined): number {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

async function deleteStoredAttachments(
  bucket: SupportAttachmentBucket | undefined,
  attachments: SupportAttachmentRecord[],
) {
  const keys = attachments
    .map((attachment) => attachment.storage_key)
    .filter((key): key is string => Boolean(key));
  if (keys.length === 0 || !bucket?.delete) return;
  try {
    await bucket.delete(keys);
  } catch {}
}

async function loadMessages(db: D1Database, ticketId: string) {
  const { results } = await db.prepare(
    `SELECT id, ticket_id, author_user_id, author_role, message, attachment_count, attachments_json, created_at
     FROM support_feedback_messages
     WHERE ticket_id = ?
     ORDER BY created_at ASC`
  ).bind(ticketId).all<SupportMessageRow>();

  return (results || []).map((row) => ({
    ...row,
    message: publicMessageText(row.message),
    attachment_count: Number(row.attachment_count || 0),
    attachments: mapAttachments(parseAttachmentsJson(row.attachments_json), { ticketId, messageId: row.id }),
  }));
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
      `SELECT ${PUBLIC_TICKET_COLUMNS}
       FROM support_feedback
       WHERE id = ? AND user_id = ?
       LIMIT 1`
    ).bind(id, user.sub).first<SupportTicketRow>();
    if (!ticket) return json({ error: "NOT_FOUND", message: "ticket not found" }, 404);
    return json({
      ticket: await publicTicket(db, ticket, true),
    });
  }

  const { results } = await db.prepare(
    `SELECT id, created_at, updated_at, category, section, subject, message, status, priority,
            attachment_count, app_version, last_reply_at, last_reply_by, resolved_at, closed_at
     FROM support_feedback
     WHERE user_id = ?
     ORDER BY COALESCE(last_reply_at, updated_at, created_at) DESC
     LIMIT 100`
  ).bind(user.sub).all<SupportTicketRow>();

  return json({
    tickets: await Promise.all((results || []).map((row) => publicTicket(db, row, false))),
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
  let form: FormData | null = null;
  try {
    form = await readFormDataRequest(request, SUPPORT_FORM_BODY_LIMIT_BYTES);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
    }
    throw err;
  }
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
  ).bind(ticketId, user.sub).first<SupportTicketRow>();
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
  } catch (error: unknown) {
    if (error instanceof SupportAttachmentTooLargeError) {
      return json({ error: "BAD_REQUEST", message: "Файл слишком большой. Прикрепите файл до 2 MB." }, 400);
    }
    return json({ error: "BAD_REQUEST", message: "Не удалось обработать вложение" }, 400);
  }

  const createdAt = nowMs();
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO support_feedback_messages (
        id, ticket_id, author_user_id, author_role, message, attachment_count, attachments_json, created_at
      )
       SELECT ?, ?, ?, 'user', ?, ?, ?, ?
       WHERE EXISTS (
         SELECT 1
         FROM support_feedback
         WHERE id = ?
           AND user_id = ?
           AND status != 'closed'
       )`
    ).bind(
      messageId,
      ticketId,
      user.sub,
      message.trim(),
      attachments.length,
      attachments.length ? JSON.stringify(attachments) : null,
      createdAt,
      ticketId,
      user.sub,
    ),
    db.prepare(
    `UPDATE support_feedback
     SET updated_at = ?, status = ?, last_reply_at = ?, last_reply_by = ?
     WHERE id = ? AND user_id = ? AND status != 'closed'`
    ).bind(createdAt, "new", createdAt, user.sub, ticketId, user.sub),
  ];

  const writeResults = await db.batch(statements);
  const messageResult = writeResults[0];
  const updateResult = writeResults[1];
  if (changedRows(messageResult) === 0 || changedRows(updateResult) === 0) {
    await deleteStoredAttachments(env.SUPPORT_ATTACHMENTS, attachments);
    const latest = await db.prepare(
      `SELECT id, status
       FROM support_feedback
       WHERE id = ? AND user_id = ?
       LIMIT 1`
    ).bind(ticketId, user.sub).first<SupportTicketRow>();
    if (latest?.status === "closed") return json({ error: "BAD_REQUEST", message: "ticket closed" }, 400);
    return json({ error: "NOT_FOUND", message: "ticket not found" }, 404);
  }

  const refreshed = await db.prepare(
    `SELECT ${PUBLIC_TICKET_COLUMNS}
     FROM support_feedback
     WHERE id = ? AND user_id = ?
     LIMIT 1`
  ).bind(ticketId, user.sub).first<SupportTicketRow>();
  return json({
    ok: true,
    ticket: refreshed ? await publicTicket(db, refreshed, true) : null,
  });
};
