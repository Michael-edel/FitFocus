import { nowMs, randomCode } from './db';
import { requireFamilyOwner } from './family_access';
import { isJsonObject } from './json';
import { requireFamilyPlan } from './plans';

type MutationResult = { meta?: { changes?: number }; changes?: number };

export type FamilyInviteCreateResult =
  | { ok: true; code: string; expiresAt: number }
  | { ok: false; error: 'INVITE_GENERATION_FAILED' };

function changedRows(result: MutationResult): number {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

export function normalizeFamilyInviteTtlHours(value: unknown): number {
  const parsedTtlHours = Number(value || 72);
  const ttlHours = Number.isFinite(parsedTtlHours) ? parsedTtlHours : 72;
  return Math.max(1, Math.min(24 * 14, ttlHours));
}

/** Issues a time-limited invite for the caller's active family. */
export async function createFamilyInvite({
  db,
  userId,
  body,
}: {
  db: D1Database;
  userId: string;
  body: unknown;
}): Promise<FamilyInviteCreateResult> {
  const family = await requireFamilyOwner(db, userId);
  await requireFamilyPlan(db, userId);

  const payload = isJsonObject(body) ? body : null;
  const ttlHours = normalizeFamilyInviteTtlHours(payload?.ttlHours);
  const now = Math.floor(nowMs() / 1000);
  const expiresAt = now + ttlHours * 3600;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomCode(8);
    const result = await db
      .prepare(
        'INSERT OR IGNORE INTO family_invites (code, family_id, created_by_user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(code, family.id, userId, now, expiresAt)
      .run();
    if (changedRows(result) === 1) return { ok: true, code, expiresAt };
  }

  return { ok: false, error: 'INVITE_GENERATION_FAILED' };
}
