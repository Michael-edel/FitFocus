import { describe, expect, it } from 'vitest';
import { onRequestGet, onRequestPost } from '../functions/api/family/menu';
import { onRequestPost as onRequestGeneratePost } from '../functions/api/family/menu/generate';

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

function makeDb(options: { existingMenuId?: string | null } = {}) {
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
          if (sql.includes('FROM sessions')) return { id: 'sid-1', revoked: 0, expires_at: NOW + 3600 };
          if (sql.includes('FROM users WHERE id = ?')) return { is_active: 1, deleted_at: null };
          if (sql.includes('JOIN family_members')) return { id: 'family-1', owner_user_id: 'user-1', role: 'owner' };
          if (sql.includes('FROM subscriptions')) return { plan: 'family' };
          if (sql.includes('SELECT id FROM weekly_menus')) {
            return options.existingMenuId ? { id: options.existingMenuId } : null;
          }
          return null;
        },
        async all() {
          if (sql.includes('FROM user_roles')) return { results: [{ role: 'user' }] };
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

async function postMenu(db: ReturnType<typeof makeDb>, body: Record<string, unknown>) {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
  return onRequestPost({
    request: new Request('https://fitfocus.test/api/family/menu', {
      method: 'POST',
      headers: { Cookie: `ff_session=${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env: { AUTH_JWT_SECRET: SECRET, DB: db } as any,
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    functionPath: '/api/family/menu',
  } as any);
}

async function getMenu(url: string) {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
  return onRequestGet({
    request: new Request(url, {
      method: 'GET',
      headers: { Cookie: `ff_session=${token}` },
    }),
    env: { AUTH_JWT_SECRET: SECRET, DB: makeDb() } as any,
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    functionPath: '/api/family/menu',
  } as any);
}

async function generateMenu(url: string) {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
  return onRequestGeneratePost({
    request: new Request(url, {
      method: 'POST',
      headers: { Cookie: `ff_session=${token}` },
    }),
    env: { AUTH_JWT_SECRET: SECRET, DB: makeDb() } as any,
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    functionPath: '/api/family/menu/generate',
  } as any);
}

describe('/api/family/menu', () => {
  it('updates an existing weekly menu without deleting the row first', async () => {
    const db = makeDb({ existingMenuId: 'menu-1' });
    const response = await postMenu(db, {
      weekStart: '2026-06-22',
      menu: { days: [{ day: 'Mon' }] },
    });

    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.menuId).toBe('menu-1');
    expect(db.runs.some((run) => run.sql.includes('UPDATE weekly_menus SET menu_json=?'))).toBe(true);
    expect(db.runs.some((run) => run.sql.includes('DELETE FROM weekly_menus'))).toBe(false);
  });

  it('rejects malformed weekStart in POST requests', async () => {
    const db = makeDb();
    const response = await postMenu(db, {
      weekStart: 'bad-week',
      menu: { days: [{ day: 'Mon' }] },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'BAD_WEEK' });
  });

  it('rejects malformed week query in GET requests', async () => {
    const response = await getMenu('https://fitfocus.test/api/family/menu?week=bad-week');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'BAD_WEEK' });
  });

  it('rejects malformed week query in generate requests', async () => {
    const response = await generateMenu('https://fitfocus.test/api/family/menu/generate?week=bad-week');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'BAD_WEEK' });
  });
});
