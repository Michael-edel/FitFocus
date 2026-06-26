import { describe, expect, it } from 'vitest';
import { onRequestPost as postFamily } from '../functions/api/family/index';
import { onRequestPost as postFamilyInvite } from '../functions/api/family/invite';
import { onRequestPost as postFamilyJoin } from '../functions/api/family/join';
import { onRequestPatch as patchFamilyMember } from '../functions/api/family/member';
import { onRequestPost as postFamilyMenu } from '../functions/api/family/menu';
import { onRequestPatch as patchShoppingBulk } from '../functions/api/shopping/bulk';
import { onRequestPatch as patchShoppingCheck } from '../functions/api/shopping/check';
import { onRequestPost as postWeeklyMenuItems } from '../functions/api/weekly_menu/items';

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
          if (sql.includes('FROM sessions WHERE id = ? AND user_id = ? LIMIT 1')) {
            return { id: String(this.binds[0] || ''), revoked: 0, expires_at: NOW + 3600 };
          }
          if (sql.includes('SELECT is_active, deleted_at FROM users WHERE id = ? LIMIT 1')) {
            return { is_active: 1, deleted_at: null };
          }
          if (sql.includes('JOIN family_members') && sql.includes('status = \'active\'')) {
            return { id: 'family-1', owner_user_id: 'user-1', role: 'owner' };
          }
          if (sql.includes('FROM subscriptions')) {
            return { plan: 'family' };
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

async function authedJsonRequest(url: string, method: string, body: string) {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
  return new Request(url, {
    method,
    headers: { Cookie: `ff_session=${token}`, 'Content-Type': 'application/json' },
    body,
  });
}

describe('bounded JSON body guards on family and shopping routes', () => {
  it('rejects oversized family create bodies before family writes', async () => {
    const db = makeDb();
    const response = await postFamily({
      request: await authedJsonRequest('https://fitfocus.test/api/family', 'POST', JSON.stringify({ name: 'x'.repeat(80 * 1024) })),
      env: { AUTH_JWT_SECRET: SECRET, DB: db } as any,
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
      functionPath: '/api/family',
    } as any);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO families'))).toBe(false);
  });

  it('rejects oversized family invite bodies before invite writes', async () => {
    const db = makeDb();
    const response = await postFamilyInvite({
      request: await authedJsonRequest('https://fitfocus.test/api/family/invite', 'POST', JSON.stringify({ ttlHours: 24, payload: 'x'.repeat(80 * 1024) })),
      env: { AUTH_JWT_SECRET: SECRET, DB: db } as any,
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
      functionPath: '/api/family/invite',
    } as any);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
    expect(db.runs.some((run) => run.sql.includes('INSERT OR IGNORE INTO family_invites'))).toBe(false);
  });

  it('rejects oversized family join bodies before claim writes', async () => {
    const db = makeDb();
    const response = await postFamilyJoin({
      request: await authedJsonRequest('https://fitfocus.test/api/family/join', 'POST', JSON.stringify({ code: 'JOINME', payload: 'x'.repeat(80 * 1024) })),
      env: { AUTH_JWT_SECRET: SECRET, DB: db } as any,
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
      functionPath: '/api/family/join',
    } as any);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
    expect(db.runs.some((run) => run.sql.includes('UPDATE family_invites SET used_by_user_id = ?'))).toBe(false);
  });

  it('rejects oversized family member bodies before updates', async () => {
    const db = makeDb();
    const response = await patchFamilyMember({
      request: await authedJsonRequest('https://fitfocus.test/api/family/member', 'PATCH', JSON.stringify({ goal: 'LOSS', payload: 'x'.repeat(80 * 1024) })),
      env: { AUTH_JWT_SECRET: SECRET, DB: db } as any,
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
      functionPath: '/api/family/member',
    } as any);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
    expect(db.runs.some((run) => run.sql.includes('UPDATE family_members'))).toBe(false);
  });

  it('rejects oversized family menu bodies before weekly menu writes', async () => {
    const db = makeDb();
    const response = await postFamilyMenu({
      request: await authedJsonRequest(
        'https://fitfocus.test/api/family/menu',
        'POST',
        JSON.stringify({ weekStart: '2026-06-22', menu: { days: [{ day: 'Mon', items: ['x'.repeat(300 * 1024)] }] } }),
      ),
      env: { AUTH_JWT_SECRET: SECRET, DB: db } as any,
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
      functionPath: '/api/family/menu',
    } as any);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
    expect(db.runs.some((run) => run.sql.includes('weekly_menus'))).toBe(false);
  });

  it('rejects oversized shopping bulk bodies before batch writes', async () => {
    const db = makeDb();
    const response = await patchShoppingBulk({
      request: await authedJsonRequest(
        'https://fitfocus.test/api/shopping/bulk',
        'PATCH',
        JSON.stringify({ week_start: '2026-06-22', updates: [{ ingredient_name: 'x'.repeat(80 * 1024), checked: true }] }),
      ),
      env: { AUTH_JWT_SECRET: SECRET, DB: db } as any,
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
      functionPath: '/api/shopping/bulk',
    } as any);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
    expect(db.batches).toHaveLength(0);
  });

  it('rejects oversized shopping check bodies before writes', async () => {
    const db = makeDb();
    const response = await patchShoppingCheck({
      request: await authedJsonRequest(
        'https://fitfocus.test/api/shopping/check',
        'PATCH',
        JSON.stringify({ week_start: '2026-06-22', ingredient_name: 'x'.repeat(80 * 1024), checked: true }),
      ),
      env: { AUTH_JWT_SECRET: SECRET, DB: db } as any,
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
      functionPath: '/api/shopping/check',
    } as any);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO shopping_checked'))).toBe(false);
  });

  it('rejects oversized weekly menu items bodies before batch writes', async () => {
    const db = makeDb();
    const response = await postWeeklyMenuItems({
      request: await authedJsonRequest(
        'https://fitfocus.test/api/weekly_menu/items',
        'POST',
        JSON.stringify({ week_start: '2026-06-22', items: [{ name: 'x'.repeat(300 * 1024), grams: 100 }] }),
      ),
      env: { AUTH_JWT_SECRET: SECRET, DB: db } as any,
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
      functionPath: '/api/weekly_menu/items',
    } as any);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
    expect(db.batches).toHaveLength(0);
  });
});
