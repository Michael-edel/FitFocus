import { describe, expect, it } from 'vitest';
import { onRequestGet as getAdminEvents } from '../functions/api/admin/admin_events';
import { onRequestGet as getAiLogs } from '../functions/api/admin/ai_logs';
type AdminEventsContext = Parameters<typeof getAdminEvents>[0];
type AiLogsContext = Parameters<typeof getAiLogs>[0];

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
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = b64url(JSON.stringify(header));
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

type PreparedStatement = {
  sql: string;
  binds: unknown[];
  bind: (...args: unknown[]) => PreparedStatement;
  first: () => Promise<unknown>;
  all: () => Promise<{ results: unknown[] }>;
  run: () => Promise<{ success: boolean; meta: { changes: number } }>;
};

function makeDb() {
  const allCalls: Array<{ sql: string; binds: unknown[] }> = [];
  return {
    allCalls,
    prepare(sql: string): PreparedStatement {
      const stmt: PreparedStatement = {
        sql,
        binds: [],
        bind(...args: unknown[]) {
          this.binds = args;
          return this;
        },
        async first() {
          if (sql.includes('FROM sessions')) return { id: 'sid-admin', revoked: 0, expires_at: NOW + 3600 };
          if (sql.includes('SELECT is_active, deleted_at FROM users')) return { is_active: 1, deleted_at: null };
          return null;
        },
        async all() {
          allCalls.push({ sql, binds: this.binds });
          if (sql.includes('FROM user_roles WHERE user_id = ?')) {
            return { results: [{ role: 'admin' }] };
          }
          return { results: [] };
        },
        async run() {
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };
}

async function adminRequest(url: string) {
  const token = await signJwt({ sub: 'admin-1', sid: 'sid-admin', email: 'a@example.com' });
  return new Request(url, { headers: { Cookie: `ff_session=${token}` } });
}

function pagesContext(request: Request, db: ReturnType<typeof makeDb>) {
  const context: AdminEventsContext = {
    request,
    env: { AUTH_JWT_SECRET: SECRET, DB: db as unknown as D1Database },
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
  };
  return context;
}

describe('admin query params', () => {
  it('falls back invalid admin_events limit and offset to bounded defaults', async () => {
    const db = makeDb();
    const response = await getAdminEvents(pagesContext(
      await adminRequest('https://fitfocus.test/api/admin/admin_events?limit=abc&offset=bad'),
      db,
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ limit: 50, offset: 0 });
    const query = db.allCalls.find((call) => call.sql.includes('FROM admin_events e'));
    expect(query?.binds.slice(-2)).toEqual([50, 0]);
  });

  it('falls back invalid ai_logs limit and clamps oversized limits', async () => {
    const db = makeDb();
    const invalidContext: AiLogsContext = {
      request: await adminRequest('https://fitfocus.test/api/admin/ai_logs?limit=abc'),
      env: { AUTH_JWT_SECRET: SECRET, DB: db as unknown as D1Database },
    };
    const invalidResponse = await getAiLogs(invalidContext);

    expect(invalidResponse.status).toBe(200);
    let query = db.allCalls.find((call) => call.sql.includes('FROM ai_events'));
    expect(query?.binds.at(-1)).toBe(50);

    const clampDb = makeDb();
    const clampContext: AiLogsContext = {
      request: await adminRequest('https://fitfocus.test/api/admin/ai_logs?limit=9999'),
      env: { AUTH_JWT_SECRET: SECRET, DB: clampDb as unknown as D1Database },
    };
    const clampResponse = await getAiLogs(clampContext);

    expect(clampResponse.status).toBe(200);
    query = clampDb.allCalls.find((call) => call.sql.includes('FROM ai_events'));
    expect(query?.binds.at(-1)).toBe(200);
  });
});
