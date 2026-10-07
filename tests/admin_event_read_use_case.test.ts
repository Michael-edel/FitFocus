import { describe, expect, it } from 'vitest';
import { exportAdminEventsCsv, readAdminEvents } from '../functions/api/_lib/admin_event_read';

function makeDb(rows: unknown[] = []) {
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
          return { results: rows };
        },
      };
      return statement;
    },
  };
  return { db: db as unknown as D1Database, calls };
}

describe('admin event read use case', () => {
  it('normalizes bounds and prepares parameterized filters', async () => {
    const { db, calls } = makeDb();

    await expect(readAdminEvents(
      db,
      new URLSearchParams({ limit: '999', offset: '-3', action: 'invite_create', q: 'Admin@example.com' }),
    )).resolves.toMatchObject({ events: [], limit: 500, offset: 0 });

    expect(calls[0]?.binds).toEqual(['invite_create', '%admin@example.com%', '%admin@example.com%', '%admin@example.com%', 500, 0]);
  });

  it('escapes CSV cells without changing the event data', () => {
    const csv = exportAdminEventsCsv([{
      id: 'event-1', ts: 0, action: 'invite_create', admin_email: 'admin@example.com',
      target_email: 'user@example.com', meta_json: '{"note":"first, \"second\""}',
    }]);

    expect(csv).toContain('"{""note"":""first, ""second""""}"');
  });
});
