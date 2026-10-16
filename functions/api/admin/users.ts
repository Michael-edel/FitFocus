// Cloudflare Pages Function: /api/admin/users
// Admin-only user list/search with product filters.
import { requireUser, json } from '../_lib/auth';
import { requireDB } from '../_lib/db';
import { requireRole } from '../_lib/rbac';
import { requireAdminRequest } from '../_lib/admin_guard';
import { listAdminUsers } from '../_lib/admin_user_list';
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

const handleAdminUsersGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: 'UNAUTH' }, 401); }
  try { requireRole(user, 'admin'); } catch { return json({ error: 'FORBIDDEN' }, 403); }
  const db = requireDB(env);
  await requireAdminRequest(user, request, db);
  return json(await listAdminUsers(db, new URL(request.url).searchParams));
};

/** Correlates list outcomes without logging search terms, filters or user records. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await handleAdminUsersGet(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('admin.users.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
