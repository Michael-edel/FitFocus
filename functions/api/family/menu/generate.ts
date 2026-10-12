// /api/family/menu/generate
// POST: generate a shared weekly menu and personalized portions for active family members.
import { requireStateUser, withSessionGuard } from '../../_lib/state_session';
import { ensureUserRow, requireDB, toApiError } from '../../_lib/db';
import { familyResponse } from '../../_lib/family_response';
import { defaultFamilyMenuWeekStart } from '../../_lib/family_menu';
import { generateFamilyMenu } from '../../_lib/family_menu_generate';
import { requestIdFor } from '../../_lib/observability';
import { readJsonRequest, RequestBodyTooLargeError } from '../../_lib/request_body';
import { isRecord } from '../../../../safeJson';

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

const handlePost: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdFor(request);
  try {
    const user = await requireStateUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);
    const weekStart = new URL(request.url).searchParams.get('week') || defaultFamilyMenuWeekStart();
    const body = await readJsonRequest(request, 16 * 1024);
    const result = await generateFamilyMenu({ db, userId: user.sub, weekStart,
      ...(isRecord(body) ? { preview: body.preview === true, familyId: typeof body.familyId === 'string' ? body.familyId : undefined } : {}),
    });
    if (result.kind === 'invalid-week') {
      return familyResponse('family.menu.generate', requestId, { error: "BAD_WEEK" }, 400);
    }
    if (result.kind === 'state-required') return familyResponse('family.menu.generate', requestId, { error: 'FAMILY_MENU_STATE_REQUIRED' }, 409);
    return familyResponse('family.menu.generate', requestId, {
      ok: true,
      weekStart: result.weekStart,
      menuId: result.menuId,
      shared: { id: result.menuId, familyId: result.familyId, weekStart: result.weekStart, menu: result.menu },
      members: result.memberCount,
      ...(result.preview ? { preview: true } : {}),
    }, 200);
  } catch (error: unknown) {
    if (error instanceof RequestBodyTooLargeError) return familyResponse('family.menu.generate', requestId, { error: 'PAYLOAD_TOO_LARGE' }, 413);
    const apiErr = toApiError(error);
    return familyResponse('family.menu.generate', requestId, { error: apiErr }, (apiErr.code === 'UNAUTH' || apiErr.code === 'STATE_SESSION_CHANGED') ? 401 : apiErr.code === 'PLAN_REQUIRED_FAMILY' ? 402 : 400);
  }
};

export const onRequestPost: PagesFunction<Env> = async context =>
  withSessionGuard(await handlePost(context), context.request, 'Family');
