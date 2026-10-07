// GET /api/admin/admin_events - admin audit events (admin-only).
// Supports filters and CSV export: ?q=...&action=...&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=50&offset=0&format=csv
import { requireUser, json } from '../_lib/auth';
import { requireDB } from '../_lib/db';
import { requireRole } from '../_lib/rbac';
import { requireAdminRequest } from '../_lib/admin_guard';
import { exportAdminEventsCsv, readAdminEvents } from '../_lib/admin_event_read';
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

const handleAdminEventsGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: 'UNAUTH' }, 401); }
  try { requireRole(user, 'admin'); } catch { return json({ error: 'FORBIDDEN' }, 403); }

  const db = requireDB(env);
  await requireAdminRequest(user, request, db);
  const url = new URL(request.url);
  const data = await readAdminEvents(db, url.searchParams);

  if ((url.searchParams.get('format') || '').toLowerCase() === 'csv') {
    return new Response(exportAdminEventsCsv(data.events), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Disposition': 'attachment; filename="admin_events.csv"',
      },
    });
  }

  return json({ ok: true, ...data });
};

/** Records only outcome metadata; audit records, filters, and CSV contents are never logged. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await handleAdminEventsGet(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('admin.events.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
