// Cloudflare Pages Function: /api/admin/user_detail
// Admin-only deep user card for the console.
import { requireUser, json } from '../_lib/auth';
import { requireDB } from '../_lib/db';
import { requireRole } from '../_lib/rbac';
import { requireAdminRequest } from '../_lib/admin_guard';
import { readAdminUserDetail } from '../_lib/admin_user_detail';
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

const handleAdminUserDetailGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: 'UNAUTH' }, 401); }
  try { requireRole(user, 'admin'); } catch { return json({ error: 'FORBIDDEN' }, 403); }
  const db = requireDB(env);
  await requireAdminRequest(user, request, db);

  const userId = String(new URL(request.url).searchParams.get('user_id') || '').trim();
  if (!userId) return json({ error: 'BAD_REQUEST', message: 'user_id required' }, 400);

  const detail = await readAdminUserDetail(db, userId);
  if (!detail) return json({ error: 'NOT_FOUND', message: 'user not found' }, 404);
  return json(detail);
};

/** Emits status-only telemetry; user identifiers and profile fields are never logged. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await handleAdminUserDetailGet(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('admin.user_detail.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
