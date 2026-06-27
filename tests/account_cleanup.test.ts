import { describe, expect, it } from 'vitest';
import { cleanupDeletedAccounts, normalizeCleanupRequestLimit } from '../functions/api/_lib/account_cleanup';
import { onRequestPost } from '../functions/api/internal/cleanup_deleted';
import { onRequestPost as onAdminCleanupPost } from '../functions/api/admin/cleanup_deleted';
type ScheduledCleanupContext = Parameters<typeof onRequestPost>[0];
type AdminCleanupContext = Parameters<typeof onAdminCleanupPost>[0];
type CleanupBody = { failed?: number; failures?: Array<{ error?: string }>; limit?: number; error?: string };

const SECRET = 'unit-test-secret';
const NOW = Math.floor(Date.now() / 1000);

type PreparedStatement = {
  sql: string;
  binds: unknown[];
  bind: (...args: unknown[]) => PreparedStatement;
  first: () => Promise<unknown>;
  all: () => Promise<{ results: unknown[] }>;
  run: () => Promise<{ success: boolean; meta: { changes: number } }>;
};

function b64url(input: string | Uint8Array | ArrayBuffer) {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signJwt(payload: Record<string, unknown>) {
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64url(JSON.stringify({ exp: NOW + 3600, ...payload }));
  const data = `${h}.${p}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(sig)}`;
}

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
          if (sql.includes('FROM sessions WHERE id = ? AND user_id = ? LIMIT 1')) {
            return { id: 'sid-admin', revoked: 0, expires_at: NOW + 3600 };
          }
          if (sql.includes('SELECT is_active, deleted_at FROM users WHERE id = ? LIMIT 1')) {
            return { is_active: 1, deleted_at: null };
          }
          if (sql.includes("FROM user_roles WHERE user_id = ? AND role = 'admin'")) return null;
          if (sql.includes("FROM families WHERE owner_user_id = ? AND is_active = 1")) return null;
          if (sql.includes("FROM families WHERE owner_user_id = ? LIMIT 1")) return null;
          return null;
        },
        async all() {
          if (sql.includes('SELECT role FROM user_roles WHERE user_id = ?')) {
            const userId = String(this.binds[0] || '');
            if (userId === 'admin-1') return { results: [{ role: 'admin' }, { role: 'user' }] };
            return { results: [{ role: 'user' }] };
          }
          if (sql.includes("FROM user_roles WHERE user_id = ? AND role = 'admin'")) {
            const userId = String(this.binds[0] || '');
            return { results: userId === 'admin-1' ? [{ ok: 1 }] : [] };
          }
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
  it('normalizes optional request limits without skipping explicit zero', () => {
    expect(normalizeCleanupRequestLimit({}, 50)).toBe(50);
    expect(normalizeCleanupRequestLimit({ limit: 'abc' }, 50)).toBe(50);
    expect(normalizeCleanupRequestLimit({ limit: 0 }, 50)).toBe(1);
    expect(normalizeCleanupRequestLimit({ limit: 999 }, 50)).toBe(200);
  });

  it('reports failed hard deletes instead of hiding them', async () => {
    const db = makeDb();
    const result = await cleanupDeletedAccounts(db as unknown as D1Database, { limit: 10, actorUserId: 'system:test' });

    expect(result.found).toBe(2);
    expect(result.deleted).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failures).toEqual([
      { id: 'blocked-user', error: 'SUPPORT_ATTACHMENTS_DELETE_UNAVAILABLE' },
    ]);
  });

  it('falls back invalid helper limits before querying', async () => {
    const db = makeDb();
    const result = await cleanupDeletedAccounts(db as unknown as D1Database, { limit: Number.NaN, actorUserId: 'system:test' });

    expect(result.limit).toBe(50);
    expect(db.deletionSelectBinds.at(-1)?.[0]).toBe(50);
  });

  it('returns HTTP 500 from the scheduled endpoint when hard deletes fail', async () => {
    const context: ScheduledCleanupContext = {
      request: new Request('https://fitfocus.test/api/internal/cleanup_deleted', {
        method: 'POST',
        headers: { Authorization: 'Bearer cron-secret' },
        body: JSON.stringify({ limit: 10 }),
      }),
      env: { DB: makeDb() as unknown as D1Database, CRON_SECRET: 'cron-secret' },
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
    };
    const response = await onRequestPost(context);

    expect(response.status).toBe(500);
    const body = await response.json() as CleanupBody;
    expect(body.failed).toBe(1);
    expect(body.failures[0].error).toBe('SUPPORT_ATTACHMENTS_DELETE_UNAVAILABLE');
  });

  it('uses shared case-insensitive bearer parsing for the scheduled endpoint', async () => {
    const context: ScheduledCleanupContext = {
      request: new Request('https://fitfocus.test/api/internal/cleanup_deleted', {
        method: 'POST',
        headers: { Authorization: 'bearer   cron-secret' },
        body: JSON.stringify({ limit: 10 }),
      }),
      env: { DB: makeDb() as unknown as D1Database, CRON_SECRET: 'cron-secret' },
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
    };
    const response = await onRequestPost(context);

    expect(response.status).toBe(500);
    const body = await response.json() as CleanupBody;
    expect(body.failed).toBe(1);
  });

  it('keeps the scheduled cleanup default for invalid request limits', async () => {
    const context: ScheduledCleanupContext = {
      request: new Request('https://fitfocus.test/api/internal/cleanup_deleted', {
        method: 'POST',
        headers: { Authorization: 'Bearer cron-secret' },
        body: JSON.stringify({ limit: 'abc' }),
      }),
      env: { DB: makeDb() as unknown as D1Database, CRON_SECRET: 'cron-secret' },
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
    };
    const response = await onRequestPost(context);

    expect(response.status).toBe(500);
    const body = await response.json() as CleanupBody;
    expect(body.limit).toBe(200);
  });

  it('normalizes an explicit scheduled request limit of zero to one', async () => {
    const context: ScheduledCleanupContext = {
      request: new Request('https://fitfocus.test/api/internal/cleanup_deleted', {
        method: 'POST',
        headers: { Authorization: 'Bearer cron-secret' },
        body: JSON.stringify({ limit: 0 }),
      }),
      env: { DB: makeDb() as unknown as D1Database, CRON_SECRET: 'cron-secret' },
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
    };
    const response = await onRequestPost(context);

    expect(response.status).toBe(500);
    const body = await response.json() as CleanupBody;
    expect(body.limit).toBe(1);
  });

  it('rejects oversized scheduled cleanup bodies before running cleanup', async () => {
    const db = makeDb();
    const context: ScheduledCleanupContext = {
      request: new Request('https://fitfocus.test/api/internal/cleanup_deleted', {
        method: 'POST',
        headers: { Authorization: 'Bearer cron-secret', 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 10, payload: 'x'.repeat(80 * 1024) }),
      }),
      env: { DB: db as unknown as D1Database, CRON_SECRET: 'cron-secret' },
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
    };
    const response = await onRequestPost(context);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
    expect(db.deletionSelectBinds).toHaveLength(0);
  });

  it('rejects oversized admin cleanup bodies before running cleanup', async () => {
    const db = makeDb();
    const token = await signJwt({ sub: 'admin-1', sid: 'sid-admin' });
    const context: AdminCleanupContext = {
      request: new Request('https://fitfocus.test/api/admin/cleanup_deleted', {
        method: 'POST',
        headers: { Cookie: `ff_session=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 10, payload: 'x'.repeat(80 * 1024) }),
      }),
      env: { DB: db as unknown as D1Database, AUTH_JWT_SECRET: SECRET },
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
    };
    const response = await onAdminCleanupPost(context);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
    expect(db.deletionSelectBinds).toHaveLength(0);
  });
});
