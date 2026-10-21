import { describe, expect, it } from 'vitest';
import { saveWeeklyMenuItems } from '../functions/api/_lib/weekly_menu_items';

function makeDb() {
  const batches: Array<Array<{ sql: string; binds: unknown[] }>> = [];
  return {
    batches,
    prepare(sql: string) {
      const statement = {
        sql,
        binds: [] as unknown[],
        bind(...binds: unknown[]) {
          this.binds = binds;
          return this;
        },
        async first() {
          if (sql.includes('JOIN family_members')) return { id: 'family-1', owner_user_id: 'owner-1', role: 'member' };
          if (sql.includes('FROM subscriptions')) return { plan: 'family' };
          return null;
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

describe('weekly menu items use case', () => {
  it('rejects invalid request data before any D1 write', async () => {
    const db = makeDb();

    await expect(saveWeeklyMenuItems({
      db: db as unknown as D1Database,
      userId: 'user-1',
      body: { week_start: 'bad-week', items: [] },
    })).resolves.toEqual({ kind: 'invalid', error: 'BAD_WEEK' });
    expect(db.batches).toHaveLength(0);
  });

  it('normalizes and atomically replaces family weekly items', async () => {
    const db = makeDb();
    const result = await saveWeeklyMenuItems({
      db: db as unknown as D1Database,
      userId: 'user-1',
      body: {
        week_start: '2026-06-22',
        family_id: 'family-1',
        items: [{ name: '  Овсянка ', grams: 120 }],
      },
    });

    expect(result).toEqual({ kind: 'saved', stored: 1, weekStart: '2026-06-22' });
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0][0].sql).toContain('DELETE FROM weekly_menu_items');
    expect(db.batches[0][1].sql).toContain('INSERT INTO weekly_menu_items');
    expect(db.batches[0][1].binds).toContain('Овсянка');
  });

  it('rejects malformed items before replacing family weekly items', async () => {
    const db = makeDb();
    const result = await saveWeeklyMenuItems({
      db: db as unknown as D1Database,
      userId: 'user-1',
      body: {
        week_start: '2026-06-22',
        family_id: 'family-1',
        items: [
          { name: 'Овсянка', grams: 120 },
          { name: '', grams: 40 },
        ],
      },
    });

    expect(result).toEqual({ kind: 'invalid', error: 'BAD_ITEM' });
    expect(db.batches).toHaveLength(0);
  });

  it('refuses a delayed personal replacement without modifying either storage path', async () => {
    const db = makeDb();
    expect(await saveWeeklyMenuItems({ db: db as unknown as D1Database, userId: 'user-1',
      body: { week_start: '2026-06-22', items: [{ name: 'stale', grams: 100 }] } })).toEqual({ kind: 'profile-required' });
    expect(db.batches).toEqual([]);
  });
});
