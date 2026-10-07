import { buildAdminEventAfterChangeStatement } from './admin_audit';
import { nowMs, uuid } from './db';

export type SupportTicketAdminRow = {
  id: string;
  user_id?: string | null;
  user_email?: string | null;
  user_name?: string | null;
  status?: string | null;
  priority?: string | null;
  attachment_count?: number | null;
  attachments_json?: string | null;
  admin_note?: string | null;
  assigned_admin_user_id?: string | null;
  resolved_at?: number | null;
  closed_at?: number | null;
  last_reply_at?: number | null;
  last_reply_by?: string | null;
  [key: string]: unknown;
};

const SUPPORT_TICKET_ADMIN_COLUMNS = [
  'id', 'user_id', 'created_at', 'updated_at', 'category', 'section', 'subject', 'message',
  'steps_json', 'device', 'browser', 'contact', 'app_version', 'status', 'priority',
  'attachment_count', 'attachments_json', 'admin_note', 'assigned_admin_user_id',
  'resolved_at', 'closed_at', 'last_reply_at', 'last_reply_by',
].join(', ');
const SUPPORT_TICKET_ADMIN_SELECT_COLUMNS = SUPPORT_TICKET_ADMIN_COLUMNS
  .split(', ')
  .map((column) => `s.${column}`)
  .join(', ');

type ChangesResult = { meta?: { changes?: number } | null; changes?: number };

export function normalizeTicketStatus(status: string) {
  switch (status.trim()) {
    case 'new':
    case 'in_progress':
    case 'waiting_user':
    case 'resolved':
    case 'closed':
      return status.trim();
    default:
      return '';
  }
}

function normalizePriority(priority: string) {
  switch (priority.trim()) {
    case 'low':
    case 'normal':
    case 'high':
    case 'urgent':
      return priority.trim();
    default:
      return '';
  }
}

function changedRows(result: ChangesResult | null | undefined) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

/** Loads the complete ticket record an administrator is allowed to inspect. */
export async function readSupportTicketForAdmin(db: D1Database, id: string) {
  return db.prepare(
    `SELECT ${SUPPORT_TICKET_ADMIN_SELECT_COLUMNS}, u.email as user_email, u.name as user_name
     FROM support_feedback s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.id = ?
     LIMIT 1`,
  ).bind(id).first<SupportTicketAdminRow>();
}

async function readSupportTicketForUpdate(db: D1Database, id: string) {
  return db.prepare(`SELECT ${SUPPORT_TICKET_ADMIN_COLUMNS} FROM support_feedback WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<SupportTicketAdminRow>();
}

export type SupportTicketUpdateResult =
  | { kind: 'invalid'; error: string; message: string }
  | { kind: 'not-found' }
  | { kind: 'updated'; ticketId: string };

/** Validates and atomically applies an administrator's ticket update and audit event. */
export async function updateSupportTicket({
  db,
  adminUserId,
  body,
}: {
  db: D1Database;
  adminUserId: string;
  body: Record<string, unknown>;
}): Promise<SupportTicketUpdateResult> {
  const ticketId = String(body.id || '').trim();
  if (!ticketId) return { kind: 'invalid', error: 'BAD_REQUEST', message: 'ticket id required' };

  const current = await readSupportTicketForUpdate(db, ticketId);
  if (!current) return { kind: 'not-found' };

  const status = normalizeTicketStatus(String(body.status || ''));
  const priority = normalizePriority(String(body.priority || ''));
  const adminNote = body.admin_note == null ? undefined : String(body.admin_note || '').trim();
  const replyMessage = String(body.message || '').trim();
  const assignMode = String(body.assign_to || '').trim();
  if (body.status != null && !status) return { kind: 'invalid', error: 'BAD_STATUS', message: 'Invalid ticket status' };
  if (body.priority != null && !priority) return { kind: 'invalid', error: 'BAD_PRIORITY', message: 'Invalid ticket priority' };
  if (body.assign_to != null && assignMode && assignMode !== 'me' && assignMode !== 'none') {
    return { kind: 'invalid', error: 'BAD_ASSIGN_TO', message: 'Invalid assignee mode' };
  }

  const now = nowMs();
  const nextStatus = status || (replyMessage ? 'waiting_user' : current.status || 'new');
  const nextPriority = priority || current.priority || 'normal';
  const assignedAdminUserId = assignMode === 'me'
    ? adminUserId
    : assignMode === 'none'
      ? null
      : current.assigned_admin_user_id || null;
  const resolvedAt = nextStatus === 'resolved' || nextStatus === 'closed' ? current.resolved_at || now : null;
  const closedAt = nextStatus === 'closed' ? current.closed_at || now : null;
  const statements: D1PreparedStatement[] = [];
  if (replyMessage) {
    statements.push(db.prepare(
      `INSERT INTO support_feedback_messages (
        id, ticket_id, author_user_id, author_role, message, attachment_count, attachments_json, created_at
      ) SELECT ?, ?, ?, 'admin', ?, 0, NULL, ?
        WHERE EXISTS (SELECT 1 FROM support_feedback WHERE id = ?)`,
    ).bind(uuid(), ticketId, adminUserId, replyMessage, now, ticketId));
  }
  statements.push(db.prepare(
    `UPDATE support_feedback
     SET updated_at = ?, status = ?, priority = ?, admin_note = ?, assigned_admin_user_id = ?,
         resolved_at = ?, closed_at = ?, last_reply_at = ?, last_reply_by = ?
     WHERE id = ?`,
  ).bind(
    now,
    nextStatus,
    nextPriority,
    adminNote === undefined ? current.admin_note || null : adminNote || null,
    assignedAdminUserId,
    resolvedAt,
    closedAt,
    replyMessage ? now : current.last_reply_at || null,
    replyMessage ? adminUserId : current.last_reply_by || null,
    ticketId,
  ));
  statements.push(buildAdminEventAfterChangeStatement(db, {
    adminUserId,
    action: "support_ticket_update",
    targetUserId: current.user_id || null,
    meta: { ticket_id: ticketId, status: nextStatus, priority: nextPriority, assigned_admin_user_id: assignedAdminUserId, replied: Boolean(replyMessage) },
  }));

  const writeResults = await db.batch(statements);
  const messageResult = replyMessage ? writeResults[0] : null;
  const updateResult = writeResults[replyMessage ? 1 : 0];
  if (changedRows(updateResult) === 0 || (replyMessage && changedRows(messageResult) === 0)) return { kind: 'not-found' };
  return { kind: 'updated', ticketId };
}
