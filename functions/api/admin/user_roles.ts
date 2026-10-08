import { requireUser, json } from '../_lib/auth';
import { requireDB } from '../_lib/db';
import { requireRole } from '../_lib/rbac';
import { requireAdminRequest } from '../_lib/admin_guard';
import { changeAdminUserRole, readAdminUserRoles } from '../_lib/admin_user_roles';
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from '../_lib/request_body';
import { asString, isJsonObject } from '../_lib/json';
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

async function adminContext(request: Request, env: Env) {
  const user = await requireUser(request, env);
  requireRole(user, 'admin');
  const db = requireDB(env);
  await requireAdminRequest(user, request, db);
  return { user, db };
}

const handleAdminUserRolesGet: PagesFunction<Env> = async ({ request, env }) => {
  let admin;
  try { admin = await adminContext(request, env); } catch (error) {
    return json({ error: (error as { code?: string }).code === 'FORBIDDEN' ? 'FORBIDDEN' : 'UNAUTH' }, (error as { code?: string }).code === 'FORBIDDEN' ? 403 : 401);
  }
  const userId = (new URL(request.url).searchParams.get('user_id') || '').trim();
  if (!userId) return json({ error: 'BAD_REQUEST', message: 'user_id required' }, 400);
  const result = await readAdminUserRoles({ db: admin.db, userId });
  return result ? json(result) : json({ error: 'NOT_FOUND', message: 'User not found' }, 404);
};

const handleAdminUserRolesPost: PagesFunction<Env> = async ({ request, env }) => {
  let admin;
  try { admin = await adminContext(request, env); } catch (error) {
    return json({ error: (error as { code?: string }).code === 'FORBIDDEN' ? 'FORBIDDEN' : 'UNAUTH' }, (error as { code?: string }).code === 'FORBIDDEN' ? 403 : 401);
  }
  let body: unknown = null;
  try { body = await readJsonRequest(request, SMALL_JSON_BODY_LIMIT_BYTES); } catch (err) {
    if (err instanceof RequestBodyTooLargeError) return json({ error: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' }, 413);
    throw err;
  }
  if (!isJsonObject(body)) return json({ error: 'BAD_REQUEST', message: 'user_id and role required' }, 400);
  const userId = asString(body.user_id);
  const role = asString(body.role);
  const action = asString(body.action, 'add');
  if (!userId || !role) return json({ error: 'BAD_REQUEST', message: 'user_id and role required' }, 400);
  const result = await changeAdminUserRole({ db: admin.db, change: { userId, role, action, adminUserId: admin.user.sub } });
  if (result.kind === 'ok') return json({ ok: true, user_id: result.user_id, roles: result.roles });
  if (result.kind === 'not_found') return json({ error: 'NOT_FOUND', message: 'User not found' }, 404);
  if (result.kind === 'bad_action') return json({ error: 'BAD_ACTION', message: 'action must be add or remove' }, 400);
  if (result.kind === 'bad_role') return json({ error: 'BAD_ROLE', message: 'Unknown role' }, 400);
  return json({ error: 'GUARD', message: 'Нельзя удалить роль admin у последнего администратора.' }, 409);
};

async function trace(context: Parameters<PagesFunction<Env>>[0], event: string, handler: PagesFunction<Env>) {
  const response = await handler(context);
  const requestId = requestIdFor(context.request);
  logApiEvent(event, { requestId, status: response.status });
  return withRequestId(response, requestId);
}

export const onRequestGet: PagesFunction<Env> = (context) => trace(context, 'admin.user_roles.get.response', handleAdminUserRolesGet);
export const onRequestPost: PagesFunction<Env> = (context) => trace(context, 'admin.user_roles.post.response', handleAdminUserRolesPost);
