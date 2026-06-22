// /api/shopping/export
// GET: CSV export of aggregated shopping list for a week (per user)
import { json, requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, toApiError } from "../_lib/db";
import { aggregateShoppingRows } from "../_lib/ingredients";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

function isIsoDay(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function formatQty(grams: number) {
  if (grams >= 1000) {
    const kg = Math.round((grams / 1000) * 10) / 10;
    return `${kg} кг`;
  }
  return `${grams} г`;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const url = new URL(request.url);
    const week = String(url.searchParams.get("week") || "");
    if (!isIsoDay(week)) {
      return new Response("BAD_WEEK", { status: 400 });
    }

    const rows = await db.prepare(
      `SELECT ingredient_name as name, grams
       FROM weekly_menu_items
       WHERE user_id = ? AND week_start = ? AND family_id IS NULL
       ORDER BY ingredient_name`
    ).bind(user.sub, week).all<any>();

    const items = aggregateShoppingRows(rows?.results || []);

    const lines = ["Продукт,Количество"];
    for (const it of items) {
      // Escape commas/quotes
      const safeName = `"${it.name.replace(/"/g, '""')}"`;
      const qty = `"${formatQty(it.grams)}"`;
      lines.push(`${safeName},${qty}`);
    }
    const csv = lines.join("\n");

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="shopping_${week}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "FORBIDDEN" ? 403 : 400);
  }
};
