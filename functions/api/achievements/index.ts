import { ACHIEVEMENT_CATALOG } from "../../../achievements/catalog";
import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { isEnabled, loadFeatures } from "../_lib/features";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };

function safeParseSnapshot(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(String(value));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const features = await loadFeatures(env as any, String(user.sub));
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
    .all();

  const unlocked = (results || []).map((row: any) => ({
    key: String(row.achievement_key || ""),
    unlocked_at: Number(row.unlocked_at || 0),
    tier: String(row.tier || ""),
    source: row.source ? String(row.source) : null,
    snapshot: safeParseSnapshot(row.snapshot_json),
    created_at: Number(row.created_at || 0),
  }));

  return json({ enabled: true, catalog: ACHIEVEMENT_CATALOG, unlocked }, 200);
};
