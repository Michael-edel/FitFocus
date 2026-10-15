import { requireScopedStateUser, withSessionGuard } from '../../_lib/state_session';
import { requireDB, toApiError } from '../../_lib/db';
import { familyMenuStateReady, readFamilyMenuState, writeFamilyMenuState } from '../../_lib/family_menu_state';
import { isFamilyWeek } from '../../../../familyMenuValidation';
import { requestIdFor } from '../../_lib/observability';
import { tracedJsonResponse } from '../../_lib/traced_response';
import { readJsonRequest, RequestBodyTooLargeError } from '../../_lib/request_body';

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

async function handle(context: Parameters<PagesFunction<Env>>[0], write: boolean): Promise<Response> {
  const { request, env } = context;
  const requestId = requestIdFor(request);
  const json = (body: unknown, status = 200) => tracedJsonResponse(`family.menu.state.${write ? 'write' : 'read'}.response`, requestId, body, status);
  try {
    const user = await requireScopedStateUser(request, env);
    const db = requireDB(env);
    if (!await familyMenuStateReady(db)) return json({ error: 'FAMILY_MENU_MIGRATION_REQUIRED' }, 503);
    if (!write) {
      const url = new URL(request.url), familyId = url.searchParams.get('familyId'), weekStart = url.searchParams.get('week');
      if (!familyId || !isFamilyWeek(weekStart)) return json({ error: 'BAD_TARGET' }, 400);
      return json({ snapshot: await readFamilyMenuState(db, user.sub, familyId, weekStart) });
    }
    const body = await readJsonRequest(request, 256 * 1024);
    const result = await writeFamilyMenuState(db, user.sub, body);
    if (result.kind === 'invalid') return json({ error: result.error }, result.error === 'FAMILY_MENU_STATE_REQUIRED' ? 409 : 422);
    if (result.kind === 'conflicted') return json({ error: 'VERSION_CONFLICT', snapshot: result.snapshot }, 409);
    return json({ ok: true, snapshot: result.snapshot });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return json({ error: 'PAYLOAD_TOO_LARGE' }, 413);
    const apiError = toApiError(error);
    const status = ['UNAUTH', 'STATE_SESSION_CHANGED', 'STATE_SESSION_REQUIRED'].includes(apiError.code) ? 401 : apiError.code === 'FORBIDDEN' ? 403
      : apiError.code === 'PLAN_REQUIRED_FAMILY' ? 402 : apiError.code === 'FAMILY_MENU_CORRUPT' ? 409
      : apiError.code === 'FAMILY_MENU_MIGRATION_REQUIRED' ? 503 : 500;
    return json({ error: apiError }, status);
  }
}
export const onRequestGet: PagesFunction<Env> = async context => withSessionGuard(await handle(context, false), context.request, 'Family-Menu');
export const onRequestPut: PagesFunction<Env> = async context => withSessionGuard(await handle(context, true), context.request, 'Family-Menu');
