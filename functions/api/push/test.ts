import { requireUser, json } from "../_lib/auth";
import { requireDB, nowMs } from "../_lib/db";
import { buildPushPayload } from "../_lib/push";
import { deliverPushTest } from '../_lib/push_test_delivery';
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";
import { asString, isJsonObject } from "../_lib/json";
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';

type Env = {
  AUTH_JWT_SECRET?: string;
  DB?: D1Database;
  PUSH_VAPID_PUBLIC_KEY?: string;
  PUSH_VAPID_PRIVATE_KEY?: string;
  PUSH_VAPID_SUBJECT?: string;
};
const handlePushTestPost: PagesFunction<Env> = async ({ request, env }) => {
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
  const result = await deliverPushTest({ db, env, userId: user.sub, endpoint, payload });
  if (result.kind === 'no-subscriptions') return json({ ok: false, error: 'NO_SUBSCRIPTIONS' }, 404);

  return json({
    ok: true,
    sent: result.sent,
    failed: result.failed,
    removed: result.removed,
    failures: result.failures,
    payload,
  }, 200);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handlePushTestPost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('push.test.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
