// /api/shopping/list
// GET: aggregated shopping list for a week
// - personal scope: per user (family_id is NULL)
// - family scope: aggregated for the whole family (family_id provided) if user is an active member
import { json, requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, toApiError } from "../_lib/db";
import { requireFamilyMember } from "../_lib/family_access";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

function isIsoDay(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const url = new URL(request.url);
    const week = String(url.searchParams.get("week") || "");
    const family_id = url.searchParams.get("family_id");

    if (!isIsoDay(week)) return json({ error: "BAD_WEEK" }, 400);

    if (family_id) {
      const famId = String(family_id);
      const sharedUserId = `family:${famId}`;

      await requireFamilyMember(db, famId, user.sub);

      const rows = await db
        .prepare(
          `SELECT
             w.ingredient_name as name,
             SUM(w.grams) as grams,
             COALESCE(MAX(sc_shared.checked), MAX(sc_user.checked), 0) as checked
           FROM weekly_menu_items w
           LEFT JOIN shopping_checked sc_shared
             ON sc_shared.user_id = ?
            AND sc_shared.week_start = ?
            AND sc_shared.family_id = ?
            AND sc_shared.ingredient_name = w.ingredient_name
           LEFT JOIN shopping_checked sc_user
             ON sc_user.user_id = ?
            AND sc_user.week_start = ?
            AND sc_user.family_id = ?
            AND sc_user.ingredient_name = w.ingredient_name
           WHERE w.week_start = ? AND w.family_id = ?
           GROUP BY w.ingredient_name
           ORDER BY w.ingredient_name`
        )
        .bind(sharedUserId, week, famId, user.sub, week, famId, week, famId)
        .all<any>();

      const items = (rows?.results || [])
        .map((r: any) => ({
          name: String(r.name || "").trim(),
          grams: Math.max(0, Math.round(Number(r.grams || 0))),
          checked: Boolean(r.checked),
        }))
        .filter((it: any) => it.name && it.grams > 0);

      const totalGrams = items.reduce((s: number, it: any) => s + it.grams, 0);
      return json({ week_start: week, family_id: famId, items, total_grams: totalGrams });
    }

    // Personal scope
    const rows = await db
      .prepare(
        `SELECT
           w.ingredient_name as name,
           SUM(w.grams) as grams,
           COALESCE(MAX(sc.checked), 0) as checked
         FROM weekly_menu_items w
         LEFT JOIN shopping_checked sc
           ON sc.user_id = ?
          AND sc.week_start = ?
          AND sc.family_id IS NULL
          AND sc.ingredient_name = w.ingredient_name
         WHERE w.user_id = ? AND w.week_start = ? AND w.family_id IS NULL
         GROUP BY w.ingredient_name
         ORDER BY w.ingredient_name`
      )
      .bind(user.sub, week, user.sub, week)
      .all<any>();

    const items = (rows?.results || [])
      .map((r: any) => ({
        name: String(r.name || "").trim(),
        grams: Math.max(0, Math.round(Number(r.grams || 0))),
        checked: Boolean(r.checked),
      }))
      .filter((it: any) => it.name && it.grams > 0);

    const totalGrams = items.reduce((s: number, it: any) => s + it.grams, 0);
    return json({ week_start: week, items, total_grams: totalGrams });
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "FORBIDDEN" ? 403 : 400);
  }
};
