import type { SessionUser } from './auth';

export async function hasBetaAccess(env: { DB?: D1Database; REQUIRE_INVITE?: string | number | boolean }, user: SessionUser): Promise<boolean> {
  const requireInvite = String((env as any)?.REQUIRE_INVITE ?? '').trim() === '1';
  if (!requireInvite) return true;
  if (Array.isArray(user?.roles) && user.roles.includes('admin')) return true;
  const db = (env as any)?.DB;
  if (!db) return false;
  const row = await db.prepare('SELECT 1 as ok FROM invite_redemptions WHERE user_id = ? LIMIT 1').bind(user.sub).first<{ ok: number }>();
  return !!row?.ok;
}

export async function requireBetaAccess(env: { DB?: D1Database; REQUIRE_INVITE?: string | number | boolean }, user: SessionUser): Promise<void> {
  const ok = await hasBetaAccess(env, user);
  if (!ok) throw new Error('ACCESS_REQUIRED');
}
