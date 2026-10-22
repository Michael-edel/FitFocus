import { attachmentResponseUrl, parseAttachmentsJson, type SupportAttachmentRecord } from './support_attachments';

export type SupportTicketUserRow = {
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
};

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

const PUBLIC_TICKET_COLUMNS = `
  id, created_at, updated_at, category, section, subject, message, status, priority,
  attachment_count, attachments_json, app_version, last_reply_at, last_reply_by, resolved_at, closed_at
`;

function publicMessageText(value: unknown): string {
  const text = typeof value === 'string' ? value : '';
  const marker = '\n\n---\nСистемная диагностика\n';
  const index = text.indexOf(marker);
  return (index >= 0 ? text.slice(0, index) : text).trim();
}

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
     ORDER BY created_at ASC`,
  ).bind(ticketId).all<SupportMessageRow>();

  return (results || []).map((row) => ({
    ...row,
    message: publicMessageText(row.message),
    attachment_count: Number(row.attachment_count || 0),
    attachments: mapAttachments(parseAttachmentsJson(row.attachments_json), { ticketId, messageId: row.id }),
  }));
}

/** Projects a ticket owner-safe view, deliberately excluding admin notes and diagnostics. */
export async function presentMySupportTicket(
  db: D1Database,
  ticket: SupportTicketUserRow,
  includeMessages: boolean,
) {
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
    ...(includeMessages ? { attachments: mapAttachments(parseAttachmentsJson(ticket.attachments_json), { ticketId: ticket.id }) } : {}),
    ...(includeMessages ? { messages: await loadMessages(db, ticket.id) } : {}),
  };
}

/** Loads one ticket owned by the caller, including its safe public message thread. */
export async function readMySupportTicketDetail(db: D1Database, userId: string, ticketId: string) {
  const ticket = await db.prepare(
    `SELECT ${PUBLIC_TICKET_COLUMNS}
     FROM support_feedback
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
  ).bind(ticketId, userId).first<SupportTicketUserRow>();
  return ticket ? presentMySupportTicket(db, ticket, true) : null;
}

/** Lists the caller's tickets without loading message threads or attachment URLs. */
export async function listMySupportTickets(db: D1Database, userId: string) {
  const { results } = await db.prepare(
    `SELECT id, created_at, updated_at, category, section, subject, message, status, priority,
            attachment_count, app_version, last_reply_at, last_reply_by, resolved_at, closed_at
     FROM support_feedback
     WHERE user_id = ?
     ORDER BY COALESCE(last_reply_at, updated_at, created_at) DESC
     LIMIT 100`,
  ).bind(userId).all<SupportTicketUserRow>();

  return Promise.all((results || []).map((ticket) => presentMySupportTicket(db, ticket, false)));
}
