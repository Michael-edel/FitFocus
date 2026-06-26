// /api/weekly_menu/items
// POST: store normalized weekly shopping list items for the current user (and optional family scope)
// Body: { week_start: 'YYYY-MM-DD', family_id?: string, items: [{name, grams}] }
import { json, requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, uuid, nowMs, toApiError } from "../_lib/db";
import { requireFamilyMember } from "../_lib/family_access";
import { normalizeShoppingIngredient } from "../_lib/ingredients";
import { requireFamilyPlan } from "../_lib/plans";
import { readJsonRequest, RequestBodyTooLargeError } from "../_lib/request_body";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };
const WEEKLY_MENU_ITEMS_JSON_BODY_LIMIT_BYTES = 256 * 1024;

function isIsoDay(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    let body: any = {};
    try {
      body = await readJsonRequest(request, WEEKLY_MENU_ITEMS_JSON_BODY_LIMIT_BYTES) ?? {};
    } catch (err) {
      if (err instanceof RequestBodyTooLargeError) {
        return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
      }
      throw err;
    }
    const week_start = String(body.week_start || "").slice(0, 10);
    const family_id = body.family_id ? String(body.family_id) : null;
    const items = Array.isArray(body.items) ? body.items : [];

    if (!isIsoDay(week_start)) return json({ error: "BAD_WEEK" }, 400);
    if (family_id) {
      const fam = await requireFamilyMember(db, family_id, user.sub);
      await requireFamilyPlan(db, fam.owner_user_id);
    }

    const norm = items
      .map((it: any) => normalizeShoppingIngredient(it?.name, it?.grams))
      .filter((it: any) => it.name && it.grams > 0)
      .slice(0, 500);

    const created_at = nowMs();
    const statements = [
      family_id
        ? db.prepare(
            "DELETE FROM weekly_menu_items WHERE user_id = ? AND week_start = ? AND family_id = ?"
          ).bind(user.sub, week_start, family_id)
        : db.prepare(
            "DELETE FROM weekly_menu_items WHERE user_id = ? AND week_start = ? AND family_id IS NULL"
          ).bind(user.sub, week_start),
      ...norm.map((it: any) => db.prepare(
        "INSERT INTO weekly_menu_items (id, user_id, family_id, week_start, ingredient_name, grams, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(uuid(), user.sub, family_id, week_start, it.name, it.grams, created_at)),
    ];
    await db.batch(statements);

    return json({ ok: true, stored: norm.length, week_start });
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "FORBIDDEN" ? 403 : apiErr.code === "PLAN_REQUIRED_FAMILY" ? 402 : 400);
  }
};
