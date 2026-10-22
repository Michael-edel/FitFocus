import { buildAdminEventAfterChangeStatement, buildAdminEventStatement } from './admin_audit';

export const ALLOWED_ROLE_VALUES = new Set(['user', 'pro', 'family_parent', 'family_child', 'support', 'admin']);
export const ALLOWED_ACTION_VALUES = new Set(['add', 'remove']);

type RoleRow = { role: string };
type UserRow = { id: string };

function changedRows(result: { meta?: { changes?: number }; changes?: number }): number {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

async function activeUser(db: D1Database, userId: string) {
  return db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1').bind(userId).first<UserRow>();
}

async function rolesForUser(db: D1Database, userId: string) {
  const { results } = await db.prepare('SELECT role FROM user_roles WHERE user_id = ? ORDER BY role').bind(userId).all<RoleRow>();
  return (results || []).map((row) => row.role);
}

export async function readAdminUserRoles(input: { db: D1Database; userId: string }) {
  if (!await activeUser(input.db, input.userId)) return null;
  return { user_id: input.userId, roles: await rolesForUser(input.db, input.userId) };
}

export type AdminRoleChange = { userId: string; role: string; action: string; adminUserId: string };
export type AdminRoleChangeResult =
  | { kind: 'ok'; user_id: string; roles: string[] }
  | { kind: 'not_found' }
  | { kind: 'bad_action' }
  | { kind: 'bad_role' }
  | { kind: 'last_admin' };

export async function changeAdminUserRole(input: { db: D1Database; change: AdminRoleChange }): Promise<AdminRoleChangeResult> {
  const { db, change } = input;
  if (!ALLOWED_ACTION_VALUES.has(change.action)) return { kind: 'bad_action' };
  if (!ALLOWED_ROLE_VALUES.has(change.role)) return { kind: 'bad_role' };
  if (!await activeUser(db, change.userId)) return { kind: 'not_found' };

  const auditParams = {
    adminUserId: change.adminUserId,
    action: change.action === 'remove' ? 'role_remove' : 'role_add',
    targetUserId: change.userId,
    meta: { role: change.role },
  };
  if (change.action === 'remove' && change.role === 'admin') {
    const roleStatement = db.prepare(
      `DELETE FROM user_roles
       WHERE user_id = ? AND role = 'admin'
       AND (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'admin' AND u.is_active = 1 AND u.deleted_at IS NULL) > 1`
    ).bind(change.userId);
    const auditStatement = buildAdminEventAfterChangeStatement(db, auditParams);
    const [roleResult] = await db.batch([roleStatement, auditStatement]);
    if (changedRows(roleResult) === 0) return { kind: 'last_admin' };
    return { kind: 'ok', user_id: change.userId, roles: await rolesForUser(db, change.userId) };
  }

  const roleStatement = change.action === 'remove'
    ? db.prepare('DELETE FROM user_roles WHERE user_id = ? AND role = ?').bind(change.userId, change.role)
    : db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, ?)').bind(change.userId, change.role);
  const auditStatement = buildAdminEventStatement(db, auditParams);
  await db.batch([roleStatement, auditStatement]);
  return { kind: 'ok', user_id: change.userId, roles: await rolesForUser(db, change.userId) };
}
