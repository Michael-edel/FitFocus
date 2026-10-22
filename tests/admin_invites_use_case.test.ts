import { describe, expect, it } from 'vitest';
import { listAdminInvites, updateAdminInvite } from '../functions/api/_lib/admin_invites';

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

describe('admin invite use case', () => {
  it('uses a safe default for invalid list limits', async () => {
    const { db, calls } = makeDb();

    await expect(listAdminInvites(db, 'not-a-number')).resolves.toEqual({ invites: [], limit: 100 });

    expect(calls[0]?.binds).toEqual([100]);
  });

  it('rejects malformed invite updates before preparing database writes', async () => {
    const { db, calls } = makeDb();

    await expect(updateAdminInvite(db, 'admin-1', { code: 'BETA', revoked: 'true' })).resolves.toEqual({ kind: 'invalid' });

    expect(calls).toEqual([]);
  });
});
