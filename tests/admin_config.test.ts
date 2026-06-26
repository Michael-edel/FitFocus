import { describe, expect, it } from 'vitest';
import { onRequestPut as putFeatureFlag } from '../functions/api/admin/feature_flags';
import { onRequestPut as putSetting } from '../functions/api/admin/settings';

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
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = b64url(JSON.stringify(header));
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

type PreparedStatement = {
  sql: string;
  binds: unknown[];
  bind: (...args: unknown[]) => PreparedStatement;
  first: () => Promise<unknown>;
  all: () => Promise<{ results: unknown[] }>;
  run: () => Promise<{ success: boolean; meta: { changes: number } }>;
};

function makeDb() {
  const runs: Array<{ sql: string; binds: unknown[] }> = [];
  const batches: Array<Array<{ sql: string; binds: unknown[] }>> = [];

  const db = {
    runs,
    batches,
    prepare(sql: string): PreparedStatement {
      const stmt: PreparedStatement = {
        sql,
        binds: [],
        bind(...args: unknown[]) {
          this.binds = args;
          return this;
        },
        async first() {
          if (sql.includes('FROM sessions')) return { id: 'sid-admin', revoked: 0, expires_at: NOW + 3600 };
          if (sql.includes('SELECT is_active, deleted_at FROM users')) return { is_active: 1, deleted_at: null };
          return null;
        },
        async all() {
          if (sql.includes('FROM user_roles WHERE user_id = ?') && sql.includes("role = 'admin'")) {
            return { results: [{ ok: 1 }] };
          }
          if (sql.includes('FROM user_roles WHERE user_id = ?')) {
            return { results: [{ role: 'admin' }, { role: 'user' }] };
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
    async batch(stmts: PreparedStatement[]) {
      const recorded = stmts.map((stmt) => ({ sql: stmt.sql, binds: stmt.binds }));
      batches.push(recorded);
      runs.push(...recorded);
      return stmts.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };

  return db;
}

async function put(path: string, db: ReturnType<typeof makeDb>, body: Record<string, unknown>) {
  const token = await signJwt({ sub: 'admin-1', sid: 'sid-admin', email: 'a@example.com' });
  const request = new Request(`https://fitfocus.test${path}`, {
    method: 'PUT',
    headers: {
      Cookie: `ff_session=${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const context = {
    request,
    env: { AUTH_JWT_SECRET: SECRET, DB: db as any },
    params: {},
    waitUntil() {},
    next: async () => new Response(null, { status: 404 }),
    data: {},
  } as any;

  return path.includes('feature_flags') ? putFeatureFlag(context) : putSetting(context);
}

describe('admin runtime configuration', () => {
  it('rejects unknown feature flag keys', async () => {
    const db = makeDb();

    const res = await put('/api/admin/feature_flags', db, { key: 'new_flag', enabled: true, rollout_percentage: 100 });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'BAD_FLAG' });
    expect(db.runs.some((run) => run.sql.includes('feature_flags'))).toBe(false);
  });

  it('requires feature flag enabled to be boolean', async () => {
    const db = makeDb();

    const res = await put('/api/admin/feature_flags', db, { key: 'ai_safe_mode', enabled: 'true', rollout_percentage: 100 });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'BAD_ENABLED' });
    expect(db.runs.some((run) => run.sql.includes('feature_flags'))).toBe(false);
  });

  it('normalizes allowed feature flag rollout values', async () => {
    const db = makeDb();

    const res = await put('/api/admin/feature_flags', db, { key: 'ai_safe_mode', enabled: true, rollout_percentage: 55.8 });

    expect(res.status).toBe(200);
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0].some((run) => run.sql.includes('feature_flags') && run.binds[2] === 55)).toBe(true);
    expect(db.batches[0].some((run) => run.sql.includes('INSERT INTO admin_events') && String(run.binds[3]) === 'flag_update')).toBe(true);
  });

  it('rejects unknown setting keys', async () => {
    const db = makeDb();

    const res = await put('/api/admin/settings', db, { key: 'ai_unknown_limit', value: '1' });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'BAD_SETTING' });
    expect(db.runs.some((run) => run.sql.includes('feature_settings'))).toBe(false);
  });

  it('rejects invalid setting values', async () => {
    const db = makeDb();

    const res = await put('/api/admin/settings', db, { key: 'ai_max_calls_per_user_day', value: '-1' });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'BAD_VALUE' });
    expect(db.runs.some((run) => run.sql.includes('feature_settings'))).toBe(false);
  });

  it('normalizes allowed setting values before saving', async () => {
    const db = makeDb();

    const res = await put('/api/admin/settings', db, { key: 'ai_on_limit_action', value: ' BLOCK ' });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ key: 'ai_on_limit_action', value: 'block' });
    expect(db.runs.some((run) => run.sql.includes('feature_settings') && run.binds[1] === 'block')).toBe(true);
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO admin_events') && String(run.binds[3]) === 'setting_update')).toBe(true);
  });
});
