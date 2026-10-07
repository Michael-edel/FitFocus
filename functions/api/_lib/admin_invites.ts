import { buildAdminEventAfterChangeStatement, buildAdminEventStatement } from './admin_audit';
import { nowMs, randomCode } from './db';
import { isJsonObject, type JsonObject } from './json';

type MutationResult = { meta?: { changes?: number }; changes?: number };
type InviteListRow = {
  code: string;
  created_at?: number;
  created_by?: string | null;
  note?: string | null;
  max_uses?: number | null;
  uses?: number | null;
  expires_at?: number | null;
  revoked?: number | null;
  redemption_count?: number | null;
  last_redeemed_at?: number | null;
};

function changedRows(result: MutationResult): number {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function boundedInt(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.trunc(number))) : fallback;
}

/** Lists invite codes with a bounded page size. */
export async function listAdminInvites(db: D1Database, rawLimit: unknown) {
  const limit = boundedInt(rawLimit, 100, 1, 200);
  const rows = await db.prepare(
    `SELECT ic.code, ic.created_at, ic.created_by, ic.note, ic.max_uses, ic.uses, ic.expires_at, ic.revoked,
            COALESCE(r.redemption_count, 0) AS redemption_count, r.last_redeemed_at
     FROM invite_codes ic
     LEFT JOIN (
       SELECT code, COUNT(*) AS redemption_count, MAX(redeemed_at) AS last_redeemed_at
       FROM invite_redemptions
       GROUP BY code
     ) r ON r.code = ic.code
     ORDER BY created_at DESC
     LIMIT ?`,
  ).bind(limit).all<InviteListRow>();
  return { invites: rows.results || [], limit };
}

/** Creates one bounded batch of invite codes and records the matching admin audit event. */
export async function createAdminInvites(db: D1Database, adminUserId: string, body: unknown) {
  const payload: JsonObject = isJsonObject(body) ? body : {};
  const note = String(payload.note || '').trim();
  const count = boundedInt(payload.count, 1, 1, 50);
  const maxUses = boundedInt(payload.max_uses, 1, 1, 1000);
  const maxExpiryMs = nowMs() + 30 * 24 * 60 * 60 * 1000;
  const requestedExpiresAt = payload.expires_at ? Number(payload.expires_at) : null;
  const expiresAt = Number.isFinite(requestedExpiresAt) && Number(requestedExpiresAt) > 0 ? Math.min(Number(requestedExpiresAt), maxExpiryMs) : null;
  const createdAt = nowMs();
  const codes: string[] = [];
  const statements: D1PreparedStatement[] = [];
  for (let index = 0; index < count; index += 1) {
    const code = randomCode(10);
    const rowNote = count > 1 ? `${note || 'invite'} #${index + 1}` : note;
    statements.push(db.prepare(
      `INSERT INTO invite_codes (code, created_at, created_by, note, max_uses, uses, expires_at, revoked)
       VALUES (?, ?, ?, ?, ?, 0, ?, 0)`,
    ).bind(code, createdAt, adminUserId, rowNote, maxUses, expiresAt));
    codes.push(code);
  }
  statements.push(buildAdminEventStatement(db, {
    adminUserId, action: 'invite_create', targetUserId: null,
    meta: { codes, count, max_uses: maxUses, note, expires_at: expiresAt, expiry_cap_days: 30 },
  }));
  await db.batch(statements);
  return { ok: true, code: codes[0], codes };
}

export type UpdateAdminInviteResult =
  | { kind: 'invalid' }
  | { kind: 'not-found' }
  | { kind: 'updated'; code: string; revoked: boolean };

/** Validates and conditionally updates an invite, auditing only a real change. */
export async function updateAdminInvite(db: D1Database, adminUserId: string, body: unknown): Promise<UpdateAdminInviteResult> {
  if (!isJsonObject(body)) return { kind: 'invalid' };
  const code = String(body.code || '').trim();
  if (!code || typeof body.revoked !== 'boolean') return { kind: 'invalid' };
  const revoked = body.revoked ? 1 : 0;
  const inviteStatement = db.prepare('UPDATE invite_codes SET revoked = ? WHERE code = ?').bind(revoked, code);
  const auditStatement = buildAdminEventAfterChangeStatement(db, {
    adminUserId, action: 'invite_update', targetUserId: null, meta: { code, revoked },
  });
  const [inviteResult] = await db.batch([inviteStatement, auditStatement]);
  if (changedRows(inviteResult) === 0) return { kind: 'not-found' };
  return { kind: 'updated', code, revoked: revoked === 1 };
}
