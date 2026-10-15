import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet as getHuaweiStatus } from '../functions/api/wearable/huawei/status';
import { onRequestPost as postHuaweiSync } from '../functions/api/wearable/huawei/sync';
import { onRequestGet as startHuaweiOAuth } from '../functions/api/wearable/huawei/start';
import { onRequestPost as startHuaweiOAuthScoped } from '../functions/api/wearable/huawei/start';
import { onRequestGet as callbackHuaweiOAuth } from '../functions/api/wearable/huawei/callback';
import { onRequestPost as disconnectHuawei } from '../functions/api/wearable/huawei/disconnect';
import { encryptHuaweiTokenSet } from '../functions/api/_lib/huawei_health';
import { stateSessionId } from '../functions/api/_lib/state_session';
import { base64UrlEncode, signState } from '../functions/api/auth/_oauth';

type HuaweiStatusContext = Parameters<typeof getHuaweiStatus>[0];
type HuaweiSyncContext = Parameters<typeof postHuaweiSync>[0];
type HuaweiStartContext = Parameters<typeof startHuaweiOAuth>[0];
type HuaweiStartScopedContext = Parameters<typeof startHuaweiOAuthScoped>[0];
type HuaweiCallbackContext = Parameters<typeof callbackHuaweiOAuth>[0];
type HuaweiDisconnectContext = Parameters<typeof disconnectHuawei>[0];

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

