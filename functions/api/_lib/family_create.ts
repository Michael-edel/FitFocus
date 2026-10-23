import { nowMs, uuid } from './db';
import { prepareFamilyPrefixBatch } from './family_prefix_fence';
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
  await db.batch(await prepareFamilyPrefixBatch(db, {
    operation: 'create', verifiedUserId: userId, targetFamilyId: familyId,
    requestId: uuid(), memberId: uuid(), name, nowSeconds: createdAt,
  }));

  const accepted = await readActiveFamily(db,userId);
  if (accepted?.id === familyId) {
    return { kind: 'created', family: { id: familyId, name, owner_user_id: userId, created_at: createdAt } };
  }

  const latest = accepted;
  return latest ? { kind: 'existing', family: latest } : { kind: 'conflict' };
}
