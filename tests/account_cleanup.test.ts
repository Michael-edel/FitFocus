import { describe, expect, it } from 'vitest';
import { cleanupDeletedAccounts } from '../functions/api/_lib/account_cleanup';

type PreparedStatement = {
  sql: string;
  binds: unknown[];
  bind: (...args: unknown[]) => PreparedStatement;
  first: () => Promise<unknown>;
  all: () => Promise<{ results: unknown[] }>;
  run: () => Promise<{ success: boolean; meta: { changes: number } }>;
};

function makeDb() {
  const batchedSqlByUser = new Map<string, string[]>();
  let currentUser = '';

  const db = {
    batchedSqlByUser,
    prepare(sql: string): PreparedStatement {
      const stmt: PreparedStatement = {
        sql,
        binds: [],
        bind(...args: unknown[]) {
          this.binds = args;
          if (sql.includes('SELECT id FROM users WHERE deletion_scheduled_at')) currentUser = '';
          return this;
        },
        async first() {
          if (sql.includes("FROM user_roles WHERE user_id = ? AND role = 'admin'")) return null;
          if (sql.includes("FROM families WHERE owner_user_id = ? AND is_active = 1")) return null;
          if (sql.includes("FROM families WHERE owner_user_id = ? LIMIT 1")) return null;
          return null;
        },
        async all() {
          if (sql.includes('SELECT id FROM users WHERE deletion_scheduled_at')) {
            return { results: [{ id: 'ok-user' }, { id: 'blocked-user' }] };
          }
          if (sql.includes('FROM support_feedback')) {
            const userId = String(this.binds[0] || '');
            currentUser = userId;
            if (userId === 'blocked-user') {
              return {
                results: [
                  { attachments_json: JSON.stringify([{ name: 'a.png', mime: 'image/png', size: 1, storage_key: 'support/blocked/a.png' }]) },
                ],
              };
            }
          }
          return { results: [] };
        },
        async run() {
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
    async batch(stmts: PreparedStatement[]) {
      batchedSqlByUser.set(currentUser, stmts.map((stmt) => stmt.sql));
      return stmts.map(() => ({ success: true }));
    },
  };

  return db;
}

describe('cleanupDeletedAccounts', () => {
  it('reports failed hard deletes instead of hiding them', async () => {
    const db = makeDb();
    const result = await cleanupDeletedAccounts(db as any, { limit: 10, actorUserId: 'system:test' });

    expect(result.found).toBe(2);
    expect(result.deleted).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failures).toEqual([
      { id: 'blocked-user', error: 'SUPPORT_ATTACHMENTS_DELETE_UNAVAILABLE' },
    ]);
  });
});
