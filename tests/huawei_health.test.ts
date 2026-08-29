import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet as getHuaweiStatus } from '../functions/api/wearable/huawei/status';
import { onRequestPost as postHuaweiSync } from '../functions/api/wearable/huawei/sync';
import { encryptHuaweiTokenSet } from '../functions/api/_lib/huawei_health';

type HuaweiStatusContext = Parameters<typeof getHuaweiStatus>[0];
type HuaweiSyncContext = Parameters<typeof postHuaweiSync>[0];

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

async function contextRequest(url: string, init: RequestInit = {}) {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-1', email: 'u@example.com', name: 'User' });
  return new Request(url, {
    ...init,
    headers: {
      Cookie: `ff_session=${token}`,
      ...(init.headers || {}),
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Huawei Health integration', () => {
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
      request: await contextRequest('https://fitfocus.test/api/wearable/huawei/status'),
      env: env(db) as unknown as HuaweiStatusContext['env'],
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
    });

    expect(response.status).toBe(200);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: 'Asia/Yekaterinburg', date: '2026-06-28' }),
      }),
      env: env(db) as unknown as HuaweiSyncContext['env'],
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
    });

    expect(response.status).toBe(200);
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

  it('rejects oversized Huawei sync bodies before calling Huawei or writing', async () => {
    const db = makeDb({});
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await postHuaweiSync({
      request: await contextRequest('https://fitfocus.test/api/wearable/huawei/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
