// Cloudflare Pages Function: /api/bootstrap
// Single request to hydrate app state after login (server-driven).
// Returns: { user, profile, kv }

import { requireUser, json } from "./_lib/auth";
import { requireBetaAccess } from "./_lib/access";
import { loadFeatures } from "./_lib/features";
import { requireDB } from "./_lib/db";
import { loadCurrentProfile } from './_lib/profile_read';
import { APP_VERSION_LABEL, API_SCHEMA_VERSION, DATA_SCHEMA_VERSION, DB_MIGRATION_VERSION } from "../../versioning";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database; REQUIRE_INVITE?: string };


export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  try {
    await requireBetaAccess(env, user);
  } catch {
    return json({ error: "ACCESS_REQUIRED" }, 403);
  }

  const db = requireDB(env);

  const profile = await loadCurrentProfile(db, user);

  // Load KV only for this user's fitfocus_data prefix
  const prefix = `fitfocus_data_${user.sub}_`;
  const { results } = await db
    .prepare("SELECT k, v, version, updated_at FROM user_kv WHERE user_id = ? AND k LIKE ?")
    .bind(user.sub, prefix + "%")
    .all<{ k: string; v: string; version?: number; updated_at?: number }>();
  const items = (results || []).map((r) => ({ key: r.k, value: r.v, version: r.version, updated_at: r.updated_at }));

  const features = await loadFeatures(env, String(user.sub));

  return json({
    schema_version: API_SCHEMA_VERSION,
    app_version: APP_VERSION_LABEL,
    data_schema_version: DATA_SCHEMA_VERSION,
    db_migration_version: DB_MIGRATION_VERSION,
    user,
    profile,
    roles: user.roles,
    features,
    items,
  }, 200);
};
