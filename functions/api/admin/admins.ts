// GET /api/admin/admins - list admin users (admin-only)
import { requireUser, json } from '../_lib/auth';
import { requireDB } from '../_lib/db';
import { requireRole } from '../_lib/rbac';
import { requireAdminRequest } from '../_lib/admin_guard';
import { listAdministrators } from '../_lib/admin_list';
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

const handleAdminListGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: 'UNAUTH' }, 401); }
  try { requireRole(user, 'admin'); } catch { return json({ error: 'FORBIDDEN' }, 403); }

  const db = requireDB(env);
  await requireAdminRequest(user, request, db);
  return json({ ok: true, admins: await listAdministrators(db) });
};

/** Logs status only; administrator identities and email addresses remain out of telemetry. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await handleAdminListGet(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('admin.list.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
