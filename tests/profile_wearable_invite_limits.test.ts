import { describe, expect, it } from 'vitest';
import { onRequestPut as putProfile, onRequestPatch as patchProfile } from '../functions/api/profile';
import { onRequestPost as postWearableSync } from '../functions/api/wearable/sync';
import { onRequestPost as postInviteRedeem } from '../functions/api/invite/redeem';

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

function makeDb(options: { betaAccess?: boolean } = {}) {
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
          if (sql.includes('FROM sessions WHERE id = ? AND user_id = ? LIMIT 1')) {
            return { id: String(this.binds[0] || ''), revoked: 0, expires_at: NOW + 3600 };
          }
          if (sql.includes('SELECT is_active, deleted_at FROM users WHERE id = ? LIMIT 1')) {
            return { is_active: 1, deleted_at: null };
          }
          if (sql.includes('SELECT 1 as ok FROM invite_redemptions WHERE user_id = ? LIMIT 1')) {
            return options.betaAccess ? { ok: 1 } : null;
          }
          if (sql.includes('SELECT profile_json, version FROM user_profiles WHERE user_id = ?')) {
            return null;
          }
          if (sql.includes('FROM subscriptions')) {
            return null;
          }
          if (sql.includes('FROM invite_redemptions') && sql.includes('code = ?')) {
            return null;
          }
          return null;
        },
        async all() {
          if (sql.includes('SELECT role FROM user_roles WHERE user_id = ?')) {
            return { results: [{ role: 'user' }] };
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
      return stmts.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };
}

describe('bounded JSON body guards on user routes', () => {
  it('rejects oversized profile PUT bodies before writing', async () => {
    const db = makeDb({ betaAccess: true });
    const token = await signJwt({ sub: 'user-1', sid: 'sid-1', email: 'u@example.com' });
    const response = await putProfile({
      request: new Request('https://fitfocus.test/api/profile', {
        method: 'PUT',
        headers: { Cookie: `ff_session=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x'.repeat(600 * 1024) }),
      }),
      env: { AUTH_JWT_SECRET: SECRET, DB: db, REQUIRE_INVITE: '1' } as any,
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
      functionPath: '/api/profile',
    } as any);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
    expect(db.batches).toHaveLength(0);
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO user_profiles'))).toBe(false);
  });

  it('rejects oversized profile PATCH bodies before writing', async () => {
    const db = makeDb({ betaAccess: true });
    const token = await signJwt({ sub: 'user-1', sid: 'sid-1', email: 'u@example.com' });
    const response = await patchProfile({
      request: new Request('https://fitfocus.test/api/profile', {
        method: 'PATCH',
        headers: { Cookie: `ff_session=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x'.repeat(600 * 1024) }),
      }),
      env: { AUTH_JWT_SECRET: SECRET, DB: db, REQUIRE_INVITE: '1' } as any,
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
      functionPath: '/api/profile',
    } as any);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
    expect(db.batches).toHaveLength(0);
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO user_profiles'))).toBe(false);
  });

  it('rejects oversized wearable sync bodies before writing', async () => {
    const db = makeDb({ betaAccess: true });
    const token = await signJwt({ sub: 'user-1', sid: 'sid-1', aud: 'mobile' });
    const response = await postWearableSync({
      request: new Request('https://fitfocus.test/api/wearable/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'apple-health', payload: 'x'.repeat(80 * 1024) }),
      }),
      env: { AUTH_JWT_SECRET: SECRET, DB: db, REQUIRE_INVITE: '1' } as any,
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
      functionPath: '/api/wearable/sync',
    } as any);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO user_profiles'))).toBe(false);
  });

  it('rejects oversized invite redeem bodies before consuming invites', async () => {
    const db = makeDb();
    const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
    const response = await postInviteRedeem({
      request: new Request('https://fitfocus.test/api/invite/redeem', {
        method: 'POST',
        headers: { Cookie: `ff_session=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'INVITE', payload: 'x'.repeat(80 * 1024) }),
      }),
      env: { AUTH_JWT_SECRET: SECRET, DB: db } as any,
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
      functionPath: '/api/invite/redeem',
    } as any);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
    expect(db.runs.some((run) => run.sql.includes('UPDATE invite_codes'))).toBe(false);
  });
});
