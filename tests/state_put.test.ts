import { describe, expect, it } from 'vitest';
import { onRequestGet, onRequestPut } from '../functions/api/state';
import { isAllowedStateKey } from '../functions/api/_lib/state_keyspace';
type StatePutContext = Parameters<typeof onRequestPut>[0];
type StateGetContext = Parameters<typeof onRequestGet>[0];

const SECRET = 'unit-test-secret';
const NOW = Math.floor(Date.now() / 1000);

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
  const runs: Array<{ sql: string; binds: unknown[] }> = [];
  const batches: Array<Array<{ sql: string; binds: unknown[] }>> = [];
  return {
    runs,
    batches,
    prepare(sql: string) {
      const stmt = {
        sql,
        binds: [] as unknown[],
        bind(...args: unknown[]) {
          this.binds = args;
          return this;
        },
        async first() {
          if (sql.includes('FROM sessions')) return { id: 'sid-1', revoked: 0, expires_at: NOW + 3600 };
          if (sql.includes('FROM users WHERE id = ? LIMIT 1')) return { is_active: 1, deleted_at: null };
          if (sql.includes('SELECT 1 as ok FROM invite_redemptions')) return { ok: 1 };
          if (sql.includes('SELECT v, version FROM user_kv')) {
            const key = String(this.binds[1] || '');
            if (key === 'fitfocus_data_user-1_food:1') return { v: '{"ok":true}', version: 1 };
            if (key === 'fitfocus_data_user-1_food:2') return { v: '{"server":true}', version: 5 };
            return null;
          }
          return null;
        },
        async all() {
          if (sql.includes('SELECT role FROM user_roles')) return { results: [{ role: 'user' }] };
          if (sql.includes('FROM user_kv')) {
            return {
              results: [
                { k: 'fitfocus_data_user-1_food:1', v: '{"meal":true}', version: 2, updated_at: 1000 },
                { k: 'fitfocus_data_user-1_all_users', v: '[{"name":"Hidden"}]', version: 3, updated_at: 1001 },
              ],
            };
          }
          return { results: [] };
        },
        async run() {
          runs.push({ sql, binds: this.binds });
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
    async batch(stmts: Array<{ sql: string; binds: unknown[] }>) {
      batches.push(stmts.map((stmt) => ({ sql: stmt.sql, binds: stmt.binds })));
      return stmts.map(() => ({ success: true }));
    },
  };
}

async function putState(db: ReturnType<typeof makeDb>, body: Record<string, unknown>) {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
  const env = { AUTH_JWT_SECRET: SECRET, DB: db as unknown as D1Database, REQUIRE_INVITE: '1' } as unknown as StatePutContext['env'];
  const context: StatePutContext = {
    request: new Request('https://fitfocus.test/api/state', {
      method: 'PUT',
      headers: { Cookie: `ff_session=${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
  };
  return onRequestPut(context);
}

async function getState(db: ReturnType<typeof makeDb>, prefix: string) {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
  const env = { AUTH_JWT_SECRET: SECRET, DB: db as unknown as D1Database, REQUIRE_INVITE: '1' } as unknown as StateGetContext['env'];
  const context: StateGetContext = {
    request: new Request(`https://fitfocus.test/api/state?prefix=${encodeURIComponent(prefix)}`, {
      method: 'GET',
      headers: { Cookie: `ff_session=${token}` },
    }),
    env,
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
  };
  return onRequestGet(context);
}

describe('/api/state PUT', () => {
  it('rejects legacy all-users snapshots from the remote state keyspace', async () => {
    expect(isAllowedStateKey('user-1', 'fitfocus_data_user-1_all_users')).toBe(false);

    const db = makeDb();
    const response = await putState(db, {
      key: 'fitfocus_data_user-1_all_users',
      value: '[{"name":"Should not sync"}]',
      baseVersion: 0,
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'FORBIDDEN_KEYSPACE',
      key: 'fitfocus_data_user-1_all_users',
    });
    expect(db.batches).toHaveLength(0);
  });

  it('does not return legacy all-users snapshots during prefix hydration', async () => {
    const db = makeDb();
    const response = await getState(db, 'fitfocus_data_user-1_');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [
        { key: 'fitfocus_data_user-1_food:1', value: '{"meal":true}', version: 2 },
      ],
    });
  });

  it('writes multiple keys through one batch after all conflicts are checked', async () => {
    const db = makeDb();
    const response = await putState(db, {
      items: [
        { key: 'fitfocus_data_user-1_food:1', value: '{"next":1}', baseVersion: 1 },
        { key: 'fitfocus_data_user-1_food:3', value: '{"new":1}', baseVersion: 0 },
      ],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      items: [
        { key: 'fitfocus_data_user-1_food:1', version: 2 },
        { key: 'fitfocus_data_user-1_food:3', version: 1 },
      ],
    });
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO user_kv'))).toBe(false);
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0]).toHaveLength(2);
  });

  it('returns KV_CONFLICT without partial writes when a later item conflicts', async () => {
    const db = makeDb();
    const response = await putState(db, {
      items: [
        { key: 'fitfocus_data_user-1_food:1', value: '{"next":1}', baseVersion: 1 },
        { key: 'fitfocus_data_user-1_food:2', value: '{"client":true}', baseVersion: 4 },
      ],
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: 'KV_CONFLICT',
      key: 'fitfocus_data_user-1_food:2',
      version: 5,
    });
    expect(db.batches).toHaveLength(0);
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO user_kv'))).toBe(false);
  });

  it('rejects invalid baseVersion values before writes', async () => {
    const db = makeDb();
    const response = await putState(db, {
      items: [
        { key: 'fitfocus_data_user-1_food:2', value: '{"client":true}', baseVersion: 'abc' },
      ],
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'BAD_BASE_VERSION',
      key: 'fitfocus_data_user-1_food:2',
    });
    expect(db.batches).toHaveLength(0);
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO user_kv'))).toBe(false);
  });

  it('rejects oversized JSON bodies before writes', async () => {
    const db = makeDb();
    const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
    const env = { AUTH_JWT_SECRET: SECRET, DB: db as unknown as D1Database, REQUIRE_INVITE: '1' } as unknown as StatePutContext['env'];
    const context: StatePutContext = {
      request: new Request('https://fitfocus.test/api/state', {
        method: 'PUT',
        headers: { Cookie: `ff_session=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ key: 'fitfocus_data_user-1_food:1', value: 'x'.repeat(600 * 1024) }] }),
      }),
      env,
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
    };
    const response = await onRequestPut(context);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
    expect(db.batches).toHaveLength(0);
    expect(db.runs).toHaveLength(0);
  });
});
