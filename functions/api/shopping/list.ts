// /api/shopping/list
// GET: aggregated shopping list for a week (per user, optional family scope)
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

    if (!isIsoDay(week)) return json({ error: "BAD_WEEK" }, { status: 400 });

    const q = family_id
      ? `SELECT ingredient_name as name, SUM(grams) as grams
         FROM weekly_menu_items
         WHERE user_id = ? AND week_start = ? AND family_id = ?
         GROUP BY ingredient_name
         ORDER BY ingredient_name`
      : `SELECT ingredient_name as name, SUM(grams) as grams
         FROM weekly_menu_items
         WHERE user_id = ? AND week_start = ? AND family_id IS NULL
         GROUP BY ingredient_name
         ORDER BY ingredient_name`;

    const stmt = family_id ? db.prepare(q).bind(user.sub, week, String(family_id)) : db.prepare(q).bind(user.sub, week);
    const rows = await stmt.all<any>();

    const items = (rows?.results || []).map((r: any) => ({
      name: String(r.name || "").trim(),
      grams: Math.max(0, Math.round(Number(r.grams || 0))),
    })).filter((it: any) => it.name && it.grams > 0);

    const totalGrams = items.reduce((s: number, it: any) => s + it.grams, 0);

    return json({ week_start: week, items, total_grams: totalGrams });
  } catch (e: any) {
    return toApiError(e);
  }
};
