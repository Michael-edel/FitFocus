import { nowMs, uuid } from './db';
import { getActiveFamilyForUser } from './family_access';
import { isJsonObject } from './json';
import { requireFamilyPlan } from './plans';


export type FamilyRecord = { id: string; name: string; owner_user_id: string; created_at: number };
export type FamilyCreateResult =
  | { kind: 'created'; family: FamilyRecord }
  | { kind: 'existing'; family: FamilyRecord }
  | { kind: 'conflict' };


export function normalizeFamilyName(body: unknown): string {
  const payload = isJsonObject(body) ? body : {};
  if (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.trim().length > 60) throw new Error('BAD_NAME');
  return payload.name.trim();
}

async function readActiveFamily(db: D1Database, userId: string): Promise<FamilyRecord | null> {
  const access = await getActiveFamilyForUser(db, userId);
  return access
    ? await db.prepare('SELECT id, name, owner_user_id, created_at FROM families WHERE id = ? LIMIT 1').bind(access.id).first<FamilyRecord>()
    : null;
}

/** Creates an owner membership only when the user does not already belong to an active family. */
export async function createFamily({
  db,
  userId,
  body,
}: {
  db: D1Database;
  userId: string;
  body: unknown;
}): Promise<FamilyCreateResult> {
  const name = normalizeFamilyName(body);
  await requireFamilyPlan(db, userId);

  const existing = await readActiveFamily(db, userId);
  if (existing) return { kind: 'existing', family: existing };

  const familyId = uuid();
  const createdAt = Math.floor(nowMs() / 1000);
  await db.batch([db.prepare(`INSERT INTO families (id,name,owner_user_id,created_at)
    SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM family_members m JOIN families f ON f.id=m.family_id
      WHERE m.user_id=? AND m.is_active=1 AND m.status='active' AND f.is_active=1)
    AND EXISTS(SELECT 1 FROM subscriptions WHERE user_id=? AND plan='family' AND status IN ('active','trialing') AND (current_period_end IS NULL OR current_period_end>?))`)
      .bind(familyId,name,userId,createdAt,userId,userId,createdAt*1000), db.prepare(
    `INSERT INTO family_members
     (id, family_id, user_id, role, status, is_active, sex, age, height_cm, weight_kg, activity, goal, created_at, updated_at)
     SELECT ?, ?, ?, 'owner', 'active', 1, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?
     WHERE EXISTS(SELECT 1 FROM families WHERE id=?) AND NOT EXISTS (
       SELECT 1
       FROM family_members fm
       JOIN families f ON f.id = fm.family_id
       WHERE fm.user_id = ?
         AND fm.status = 'active'
         AND fm.is_active = 1
         AND f.is_active = 1
     )`,
  ).bind(uuid(), familyId, userId, createdAt, createdAt, familyId, userId)]);

  const accepted = await readActiveFamily(db,userId);
  if (accepted?.id === familyId) {
    return { kind: 'created', family: { id: familyId, name, owner_user_id: userId, created_at: createdAt } };
  }

  const latest = accepted;
  return latest ? { kind: 'existing', family: latest } : { kind: 'conflict' };
}
