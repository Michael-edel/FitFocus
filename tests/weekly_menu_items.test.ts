import { describe, expect, it } from 'vitest';
import { onRequestPost } from '../functions/api/weekly_menu/items';

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
          if (sql.includes('FROM users WHERE id = ?')) return { is_active: 1, deleted_at: null };
          if (sql.includes('JOIN family_members')) return { id: 'family-1', owner_user_id: 'owner-1', role: 'member' };
          if (sql.includes('FROM subscriptions')) return { plan: 'family' };
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
    async batch(stmts: Array<{ sql: string; binds: unknown[] }>) {
      batches.push(stmts.map((stmt) => ({ sql: stmt.sql, binds: stmt.binds })));
      return stmts.map(() => ({ success: true }));
    },
  };
}

async function postItems(db: ReturnType<typeof makeDb>, body: Record<string, unknown>) {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
  return onRequestPost({
    request: new Request('https://fitfocus.test/api/weekly_menu/items', {
      method: 'POST',
      headers: { Cookie: `ff_session=${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env: { AUTH_JWT_SECRET: SECRET, DB: db } as any,
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    functionPath: '/api/weekly_menu/items',
  } as any);
}

describe('/api/weekly_menu/items', () => {
  it('replaces items through a single batch write', async () => {
    const db = makeDb();
    const response = await postItems(db, {
      week_start: '2026-06-22',
      items: [
        { name: 'Овсянка', grams: 120 },
        { name: 'Банан', grams: 200 },
      ],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, stored: 2, week_start: '2026-06-22' });
    expect(db.runs.some((run) => run.sql.includes('DELETE FROM weekly_menu_items'))).toBe(false);
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0][0].sql).toContain('DELETE FROM weekly_menu_items');
    expect(db.batches[0].filter((stmt) => stmt.sql.includes('INSERT INTO weekly_menu_items'))).toHaveLength(2);
  });

  it('rejects malformed week_start', async () => {
    const db = makeDb();
    const response = await postItems(db, {
      week_start: 'bad-week',
      items: [{ name: 'Овсянка', grams: 120 }],
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'BAD_WEEK' });
    expect(db.batches).toHaveLength(0);
  });
});
