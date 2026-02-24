// /api/shopping/list
// GET: aggregated shopping list for a week (per user, optional family scope)
// Returns { week_start, items: [{ name, grams, category, checked, display_qty }], total_grams }
import { json, requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, toApiError } from "../_lib/db";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

function isIsoDay(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

type Category = "vegetables" | "fruits" | "protein" | "dairy" | "carbs" | "fat" | "other";

function normalizeCategory(v: any): Category {
  const s = String(v || "").trim().toLowerCase();
  switch (s) {
    case "vegetables":
    case "fruits":
    case "protein":
    case "dairy":
    case "carbs":
    case "fat":
      return s as Category;
    default:
      return "other";
  }
}

function roundUp(amount: number, step: number) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (!Number.isFinite(step) || step <= 0) return Math.ceil(amount);
  return Math.ceil(amount / step) * step;
}

function retailStep(cat: Category, name: string): number {
  const n = name.toLowerCase();
  // eggs: round to packs of 10 pcs-equivalent (we still store grams; this is for display only)
  // We'll handle eggs separately in display formatting when name looks like eggs.
  if (cat === "protein") return 50;
  if (cat === "carbs") return 50;
  if (cat === "dairy") return 100;
  if (cat === "vegetables" || cat === "fruits") return 100;
  if (cat === "fat") return 10;
  return 50;
}

function looksLikeEggs(name: string) {
  const n = name.toLowerCase();
  return n.includes("яйц") || n.includes("egg");
}

function formatQty(grams: number, name: string, cat: Category): string {
  const g = Math.max(0, Math.round(grams));
  if (g === 0) return "0 г";

  // Heuristic: eggs in grams are annoying; if AI provides eggs as grams, show as grams.
  // If later we switch to pcs, this can be upgraded. For now, we keep grams but still round nicely.
  const step = retailStep(cat, name);
  const rounded = roundUp(g, step);

  if (rounded >= 1000) {
    const kg = Math.round((rounded / 1000) * 10) / 10;
    return `${kg} кг`;
  }
  return `${rounded} г`;
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

    // Aggregate weekly_menu_items, keep a best-effort category (MAX(category))
    const q = family_id
      ? `SELECT ingredient_name as name,
                SUM(grams) as grams,
                COALESCE(MAX(category), 'other') as category
         FROM weekly_menu_items
         WHERE user_id = ? AND week_start = ? AND family_id = ?
         GROUP BY ingredient_name
         ORDER BY ingredient_name`
      : `SELECT ingredient_name as name,
                SUM(grams) as grams,
                COALESCE(MAX(category), 'other') as category
         FROM weekly_menu_items
         WHERE user_id = ? AND week_start = ? AND family_id IS NULL
         GROUP BY ingredient_name
         ORDER BY ingredient_name`;

    const stmt = family_id
      ? db.prepare(q).bind(user.sub, week, String(family_id))
      : db.prepare(q).bind(user.sub, week);

    const rows = await stmt.all<any>();
    const rawItems = (rows?.results || [])
      .map((r: any) => ({
        name: String(r.name || "").trim(),
        grams: Math.max(0, Math.round(Number(r.grams || 0))),
        category: normalizeCategory(r.category),
      }))
      .filter((it: any) => it.name && it.grams > 0);

    // Load checked states
    const checkedQ = family_id
      ? `SELECT ingredient_name as name, checked
         FROM shopping_checked
         WHERE user_id = ? AND week_start = ? AND family_id = ?`
      : `SELECT ingredient_name as name, checked
         FROM shopping_checked
         WHERE user_id = ? AND week_start = ? AND family_id IS NULL`;

    const checkedRows = family_id
      ? await db.prepare(checkedQ).bind(user.sub, week, String(family_id)).all<any>()
      : await db.prepare(checkedQ).bind(user.sub, week).all<any>();

    const checkedMap = new Map<string, boolean>(
      (checkedRows?.results || []).map((r: any) => [String(r.name || "").trim(), Number(r.checked || 0) === 1])
    );

    const items = rawItems.map((it) => ({
      name: it.name,
      grams: it.grams,
      category: it.category,
      checked: checkedMap.get(it.name) ?? false,
      display_qty: formatQty(it.grams, it.name, it.category),
    }));

    const totalGrams = items.reduce((s: number, it: any) => s + it.grams, 0);

    return json({ week_start: week, items, total_grams: totalGrams });
  } catch (e: any) {
    return toApiError(e);
  }
};
