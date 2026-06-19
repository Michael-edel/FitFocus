// Cloudflare Pages Function: /api/bootstrap
// Single request to hydrate app state after login (server-driven).
// Returns: { user, profile, kv }

import { requireUser, json } from "./_lib/auth";
import { loadFeatures } from "./_lib/features";
import { requireDB } from "./_lib/db";
import { migrateLegacyAccountByEmail } from "./_lib/legacy_sync";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };


export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const db = requireDB(env);

  const profRow = await db
    .prepare("SELECT profile_json FROM user_profiles WHERE user_id = ?")
    .bind(user.sub)
    .first<{ profile_json: string }>();

  let profile = profRow?.profile_json ? safeParse(profRow.profile_json) : null;
  if (!profile) {
    profile = await migrateLegacyAccountByEmail(db, user as any);
  }

  // Load KV only for this user's fitfocus_data prefix
  const prefix = `fitfocus_data_${user.sub}_`;
  const { results } = await db
    .prepare("SELECT k, v FROM user_kv WHERE user_id = ? AND k LIKE ?")
    .bind(user.sub, prefix + "%")
    .all<{ k: string; v: string }>();
  const items = (results || []).map((r) => ({ key: r.k, value: r.v }));

  const features = await loadFeatures(env);

  return json({ schema_version: 3, user, profile, roles: user.roles, features, items }, 200);
};

function safeParse(s: string) {
  try { return JSON.parse(s); } catch { return null; }
}
