import { describe, expect, it } from 'vitest';
import { cleanupDeletedAccounts } from '../functions/api/_lib/account_cleanup';
import { onRequestPost } from '../functions/api/internal/cleanup_deleted';

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
  const deletionSelectBinds: unknown[][] = [];
  let currentUser = '';

  const db = {
    batchedSqlByUser,
    deletionSelectBinds,
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
            deletionSelectBinds.push(this.binds);
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

  it('falls back invalid helper limits before querying', async () => {
    const db = makeDb();
    const result = await cleanupDeletedAccounts(db as any, { limit: Number.NaN, actorUserId: 'system:test' });

    expect(result.limit).toBe(50);
    expect(db.deletionSelectBinds.at(-1)?.[0]).toBe(50);
  });

  it('returns HTTP 500 from the scheduled endpoint when hard deletes fail', async () => {
    const response = await onRequestPost({
      request: new Request('https://fitfocus.test/api/internal/cleanup_deleted', {
        method: 'POST',
        headers: { Authorization: 'Bearer cron-secret' },
        body: JSON.stringify({ limit: 10 }),
      }),
      env: { DB: makeDb(), CRON_SECRET: 'cron-secret' } as any,
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
      functionPath: '/api/internal/cleanup_deleted',
    } as any);

    expect(response.status).toBe(500);
    const body = await response.json() as any;
    expect(body.failed).toBe(1);
    expect(body.failures[0].error).toBe('SUPPORT_ATTACHMENTS_DELETE_UNAVAILABLE');
  });

  it('keeps the scheduled cleanup default for invalid request limits', async () => {
    const response = await onRequestPost({
      request: new Request('https://fitfocus.test/api/internal/cleanup_deleted', {
        method: 'POST',
        headers: { Authorization: 'Bearer cron-secret' },
        body: JSON.stringify({ limit: 'abc' }),
      }),
      env: { DB: makeDb(), CRON_SECRET: 'cron-secret' } as any,
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
      functionPath: '/api/internal/cleanup_deleted',
    } as any);

    expect(response.status).toBe(500);
    const body = await response.json() as any;
    expect(body.limit).toBe(200);
  });
});
