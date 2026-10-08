import { buildAdminEventAfterChangeStatement } from './admin_audit';
type MutationResult = { meta?: { changes?: number }; changes?: number };
function changedRows(result: MutationResult) { return Number(result?.meta?.changes ?? result?.changes ?? 0); }
async function activeUser(db: D1Database, userId: string) { return db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1').bind(userId).first<{ id: string }>(); }
export async function readAdminSessions(input: { db: D1Database; userId: string }) {
  if (!input.userId) return { kind: 'ok' as const, sessions: [] };
  if (!await activeUser(input.db, input.userId)) return { kind: 'not_found' as const };
  const { results } = await input.db.prepare('SELECT id, created_at, expires_at, revoked, user_agent, ip FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').bind(input.userId).all();
  return { kind: 'ok' as const, sessions: results || [] };
}
export async function revokeAdminSession(input: { db: D1Database; userId: string; sessionId: string; adminUserId: string }) {
  const db = input.db;
  if (!await activeUser(input.db, input.userId)) return { kind: 'user_not_found' as const };
  const revokeStatement = input.db.prepare('UPDATE sessions SET revoked = 1 WHERE id = ? AND user_id = ?').bind(input.sessionId, input.userId);
  const auditStatement = buildAdminEventAfterChangeStatement(input.db, { adminUserId: input.adminUserId, action: "session_revoke", targetUserId: input.userId, meta: { session_id: input.sessionId } });
  const [revokeResult] = await db.batch([revokeStatement, auditStatement]);
  return changedRows(revokeResult) === 0 ? { kind: 'session_not_found' as const } : { kind: 'ok' as const };
}
