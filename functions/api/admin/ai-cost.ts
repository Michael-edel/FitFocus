// /api/admin/ai-cost
// Admin-only AI cost analytics (D1).
import { json } from '../_lib/auth';
import { requireDB } from '../_lib/db';
import { requireAdminRequest } from '../_lib/admin_guard';
import { readAdminAiCost } from '../_lib/admin_ai_cost';
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';

type Env = { DB?: D1Database; AUTH_JWT_SECRET?: string };

const handleAdminAiCostGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await requireAdminRequest(request, env);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'FORBIDDEN') return json({ error: 'FORBIDDEN' }, 403);
    if (code === 'AUTH_CONFIG' || code === 'DB_CONFIG') return json({ error: 'SERVER_CONFIG' }, 500);
    return json({ error: 'UNAUTH' }, 401);
  }

  return json(await readAdminAiCost(requireDB(env)));
};

/** Emits status-only telemetry so user email and usage values never reach server logs. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await handleAdminAiCostGet(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('admin.ai_cost.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
