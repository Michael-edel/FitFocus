import { describe, expect, it } from 'vitest';
import { readAdminAiLogs } from '../functions/api/_lib/admin_ai_logs';

function makeDb() {
  const calls: Array<{ sql: string; binds: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      const statement = {
        binds: [] as unknown[],
        bind(...binds: unknown[]) {
          this.binds = binds;
          return this;
        },
        async all() {
          calls.push({ sql, binds: this.binds });
          return { results: [] };
        },
      };
      return statement;
    },
  };
  return { db: db as unknown as D1Database, calls };
}

describe('admin AI log use case', () => {
  it('bounds the page and parameterizes optional filters', async () => {
    const { db, calls } = makeDb();

    await expect(readAdminAiLogs(
      db,
      new URLSearchParams({ limit: '999', user_id: 'user-1', feature: 'menu' }),
    )).resolves.toEqual({ logs: [], limit: 200 });

    expect(calls[0]?.sql).toContain('WHERE user_id = ? AND feature = ?');
    expect(calls[0]?.binds).toEqual(['user-1', 'menu', 200]);
  });
});
