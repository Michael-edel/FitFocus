import type { JsonObject } from "./json";

type ProfileWriteResult = {
  meta?: { changes?: number } | null;
  changes?: number;
};

export function changedRows(result: ProfileWriteResult | null | undefined): number {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

/**
 * Writes a profile only when the caller still has the version it read.
 * Version zero is reserved for first-time profile creation.
 */
export async function writeProfileCas(
  db: D1Database,
  userId: string,
  profile: JsonObject,
  expectedVersion: number,
  updatedAt: number,
): Promise<boolean> {
  const profileJson = JSON.stringify(profile);
  const statement = expectedVersion === 0
    ? db.prepare(
        "INSERT INTO user_profiles (user_id, profile_json, updated_at, version) VALUES (?, ?, ?, ?) " +
          "ON CONFLICT(user_id) DO NOTHING"
      ).bind(userId, profileJson, updatedAt, Number(profile.version || 1))
    : db.prepare(
        "UPDATE user_profiles SET profile_json = ?, updated_at = ?, version = ? " +
          "WHERE user_id = ? AND version = ?"
      ).bind(profileJson, updatedAt, Number(profile.version || expectedVersion + 1), userId, expectedVersion);

  return changedRows(await statement.run()) === 1;
}
