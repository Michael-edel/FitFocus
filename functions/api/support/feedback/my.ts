import { json, requireUser } from "../../_lib/auth";
import { nowMs, requireDB, uuid } from "../../_lib/db";
import {
  readFormDataRequest,
  RequestBodyTooLargeError,
  SUPPORT_FORM_BODY_LIMIT_BYTES,
} from "../../_lib/request_body";
import {
  fileToAttachment,
  deleteStoredSupportAttachments,
  SupportAttachmentTooLargeError,
  type SupportAttachmentBucket,
  type SupportAttachmentRecord,
} from "../../_lib/support_attachments";
import { logApiEvent, requestIdFor, withRequestId } from '../../_lib/observability';
import {
  listMySupportTickets,
  presentMySupportTicket,
  readMySupportTicketDetail,
  type SupportTicketUserRow,
} from '../../_lib/support_ticket_user_read';

type Env = { DB: D1Database; AUTH_JWT_SECRET: string; SUPPORT_ATTACHMENTS?: SupportAttachmentBucket };
type ChangesResult = {
  meta?: { changes?: number } | null;
  changes?: number;
};
function changedRows(result: ChangesResult | null | undefined): number {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

const handleMySupportGet: PagesFunction<Env> = async ({ request, env }) => {
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
    const ticket = await readMySupportTicketDetail(db, user.sub, id);
    if (!ticket) return json({ error: "NOT_FOUND", message: "ticket not found" }, 404);
    return json({ ticket });
  }

  return json({ tickets: await listMySupportTickets(db, user.sub) });
};

const handleMySupportPost: PagesFunction<Env> = async ({ request, env }) => {
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
  ).bind(ticketId, user.sub).first<SupportTicketUserRow>();
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
    await deleteStoredSupportAttachments(env.SUPPORT_ATTACHMENTS, attachments);
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

  let writeResults: D1Result[];
  try {
    writeResults = await db.batch(statements);
  } catch (error) {
    await deleteStoredSupportAttachments(env.SUPPORT_ATTACHMENTS, attachments);
    throw error;
  }
  const messageResult = writeResults[0];
  const updateResult = writeResults[1];
  if (changedRows(messageResult) === 0 || changedRows(updateResult) === 0) {
    await deleteStoredSupportAttachments(env.SUPPORT_ATTACHMENTS, attachments);
    const latest = await db.prepare(
      `SELECT id, status
       FROM support_feedback
       WHERE id = ? AND user_id = ?
       LIMIT 1`
    ).bind(ticketId, user.sub).first<SupportTicketUserRow>();
    if (latest?.status === "closed") return json({ error: "BAD_REQUEST", message: "ticket closed" }, 400);
    return json({ error: "NOT_FOUND", message: "ticket not found" }, 404);
  }

  const refreshed = await db.prepare(
    `SELECT id, created_at, updated_at, category, section, subject, message, status, priority,
            attachment_count, attachments_json, app_version, last_reply_at, last_reply_by, resolved_at, closed_at
     FROM support_feedback
     WHERE id = ? AND user_id = ?
     LIMIT 1`
  ).bind(ticketId, user.sub).first<SupportTicketUserRow>();
  return json({
    ok: true,
    ticket: refreshed ? await presentMySupportTicket(db, refreshed, true) : null,
  });
};

/** Correlates support reads and replies without logging ticket content or attachments. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await handleMySupportGet(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('support.my.get.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handleMySupportPost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('support.my.post.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
