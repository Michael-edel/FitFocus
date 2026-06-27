import { describe, expect, it } from 'vitest';
import { onRequestPost } from '../functions/api/family/index';

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

function makeDb(options: { memberInsertChanges?: number; latestFamily?: LatestFamily | null } = {}) {
  const runs: Array<{ sql: string; binds: unknown[] }> = [];
  let accessReadCount = 0;
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
          if (sql.includes('FROM users WHERE id = ? LIMIT 1')) return { is_active: 1, deleted_at: null };
          if (sql.includes('FROM families f') && sql.includes('JOIN family_members m')) {
            accessReadCount += 1;
            if (accessReadCount === 1) return null;
            return options.latestFamily ? { id: options.latestFamily.id, owner_user_id: options.latestFamily.owner_user_id, role: 'owner' } : null;
          }
          if (sql.includes('SELECT id, name, owner_user_id, created_at FROM families WHERE id = ? LIMIT 1')) {
            return options.latestFamily || null;
          }
          if (sql.includes('FROM subscriptions')) return { plan: 'family' };
          return null;
        },
        async all() {
          if (sql.includes('SELECT role FROM user_roles')) return { results: [{ role: 'user' }] };
          return { results: [] };
        },
        async run() {
          runs.push({ sql, binds: this.binds });
          if (sql.includes('SELECT ?, ?, ?, \'owner\'')) {
            return { success: true, meta: { changes: options.memberInsertChanges ?? 1 } };
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };
}

async function postFamily(db: ReturnType<typeof makeDb>) {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
  const context: FamilyHandlerContext = {
    request: new Request('https://fitfocus.test/api/family', {
      method: 'POST',
      headers: { Cookie: `ff_session=${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Моя семья' }),
    }),
    env: { AUTH_JWT_SECRET: SECRET, DB: db as unknown as D1Database },
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
  };
  return onRequestPost(context);
}

describe('/api/family POST', () => {
  it('creates a family when the owner membership insert succeeds', async () => {
    const db = makeDb();
    const response = await postFamily(db);

    expect(response.status).toBe(201);
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO families'))).toBe(true);
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO family_members'))).toBe(true);
  });

  it('deletes the orphan family row and returns the existing family when membership insert loses the race', async () => {
    const db = makeDb({
      memberInsertChanges: 0,
      latestFamily: { id: 'family-existing', name: 'Уже есть', owner_user_id: 'user-1', created_at: NOW },
    });
    const response = await postFamily(db);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      family: { id: 'family-existing' },
      alreadyMember: true,
    });
    expect(db.runs.some((run) => run.sql.includes('DELETE FROM families WHERE id = ?'))).toBe(true);
  });
});
type FamilyHandlerContext = Parameters<typeof onRequestPost>[0];
type LatestFamily = { id: string; owner_user_id: string; created_at: number; name?: string };
