import type { SessionUser } from './auth';

export async function hasBetaAccess(env: { DB?: D1Database; REQUIRE_INVITE?: string | number | boolean }, user: SessionUser): Promise<boolean> {
  const requireInvite = String((env as any)?.REQUIRE_INVITE ?? '').trim() === '1';
  if (!requireInvite) return true;
  if (Array.isArray(user?.roles) && user.roles.includes('admin')) return true;
  const db = (env as any)?.DB;
  if (!db) return false;
  const directRow = await db.prepare('SELECT 1 as ok FROM invite_redemptions WHERE user_id = ? LIMIT 1').bind(user.sub).first();
  if (directRow?.ok) return true;

  const email = String(user?.email || '').trim().toLowerCase();
  if (!email) return false;

  const legacyRow = await db.prepare(
    `SELECT 1 as ok
     FROM invite_redemptions ir
     JOIN users u ON u.id = ir.user_id
     WHERE lower(u.email) = ?
     LIMIT 1`
  ).bind(email).first();
  return !!legacyRow?.ok;
}

export async function requireBetaAccess(env: { DB?: D1Database; REQUIRE_INVITE?: string | number | boolean }, user: SessionUser): Promise<void> {
  const ok = await hasBetaAccess(env, user);
  if (!ok) throw new Error('ACCESS_REQUIRED');
}
