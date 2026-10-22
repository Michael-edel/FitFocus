import { attachmentResponseUrl, parseAttachmentsJson, type SupportAttachmentRecord } from './support_attachments';
import { readSupportTicketForAdmin, type SupportTicketAdminRow } from './support_ticket_admin';

type SupportMessageRow = {
  id: string;
  ticket_id: string;
  author_user_id: string;
  author_role: 'user' | 'admin';
  message: string;
  attachment_count: number;
  attachments_json?: string | null;
  created_at: number;
};

function mapAttachments(records: SupportAttachmentRecord[], scope: { ticketId: string; messageId?: string }) {
  return records.map((attachment, index) => ({
    ...attachment,
    data_url: attachment.data_url || attachmentResponseUrl(scope.ticketId, index, scope.messageId),
  }));
}

async function loadMessageThread(db: D1Database, ticketId: string) {
  const { results } = await db.prepare(
    `SELECT id, ticket_id, author_user_id, author_role, message, attachment_count, attachments_json, created_at
     FROM support_feedback_messages
     WHERE ticket_id = ?
     ORDER BY created_at ASC`,
  ).bind(ticketId).all<SupportMessageRow>();

  return (results || []).map((row) => ({
    ...row,
    attachment_count: Number(row.attachment_count || 0),
    attachments: mapAttachments(parseAttachmentsJson(row.attachments_json), { ticketId, messageId: row.id }),
  }));
}

/** Loads an admin ticket with safe attachment URLs and its full message thread. */
export async function readAdminSupportTicketDetail(db: D1Database, ticketId: string) {
  const ticket = await readSupportTicketForAdmin(db, ticketId);
  if (!ticket) return null;

  return {
    ...ticket,
    attachment_count: Number(ticket.attachment_count || 0),
    attachments: mapAttachments(parseAttachmentsJson(ticket.attachments_json), { ticketId }),
    messages: await loadMessageThread(db, ticketId),
  };
}

/** Lists the administrator's ticket queue with optional normalized status filtering. */
export async function listAdminSupportTickets(db: D1Database, status: string, limit: number) {
  const filters: string[] = [];
  const binds: unknown[] = [];
  if (status) {
    filters.push('s.status = ?');
    binds.push(status);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const query = `
    SELECT s.id, s.user_id, s.created_at, s.updated_at, s.category, s.section, s.subject, s.message,
           s.steps_json, s.device, s.browser, s.contact, s.app_version, s.status, s.priority,
           s.attachment_count, s.assigned_admin_user_id, s.resolved_at, s.closed_at, s.last_reply_at, s.last_reply_by,
           u.email as user_email, u.name as user_name
    FROM support_feedback s
    LEFT JOIN users u ON u.id = s.user_id
    ${whereClause}
    ORDER BY COALESCE(s.last_reply_at, s.updated_at, s.created_at) DESC
    LIMIT ?`;

  const { results } = await db.prepare(query).bind(...binds, limit).all<SupportTicketAdminRow>();
  return (results || []).map((row) => ({
    ...row,
    attachment_count: Number(row.attachment_count || 0),
  }));
}
