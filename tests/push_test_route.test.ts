import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendPushNotification = vi.fn();

vi.mock('../functions/api/_lib/push', () => ({
  buildPushPayload: (input: any) => ({
    title: input.title || 'FitFocus',
    body: input.body || 'body',
    url: input.url || '/',
    tag: input.tag || 'fitfocus-test',
    data: input.data || {},
  }),
  sendPushNotification,
}));

const { onRequestPost } = await import('../functions/api/push/test');

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
          return null;
        },
        async all() {
          if (sql.includes('SELECT role FROM user_roles')) return { results: [{ role: 'user' }] };
          if (sql.includes('FROM push_subscriptions')) {
            return {
              results: [
                { id: 'sub-1', user_id: 'user-1', endpoint: 'https://push/1', p256dh: 'k1', auth: 'a1', content_encoding: 'aes128gcm' },
                { id: 'sub-2', user_id: 'user-1', endpoint: 'https://push/2', p256dh: 'k2', auth: 'a2', content_encoding: 'aes128gcm' },
                { id: 'sub-3', user_id: 'user-1', endpoint: 'https://push/3', p256dh: 'k3', auth: 'a3', content_encoding: 'aes128gcm' },
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

async function postPushTest(db: ReturnType<typeof makeDb>) {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
  return onRequestPost({
    request: new Request('https://fitfocus.test/api/push/test', {
      method: 'POST',
      headers: { Cookie: `ff_session=${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'hello' }),
    }),
    env: { AUTH_JWT_SECRET: SECRET, DB: db } as any,
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    functionPath: '/api/push/test',
  } as any);
}

describe('/api/push/test', () => {
  beforeEach(() => {
    sendPushNotification.mockReset();
  });

  it('batches subscription status updates after delivery attempts', async () => {
    sendPushNotification
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ statusCode: 410, message: 'Gone' })
      .mockRejectedValueOnce(new Error('Boom'));

    const db = makeDb();
    const response = await postPushTest(db);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, sent: 1, failed: 2, removed: 1 });
    expect(db.runs.some((run) => run.sql.includes('UPDATE push_subscriptions SET last_sent_at'))).toBe(false);
    expect(db.runs.some((run) => run.sql.includes('DELETE FROM push_subscriptions'))).toBe(false);
    expect(db.runs.some((run) => run.sql.includes('UPDATE push_subscriptions SET last_error'))).toBe(false);
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0].some((stmt) => stmt.sql.includes('UPDATE push_subscriptions SET last_sent_at'))).toBe(true);
    expect(db.batches[0].some((stmt) => stmt.sql.includes('DELETE FROM push_subscriptions WHERE id = ?'))).toBe(true);
    expect(db.batches[0].some((stmt) => stmt.sql.includes('UPDATE push_subscriptions SET last_error = ?'))).toBe(true);
  });
});
