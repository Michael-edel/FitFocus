import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { parsePushSubscription } from "../_lib/push";
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";
import { asString, isJsonObject } from "../_lib/json";

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
  const endpoint = asString(payload?.endpoint || parsed?.endpoint);
  const subscriptionId = asString(payload?.subscriptionId || payload?.id);
  if (!endpoint && !subscriptionId) return json({ error: "BAD_REQUEST" }, 400);

  const db = requireDB(env);
  const statement = endpoint
    ? db.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").bind(user.sub, endpoint)
    : db.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND id = ?").bind(user.sub, subscriptionId);
  const result = await statement.run();

  const removed = Number((result as { meta?: { changes?: number } }).meta?.changes || 0);

  return json({
    ok: true,
    removed,
  }, 200);
};
