import { requireUser, json } from "../_lib/auth";
import { requireDB, nowMs, uuid } from "../_lib/db";
import { normalizePushDeviceLabel, parsePushSubscription } from "../_lib/push";

type Env = {
  AUTH_JWT_SECRET?: string;
  DB?: D1Database;
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = parsePushSubscription(body?.subscription || body);
  if (!parsed) return json({ error: "BAD_REQUEST" }, 400);

  const db = requireDB(env);
  const t = nowMs();
  const deviceLabel = normalizePushDeviceLabel(body?.deviceLabel, request.headers.get("user-agent"));
  const userAgent = request.headers.get("user-agent");

  await db
    .prepare(
      "INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, content_encoding, device_label, user_agent, created_at, updated_at, last_sent_at, last_error, enabled) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 1) " +
      "ON CONFLICT(endpoint) DO UPDATE SET " +
      "user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, content_encoding = excluded.content_encoding, " +
      "device_label = excluded.device_label, user_agent = excluded.user_agent, updated_at = excluded.updated_at, enabled = 1, last_error = NULL"
    )
    .bind(uuid(), user.sub, parsed.endpoint, parsed.p256dh, parsed.auth, parsed.contentEncoding, deviceLabel, userAgent, t, t)
    .run();

  const { results } = await db
    .prepare("SELECT COUNT(1) AS count FROM push_subscriptions WHERE user_id = ? AND enabled = 1")
    .bind(user.sub)
    .all<any>();

  return json({
    ok: true,
    count: Number(results?.[0]?.count || 0),
    deviceLabel,
  }, 200);
};
