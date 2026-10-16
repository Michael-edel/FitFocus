import { nowMs, uuid } from './db';
import { getActiveFamilyForUser } from './family_access';
import { asString, isJsonObject } from './json';
import { loadActivePlan } from './plans';

type MutationResult = { meta?: { changes?: number }; changes?: number };
type FamilyInviteRow = { code: string; family_id: string; expires_at: number; used_by_user_id?: string | null };
type ActiveFamilyRow = { id: string; owner_user_id: string };
type CountRow = { c?: number };

function changedRows(result: MutationResult): number {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

export function parseFamilyJoinCode(body: unknown): string {
  if (!isJsonObject(body)) throw new Error('BAD_REQUEST');
  const code = asString(body.code).toUpperCase();
  if (!code) throw new Error('BAD_REQUEST');
  return code;
}

/** Atomically claims an active family invite and adds the current user as a member. */
export async function joinFamilyByInvite({
  db,
  userId,
  body,
}: {
  db: D1Database;
  userId: string;
  body: unknown;
}): Promise<{ familyId: string; alreadyMember?: boolean }> {
  const code = parseFamilyJoinCode(body);

  const existing = await getActiveFamilyForUser(db, userId);
  if (existing) return { familyId: existing.id, alreadyMember: true };

  const invite = await db
    .prepare(
      `SELECT code, family_id, expires_at, used_by_user_id
       FROM family_invites WHERE code = ? LIMIT 1`,
    )
    .bind(code)
    .first<FamilyInviteRow>();

  const now = Math.floor(nowMs() / 1000);
  if (!invite || invite.used_by_user_id || now > invite.expires_at) throw new Error('INVITE_INVALID');

  const activeFamily = await db
    .prepare('SELECT id, owner_user_id FROM families WHERE id = ? AND is_active = 1 LIMIT 1')
    .bind(invite.family_id)
    .first<ActiveFamilyRow>();
  if (!activeFamily) throw new Error('INVITE_INVALID');

  const ownerPlan = await loadActivePlan(db, String(activeFamily.owner_user_id || ''));
  if (ownerPlan !== 'family') throw new Error('FAMILY_PLAN_INACTIVE');

  const memberCount = await db
    .prepare("SELECT COUNT(*) as c FROM family_members WHERE family_id = ? AND status = 'active' AND is_active = 1")
    .bind(invite.family_id)
    .first<CountRow>();
  if ((memberCount?.c || 0) >= 5) throw new Error('FAMILY_LIMIT');

  const inviteClaim = await db
    .prepare('UPDATE family_invites SET used_by_user_id = ?, used_at = ? WHERE code = ? AND used_by_user_id IS NULL AND expires_at >= ?')
    .bind(userId, now, code, now)
    .run();
  if (changedRows(inviteClaim) !== 1) throw new Error('INVITE_INVALID');

  const memberInsert = await db.prepare(
    `INSERT INTO family_members
     (id, family_id, user_id, role, status, is_active, sex, age, height_cm, weight_kg, activity, goal, created_at, updated_at)
     SELECT ?, ?, ?, 'member', 'active', 1, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?
     WHERE (SELECT COUNT(*) FROM family_members WHERE family_id = ? AND status = 'active' AND is_active = 1) < 5
       AND NOT EXISTS (
         SELECT 1
         FROM family_members fm
         JOIN families f ON f.id = fm.family_id
         WHERE fm.user_id = ?
           AND fm.status = 'active'
           AND fm.is_active = 1
           AND f.is_active = 1
       )`,
  ).bind(uuid(), invite.family_id, userId, now, now, invite.family_id, userId).run();

  if (changedRows(memberInsert) !== 1) {
    await db
      .prepare('UPDATE family_invites SET used_by_user_id = NULL, used_at = NULL WHERE code = ? AND used_by_user_id = ?')
      .bind(code, userId)
      .run();
    const latestFamily = await getActiveFamilyForUser(db, userId);
    if (latestFamily) return { familyId: latestFamily.id, alreadyMember: true };
    throw new Error('FAMILY_JOIN_CONFLICT');
  }

  return { familyId: invite.family_id };
}
