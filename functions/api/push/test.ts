import { requireUser, json } from "../_lib/auth";
import { requireDB, nowMs } from "../_lib/db";
import { buildPushPayload, sendPushNotification } from "../_lib/push";

type Env = {
  AUTH_JWT_SECRET?: string;
  DB?: D1Database;
  PUSH_VAPID_PUBLIC_KEY?: string;
  PUSH_VAPID_PRIVATE_KEY?: string;
  PUSH_VAPID_SUBJECT?: string;
};

function isGoneError(error: any) {
  const status = Number(error?.statusCode || error?.status || error?.code || 0);
  return status === 404 || status === 410;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const body = await request.json().catch(() => null);
  const endpoint = String(body?.endpoint || "").trim();
  const payload = buildPushPayload({
    title: String(body?.title || "FitFocus"),
    body: String(body?.body || "Тестовое push-уведомление FitFocus успешно доставляется."),
    url: String(body?.url || "/"),
    tag: String(body?.tag || "fitfocus-test"),
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
    .all<any>();

  const subscriptions = results || [];
  if (!subscriptions.length) {
    return json({ ok: false, error: "NO_SUBSCRIPTIONS" }, 404);
  }

  let sent = 0;
  let removed = 0;
  let failed = 0;
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
      if (isGoneError(error)) {
        statements.push(db.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(row.id));
        removed += 1;
      } else {
        statements.push(
          db
          .prepare("UPDATE push_subscriptions SET last_error = ?, updated_at = ? WHERE id = ?")
          .bind(String(error?.message || error || "PUSH_ERROR"), nowMs(), row.id)
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
    payload,
  }, 200);
};
