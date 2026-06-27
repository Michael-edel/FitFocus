import { describe, expect, it, vi } from 'vitest';

const randomCode = vi.fn();

vi.mock('../functions/api/_lib/db', async () => {
  const actual = await vi.importActual<typeof import('../functions/api/_lib/db')>('../functions/api/_lib/db');
  return {
    ...actual,
    randomCode,
  };
});

const { onRequestPost } = await import('../functions/api/family/invite');
type FamilyInviteContext = Parameters<typeof onRequestPost>[0];
type InviteResponseBody = { code?: string; expiresAt?: number; error?: string };

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

function makeDb(options: { insertChanges?: number[] } = {}) {
  const runs: Array<{ sql: string; binds: unknown[] }> = [];
  let insertAttempt = 0;
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
          if (sql.includes('JOIN family_members')) return { id: 'family-1', owner_user_id: 'user-1', role: 'owner' };
          if (sql.includes('FROM subscriptions')) return { plan: 'family' };
          return null;
        },
        async all() {
          if (sql.includes('SELECT role FROM user_roles')) return { results: [{ role: 'user' }] };
          return { results: [] };
        },
        async run() {
          runs.push({ sql, binds: this.binds });
          if (sql.includes('INSERT OR IGNORE INTO family_invites')) {
            const changes = options.insertChanges?.[insertAttempt] ?? 1;
            insertAttempt += 1;
            return { success: true, meta: { changes } };
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };
}

async function postInvite(db: ReturnType<typeof makeDb>, body: Record<string, unknown> = { ttlHours: 24 }) {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
  const context: FamilyInviteContext = {
    request: new Request('https://fitfocus.test/api/family/invite', {
      method: 'POST',
      headers: { Cookie: `ff_session=${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env: { AUTH_JWT_SECRET: SECRET, DB: db as unknown as D1Database },
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
  };
  return onRequestPost(context);
}

describe('/api/family/invite', () => {
  it('retries invite insertion until a unique code is stored', async () => {
    randomCode.mockReset();
    randomCode.mockReturnValueOnce('AAAA1111').mockReturnValueOnce('BBBB2222');

    const db = makeDb({ insertChanges: [0, 1] });
    const response = await postInvite(db);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ code: 'BBBB2222' });
    expect(db.runs.filter((run) => run.sql.includes('INSERT OR IGNORE INTO family_invites'))).toHaveLength(2);
  });

  it('falls back invalid ttlHours before writing expires_at', async () => {
    randomCode.mockReset();
    randomCode.mockReturnValue('AAAA1111');

    const db = makeDb();
    const response = await postInvite(db, { ttlHours: 'abc' });

    expect(response.status).toBe(201);
    const body = await response.json() as InviteResponseBody;
    expect(Number.isFinite(body.expiresAt)).toBe(true);
    const insert = db.runs.find((run) => run.sql.includes('INSERT OR IGNORE INTO family_invites'));
    expect(Number.isFinite(insert?.binds.at(-1))).toBe(true);
  });

  it('returns 409 when invite generation keeps colliding', async () => {
    randomCode.mockReset();
    randomCode.mockReturnValue('COLLIDE1');

    const db = makeDb({ insertChanges: [0, 0, 0, 0, 0, 0, 0, 0] });
    const response = await postInvite(db);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: 'INVITE_GENERATION_FAILED' });
  });
});