function makeDb(connection?: Record<string, unknown>) {
  const runs: Array<{ sql: string; binds: unknown[] }> = [];
  const prepared: string[] = [];
  return {
    runs,
    prepared,
    prepare(sql: string) {
      prepared.push(sql);
      const stmt = {
        sql,
        binds: [] as unknown[],
        bind(...args: unknown[]) {
          this.binds = args;
          return this;
        },
        async first() {
          if (sql.includes('UPDATE user_profiles SET profile_json') && sql.includes('RETURNING version')) {
            runs.push({ sql, binds: this.binds });
            return { version: Number(this.binds[2]) };
          }
          if (sql.includes('FROM sessions WHERE id = ? AND user_id = ? LIMIT 1')) {
            return { id: String(this.binds[0] || ''), revoked: 0, expires_at: NOW + 3600 };
          }
          if (sql.includes('SELECT is_active, deleted_at FROM users WHERE id = ? LIMIT 1')) {
            return { is_active: 1, deleted_at: null };
          }
          if (sql.includes('FROM wearable_connections')) {
            return connection || null;
          }
          if (sql.includes('SELECT profile_json, version FROM user_profiles WHERE user_id = ?')) {
            return { profile_json: JSON.stringify({ name: 'User', weight: 82, wearableProvider: 'manual' }), version: 2 };
          }
          if (sql.includes('FROM subscriptions')) return null;
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
  };
}

function env(db: ReturnType<typeof makeDb>) {
  return {
    AUTH_JWT_SECRET: SECRET,
    HUAWEI_HEALTH_CLIENT_ID: 'huawei-client',
    HUAWEI_HEALTH_CLIENT_SECRET: 'huawei-secret',
    HUAWEI_HEALTH_SCOPES: 'openid health.read',
    HUAWEI_HEALTH_TOKEN_SECRET: SECRET,
    DB: db as unknown as D1Database,
  };
}

async function scopedHeaders(overrides: Record<string, string> = {}) {
  const session = await stateSessionId({ sub: 'user-1', sid: 'sid-1' });
  return { 'X-FitFocus-State-Account': 'user-1', 'X-FitFocus-State-Session': session, ...overrides };
}

async function contextRequest(url: string, init: RequestInit = {}) {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-1', email: 'u@example.com', name: 'User' });
  const headers = new Headers(init.headers);
  const extraCookie = headers.get('Cookie');
  headers.set('Cookie', [`ff_session=${token}`, extraCookie].filter(Boolean).join('; '));
  return new Request(url, {
    ...init,
    headers,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Huawei Health integration', () => {
  it('correlates OAuth start, callback, and disconnect failures without provider data', async () => {
    const db = makeDb();
    const context = { params: {}, data: {}, waitUntil: () => undefined, next: () => Promise.resolve(new Response(null, { status: 404 })) };
    const start = await startHuaweiOAuth({
      ...context,
      request: new Request('https://fitfocus.test/api/wearable/huawei/start', { headers: { 'X-Request-ID': 'huawei-start-test-01' } }),
      env: env(db),
    } as unknown as HuaweiStartContext);
    const callback = await callbackHuaweiOAuth({
      ...context,
      request: new Request('https://fitfocus.test/api/wearable/huawei/callback', { headers: { 'X-Request-ID': 'huawei-callback-test-01' } }),
      env: env(db),
    } as unknown as HuaweiCallbackContext);
    const disconnect = await disconnectHuawei({
      ...context,
      request: new Request('https://fitfocus.test/api/wearable/huawei/disconnect', { method: 'POST', headers: { 'X-Request-ID': 'huawei-disconnect-test-01' } }),
      env: env(db),
    } as unknown as HuaweiDisconnectContext);

    expect(start.status).toBe(401);
    expect(start.headers.get('X-Request-ID')).toBe('huawei-start-test-01');
    expect(callback.status).toBe(400);
    expect(callback.headers.get('X-Request-ID')).toBe('huawei-callback-test-01');
    expect(disconnect.status).toBe(401);
    expect(disconnect.headers.get('X-Request-ID')).toBe('huawei-disconnect-test-01');
  });

  it('rejects Huawei routes without account/session proof before parsing bodies or touching D1/provider APIs', async () => {
    const db = makeDb();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const context = { params: {}, data: {}, waitUntil: () => undefined, next: () => Promise.resolve(new Response(null, { status: 404 })) };
    const oversizedBody = JSON.stringify({ payload: 'x'.repeat(80 * 1024) });
    const responses = await Promise.all([
      startHuaweiOAuth({
        ...context,
        request: await contextRequest('https://fitfocus.test/api/wearable/huawei/start'),
        env: env(db),
      } as unknown as HuaweiStartContext),
      startHuaweiOAuthScoped({
        ...context,
        request: await contextRequest('https://fitfocus.test/api/wearable/huawei/start', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: oversizedBody,
        }),
        env: env(db),
      } as unknown as HuaweiStartScopedContext),
      getHuaweiStatus({
        ...context,
        request: await contextRequest('https://fitfocus.test/api/wearable/huawei/status'),
        env: env(db),
      } as unknown as HuaweiStatusContext),
      getHuaweiStatus({
        ...context,
        request: await contextRequest('https://fitfocus.test/api/wearable/huawei/status', {
          headers: { 'X-FitFocus-State-Account': 'user-1' },
        }),
        env: env(db),
      } as unknown as HuaweiStatusContext),
      postHuaweiSync({
        ...context,
        request: await contextRequest('https://fitfocus.test/api/wearable/huawei/sync', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: oversizedBody,
        }),
        env: env(db),
      } as unknown as HuaweiSyncContext),
      disconnectHuawei({
        ...context,
        request: await contextRequest('https://fitfocus.test/api/wearable/huawei/disconnect', { method: 'POST' }),
        env: env(db),
      } as unknown as HuaweiDisconnectContext),
    ]);

    expect(responses.map(response => response.status)).toEqual([401, 401, 401, 401, 401, 401]);
    expect(responses.every(response => !response.headers.has('Location') && !response.headers.has('Set-Cookie'))).toBe(true);
    expect(db.prepared).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns connection status without leaking encrypted tokens', async () => {
    const encrypted = await encryptHuaweiTokenSet(env(makeDb()), new Request('https://fitfocus.test'), {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      scope: 'health.read',
      expiresAt: NOW + 3600,
    });
    const db = makeDb({
      user_id: 'user-1',
      provider: 'huawei_health',
      access_token_enc: encrypted.accessTokenEnc,
      refresh_token_enc: encrypted.refreshTokenEnc,
      token_type: 'Bearer',
      scope: 'health.read',
      expires_at: NOW + 3600,
      created_at: NOW,
      updated_at: NOW,
      last_sync_at: NOW,
      status: 'connected',
      metadata_json: '{}',
    });

    const response = await getHuaweiStatus({
      request: await contextRequest('https://fitfocus.test/api/wearable/huawei/status', {
        headers: { ...await scopedHeaders(), 'X-Request-ID': 'huawei-status-test-01' },
      }),
      env: env(db) as unknown as HuaweiStatusContext['env'],
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-ID')).toBe('huawei-status-test-01');
    expect(response.headers.get('X-FitFocus-Huawei-Protocol')).toBe('1');
    const bodyText = await response.text();
    expect(bodyText).toContain('"connected":true');
    expect(bodyText).not.toContain('access-token');
    expect(bodyText).not.toContain('refresh-token');
    expect(bodyText).not.toContain(encrypted.accessTokenEnc);
    expect(db.runs.some((run) => run.sql.includes('CREATE TABLE IF NOT EXISTS wearable_connections'))).toBe(true);
  });

  it('syncs today steps from Huawei Health into the profile', async () => {
    const encrypted = await encryptHuaweiTokenSet(env(makeDb()), new Request('https://fitfocus.test'), {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      scope: 'health.read',
      expiresAt: NOW + 3600,
    });
    const db = makeDb({
      user_id: 'user-1',
      provider: 'huawei_health',
      access_token_enc: encrypted.accessTokenEnc,
      refresh_token_enc: encrypted.refreshTokenEnc,
      token_type: 'Bearer',
      scope: 'health.read',
      expires_at: NOW + 3600,
      created_at: NOW,
      updated_at: NOW,
      last_sync_at: null,
      status: 'connected',
      metadata_json: '{}',
    });

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      sampleSets: [{
        samplePoints: [{
          dataTypeName: 'com.huawei.continuous.steps.delta',
          fields: [{ name: 'steps', integerValue: 4321 }],
        }],
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    const response = await postHuaweiSync({
      request: await contextRequest('https://fitfocus.test/api/wearable/huawei/sync', {
        method: 'POST',
        headers: { ...await scopedHeaders(), 'Content-Type': 'application/json', 'X-Request-ID': 'huawei-sync-test-01' },
        body: JSON.stringify({ timezone: 'Asia/Yekaterinburg', date: '2026-06-28' }),
      }),
      env: env(db) as unknown as HuaweiSyncContext['env'],
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-ID')).toBe('huawei-sync-test-01');
    await expect(response.json()).resolves.toMatchObject({
      provider: 'huawei_health',
      updatedFields: ['wearableStepsToday'],
      profile: {
        wearableProvider: 'huawei_health',
        wearableEnabled: true,
        wearableStepsToday: 4321,
      },
    });
    expect(db.runs.some((run) => run.sql.includes('UPDATE user_profiles SET profile_json'))).toBe(true);
    expect(db.runs.some((run) => run.sql.includes('UPDATE wearable_connections SET last_sync_at'))).toBe(true);
  });

  it('rejects stale scoped sessions before Huawei reads or profile writes and echoes the request guard', async () => {
    const db = makeDb({});
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await postHuaweiSync({
      request: await contextRequest('https://fitfocus.test/api/wearable/huawei/sync', {
        method: 'POST',
        headers: await scopedHeaders({ 'X-FitFocus-State-Account': 'user-2', 'X-Request-ID': 'huawei-stale-test-01' }),
        body: JSON.stringify({ timezone: 'UTC', date: '2026-06-28' }),
      }),
      env: env(db) as unknown as HuaweiSyncContext['env'],
      params: {}, data: {}, waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('X-FitFocus-Huawei-Protocol')).toBe('1');
    expect(response.headers.get('X-FitFocus-Huawei-Guard')).toBe('1');
    expect(response.headers.get('X-FitFocus-State-Account')).toBe('user-2');
    expect(response.headers.get('X-Request-ID')).toBe('huawei-stale-test-01');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.runs.some(run => run.sql.includes('CREATE TABLE IF NOT EXISTS wearable_connections'))).toBe(false);
    expect(db.runs.some(run => run.sql.includes('UPDATE user_profiles SET profile_json'))).toBe(false);
  });

  it('issues a scoped OAuth start URL and binds its signed state to the initiating session', async () => {
    const db = makeDb();
    const request = await contextRequest('https://fitfocus.test/api/wearable/huawei/start', {
      method: 'POST', headers: { ...await scopedHeaders(), 'Content-Type': 'application/json', 'X-Request-ID': 'huawei-post-start-01' },
      body: JSON.stringify({ redirect: 'https://fitfocus.test/#settings' }),
    });
    const response = await startHuaweiOAuthScoped({
      request, env: env(db) as unknown as HuaweiStartScopedContext['env'], params: {}, data: {},
      waitUntil: () => undefined, next: () => Promise.resolve(new Response(null, { status: 404 })),
    } as unknown as HuaweiStartScopedContext);

    expect(response.status).toBe(200);
    expect(response.headers.get('X-FitFocus-Huawei-Protocol')).toBe('1');
    expect(response.headers.get('X-FitFocus-State-Session')).toBe((await scopedHeaders())['X-FitFocus-State-Session']);
    expect(response.headers.get('X-Request-ID')).toBe('huawei-post-start-01');
    const body = await response.json() as { authorizeUrl: string };
    const authorizeUrl = new URL(body.authorizeUrl);
    const encodedState = authorizeUrl.searchParams.get('state')!;
    const stateBytes = encodedState.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const rawState = new TextDecoder().decode(Uint8Array.from(atob(stateBytes + '='.repeat((4 - stateBytes.length % 4) % 4)), c => c.charCodeAt(0)));
    const state = JSON.parse(rawState) as { u: string; s: string; r: string; n: string; t: number };
    expect(state).toMatchObject({ u: 'user-1', s: await stateSessionId({ sub: 'user-1', sid: 'sid-1' }), r: 'https://fitfocus.test/#settings' });
    expect(response.headers.get('Set-Cookie')).toContain('ff_huawei_oauth_nonce=');
  });

  it('rejects an OAuth callback from a different login session before exchanging credentials', async () => {
    const db = makeDb();
    const rawState = JSON.stringify({ u: 'user-1', s: 'wrong-session-digest', r: 'https://fitfocus.test/', n: 'nonce-1', t: Date.now() });
    const state = `${base64UrlEncode(new TextEncoder().encode(rawState))}.${await signState(rawState, SECRET)}`;
    const response = await callbackHuaweiOAuth({
      request: await contextRequest(`https://fitfocus.test/api/wearable/huawei/callback?code=code-1&state=${encodeURIComponent(state)}`, {
        headers: { Cookie: 'ff_huawei_oauth_nonce=nonce-1' },
      }),
      env: env(db) as unknown as HuaweiCallbackContext['env'], params: {}, data: {},
      waitUntil: () => undefined, next: () => Promise.resolve(new Response(null, { status: 404 })),
    } as unknown as HuaweiCallbackContext);
    expect(response.status).toBe(400);
    expect(db.runs.some(run => run.sql.includes('CREATE TABLE IF NOT EXISTS wearable_connections'))).toBe(false);
    expect(db.runs.some(run => run.sql.includes('UPDATE user_profiles SET profile_json'))).toBe(false);
  });

  it('rejects oversized Huawei sync bodies before calling Huawei or writing', async () => {
    const db = makeDb({});
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await postHuaweiSync({
      request: await contextRequest('https://fitfocus.test/api/wearable/huawei/sync', {
        method: 'POST',
        headers: { ...await scopedHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: 'x'.repeat(80 * 1024) }),
      }),
      env: env(db) as unknown as HuaweiSyncContext['env'],
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
    });

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.runs.some((run) => run.sql.includes('user_profiles'))).toBe(false);
  });
});
