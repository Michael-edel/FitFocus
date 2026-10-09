import { parseAttachmentsJson, type SupportAttachmentRecord } from './support_attachments';

type SupportTicketOwnerRow = { id: string; user_id: string; attachments_json?: string | null };
type SupportMessageAttachmentRow = { attachments_json?: string | null };

export type SupportAttachmentReadResult =
  | { kind: 'found'; attachment: SupportAttachmentRecord }
  | { kind: 'ticket-not-found' }
  | { kind: 'forbidden' }
  | { kind: 'message-not-found' }
  | { kind: 'attachment-not-found' };

/** Resolves support attachment ownership and metadata before a route reads its bytes from R2 or D1. */
export async function readSupportAttachmentRecord(
  db: D1Database,
  input: { userId: string; isAdmin: boolean; ticketId: string; messageId?: string; index: number },
): Promise<SupportAttachmentReadResult> {
  const ticket = await db.prepare(
    `SELECT id, user_id
     FROM support_feedback
     WHERE id = ?
     LIMIT 1`,
  ).bind(input.ticketId).first<SupportTicketOwnerRow>();
  if (!ticket) return { kind: 'ticket-not-found' };
  if (!input.isAdmin && ticket.user_id !== input.userId) return { kind: 'forbidden' };

  let attachmentsJson: string | null | undefined;
  if (input.messageId) {
    const message = await db.prepare(
      `SELECT attachments_json
       FROM support_feedback_messages
       WHERE id = ? AND ticket_id = ?
       LIMIT 1`,
    ).bind(input.messageId, input.ticketId).first<SupportMessageAttachmentRow>();
    if (!message) return { kind: 'message-not-found' };
    attachmentsJson = message.attachments_json;
  } else {
    const ticketAttachments = await db.prepare(
      `SELECT attachments_json
       FROM support_feedback
       WHERE id = ?
       LIMIT 1`,
    ).bind(input.ticketId).first<SupportMessageAttachmentRow>();
    attachmentsJson = ticketAttachments?.attachments_json;
  }

  const attachment = parseAttachmentsJson(attachmentsJson)[input.index];
  return attachment ? { kind: 'found', attachment } : { kind: 'attachment-not-found' };
}