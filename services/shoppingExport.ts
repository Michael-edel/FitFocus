export type PersonalShoppingExportItem = { name: string; grams: number };

function formatQuantity(grams: number) {
  if (grams >= 1000) return `${Math.round((grams / 1000) * 10) / 10} кг`;
  return `${grams} г`;
}

/** Builds the same two-column CSV as the server from the already scoped list snapshot. */
export function buildPersonalShoppingCsv(items: PersonalShoppingExportItem[]): string {
  const lines = ['Продукт,Количество'];
  for (const item of items) {
    const safeName = `"${item.name.replace(/"/g, '""')}"`;
    lines.push(`${safeName},"${formatQuantity(item.grams)}"`);
  }
  return lines.join('\n');
}
