import { nowMs, uuid } from './db';
import type { SupportAttachmentRecord } from './support_attachments';

export type SupportTicketCreateInput = {
  ticketId: string;
  category: string;
  section: string;
  subject: string;
  message: string;
  stepsJson: string | null;
  device: string;
  browser: string;
  contact: string;
  appVersion: string;
  adminNote: string | null;
  attachments: SupportAttachmentRecord[];
};

/** Creates a ticket and its first user message in one D1 batch. */
export async function createSupportTicket({
  db,
  userId,
  input,
}: {
  db: D1Database;
  userId: string;
  input: SupportTicketCreateInput;
}) {
  const ticketId = input.ticketId;
  const messageId = uuid();
  const now = nowMs();
  const attachmentsJson = input.attachments.length ? JSON.stringify(input.attachments) : null;
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO support_feedback (
        id, user_id, created_at, updated_at, category, section, subject, message, steps_json,
        device, browser, contact, app_version, status, priority, attachment_count, attachments_json, admin_note,
        assigned_admin_user_id, resolved_at, closed_at, last_reply_at, last_reply_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 'normal', ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
    ).bind(
      ticketId, userId, now, now, input.category, input.section, input.subject, input.message,
      input.stepsJson, input.device, input.browser, input.contact, input.appVersion,
      input.attachments.length, attachmentsJson, input.adminNote, now, userId,
    ),
    db.prepare(
      `INSERT INTO support_feedback_messages (
        id, ticket_id, author_user_id, author_role, message, attachment_count, attachments_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(messageId, ticketId, userId, 'user', input.message, input.attachments.length, attachmentsJson, now),
  ];
  await db.batch(statements);
  return { ticketId, attachmentCount: input.attachments.length };
}
