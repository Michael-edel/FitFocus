import { requireUser, json } from "../_lib/auth";
import { requireDB, nowMs } from "../_lib/db";
import { buildPushPayload, sendPushNotification } from "../_lib/push";
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";
import { asString, isJsonObject } from "../_lib/json";

type Env = {
  AUTH_JWT_SECRET?: string;
  DB?: D1Database;
  PUSH_VAPID_PUBLIC_KEY?: string;
  PUSH_VAPID_PRIVATE_KEY?: string;
  PUSH_VAPID_SUBJECT?: string;
};
type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  content_encoding: string | null;
};

function isGoneError(error: unknown) {
  if (!isJsonObject(error)) return false;
  const status = Number(error.statusCode || error.status || error.code || 0);
  return status === 404 || status === 410;
}

function pushErrorDetails(error: unknown) {
  const errorObject = isJsonObject(error) ? error : null;
  const status = Number(errorObject?.statusCode || errorObject?.status || errorObject?.code || 0);
  const message = String(errorObject?.message || error || "PUSH_ERROR").slice(0, 240);
  return {
    status: Number.isFinite(status) && status > 0 ? status : null,
    message,
  };
}

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
  const payloadInput = isJsonObject(body) ? body : null;
  const endpoint = asString(payloadInput?.endpoint);
  const payload = buildPushPayload({
    title: asString(payloadInput?.title, "FitFocus"),
    body: asString(payloadInput?.body, "Тестовое push-уведомление FitFocus успешно доставляется."),
    url: asString(payloadInput?.url, "/"),
    tag: asString(payloadInput?.tag, "fitfocus-test"),
    data: {
      kind: "test",
      userId: user.sub,
      sentAt: nowMs(),
    },
  });

  const db = requireDB(env);
  const whereSql = endpoint
    ? "WHERE user_id = ? AND endpoint = ? AND enabled = 1"
    : "WHERE user_id = ? AND enabled = 1";
  const binds = endpoint ? [user.sub, endpoint] : [user.sub];
  const { results } = await db
    .prepare(`SELECT id, user_id, endpoint, p256dh, auth, content_encoding FROM push_subscriptions ${whereSql} ORDER BY updated_at DESC`)
    .bind(...binds)
    .all<PushSubscriptionRow>();

  const subscriptions = results || [];
  if (!subscriptions.length) {
    return json({ ok: false, error: "NO_SUBSCRIPTIONS" }, 404);
  }

  let sent = 0;
  let removed = 0;
  let failed = 0;
  const failures: Array<{ id: string; status: number | null; message: string; removed: boolean }> = [];
  const statements: D1PreparedStatement[] = [];

  for (const row of subscriptions) {
    try {
      await sendPushNotification(env, row, payload);
      statements.push(
        db
        .prepare("UPDATE push_subscriptions SET last_sent_at = ?, last_error = NULL, updated_at = ? WHERE id = ?")
        .bind(nowMs(), nowMs(), row.id)
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      const details = pushErrorDetails(error);
      const removedSubscription = isGoneError(error);
      failures.push({
        id: String(row.id || ""),
        ...details,
        removed: removedSubscription,
      });
      if (removedSubscription) {
        statements.push(db.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(row.id));
        removed += 1;
      } else {
        statements.push(
          db
          .prepare("UPDATE push_subscriptions SET last_error = ?, updated_at = ? WHERE id = ?")
          .bind(details.message, nowMs(), row.id)
        );
      }
    }
  }

  if (statements.length) {
    await db.batch(statements);
  }

  return json({
    ok: true,
    sent,
    failed,
    removed,
    failures: failures.slice(0, 5),
    payload,
  }, 200);
};
