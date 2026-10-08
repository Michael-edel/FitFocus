import { replaceActiveSessionsForUser } from './auth';
import { consumeInviteCode } from './invites';

export type AppleLoginUser = { sub: string; email: string; name: string; picture: string; emailVerified: boolean };
export type AppleLoginResult = { kind: 'ok'; sid: string; expiresAt: number } | { kind: 'invite-required' } | { kind: 'invalid-invite' };

/** Applies access policy, account restoration, roles and a replacement web session after Apple identity validation. */
export async function completeAppleLogin(input: {
  db: D1Database; user: AppleLoginUser; inviteCode: string; now: number; requireInvite: boolean;
  adminEmails?: string; bootstrapAdminEmails?: string; userAgent: string; ip: string;
}): Promise<AppleLoginResult> {
  const { db, user, now } = input;
  await db.prepare('INSERT INTO users (id, email, name, picture, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET email=excluded.email, name=excluded.name, picture=excluded.picture, updated_at=excluded.updated_at')
    .bind(user.sub, user.email, user.name, user.picture, now, now).run();
  if (input.requireInvite && !input.inviteCode) return { kind: 'invite-required' };
  if (input.inviteCode && !(await consumeInviteCode(db, input.inviteCode, user.sub, now)).ok) return { kind: 'invalid-invite' };
  await db.prepare("UPDATE users SET deleted_at = NULL, deletion_scheduled_at = NULL, is_active = 1, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL AND deletion_scheduled_at IS NOT NULL AND deletion_scheduled_at > datetime('now')")
    .bind(now, user.sub).run();
  const email = user.email.toLowerCase();
  const listed = (value?: string) => String(value || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (user.emailVerified && email && listed(input.adminEmails).includes(email)) {
    await db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, 'admin')").bind(user.sub).run();
  }
  if (user.emailVerified && email && listed(input.bootstrapAdminEmails).includes(email)) {
    const anyAdmin = await db.prepare("SELECT 1 FROM user_roles WHERE role='admin' LIMIT 1").first();
    if (!anyAdmin) await db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, 'admin')").bind(user.sub).run();
  }
  const sid = crypto.randomUUID(); const expiresAt = now + 60 * 60 * 24 * 30;
  await replaceActiveSessionsForUser(db, user.sub, now);
  await db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, revoked, user_agent, ip) VALUES (?, ?, ?, ?, 0, ?, ?)')
    .bind(sid, user.sub, now, expiresAt, input.userAgent.slice(0, 500), input.ip.slice(0, 100)).run();
  return { kind: 'ok', sid, expiresAt };
}