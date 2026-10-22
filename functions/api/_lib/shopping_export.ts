import { aggregateShoppingRows } from './ingredients';
import { readPersonalMenuItems } from './personal_menu_projection';

export function isShoppingExportWeek(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatQuantity(grams: number) {
  if (grams >= 1000) return `${Math.round((grams / 1000) * 10) / 10} кг`;
  return `${grams} г`;
}

/** Builds a CSV export from the caller's personal shopping rows. */
export async function buildPersonalShoppingExport(db: D1Database, userId: string, week: string) {
  const rows = await readPersonalMenuItems(db, userId, week);
  const lines = ['Продукт,Количество'];
  for (const item of aggregateShoppingRows(rows)) {
    const safeName = `"${item.name.replace(/"/g, '""')}"`;
    lines.push(`${safeName},"${formatQuantity(item.grams)}"`);
  }
  return lines.join('\n');
}
