// /api/weekly_menu/items
// POST: store normalized weekly shopping list items for the current user (and optional family scope)
// Body: { week_start: 'YYYY-MM-DD', family_id?: string, items: [{name, grams}] }
import { requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, toApiError } from "../_lib/db";
import { readJsonRequest, RequestBodyTooLargeError } from "../_lib/request_body";
import { saveWeeklyMenuItems } from '../_lib/weekly_menu_items';
import { requestIdFor } from '../_lib/observability';
import { tracedJsonResponse } from '../_lib/traced_response';

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };
const WEEKLY_MENU_ITEMS_JSON_BODY_LIMIT_BYTES = 256 * 1024;
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdFor(request);
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    let body: unknown = {};
    try {
      body = await readJsonRequest(request, WEEKLY_MENU_ITEMS_JSON_BODY_LIMIT_BYTES) ?? {};
    } catch (err) {
      if (err instanceof RequestBodyTooLargeError) {
        return tracedJsonResponse('weekly-menu.items.response', requestId, { error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
      }
      throw err;
    }
    const result = await saveWeeklyMenuItems({ db, userId: user.sub, body });
    if (result.kind === 'invalid') return tracedJsonResponse('weekly-menu.items.response', requestId, { error: result.error }, 400);
    return tracedJsonResponse('weekly-menu.items.response', requestId, { ok: true, stored: result.stored, week_start: result.weekStart }, 200);
  } catch (e: unknown) {
    const apiErr = toApiError(e);
    return tracedJsonResponse('weekly-menu.items.response', requestId, { error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "FORBIDDEN" ? 403 : apiErr.code === "PLAN_REQUIRED_FAMILY" ? 402 : 400);
  }
};
