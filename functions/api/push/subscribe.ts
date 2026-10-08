import { requireUser, json } from '../_lib/auth';
import { requireDB } from '../_lib/db';
import { asOptionalString, isJsonObject } from '../_lib/json';
import { normalizePushDeviceLabel, parsePushSubscription } from '../_lib/push';
import { savePushSubscription } from '../_lib/push_subscriptions';
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from '../_lib/request_body';
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

const handlePushSubscribePost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: 'UNAUTH' }, 401); }
  let body: unknown = null;
  try { body = await readJsonRequest(request, SMALL_JSON_BODY_LIMIT_BYTES); } catch (err) {
    if (err instanceof RequestBodyTooLargeError) return json({ error: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' }, 413);
    throw err;
  }
  const payload = isJsonObject(body) ? body : null;
  const subscription = parsePushSubscription(payload?.subscription || payload);
  if (!subscription) return json({ error: 'BAD_REQUEST' }, 400);
  const deviceLabel = normalizePushDeviceLabel(asOptionalString(payload?.deviceLabel), request.headers.get('user-agent'));
  const result = await savePushSubscription({
    db: requireDB(env), userId: user.sub, subscription, deviceLabel,
    browserLabel: asOptionalString(payload?.browserLabel), userAgent: request.headers.get('user-agent'),
  });
  return json(result, 200);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handlePushSubscribePost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('push.subscribe.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
