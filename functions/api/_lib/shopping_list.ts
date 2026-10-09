import { requireFamilyMember } from './family_access';
import { aggregateShoppingRows, ingredientKey } from './ingredients';
import { requireFamilyPlan } from './plans';

type ShoppingRow = { name?: string | null; grams?: number | null };
type CheckedRow = { name?: string | null; checked?: number | boolean | null };

export type ShoppingListResult =
  | { kind: 'invalid-week' }
  | { kind: 'loaded'; weekStart: string; familyId?: string; items: Array<{ name: string; grams: number; checked: boolean }>; totalGrams: number };

function isIsoDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function shoppingScopeId(userId: string, familyId: string | null) {
  return familyId ? `family:${familyId}` : `personal:${userId}`;
}

function mergedItems(rows: ShoppingRow[], checkedRows: CheckedRow[]) {
  const checkedByKey = new Map<string, boolean>();
  for (const row of checkedRows) {
    const key = ingredientKey(String(row.name || ''));
    if (key) checkedByKey.set(key, Boolean(row.checked) || Boolean(checkedByKey.get(key)));
  }
  return aggregateShoppingRows(rows.map((row) => ({
    name: row.name,
    grams: row.grams,
    checked: checkedByKey.get(ingredientKey(String(row.name || ''))) || false,
  })));
}

/** Reads an aggregated personal or family shopping list with its persisted checkmarks. */
export async function readShoppingList({
  db,
  userId,
  weekStart,
  familyId,
}: {
  db: D1Database;
  userId: string;
  weekStart: string;
  familyId: string | null;
}): Promise<ShoppingListResult> {
  if (!isIsoDay(weekStart)) return { kind: 'invalid-week' };

  if (familyId) {
    const family = await requireFamilyMember(db, familyId, userId);
    await requireFamilyPlan(db, family.owner_user_id);
    const [rows, checkedRows] = await Promise.all([
      db
        .prepare(
          `SELECT w.ingredient_name as name, w.grams as grams
           FROM weekly_menu_items w
           WHERE w.week_start = ? AND w.family_id = ?
           ORDER BY w.ingredient_name`,
        )
        .bind(weekStart, familyId)
        .all<ShoppingRow>(),
      db
        .prepare(
          `SELECT ingredient_name as name, checked
           FROM shopping_checked
           WHERE scope_id = ? AND week_start = ?`,
        )
        .bind(shoppingScopeId(userId, familyId), weekStart)
        .all<CheckedRow>(),
    ]);
    const items = mergedItems(rows.results || [], checkedRows.results || []);
    return { kind: 'loaded', weekStart, familyId, items, totalGrams: items.reduce((total, item) => total + item.grams, 0) };
  }

  const [rows, checkedRows] = await Promise.all([
    db
      .prepare(
        `SELECT w.ingredient_name as name, w.grams as grams
         FROM weekly_menu_items w
         WHERE w.user_id = ? AND w.week_start = ? AND w.family_id IS NULL
         ORDER BY w.ingredient_name`,
      )
      .bind(userId, weekStart)
      .all<ShoppingRow>(),
    db
      .prepare(
        `SELECT ingredient_name as name, checked
         FROM shopping_checked
         WHERE scope_id = ? AND week_start = ?`,
      )
      .bind(shoppingScopeId(userId, null), weekStart)
      .all<CheckedRow>(),
  ]);
  const items = mergedItems(rows.results || [], checkedRows.results || []);
  return { kind: 'loaded', weekStart, items, totalGrams: items.reduce((total, item) => total + item.grams, 0) };
}
