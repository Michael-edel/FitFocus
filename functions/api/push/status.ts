import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { hasPushConfig } from "../_lib/push";

type Env = {
  AUTH_JWT_SECRET?: string;
  DB?: D1Database;
  PUSH_VAPID_PUBLIC_KEY?: string;
  PUSH_VAPID_PRIVATE_KEY?: string;
  PUSH_VAPID_SUBJECT?: string;
};

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

  return json({
    ok: true,
    configured: hasPushConfig(env),
    count: items.length,
    subscriptions: items,
  }, 200);
};
