// /api/shopping/export
// GET: CSV export of aggregated personal shopping list for a week.
import { json } from '../_lib/auth';
import { ensureUserRow, requireDB, toApiError } from '../_lib/db';
import { buildPersonalShoppingExport, isShoppingExportWeek } from '../_lib/shopping_export';
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';
import { requireScopedStateUser, withSessionGuard } from '../_lib/state_session';

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

const handleShoppingExportGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireScopedStateUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);
    const week = String(new URL(request.url).searchParams.get('week') || '');
    if (!isShoppingExportWeek(week)) return new Response('BAD_WEEK', { status: 400 });
    const csv = await buildPersonalShoppingExport(db, user.sub, week);
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="shopping_${week}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    const apiError = toApiError(error);
    return json({ error: apiError }, ['UNAUTH', 'STATE_SESSION_CHANGED', 'STATE_SESSION_REQUIRED'].includes(apiError.code) ? 401 : apiError.code === 'FORBIDDEN' ? 403 : 400);
  }
};

/** Correlates CSV export outcomes without logging list rows or user identity. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await handleShoppingExportGet(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('shopping.export.response', { requestId, status: response.status });
  return withRequestId(withSessionGuard(response, context.request, 'Family'), requestId);
};
