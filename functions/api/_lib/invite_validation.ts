export type InviteCodeRow = { code: string; created_at?: number; note?: string | null; max_uses?: number | null; uses?: number | null; expires_at?: number | null; revoked?: number | null };
export async function validateInviteCode(input: { db: D1Database; code: string; now?: () => number }) {
  const row = await input.db.prepare(`SELECT code, created_at, note, max_uses, uses, expires_at, revoked FROM invite_codes WHERE code = ? LIMIT 1`).bind(input.code).first<InviteCodeRow>();
  if (!row) return { valid: false };
  const now = Math.floor((input.now || Date.now)() / 1000);
  const revoked = Number(row.revoked || 0) === 1;
  const expired = row.expires_at != null && Number(row.expires_at) <= now;
  const exhausted = Number(row.uses || 0) >= (row.max_uses == null ? 1 : Number(row.max_uses));
  return { valid: !revoked && !expired && !exhausted };
}
