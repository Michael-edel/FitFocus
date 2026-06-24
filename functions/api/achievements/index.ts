import { ACHIEVEMENT_CATALOG } from "../../../achievements/catalog";
import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
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
    snapshot: row.snapshot_json ? JSON.parse(String(row.snapshot_json)) : null,
    created_at: Number(row.created_at || 0),
  }));

  return json({ catalog: ACHIEVEMENT_CATALOG, unlocked }, 200);
};
