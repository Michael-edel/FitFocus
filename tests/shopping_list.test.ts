import { describe, expect, it } from 'vitest';
import { onRequestGet } from '../functions/api/shopping/list';

type ShoppingListContext = Parameters<typeof onRequestGet>[0];

const SECRET = 'unit-test-secret';
const NOW = Math.floor(Date.now() / 1000);

function b64url(input: string | Uint8Array | ArrayBuffer) {
  const bytes = typeof input === 'string'
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
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(sig)}`;
}

function makeDb() {
  return {
    prepare(sql: string) {
      const statement = {
        bind() { return this; },
        async first() {
          if (sql.includes('FROM sessions')) return { id: 'sid-1', revoked: 0, expires_at: NOW + 3600 };
          if (sql.includes('FROM users WHERE id = ?')) return { is_active: 1, deleted_at: null };
          return null;
        },
        async all() {
          if (sql.includes('FROM user_roles')) return { results: [{ role: 'user' }] };
          return { results: [] };
        },
        async run() { return { success: true, meta: { changes: 1 } }; },
      };
      return statement;
    },
  };
}

async function getShoppingList(week: string, requestId: string) {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
  const context: ShoppingListContext = {
    request: new Request(`https://fitfocus.test/api/shopping/list?week=${week}`, {
      headers: { Cookie: `ff_session=${token}`, 'X-Request-ID': requestId },
    }),
    env: { AUTH_JWT_SECRET: SECRET, DB: makeDb() as unknown as D1Database },
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
  };
  return onRequestGet(context);
}

describe('/api/shopping/list', () => {
  it('returns the caller request ID for an empty personal list', async () => {
    const response = await getShoppingList('2026-06-22', 'shopping-list-request-1');

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-ID')).toBe('shopping-list-request-1');
    await expect(response.json()).resolves.toMatchObject({ week_start: '2026-06-22', items: [], total_grams: 0 });
  });

  it('returns the caller request ID for an invalid week', async () => {
    const response = await getShoppingList('bad-week', 'shopping-list-request-2');

    expect(response.status).toBe(400);
    expect(response.headers.get('X-Request-ID')).toBe('shopping-list-request-2');
    await expect(response.json()).resolves.toMatchObject({ error: 'BAD_WEEK' });
  });
});
