export type FamilyAccess = {
  id: string;
  owner_user_id: string;
  role: string;
};

export async function getActiveFamilyForUser(db: D1Database, userId: string): Promise<FamilyAccess | null> {
  if (!db || !userId) return null;
  return await db
    .prepare(
      `SELECT f.id, f.owner_user_id, m.role
       FROM families f
       JOIN family_members m ON m.family_id = f.id
       WHERE m.user_id = ?
         AND f.is_active = 1
         AND m.is_active = 1
         AND m.status = 'active'
       LIMIT 1`
    )
    .bind(userId)
    .first<FamilyAccess>();
}

export async function requireActiveFamilyForUser(db: D1Database, userId: string): Promise<FamilyAccess> {
  const family = await getActiveFamilyForUser(db, userId);
  if (!family) throw new Error("NOT_IN_FAMILY");
  return family;
}

export async function requireFamilyMember(
  db: D1Database,
  familyId: string,
  userId: string,
): Promise<FamilyAccess> {
  const family = await db
    .prepare(
      `SELECT f.id, f.owner_user_id, m.role
       FROM families f
       JOIN family_members m ON m.family_id = f.id
       WHERE f.id = ?
         AND m.user_id = ?
         AND f.is_active = 1
         AND m.is_active = 1
         AND m.status = 'active'
       LIMIT 1`
    )
    .bind(familyId, userId)
    .first<FamilyAccess>();
  if (!family) throw new Error("FORBIDDEN");
  return family;
}

export async function requireFamilyOwner(db: D1Database, userId: string): Promise<FamilyAccess> {
  const family = await requireActiveFamilyForUser(db, userId);
  if (family.owner_user_id !== userId) throw new Error("FORBIDDEN");
  return family;
}
