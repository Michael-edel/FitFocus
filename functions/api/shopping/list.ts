// /api/shopping/list
// GET: aggregated shopping list for a week, scoped to the caller or their family
import { requireUser } from '../_lib/auth';
import { requireDB, ensureUserRow, toApiError } from '../_lib/db';
import { requestIdFor } from '../_lib/observability';
import { readShoppingList } from '../_lib/shopping_list';
import { tracedJsonResponse } from '../_lib/traced_response';

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdFor(request);
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const url = new URL(request.url);
    const result = await readShoppingList({
      db,
      userId: user.sub,
      weekStart: String(url.searchParams.get('week') || ''),
      familyId: url.searchParams.get('family_id'),
    });
    if (result.kind === 'invalid-week') return tracedJsonResponse('shopping.list.response', requestId, { error: 'BAD_WEEK' }, 400);
    return tracedJsonResponse('shopping.list.response', requestId, {
      week_start: result.weekStart,
      ...(result.familyId ? { family_id: result.familyId } : {}),
      items: result.items,
      total_grams: result.totalGrams,
    }, 200);
  } catch (error: unknown) {
    const apiErr = toApiError(error);
    return tracedJsonResponse('shopping.list.response', requestId, { error: apiErr }, apiErr.code === 'UNAUTH' ? 401 : apiErr.code === 'FORBIDDEN' ? 403 : apiErr.code === 'PLAN_REQUIRED_FAMILY' ? 402 : 400);
  }
};
