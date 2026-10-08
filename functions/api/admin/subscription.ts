import { requireUser, json } from '../_lib/auth';
import { requireDB } from '../_lib/db';
import { requireRole } from '../_lib/rbac';
import { requireAdminRequest } from '../_lib/admin_guard';
import { normalizePlan, updateAdminSubscription } from '../_lib/admin_subscription';
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from '../_lib/request_body';
import { asString, isJsonObject } from '../_lib/json';
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };
const handleAdminSubscriptionPost: PagesFunction<Env> = async ({ request, env }) => {
  let user; try { user = await requireUser(request, env); } catch { return json({ error: 'UNAUTH' }, 401); }
  try { requireRole(user, 'admin'); } catch { return json({ error: 'FORBIDDEN' }, 403); }
  const db = requireDB(env); await requireAdminRequest(user, request, db);
  let body: unknown = null; try { body = await readJsonRequest(request, SMALL_JSON_BODY_LIMIT_BYTES); } catch (error) { if (error instanceof RequestBodyTooLargeError) return json({ error: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' }, 413); throw error; }
  if (!isJsonObject(body)) return json({ error: 'BAD_REQUEST', message: 'user_id and plan are required' }, 400);
  const userId = asString(body.user_id); const plan = normalizePlan(body.plan);
  if (!userId || !plan) return json({ error: 'BAD_REQUEST', message: 'user_id and plan are required' }, 400);
  const result = await updateAdminSubscription({ db, userId, plan, adminUserId: user.sub });
  return result ? json(result) : json({ error: 'NOT_FOUND', message: 'user not found' }, 404);
};
export const onRequestPost: PagesFunction<Env> = async (context) => { const response = await handleAdminSubscriptionPost(context); const requestId = requestIdFor(context.request); logApiEvent('admin.subscription.response', { requestId, status: response.status }); return withRequestId(response, requestId); };
