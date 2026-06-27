import { ACHIEVEMENT_CATALOG } from "../../../achievements/catalog";
import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { isEnabled, loadFeatures } from "../_lib/features";
import { safeJsonParseObject, type JsonObject } from "../_lib/json";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };
type AchievementRow = {
  achievement_key?: string;
  unlocked_at?: number;
  tier?: string;
  source?: string | null;
  snapshot_json?: string | null;
  created_at?: number;
};

function safeParseSnapshot(value: unknown): JsonObject | null {
  if (!value) return null;
  return safeJsonParseObject(String(value));
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const features = await loadFeatures(env, String(user.sub));
  if (!isEnabled(features, "achievements_enabled", true)) {
    return json({ enabled: false, catalog: [], unlocked: [] }, 200);
  }

  const db = requireDB(env);
  const { results } = await db
    .prepare(
      `SELECT achievement_key, unlocked_at, tier, source, snapshot_json, created_at
       FROM user_achievements
       WHERE user_id = ?
       ORDER BY unlocked_at DESC`
    )
    .bind(user.sub)
    .all<AchievementRow>();

  const unlocked = (results || []).map((row) => ({
    key: String(row.achievement_key || ""),
    unlocked_at: Number(row.unlocked_at || 0),
    tier: String(row.tier || ""),
    source: row.source ? String(row.source) : null,
    snapshot: safeParseSnapshot(row.snapshot_json),
    created_at: Number(row.created_at || 0),
  }));

  return json({ enabled: true, catalog: ACHIEVEMENT_CATALOG, unlocked }, 200);
};
