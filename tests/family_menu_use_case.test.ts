import { describe, expect, it } from 'vitest';
import {
  defaultFamilyMenuWeekStart,
  readFamilyMenu,
  saveFamilyMenu,
} from '../functions/api/_lib/family_menu';

function makeDb(options: { family?: boolean; existingMenuId?: string | null } = {}) {
  const runs: Array<{ sql: string; binds: unknown[] }> = [];
  return {
    runs,
    prepare(sql: string) {
      const statement = {
        binds: [] as unknown[],
        bind(...binds: unknown[]) {
          this.binds = binds;
          return this;
        },
        async first() {
          if (sql.includes('FROM families f') && sql.includes('JOIN family_members')) {
            return options.family === false ? null : { id: 'family-1', owner_user_id: 'user-1', role: 'owner' };
          }
          if (sql.includes('FROM subscriptions')) return { plan: 'family' };
          if (sql.includes('SELECT id, family_id, week_start, menu_json')) {
            return {
              id: 'menu-1',
              family_id: 'family-1',
              week_start: '2026-06-22',
              menu_json: JSON.stringify({ days: [{ day: 'Mon' }] }),
            };
          }
          if (sql.includes('SELECT portions_json')) {
            return { portions_json: '[{"day":"Mon"}]', totals_json: '[{"name":"Овсянка","grams":60}]', updated_at: 123 };
          }
          if (sql.includes('SELECT id FROM weekly_menus')) return options.existingMenuId ? { id: options.existingMenuId } : null;
          return null;
        },
        async run() {
          runs.push({ sql, binds: this.binds });
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };
}

describe('family menu use cases', () => {
  it('uses Monday as the fallback week start', () => {
    expect(defaultFamilyMenuWeekStart(new Date('2026-06-28T12:00:00Z'))).toBe('2026-06-22');
  });

  it('rejects malformed read and save inputs before querying D1', async () => {
    const db = makeDb();

    await expect(readFamilyMenu({ db: db as unknown as D1Database, userId: 'user-1', weekStart: 'bad-week' }))
      .resolves.toEqual({ kind: 'invalid-week' });
    await expect(saveFamilyMenu({ db: db as unknown as D1Database, userId: 'user-1', body: { weekStart: 'bad-week', menu: { days: [{}] } } }))
      .resolves.toEqual({ kind: 'invalid', error: 'BAD_WEEK' });
    expect(db.runs).toHaveLength(0);
  });

  it('reads a family menu with the caller portions from the shared access scope', async () => {
    const result = await readFamilyMenu({
      db: makeDb() as unknown as D1Database,
      userId: 'user-1',
      weekStart: '2026-06-22',
    });

    expect(result).toMatchObject({
      kind: 'loaded',
      shared: { id: 'menu-1', familyId: 'family-1' },
      portions: { totals: [{ name: 'Овсянка', grams: 60 }] },
    });
  });

  it('updates the existing weekly menu row through the save use case', async () => {
    const db = makeDb({ existingMenuId: 'menu-existing' });
    const result = await saveFamilyMenu({
      db: db as unknown as D1Database,
      userId: 'user-1',
      body: { weekStart: '2026-06-22', menu: { days: [{ day: 'Mon' }] } },
    });

    expect(result).toEqual({ kind: 'saved', weekStart: '2026-06-22', menuId: 'menu-existing' });
    expect(db.runs.some((run) => run.sql.includes('UPDATE weekly_menus SET menu_json=?'))).toBe(true);
  });
});
