import { describe, expect, it } from 'vitest';
import { onRequestPost } from '../functions/api/family/menu/generate';

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
          if (sql.includes('JOIN family_members')) return { id: 'family-1', owner_user_id: 'user-1', role: 'owner' };
          if (sql.includes('FROM subscriptions')) return { plan: 'family' };
          if (sql.includes('SELECT id FROM weekly_menus')) {
            return options.existingMenuId ? { id: options.existingMenuId } : null;
          }
          return null;
        },
        async all() {
          if (sql.includes('FROM user_roles')) return { results: [{ role: 'user' }] };
          if (sql.includes('FROM family_members')) {
            return {
              results: [
                {
                  user_id: 'user-1',
                  goal: 'MAINTAIN',
                  sex: 'MALE',
                  age: 30,
                  height_cm: 180,
                  weight_kg: 80,
                  activity: 1.2,
                  restrictions_json: null,
                },
                {
                  user_id: 'user-2',
                  goal: 'LOSS',
                  sex: 'FEMALE',
                  age: 28,
                  height_cm: 165,
                  weight_kg: 65,
                  activity: 1.2,
                  restrictions_json: null,
                },
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

async function generateMenu(db: ReturnType<typeof makeDb>, url = 'https://fitfocus.test/api/family/menu/generate?week=2026-06-22') {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
  return onRequestPost({
    request: new Request(url, {
      method: 'POST',
      headers: { Cookie: `ff_session=${token}` },
    }),
    env: { AUTH_JWT_SECRET: SECRET, DB: db } as any,
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    functionPath: '/api/family/menu/generate',
  } as any);
}

describe('/api/family/menu/generate', () => {
  it('writes menu, portions, and shopping items through one batch and clears stale family rows', async () => {
    const db = makeDb({ existingMenuId: 'menu-1' });
    const response = await generateMenu(db);

    expect(response.status).toBe(200);
    expect(db.runs.some((run) => run.sql.includes('UPDATE weekly_menus SET menu_json='))).toBe(false);
    expect(db.runs.some((run) => run.sql.includes('DELETE FROM weekly_menu_portions'))).toBe(false);
    expect(db.runs.some((run) => run.sql.includes('DELETE FROM weekly_menu_items'))).toBe(false);
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0].some((stmt) => stmt.sql.includes('UPDATE weekly_menus SET menu_json='))).toBe(true);
    expect(db.batches[0].some((stmt) => stmt.sql.includes('DELETE FROM weekly_menu_portions WHERE weekly_menu_id=?'))).toBe(true);
    expect(db.batches[0].some((stmt) => stmt.sql.includes('DELETE FROM weekly_menu_items WHERE family_id=? AND week_start=?'))).toBe(true);
    expect(db.batches[0].some((stmt) => stmt.sql.includes('INSERT INTO weekly_menu_portions'))).toBe(true);
    expect(db.batches[0].some((stmt) => stmt.sql.includes('INSERT INTO weekly_menu_items'))).toBe(true);
  });
});
