// /api/shopping/check
// PATCH/POST: set checked state for a shopping list item (per user/week, optional family scope)
import { requireUser } from '../_lib/auth';
import { requireDB, ensureUserRow, toApiError } from '../_lib/db';
import { requestIdFor } from '../_lib/observability';
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from '../_lib/request_body';
import { updateShoppingCheck } from '../_lib/shopping_checks';
import { tracedJsonResponse } from '../_lib/traced_response';

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

async function handle(request: Request, env: Env, requestId: string): Promise<Response> {
  const user = await requireUser(request, env);
  const db = requireDB(env);
  await ensureUserRow(db, user);

  let body: unknown = {};
  try {
    body = await readJsonRequest(request, SMALL_JSON_BODY_LIMIT_BYTES) ?? {};
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return tracedJsonResponse('shopping.check.response', requestId, { error: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' }, 413);
    }
    throw error;
  }

  const result = await updateShoppingCheck({ db, userId: user.sub, body });
  if (result.kind === 'invalid') return tracedJsonResponse('shopping.check.response', requestId, { error: result.error }, 400);
  return tracedJsonResponse('shopping.check.response', requestId, {
    ok: true,
    week_start: result.weekStart,
    ingredient_name: result.ingredientName,
    checked: result.checked,
  }, 200);
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdFor(request);
  try {
    return await handle(request, env, requestId);
  } catch (error: unknown) {
    const apiErr = toApiError(error);
    return tracedJsonResponse('shopping.check.response', requestId, { error: apiErr }, apiErr.code === 'UNAUTH' ? 401 : apiErr.code === 'FORBIDDEN' ? 403 : apiErr.code === 'PLAN_REQUIRED_FAMILY' ? 402 : 400);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdFor(request);
  try {
    return await handle(request, env, requestId);
  } catch (error: unknown) {
    const apiErr = toApiError(error);
    return tracedJsonResponse('shopping.check.response', requestId, { error: apiErr }, apiErr.code === 'UNAUTH' ? 401 : apiErr.code === 'FORBIDDEN' ? 403 : apiErr.code === 'PLAN_REQUIRED_FAMILY' ? 402 : 400);
  }
};
