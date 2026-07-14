import { describe, expect, it } from 'vitest';
import { onRequestPost as deleteAccount } from '../functions/api/account/delete';
import { onRequestPost as logoutAll } from '../functions/api/logout_all';

type DeleteAccountContext = Parameters<typeof deleteAccount>[0];
type LogoutAllContext = Parameters<typeof logoutAll>[0];

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

function makeDb(options: { lastAdmin?: boolean } = {}) {
  const runs: Array<{ sql: string; binds: unknown[] }> = [];
  return {
    runs,
    prepare(sql: string) {
      const stmt = {
        sql,
        binds: [] as unknown[],
        bind(...args: unknown[]) {
          this.binds = args;
          return this;
        },
        async first() {
          if (sql.includes('FROM sessions WHERE id = ? AND user_id = ? LIMIT 1')) {
            return { id: String(this.binds[0] || ''), revoked: 0, expires_at: NOW + 3600 };
          }
          if (sql.includes('SELECT is_active, deleted_at FROM users WHERE id = ? LIMIT 1')) {
            return { is_active: 1, deleted_at: null };
          }
          if (sql.includes('SELECT id, is_active, deleted_at FROM users WHERE id = ? LIMIT 1')) {
            return { id: String(this.binds[0] || ''), is_active: 1, deleted_at: null };
          }
          if (sql.includes("SELECT 1 as x FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1")) {
            return options.lastAdmin ? { x: 1 } : null;
          }
          if (sql.includes("WHERE ur.role = 'admin' AND u.is_active = 1 AND u.deleted_at IS NULL")) {
            return { c: options.lastAdmin ? 1 : 2 };
          }
          if (sql.includes('SELECT id FROM families WHERE owner_user_id = ? AND is_active = 1 LIMIT 1')) {
            return null;
          }
          return null;
        },
        async all() {
          if (sql.includes('SELECT role FROM user_roles WHERE user_id = ?')) {
            return { results: [{ role: options.lastAdmin ? 'admin' : 'user' }] };
          }
          return { results: [] };
        },
        async run() {
          runs.push({ sql, binds: this.binds });
          if (sql.includes('UPDATE users') && sql.includes('deletion_scheduled_at')) {
            return { success: true, meta: { changes: 0 } };
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
    async batch() {
      return [];
    },
  };
}

function baseContext() {
  return {
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
  };
}

describe('public account endpoint errors', () => {
  it('does not expose auth configuration failures from logout-all', async () => {
    const response = await logoutAll({
      ...baseContext(),
      request: new Request('https://fitfocus.test/api/logout_all', {
        method: 'POST',
        headers: { Cookie: 'ff_session=bad-token' },
      }),
      env: { DB: makeDb() as unknown as D1Database } as unknown as LogoutAllContext['env'],
    });

    const bodyText = await response.text();

    expect(response.status).toBe(401);
    expect(bodyText).toContain('"error":"UNAUTH"');
    expect(bodyText).not.toContain('AUTH_CONFIG');
    expect(bodyText).not.toContain('DB_CONFIG');
  });

  it('does not expose auth configuration failures from account delete', async () => {
    const response = await deleteAccount({
      ...baseContext(),
      request: new Request('https://fitfocus.test/api/account/delete', {
        method: 'POST',
        headers: { Cookie: 'ff_session=bad-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      }),
      env: { DB: makeDb() as unknown as D1Database } as unknown as DeleteAccountContext['env'],
    });

    const bodyText = await response.text();

    expect(response.status).toBe(401);
    expect(bodyText).toContain('"error":"UNAUTH"');
    expect(bodyText).not.toContain('AUTH_CONFIG');
    expect(bodyText).not.toContain('DB_CONFIG');
  });

  it('does not expose raw soft-delete failures from account delete', async () => {
    const db = makeDb();
    const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
    const response = await deleteAccount({
      ...baseContext(),
      request: new Request('https://fitfocus.test/api/account/delete', {
        method: 'POST',
        headers: { Cookie: `ff_session=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      }),
      env: { AUTH_JWT_SECRET: SECRET, DB: db as unknown as D1Database } as unknown as DeleteAccountContext['env'],
    });

    const bodyText = await response.text();

    expect(response.status).toBe(500);
    expect(bodyText).toContain('"error":"ACCOUNT_DELETE_FAILED"');
    expect(bodyText).not.toContain('Failed to soft-delete account');
    expect(bodyText).not.toContain('последнего администратора');
  });

  it('does not expose last-admin guard exception text from account delete', async () => {
    const token = await signJwt({ sub: 'admin-1', sid: 'sid-1' });
    const response = await deleteAccount({
      ...baseContext(),
      request: new Request('https://fitfocus.test/api/account/delete', {
        method: 'POST',
        headers: { Cookie: `ff_session=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      }),
      env: { AUTH_JWT_SECRET: SECRET, DB: makeDb({ lastAdmin: true }) as unknown as D1Database } as unknown as DeleteAccountContext['env'],
    });

    const bodyText = await response.text();

    expect(response.status).toBe(409);
    expect(bodyText).toContain('"error":"ACCOUNT_DELETE_BLOCKED"');
    expect(bodyText).not.toContain('последнего администратора');
  });
});
