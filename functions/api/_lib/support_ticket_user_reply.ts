import { nowMs, uuid } from './db';
import {
  deleteStoredSupportAttachments,
  fileToAttachment,
  SupportAttachmentTooLargeError,
  type SupportAttachmentBucket,
  type SupportAttachmentRecord,
} from './support_attachments';
import {
  presentMySupportTicket,
  type SupportTicketUserRow,
} from './support_ticket_user_read';

type ChangesResult = { meta?: { changes?: number } | null; changes?: number };

function changedRows(result: ChangesResult | null | undefined): number {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

export type UserSupportReplyResult =
  | { kind: 'bad-request'; message: string }
  | { kind: 'not-found' }
  | { kind: 'closed' }
  | { kind: 'success'; ticket: unknown | null };

/** Adds a user reply with attachments and removes uploaded objects if the D1 write cannot be completed. */
export async function replyToMySupportTicket({
  db,
  userId,
  bucket,
  form,
}: {
  db: D1Database;
  userId: string;
  bucket: SupportAttachmentBucket | undefined;
  form: FormData;
}): Promise<UserSupportReplyResult> {
  const ticketId = String(form.get('ticket_id') || '').trim();
  const message = String(form.get('message') || '').trim();
  if (!ticketId) return { kind: 'bad-request', message: 'ticket id required' };
  if (!message && !form.getAll('attachments').length) return { kind: 'bad-request', message: 'message required' };

  const ticket = await db.prepare(
    `SELECT id, status
     FROM support_feedback
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
  ).bind(ticketId, userId).first<SupportTicketUserRow>();
  if (!ticket) return { kind: 'not-found' };
  if (ticket.status === 'closed') return { kind: 'closed' };

  const files = form.getAll('attachments').filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length > 3) return { kind: 'bad-request', message: 'Too many attachments' };

  const messageId = uuid();
  const attachments: SupportAttachmentRecord[] = [];
  try {
    for (const [index, file] of files.entries()) {
      attachments.push(await fileToAttachment(file, { bucket, ticketId, messageId, index }));
    }
  } catch (error: unknown) {
    await deleteStoredSupportAttachments(bucket, attachments);
    if (error instanceof SupportAttachmentTooLargeError) {
      return { kind: 'bad-request', message: 'Файл слишком большой. Прикрепите файл до 2 MB.' };
    }
    return { kind: 'bad-request', message: 'Не удалось обработать вложение' };
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
       )`,
    ).bind(messageId, ticketId, userId, message, attachments.length, attachments.length ? JSON.stringify(attachments) : null, createdAt, ticketId, userId),
    db.prepare(
      `UPDATE support_feedback
       SET updated_at = ?, status = ?, last_reply_at = ?, last_reply_by = ?
       WHERE id = ? AND user_id = ? AND status != 'closed'`,
    ).bind(createdAt, 'new', createdAt, userId, ticketId, userId),
  ];

  let writeResults: D1Result[];
  try {
    writeResults = await db.batch(statements);
  } catch (error) {
    await deleteStoredSupportAttachments(bucket, attachments);
    throw error;
  }
  if (changedRows(writeResults[0]) === 0 || changedRows(writeResults[1]) === 0) {
    await deleteStoredSupportAttachments(bucket, attachments);
    const latest = await db.prepare(
      `SELECT id, status
       FROM support_feedback
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
    ).bind(ticketId, userId).first<SupportTicketUserRow>();
    return latest?.status === 'closed' ? { kind: 'closed' } : { kind: 'not-found' };
  }

  const refreshed = await db.prepare(
    `SELECT id, created_at, updated_at, category, section, subject, message, status, priority,
            attachment_count, attachments_json, app_version, last_reply_at, last_reply_by, resolved_at, closed_at
     FROM support_feedback
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
  ).bind(ticketId, userId).first<SupportTicketUserRow>();
  return { kind: 'success', ticket: refreshed ? await presentMySupportTicket(db, refreshed, true) : null };
}