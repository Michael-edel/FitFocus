import { aggregateShoppingRows } from './ingredients';

type ShoppingExportRow = { name?: string | null; grams?: number | null };

export function isShoppingExportWeek(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatQuantity(grams: number) {
  if (grams >= 1000) return `${Math.round((grams / 1000) * 10) / 10} кг`;
  return `${grams} г`;
}

/** Builds a CSV export from the caller's personal shopping rows. */
export async function buildPersonalShoppingExport(db: D1Database, userId: string, week: string) {
  const rows = await db.prepare(
    `SELECT ingredient_name as name, grams
     FROM weekly_menu_items
     WHERE user_id = ? AND week_start = ? AND family_id IS NULL
     ORDER BY ingredient_name`,
  ).bind(userId, week).all<ShoppingExportRow>();
  const lines = ['Продукт,Количество'];
  for (const item of aggregateShoppingRows(rows.results || [])) {
    const safeName = `"${item.name.replace(/"/g, '""')}"`;
    lines.push(`${safeName},"${formatQuantity(item.grams)}"`);
  }
  return lines.join('\n');
}
