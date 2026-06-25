import { describe, expect, it } from 'vitest';
import { onRequestPut } from '../functions/api/admin/invites';

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

function makeDb(options: { inviteExists?: boolean } = {}) {
  const runs: Array<{ sql: string; binds: unknown[] }> = [];

  const db = {
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
          const changes = sql.includes('UPDATE invite_codes SET revoked') && options.inviteExists === false ? 0 : 1;
          return { success: true, meta: { changes } };
        },
      };
      return stmt;
    },
  };

  return db;
}

async function putInvite(db: ReturnType<typeof makeDb>, body: Record<string, unknown>) {
  const token = await signJwt({ sub: 'admin-1', sid: 'sid-admin', email: 'a@example.com' });
  const request = new Request('https://fitfocus.test/api/admin/invites', {
    method: 'PUT',
    headers: {
      Cookie: `ff_session=${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return onRequestPut({
    request,
    env: { AUTH_JWT_SECRET: SECRET, DB: db as any },
    params: {},
    waitUntil() {},
    next: async () => new Response(null, { status: 404 }),
    data: {},
  } as any);
}

describe('admin invite updates', () => {
  it('rejects non-boolean revoked values', async () => {
    const db = makeDb();

    const res = await putInvite(db, { code: 'ABC123', revoked: 'false' });

    expect(res.status).toBe(400);
    expect(db.runs.some((run) => run.sql.includes('UPDATE invite_codes SET revoked'))).toBe(false);
  });

  it('returns 404 and skips audit when the invite code is missing', async () => {
    const db = makeDb({ inviteExists: false });

    const res = await putInvite(db, { code: 'MISSING', revoked: true });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'NOT_FOUND' });
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO admin_events'))).toBe(false);
  });

  it('updates an existing invite and writes an audit event', async () => {
    const db = makeDb();

    const res = await putInvite(db, { code: 'ABC123', revoked: true });

    expect(res.status).toBe(200);
    expect(db.runs.some((run) => run.sql.includes('UPDATE invite_codes SET revoked') && run.binds[1] === 'ABC123')).toBe(true);
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO admin_events') && String(run.binds[3]) === 'invite_update')).toBe(true);
  });
});
