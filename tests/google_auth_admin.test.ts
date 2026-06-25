import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from '../functions/api/auth/google';

const SECRET = 'unit-test-secret';

function makeDb() {
  const runs: Array<{ sql: string; binds: unknown[] }> = [];
  return {
    runs,
    prepare(sql: string) {
      const stmt = {
        binds: [] as unknown[],
        bind(...args: unknown[]) {
          this.binds = args;
          return this;
        },
        async first() {
          return null;
        },
        async all() {
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

async function postGoogleAuth(db: ReturnType<typeof makeDb>, emailVerified: boolean) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    aud: 'google-client-id',
    iss: 'https://accounts.google.com',
    sub: 'google-user-1',
    email: 'admin@example.com',
    name: 'Admin User',
    picture: '',
    email_verified: emailVerified ? 'true' : 'false',
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })));

  return postGoogleRequest(db);
}

async function postGoogleRequest(db: ReturnType<typeof makeDb>) {
  return onRequestPost({
    request: new Request('https://fitfocus.test/api/auth/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' },
      body: JSON.stringify({ credential: 'google-id-token' }),
    }),
    env: {
      AUTH_JWT_SECRET: SECRET,
      DB: db,
      GOOGLE_CLIENT_ID: 'google-client-id',
      ADMIN_EMAILS: 'admin@example.com',
    } as any,
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    functionPath: '/api/auth/google',
  } as any);
}

function hasAdminPromotion(db: ReturnType<typeof makeDb>) {
  return db.runs.some((run) => run.sql.includes('INSERT OR IGNORE INTO user_roles') && run.sql.includes("'admin'"));
}

describe('/api/auth/google admin promotion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not auto-promote an admin email when Google reports it unverified', async () => {
    const db = makeDb();
    const response = await postGoogleAuth(db, false);

    expect(response.status).toBe(200);
    expect(hasAdminPromotion(db)).toBe(false);
  });

  it('auto-promotes an admin email only after Google reports it verified', async () => {
    const db = makeDb();
    const response = await postGoogleAuth(db, true);

    expect(response.status).toBe(200);
    expect(hasAdminPromotion(db)).toBe(true);
  });

  it('does not read tokeninfo error responses through unbounded text()', async () => {
    const text = vi.fn(async () => 'not-json-error-body');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => {
        throw new Error('not json');
      },
      text,
    })));

    const response = await postGoogleRequest(makeDb());
    const body = await response.json() as any;

    expect(response.status).toBe(401);
    expect(body.error).toBe('Invalid Google token');
    expect(text).not.toHaveBeenCalled();
  });
});
