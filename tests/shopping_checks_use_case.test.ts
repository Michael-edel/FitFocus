import { describe, expect, it } from 'vitest';
import { updateShoppingCheck, updateShoppingChecks } from '../functions/api/_lib/shopping_checks';

function makeDb() {
  const runs: Array<{ sql: string; binds: unknown[] }> = [];
  const batches: Array<Array<{ sql: string; binds: unknown[] }>> = [];
  return {
    runs,
    batches,
    prepare(sql: string) {
      const statement = {
        sql,
        binds: [] as unknown[],
        bind(...binds: unknown[]) {
          this.binds = binds;
          return this;
        },
        async run() {
          runs.push({ sql, binds: this.binds });
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch(statements: Array<{ sql: string; binds: unknown[] }>) {
      batches.push(statements.map((statement) => ({ sql: statement.sql, binds: statement.binds })));
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };
}

describe('shopping check use cases', () => {
  it('rejects invalid single updates before writing', async () => {
    const db = makeDb();

    await expect(updateShoppingCheck({
      db: db as unknown as D1Database,
      userId: 'user-1',
      body: { week_start: '2026-06-22', ingredient_name: '', checked: true },
    })).resolves.toEqual({ kind: 'invalid', error: 'BAD_INGREDIENT' });
    expect(db.runs).toHaveLength(0);
  });

  it('writes a normalized single check through one UPSERT', async () => {
    const db = makeDb();
    const result = await updateShoppingCheck({
      db: db as unknown as D1Database,
      userId: 'user-1',
      body: { week_start: '2026-06-22', ingredient_name: '  Овсянка ', checked: true },
    });

    expect(result).toEqual({ kind: 'saved', weekStart: '2026-06-22', ingredientName: 'Овсянка', checked: true });
    expect(db.runs).toHaveLength(1);
    expect(db.runs[0].sql).toContain('INSERT INTO shopping_checked');
    expect(db.runs[0].binds).toContain('personal:user-1');
  });

  it('writes normalized bulk checks through one batch without individual runs', async () => {
    const db = makeDb();
    const result = await updateShoppingChecks({
      db: db as unknown as D1Database,
      userId: 'user-1',
      body: {
        week_start: '2026-06-22',
        updates: [
          { ingredient_name: 'Овсянка', checked: true },
          { ingredient_name: '', checked: false },
        ],
      },
    });

    expect(result).toEqual({ kind: 'saved', weekStart: '2026-06-22', updated: 1 });
    expect(db.runs).toHaveLength(0);
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0]).toHaveLength(1);
    expect(db.batches[0][0].sql).toContain('INSERT INTO shopping_checked');
  });
});
