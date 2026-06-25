import { describe, expect, it } from 'vitest';
import { onRequestPost as postSession } from '../functions/api/admin/sessions';
import { onRequestPost as postSubscription } from '../functions/api/admin/subscription';

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

function makeDb(options: { targetExists?: boolean; sessionExists?: boolean } = {}) {
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
          const changes = sql.includes('UPDATE sessions SET revoked = 1') && options.sessionExists === false ? 0 : 1;
          return { success: true, meta: { changes } };
        },
      };
      return stmt;
    },
  };

  return db;
}

function context(request: Request, db: ReturnType<typeof makeDb>) {
  return {
    request,
    env: { AUTH_JWT_SECRET: SECRET, DB: db as any },
    params: {},
    waitUntil() {},
    next: async () => new Response(null, { status: 404 }),
    data: {},
  } as any;
}

async function adminRequest(url: string, body: Record<string, unknown>) {
  const token = await signJwt({ sub: 'admin-1', sid: 'sid-admin', email: 'a@example.com' });
  return new Request(url, {
    method: 'POST',
    headers: {
      Cookie: `ff_session=${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('admin session and subscription mutations', () => {
  it('rejects session revoke for missing or deleted target users', async () => {
    const db = makeDb({ targetExists: false });
    const request = await adminRequest('https://fitfocus.test/api/admin/sessions', {
      user_id: 'missing-user',
      session_id: 'sid-user',
      action: 'revoke',
    });

    const res = await postSession(context(request, db));

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'NOT_FOUND' });
    expect(db.runs.some((run) => run.sql.includes('UPDATE sessions SET revoked = 1'))).toBe(false);
  });

  it('rejects session revoke when the session row was not updated', async () => {
    const db = makeDb({ sessionExists: false });
    const request = await adminRequest('https://fitfocus.test/api/admin/sessions', {
      user_id: 'user-1',
      session_id: 'missing-session',
      action: 'revoke',
    });

    const res = await postSession(context(request, db));

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'NOT_FOUND' });
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO admin_events'))).toBe(false);
  });

  it('revokes an existing session and writes an audit event', async () => {
    const db = makeDb();
    const request = await adminRequest('https://fitfocus.test/api/admin/sessions', {
      user_id: 'user-1',
      session_id: 'sid-user',
      action: 'revoke',
    });

    const res = await postSession(context(request, db));

    expect(res.status).toBe(200);
    expect(db.runs.some((run) => run.sql.includes('UPDATE sessions SET revoked = 1'))).toBe(true);
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO admin_events') && String(run.binds[3]) === 'session_revoke')).toBe(true);
  });

  it('rejects subscription changes for missing or deleted target users', async () => {
    const db = makeDb({ targetExists: false });
    const request = await adminRequest('https://fitfocus.test/api/admin/subscription', {
      user_id: 'missing-user',
      plan: 'pro',
    });

    const res = await postSubscription(context(request, db));

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'NOT_FOUND' });
    expect(db.runs.some((run) => run.sql.includes('subscriptions'))).toBe(false);
  });

  it('updates a subscription and writes an audit event', async () => {
    const db = makeDb();
    const request = await adminRequest('https://fitfocus.test/api/admin/subscription', {
      user_id: 'user-1',
      plan: 'pro',
    });

    const res = await postSubscription(context(request, db));

    expect(res.status).toBe(200);
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO subscriptions'))).toBe(true);
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO admin_events') && String(run.binds[3]) === 'subscription_update')).toBe(true);
  });

  it('upserts a canceled free subscription row instead of silently skipping missing rows', async () => {
    const db = makeDb();
    const request = await adminRequest('https://fitfocus.test/api/admin/subscription', {
      user_id: 'user-1',
      plan: 'free',
    });

    const res = await postSubscription(context(request, db));

    expect(res.status).toBe(200);
    const subscriptionWrite = db.runs.find((run) => run.sql.includes('INSERT INTO subscriptions'));
    expect(subscriptionWrite).toBeTruthy();
    expect(subscriptionWrite?.sql).toContain("VALUES (?1, 'free', 'canceled'");
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO admin_events') && String(run.binds[3]) === 'subscription_update')).toBe(true);
  });
});
