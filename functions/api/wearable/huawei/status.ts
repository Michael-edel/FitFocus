import type { PagesFunction } from "@cloudflare/workers-types";
import { requireUser, json } from "../../_lib/auth";
import { requireBetaAccess } from "../../_lib/access";
import { requireDB } from "../../_lib/db";
import { ensureHuaweiConnectionsSchema, getHuaweiConfig, huaweiProviderId, readHuaweiMetadata, type HuaweiConnectionRow, type HuaweiHealthEnv } from "../../_lib/huawei_health";

type Env = HuaweiHealthEnv & { DB: D1Database };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
    await requireBetaAccess(env, user);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }
  const config = getHuaweiConfig(env, request);

  const db = requireDB(env);
  await ensureHuaweiConnectionsSchema(db);
  const row = await db
    .prepare("SELECT user_id, provider, token_type, scope, expires_at, created_at, updated_at, last_sync_at, status, metadata_json FROM wearable_connections WHERE user_id = ? AND provider = ? LIMIT 1")
    .bind(user.sub, huaweiProviderId())
    .first<HuaweiConnectionRow>();

  return json({
    provider: huaweiProviderId(),
    configured: config.missing.length === 0,
    connected: row?.status === "connected",
    status: row?.status || "disconnected",
    scope: row?.scope || "",
    expiresAt: row?.expires_at || null,
    lastSyncAt: row?.last_sync_at || null,
    metadata: row ? readHuaweiMetadata(row) : {},
  });
};
