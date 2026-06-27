// /api/shopping/list
// GET: aggregated shopping list for a week
// - personal scope: per user
// - family scope: aggregated for the whole family (family_id provided) if user is an active member
import { json, requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, toApiError } from "../_lib/db";
import { requireFamilyMember } from "../_lib/family_access";
import { aggregateShoppingRows, ingredientKey } from "../_lib/ingredients";
import { requireFamilyPlan } from "../_lib/plans";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };
type ShoppingRow = { name?: string | null; grams?: number | null };
type CheckedRow = { name?: string | null; checked?: number | boolean | null };

function isIsoDay(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function getShoppingScopeId(userId: string, familyId?: string | null) {
  return familyId ? `family:${familyId}` : `personal:${userId}`;
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
      const scopeId = getShoppingScopeId(user.sub, famId);

      const fam = await requireFamilyMember(db, famId, user.sub);
      await requireFamilyPlan(db, fam.owner_user_id);

      const rows = await db
        .prepare(
          `SELECT
             w.ingredient_name as name,
             w.grams as grams
           FROM weekly_menu_items w
           WHERE w.week_start = ? AND w.family_id = ?
           ORDER BY w.ingredient_name`
        )
        .bind(week, famId)
        .all<ShoppingRow>();

      const checkedRows = await db
        .prepare(
          `SELECT ingredient_name as name, checked
           FROM shopping_checked
           WHERE scope_id = ? AND week_start = ?`
        )
        .bind(scopeId, week)
        .all<CheckedRow>();

      const checkedByKey = new Map<string, boolean>();
      for (const row of checkedRows?.results || []) {
        const key = ingredientKey(String(row.name || ""));
        if (key) checkedByKey.set(key, Boolean(row.checked) || Boolean(checkedByKey.get(key)));
      }

      const items = aggregateShoppingRows((rows?.results || []).map((row) => ({
        name: row.name,
        grams: row.grams,
        checked: checkedByKey.get(ingredientKey(String(row.name || ""))) || false,
      })));

      const totalGrams = items.reduce((s, it) => s + it.grams, 0);
      return json({ week_start: week, family_id: famId, items, total_grams: totalGrams });
    }

    // Personal scope
    const rows = await db
      .prepare(
        `SELECT
           w.ingredient_name as name,
           w.grams as grams
         FROM weekly_menu_items w
         WHERE w.user_id = ? AND w.week_start = ? AND w.family_id IS NULL
         ORDER BY w.ingredient_name`
      )
      .bind(user.sub, week)
      .all<ShoppingRow>();

    const checkedRows = await db
      .prepare(
        `SELECT ingredient_name as name, checked
         FROM shopping_checked
         WHERE scope_id = ? AND week_start = ?`
      )
      .bind(getShoppingScopeId(user.sub, null), week)
      .all<CheckedRow>();

    const checkedByKey = new Map<string, boolean>();
    for (const row of checkedRows?.results || []) {
      const key = ingredientKey(String(row.name || ""));
      if (key) checkedByKey.set(key, Boolean(row.checked) || Boolean(checkedByKey.get(key)));
    }

    const items = aggregateShoppingRows((rows?.results || []).map((row) => ({
      name: row.name,
      grams: row.grams,
      checked: checkedByKey.get(ingredientKey(String(row.name || ""))) || false,
    })));

    const totalGrams = items.reduce((s, it) => s + it.grams, 0);
    return json({ week_start: week, items, total_grams: totalGrams });
  } catch (e: unknown) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "FORBIDDEN" ? 403 : apiErr.code === "PLAN_REQUIRED_FAMILY" ? 402 : 400);
  }
};
