// /api/shopping/list
// GET: aggregated shopping list for a week
// - personal scope: per user (family_id is NULL)
// - family scope: aggregated for the whole family (family_id provided) if user is an active member
import { json, requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, toApiError } from "../_lib/db";

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

      // Ensure current user is in this family (active)
      const mem = await db
        .prepare(
          `SELECT 1 AS ok
           FROM family_members
           WHERE family_id = ? AND user_id = ? AND status = 'active'
           LIMIT 1`
        )
        .bind(famId, user.sub)
        .first<any>();
      if (!mem) return json({ error: "FORBIDDEN" }, 403);

      const rows = await db
        .prepare(
          `SELECT ingredient_name as name, SUM(grams) as grams
           FROM weekly_menu_items
           WHERE week_start = ? AND family_id = ?
           GROUP BY ingredient_name
           ORDER BY ingredient_name`
        )
        .bind(week, famId)
        .all<any>();

      const items = (rows?.results || [])
        .map((r: any) => ({
          name: String(r.name || "").trim(),
          grams: Math.max(0, Math.round(Number(r.grams || 0))),
        }))
        .filter((it: any) => it.name && it.grams > 0);

      const totalGrams = items.reduce((s: number, it: any) => s + it.grams, 0);
      return json({ week_start: week, family_id: famId, items, total_grams: totalGrams });
    }

    // Personal scope
    const rows = await db
      .prepare(
        `SELECT ingredient_name as name, SUM(grams) as grams
         FROM weekly_menu_items
         WHERE user_id = ? AND week_start = ? AND family_id IS NULL
         GROUP BY ingredient_name
         ORDER BY ingredient_name`
      )
      .bind(user.sub, week)
      .all<any>();

    const items = (rows?.results || [])
      .map((r: any) => ({
        name: String(r.name || "").trim(),
        grams: Math.max(0, Math.round(Number(r.grams || 0))),
      }))
      .filter((it: any) => it.name && it.grams > 0);

    const totalGrams = items.reduce((s: number, it: any) => s + it.grams, 0);
    return json({ week_start: week, items, total_grams: totalGrams });
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "FORBIDDEN" ? 403 : 400);
  }
};
