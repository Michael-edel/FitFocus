import { describe, expect, it } from 'vitest';
import { onRequestPost } from '../functions/api/admin/user_roles';

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

function makeDb(options: { targetExists?: boolean; adminDeleteChanges?: number } = {}) {
  const prepared: PreparedStatement[] = [];
  const runs: Array<{ sql: string; binds: unknown[] }> = [];

  const db = {
    prepared,
    runs,
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
          if (sql.includes('SELECT id FROM users')) {
            return options.targetExists === false ? null : { id: this.binds[0] };
          }
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
          if (sql.includes('DELETE FROM user_roles') && sql.includes("role = 'admin'")) {
            return { success: true, meta: { changes: options.adminDeleteChanges ?? 1 } };
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      prepared.push(stmt);
      return stmt;
    },
  };

  return db;
}

async function postRole(db: ReturnType<typeof makeDb>, body: Record<string, unknown>) {
  const token = await signJwt({ sub: 'admin-1', sid: 'sid-admin', email: 'a@example.com' });
  const request = new Request('https://fitfocus.test/api/admin/user_roles', {
    method: 'POST',
    headers: {
      Cookie: `ff_session=${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return onRequestPost({
    request,
    env: { AUTH_JWT_SECRET: SECRET, DB: db as any },
    params: {},
    waitUntil() {},
    next: async () => new Response(null, { status: 404 }),
    data: {},
  } as any);
}

describe('admin user role management', () => {
  it('rejects unknown role values', async () => {
    const db = makeDb();

    const res = await postRole(db, { user_id: 'user-1', role: 'owner', action: 'add' });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'BAD_ROLE' });
    expect(db.runs.some((run) => run.sql.includes('INSERT OR IGNORE INTO user_roles'))).toBe(false);
  });

  it('rejects unknown actions', async () => {
    const db = makeDb();

    const res = await postRole(db, { user_id: 'user-1', role: 'support', action: 'grant' });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'BAD_ACTION' });
    expect(db.runs.some((run) => run.sql.includes('INSERT OR IGNORE INTO user_roles'))).toBe(false);
  });

  it('rejects role changes for missing or deleted target users', async () => {
    const db = makeDb({ targetExists: false });

    const res = await postRole(db, { user_id: 'missing-user', role: 'support', action: 'add' });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'NOT_FOUND' });
    expect(db.runs.some((run) => run.sql.includes('INSERT OR IGNORE INTO user_roles'))).toBe(false);
  });

  it('adds an allowed role for an existing active user', async () => {
    const db = makeDb();

    const res = await postRole(db, { user_id: 'user-1', role: 'support', action: 'add' });

    expect(res.status).toBe(200);
    expect(db.runs.some((run) => run.sql.includes('INSERT OR IGNORE INTO user_roles') && run.binds[1] === 'support')).toBe(true);
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO admin_events'))).toBe(true);
  });

  it('removes admin only through a guarded conditional delete', async () => {
    const db = makeDb();

    const res = await postRole(db, { user_id: 'user-2', role: 'admin', action: 'remove' });

    expect(res.status).toBe(200);
    expect(db.runs.some((run) => run.sql.includes('DELETE FROM user_roles') && run.sql.includes('COUNT(*)'))).toBe(true);
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO admin_events'))).toBe(true);
  });

  it('rejects removing the last active admin when the guarded delete changes no rows', async () => {
    const db = makeDb({ adminDeleteChanges: 0 });

    const res = await postRole(db, { user_id: 'user-2', role: 'admin', action: 'remove' });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'GUARD' });
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO admin_events'))).toBe(false);
  });
});
