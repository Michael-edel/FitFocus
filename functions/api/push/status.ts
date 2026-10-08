import { requireUser, json } from '../_lib/auth';
import { requireDB } from '../_lib/db';
import { readPushStatus } from '../_lib/push_subscriptions';
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';

type Env = {
  AUTH_JWT_SECRET?: string;
  DB?: D1Database;
  PUSH_VAPID_PUBLIC_KEY?: string;
  PUSH_VAPID_PRIVATE_KEY?: string;
  PUSH_VAPID_SUBJECT?: string;
};

const handlePushStatusGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: 'UNAUTH' }, 401); }
  const payload = await readPushStatus({
    db: requireDB(env), env, userId: user.sub,
    userAgent: request.headers.get('user-agent'),
    browserLabelHeader: request.headers.get('x-fitfocus-browser-label'),
  });
  return json(payload, 200);
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await handlePushStatusGet(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('push.status.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
