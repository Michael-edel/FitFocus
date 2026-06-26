import { describe, expect, it } from 'vitest';
import { onRequestGet as getPushStatus } from '../functions/api/push/status';
import { onRequestPost as postPushSubscribe } from '../functions/api/push/subscribe';
import { onRequestPost as postPushUnsubscribe } from '../functions/api/push/unsubscribe';

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
  const allCalls: Array<{ sql: string; binds: unknown[] }> = [];
  return {
    runs,
    allCalls,
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
          return null;
        },
        async all() {
          allCalls.push({ sql, binds: this.binds });
          if (sql.includes('SELECT role FROM user_roles')) return { results: [{ role: 'user' }] };
          if (sql.includes('SELECT id, device_label')) {
            return {
              results: [
                {
                  id: 'sub-1',
                  device_label: 'Windows',
                  user_agent: 'ua',
                  created_at: 1,
                  updated_at: 2,
                  last_sent_at: null,
                  last_error: null,
                  enabled: 1,
                },
              ],
            };
          }
          if (sql.includes('SELECT COUNT(1) AS count FROM push_subscriptions')) {
            return { results: [{ count: 1 }] };
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

async function authedRequest(url: string, init: RequestInit = {}) {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
  const headers = new Headers(init.headers);
  headers.set('Cookie', `ff_session=${token}`);
  return new Request(url, { ...init, headers });
}

function context(request: Request, db: ReturnType<typeof makeDb>, env: Record<string, unknown> = {}) {
  return {
    request,
    env: { AUTH_JWT_SECRET: SECRET, DB: db as any, ...env },
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
  } as any;
}

describe('push runtime configuration routes', () => {
  it('returns configured status with the public VAPID key', async () => {
    const db = makeDb();
    const request = await authedRequest('https://fitfocus.test/api/push/status');

    const response = await getPushStatus(context(request, db, {
      PUSH_VAPID_PUBLIC_KEY: 'public-key',
      PUSH_VAPID_PRIVATE_KEY: 'private-key',
      PUSH_VAPID_SUBJECT: 'mailto:test@example.com',
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      configured: true,
      vapid_public_key: 'public-key',
      missing_config: [],
      config_keys: {
        PUSH_VAPID_PUBLIC_KEY: true,
        PUSH_VAPID_PRIVATE_KEY: true,
        PUSH_VAPID_SUBJECT: true,
      },
      count: 1,
    });
  });

  it('reports missing VAPID keys without exposing private values', async () => {
    const db = makeDb();
    const request = await authedRequest('https://fitfocus.test/api/push/status');

    const response = await getPushStatus(context(request, db, {
      PUSH_VAPID_PUBLIC_KEY: 'public-key',
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      configured: false,
      vapid_public_key: 'public-key',
      missing_config: ['PUSH_VAPID_PRIVATE_KEY', 'PUSH_VAPID_SUBJECT'],
      config_keys: {
        PUSH_VAPID_PUBLIC_KEY: true,
        PUSH_VAPID_PRIVATE_KEY: false,
        PUSH_VAPID_SUBJECT: false,
      },
    });
    expect(JSON.stringify(payload)).not.toContain('private-key');
  });

  it('rejects oversized subscribe JSON before writing', async () => {
    const db = makeDb();
    const request = await authedRequest('https://fitfocus.test/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: `{"endpoint":"https://push.example","keys":{"p256dh":"k","auth":"a"},"payload":"${'x'.repeat(70 * 1024)}"}`,
    });

    const response = await postPushSubscribe(context(request, db));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO push_subscriptions'))).toBe(false);
  });

  it('rejects oversized unsubscribe JSON before deleting', async () => {
    const db = makeDb();
    const request = await authedRequest('https://fitfocus.test/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: `{"endpoint":"https://push.example","payload":"${'x'.repeat(70 * 1024)}"}`,
    });

    const response = await postPushUnsubscribe(context(request, db));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
    expect(db.runs.some((run) => run.sql.includes('DELETE FROM push_subscriptions'))).toBe(false);
  });
});
