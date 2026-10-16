// /api/family/menu
// GET: returns shared menu for week + personalized portions for current user
// POST: saves the family's weekly menu as the server source of truth
import { requireUser } from '../_lib/auth';
import { requireDB, ensureUserRow, toApiError } from '../_lib/db';
import { defaultFamilyMenuWeekStart, readFamilyMenu, saveFamilyMenu } from '../_lib/family_menu';
import { familyResponse } from '../_lib/family_response';
import { requestIdFor } from '../_lib/observability';
import { readJsonRequest, RequestBodyTooLargeError } from '../_lib/request_body';

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };
const FAMILY_MENU_JSON_BODY_LIMIT_BYTES = 256 * 1024;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdFor(request);
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const requestedWeek = new URL(request.url).searchParams.get('week');
    const result = await readFamilyMenu({
      db,
      userId: user.sub,
      weekStart: requestedWeek || defaultFamilyMenuWeekStart(),
    });
    if (result.kind === 'invalid-week') return familyResponse('family.menu.read', requestId, { error: 'BAD_WEEK' }, 400);
    if (result.kind === 'empty') return familyResponse('family.menu.read', requestId, { weekStart: result.weekStart, shared: null, portions: null }, 200);
    return familyResponse('family.menu.read', requestId, {
      weekStart: result.weekStart,
      shared: result.shared,
      portions: result.portions,
    }, 200);
  } catch (error: unknown) {
    const apiErr = toApiError(error);
    return familyResponse('family.menu.read', requestId, { error: apiErr }, apiErr.code === 'UNAUTH' ? 401 : apiErr.code === 'PLAN_REQUIRED_FAMILY' ? 402 : 400);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdFor(request);
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    let body: unknown = {};
    try {
      body = await readJsonRequest(request, FAMILY_MENU_JSON_BODY_LIMIT_BYTES) ?? {};
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return familyResponse('family.menu.save', requestId, { error: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' }, 413);
      }
      throw error;
    }

    const result = await saveFamilyMenu({ db, userId: user.sub, body });
    if (result.kind === 'invalid') return familyResponse('family.menu.save', requestId, { error: result.error }, 400);
    return familyResponse('family.menu.save', requestId, { ok: true, weekStart: result.weekStart, menuId: result.menuId }, 200);
  } catch (error: unknown) {
    const apiErr = toApiError(error);
    return familyResponse('family.menu.save', requestId, { error: apiErr }, apiErr.code === 'UNAUTH' ? 401 : apiErr.code === 'PLAN_REQUIRED_FAMILY' ? 402 : 400);
  }
};
