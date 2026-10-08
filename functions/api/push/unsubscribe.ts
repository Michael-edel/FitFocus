import { requireUser, json } from '../_lib/auth';
import { requireDB } from '../_lib/db';
import { asString, isJsonObject } from '../_lib/json';
import { parsePushSubscription } from '../_lib/push';
import { removePushSubscription } from '../_lib/push_subscriptions';
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from '../_lib/request_body';
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

const handlePushUnsubscribePost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: 'UNAUTH' }, 401); }
  let body: unknown = null;
  try { body = await readJsonRequest(request, SMALL_JSON_BODY_LIMIT_BYTES); } catch (err) {
    if (err instanceof RequestBodyTooLargeError) return json({ error: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' }, 413);
    throw err;
  }
  const payload = isJsonObject(body) ? body : null;
  const parsed = parsePushSubscription(payload?.subscription || payload);
  const endpoint = asString(payload?.endpoint || parsed?.endpoint);
  const subscriptionId = asString(payload?.subscriptionId || payload?.id);
  if (!endpoint && !subscriptionId) return json({ error: 'BAD_REQUEST' }, 400);
  return json(await removePushSubscription({ db: requireDB(env), userId: user.sub, endpoint, subscriptionId }), 200);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handlePushUnsubscribePost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('push.unsubscribe.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
