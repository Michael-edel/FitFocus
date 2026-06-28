import type { PagesFunction } from "@cloudflare/workers-types";
import { requireUser, json } from "../../_lib/auth";
import { requireBetaAccess } from "../../_lib/access";
import { requireDB } from "../../_lib/db";
import { huaweiProviderId, type HuaweiHealthEnv } from "../../_lib/huawei_health";
import { safeJsonParseObject, type JsonObject } from "../../_lib/json";
import { withProtectedFields } from "../../_lib/legacy_sync";
import { loadActivePlan } from "../../_lib/plans";

type Env = HuaweiHealthEnv & { DB: D1Database };

async function loadProfile(db: D1Database, userId: string): Promise<{ profile: JsonObject; version: number }> {
  const row = await db
    .prepare("SELECT profile_json, version FROM user_profiles WHERE user_id = ?")
    .bind(userId)
    .first<{ profile_json?: string; version?: number }>();
  return {
    profile: row?.profile_json ? (safeJsonParseObject(String(row.profile_json)) || {}) : {},
    version: Number(row?.version || 0),
  };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
    await requireBetaAccess(env, user);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }
  const db = requireDB(env);
  const provider = huaweiProviderId();
  await db.prepare("DELETE FROM wearable_connections WHERE user_id = ? AND provider = ?").bind(user.sub, provider).run();

  const current = await loadProfile(db, user.sub);
  const profile = current.profile;
  if (profile.wearableProvider !== provider) {
    return json({ disconnected: true, profile, version: current.version });
  }

  const version = current.version + 1;
  const plan = await loadActivePlan(db, user.sub);
  const nextProfile = withProtectedFields(user, {
    ...profile,
    plan,
    version,
    wearableEnabled: false,
  });
  await db
    .prepare(
      "INSERT INTO user_profiles (user_id, profile_json, updated_at, version) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(user_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at, version = excluded.version"
    )
    .bind(user.sub, JSON.stringify(nextProfile), Date.now(), version)
    .run();
  return json({ disconnected: true, profile: nextProfile, version });
};
