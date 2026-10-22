import { safeJsonParseObject, type JsonObject } from './json';

type AchievementRow = {
  achievement_key?: string;
  unlocked_at?: number;
  tier?: string;
  source?: string | null;
  snapshot_json?: string | null;
  created_at?: number;
};

function safeParseSnapshot(value: unknown): JsonObject | null {
  return value ? safeJsonParseObject(String(value)) : null;
}

/** Loads the current user's earned achievement records with safely parsed snapshots. */
export async function readUserAchievements(db: D1Database, userId: string) {
  const { results } = await db.prepare(
    `SELECT achievement_key, unlocked_at, tier, source, snapshot_json, created_at
     FROM user_achievements
     WHERE user_id = ?
     ORDER BY unlocked_at DESC`,
  ).bind(userId).all<AchievementRow>();
  return (results || []).map((row) => ({
    key: String(row.achievement_key || ''),
    unlocked_at: Number(row.unlocked_at || 0),
    tier: String(row.tier || ''),
    source: row.source ? String(row.source) : null,
    snapshot: safeParseSnapshot(row.snapshot_json),
    created_at: Number(row.created_at || 0),
  }));
}
