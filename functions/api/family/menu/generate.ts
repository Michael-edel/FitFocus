// /api/family/menu/generate
// POST: generate a shared weekly menu and personalized portions for active family members.
import { requireUser } from '../../_lib/auth';
import { ensureUserRow, requireDB, toApiError } from '../../_lib/db';
import { familyResponse } from '../../_lib/family_response';
import { defaultFamilyMenuWeekStart } from '../../_lib/family_menu';
import { generateFamilyMenu } from '../../_lib/family_menu_generate';
import { requestIdFor } from '../../_lib/observability';

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdFor(request);
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);
    const weekStart = new URL(request.url).searchParams.get('week') || defaultFamilyMenuWeekStart();
    const result = await generateFamilyMenu({ db, userId: user.sub, weekStart });
    if (result.kind === 'invalid-week') {
      return familyResponse('family.menu.generate', requestId, { error: "BAD_WEEK" }, 400);
    }
    return familyResponse('family.menu.generate', requestId, {
      ok: true,
      weekStart: result.weekStart,
      menuId: result.menuId,
      shared: { id: result.menuId, familyId: result.familyId, weekStart: result.weekStart, menu: result.menu },
      members: result.memberCount,
    }, 200);
  } catch (error: unknown) {
    const apiErr = toApiError(error);
    return familyResponse('family.menu.generate', requestId, { error: apiErr }, apiErr.code === 'UNAUTH' ? 401 : apiErr.code === 'PLAN_REQUIRED_FAMILY' ? 402 : 400);
  }
};
