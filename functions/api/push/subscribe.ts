import { requireUser, json } from "../_lib/auth";
import { requireDB, nowMs, uuid } from "../_lib/db";
import { mergePushUserAgentWithBrowserHint, normalizePushDeviceLabel, parsePushSubscription } from "../_lib/push";
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";
import { asOptionalString, isJsonObject } from "../_lib/json";

type Env = {
  AUTH_JWT_SECRET?: string;
  DB?: D1Database;
};
type CountRow = { count?: number };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  let body: unknown = null;
  try {
    body = await readJsonRequest(request, SMALL_JSON_BODY_LIMIT_BYTES);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
    }
    throw err;
  }
  const payload = isJsonObject(body) ? body : null;
  const parsed = parsePushSubscription(payload?.subscription || payload);
  if (!parsed) return json({ error: "BAD_REQUEST" }, 400);

  const db = requireDB(env);
  const t = nowMs();
  const deviceLabel = normalizePushDeviceLabel(asOptionalString(payload?.deviceLabel), request.headers.get("user-agent"));
  const browserLabel = asOptionalString(payload?.browserLabel);
  const userAgent = mergePushUserAgentWithBrowserHint(request.headers.get("user-agent"), browserLabel);

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
    .all<CountRow>();

  return json({
    ok: true,
    count: Number(results?.[0]?.count || 0),
    deviceLabel,
  }, 200);
};
