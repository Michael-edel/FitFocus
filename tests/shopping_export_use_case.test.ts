import { describe, expect, it } from 'vitest';
import { buildPersonalShoppingExport, isShoppingExportWeek } from '../functions/api/_lib/shopping_export';

describe('shopping export use case', () => {
  it('accepts only ISO day keys', () => {
    expect(isShoppingExportWeek('2026-10-07')).toBe(true);
    expect(isShoppingExportWeek('07.10.2026')).toBe(false);
  });

  it('aggregates rows and escapes CSV fields', async () => {
    const db = {
      prepare() {
        return {
          bind() { return this; },
          async all() {
            return { results: [
              { name: 'Яблоко', grams: 600 },
              { name: 'Яблоко', grams: 500 },
              { name: 'Соус "лайм"', grams: 50 },
            ] };
          },
        };
      },
    } as unknown as D1Database;

    await expect(buildPersonalShoppingExport(db, 'user-1', '2026-10-05')).resolves.toBe(
      'Продукт,Количество\n"Соус ""лайм""","50 г"\n"Яблоки","1.1 кг"',
    );
  });
});
