import { getActiveFamilyForUser } from './family_access';
import type { FamilyRecord } from './family_create';

export type FamilyMemberRecord = {
  user_id: string;
  role: string;
  status: string;
  sex?: string | null;
  age?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  activity?: number | null;
  goal?: string | null;
  created_at?: number;
  updated_at?: number;
  restrictions_json?: string | null;
};

export type FamilyContext = {
  family: FamilyRecord | null;
  members: FamilyMemberRecord[];
};

/** Loads only the caller's currently active family and its active members. */
export async function readActiveFamilyContext(db: D1Database, userId: string): Promise<FamilyContext> {
  const access = await getActiveFamilyForUser(db, userId);
  const family = access
    ? await db.prepare('SELECT id, name, owner_user_id, created_at FROM families WHERE id = ? LIMIT 1').bind(access.id).first<FamilyRecord>()
    : null;

  if (!family) return { family: null, members: [] };

  const members = await db
    .prepare(
      `SELECT user_id, role, status, sex, age, height_cm, weight_kg, activity, goal, created_at, updated_at
              , restrictions_json
       FROM family_members
       WHERE family_id = ? AND status = 'active' AND is_active = 1
       ORDER BY role DESC, created_at ASC`,
    )
    .bind(family.id)
    .all<FamilyMemberRecord>();

  return { family, members: members.results || [] };
}
