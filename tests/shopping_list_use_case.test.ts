import { describe, expect, it } from 'vitest';
import { readShoppingList } from '../functions/api/_lib/shopping_list';

function makeDb() {
  const queries: string[] = [];
  return {
    queries,
    prepare(sql: string) {
      queries.push(sql);
      const statement = {
        bind() { return this; },
        async all() {
          if (sql.includes('FROM weekly_menu_items')) {
            return {
              results: [
                { name: 'Овсянка', grams: 60 },
                { name: ' овсянка ', grams: 40 },
                { name: 'Банан', grams: 120 },
              ],
            };
          }
          if (sql.includes('FROM shopping_checked')) return { results: [{ name: 'овсянка', checked: 1 }] };
          return { results: [] };
        },
      };
      return statement;
    },
  };
}

describe('shopping list read use case', () => {
  it('rejects a malformed week before querying D1', async () => {
    const db = makeDb();
    const result = await readShoppingList({
      db: db as unknown as D1Database,
      userId: 'user-1',
      weekStart: 'not-a-week',
      familyId: null,
    });

    expect(result).toEqual({ kind: 'invalid-week' });
    expect(db.queries).toHaveLength(0);
  });

  it('aggregates normalized ingredients and applies persisted checkmarks', async () => {
    const result = await readShoppingList({
      db: makeDb() as unknown as D1Database,
      userId: 'user-1',
      weekStart: '2026-06-22',
      familyId: null,
    });

    expect(result).toMatchObject({ kind: 'loaded', weekStart: '2026-06-22', totalGrams: 220 });
    if (result.kind !== 'loaded') throw new Error('expected a loaded shopping list');
    expect(result.items).toEqual(expect.arrayContaining([
      { name: 'Овсянка', grams: 100, checked: true },
      { name: 'Бананы', grams: 120, checked: false },
    ]));
  });
});
