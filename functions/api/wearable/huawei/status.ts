import type { PagesFunction } from "@cloudflare/workers-types";
import { requireUser, json } from "../../_lib/auth";
import { requireBetaAccess } from "../../_lib/access";
import { requireDB } from "../../_lib/db";
import { getHuaweiConfig, huaweiProviderId, readHuaweiMetadata, type HuaweiConnectionRow, type HuaweiHealthEnv } from "../../_lib/huawei_health";

type Env = HuaweiHealthEnv & { DB: D1Database };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const config = getHuaweiConfig(env, request);
  let user;
  try {
    user = await requireUser(request, env);
    await requireBetaAccess(env, user);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const row = await requireDB(env)
    .prepare("SELECT * FROM wearable_connections WHERE user_id = ? AND provider = ? LIMIT 1")
    .bind(user.sub, huaweiProviderId())
    .first<HuaweiConnectionRow>();

  return json({
    provider: huaweiProviderId(),
    configured: config.missing.length === 0,
    missingConfig: config.missing,
    connected: row?.status === "connected",
    status: row?.status || "disconnected",
    scope: row?.scope || "",
    expiresAt: row?.expires_at || null,
    lastSyncAt: row?.last_sync_at || null,
    metadata: row ? readHuaweiMetadata(row) : {},
  });
};
