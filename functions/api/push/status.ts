import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { hasPushConfig, normalizePushBrowserLabel, normalizePushDeviceLabel } from "../_lib/push";

type Env = {
  AUTH_JWT_SECRET?: string;
  DB?: D1Database;
  PUSH_VAPID_PUBLIC_KEY?: string;
  PUSH_VAPID_PRIVATE_KEY?: string;
  PUSH_VAPID_SUBJECT?: string;
};

function pushConfigDiagnostics(env: Env) {
  const missing: string[] = [];
  if (!env.PUSH_VAPID_PUBLIC_KEY) missing.push("PUSH_VAPID_PUBLIC_KEY");
  if (!env.PUSH_VAPID_PRIVATE_KEY) missing.push("PUSH_VAPID_PRIVATE_KEY");
  if (!env.PUSH_VAPID_SUBJECT) missing.push("PUSH_VAPID_SUBJECT");
  return {
    missing,
    keys: {
      PUSH_VAPID_PUBLIC_KEY: Boolean(env.PUSH_VAPID_PUBLIC_KEY),
      PUSH_VAPID_PRIVATE_KEY: Boolean(env.PUSH_VAPID_PRIVATE_KEY),
      PUSH_VAPID_SUBJECT: Boolean(env.PUSH_VAPID_SUBJECT),
    },
  };
}

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
      "SELECT id, device_label, user_agent, created_at, updated_at, last_sent_at, last_error, enabled FROM push_subscriptions WHERE user_id = ? ORDER BY updated_at DESC"
    )
    .bind(user.sub)
    .all<any>();

  const items = (results || []).map((row) => ({
    id: row.id,
    device_label: row.device_label,
    user_agent: row.user_agent,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_sent_at: row.last_sent_at,
    last_error: row.last_error,
    enabled: Number(row.enabled || 0) === 1,
  }));
  const currentDeviceLabel = normalizePushDeviceLabel(null, request.headers.get("user-agent"));
  const currentBrowserLabel = normalizePushBrowserLabel(request.headers.get("user-agent"), request.headers.get("sec-ch-ua"));
  const enabledItems = items.filter((row) => row.enabled);
  const currentMatch = enabledItems.find((row) => {
    const deviceLabel = normalizePushDeviceLabel(row.device_label, row.user_agent);
    const browserLabel = normalizePushBrowserLabel(row.user_agent);
    return row.enabled && deviceLabel === currentDeviceLabel && browserLabel === currentBrowserLabel;
  }) || (enabledItems.length === 1 ? enabledItems[0] : null);

  const config = pushConfigDiagnostics(env);

  return json({
    ok: true,
    configured: hasPushConfig(env),
    vapid_public_key: env.PUSH_VAPID_PUBLIC_KEY || null,
    missing_config: config.missing,
    config_keys: config.keys,
    checked_at: new Date().toISOString(),
    count: items.length,
    current_subscription_id: currentMatch?.id || null,
    current_device_label: currentMatch?.device_label || currentDeviceLabel,
    current_browser_label: currentBrowserLabel,
    subscriptions: items,
  }, 200);
};
