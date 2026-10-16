import { requireUser, json } from '../_lib/auth';
import { requireDB } from '../_lib/db';
import { requireRole } from '../_lib/rbac';
import { requireAdminRequest } from '../_lib/admin_guard';
import { readAdminAiLogs } from '../_lib/admin_ai_logs';
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

const handleAdminAiLogsGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: 'UNAUTH' }, 401); }
  try { requireRole(user, 'admin'); } catch { return json({ error: 'FORBIDDEN' }, 403); }
  const db = requireDB(env);
  await requireAdminRequest(user, request, db);

  const data = await readAdminAiLogs(db, new URL(request.url).searchParams);
  return json({ logs: data.logs });
};

/** Emits no event payload, user ID, feature, or model error text. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await handleAdminAiLogsGet(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('admin.ai_logs.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
