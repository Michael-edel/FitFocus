import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createAppleClientSecret = vi.fn();
const verifyAppleIdToken = vi.fn();
const verifyState = vi.fn();
const signSessionJwt = vi.fn();

vi.mock('../functions/api/auth/_oauth', async () => {
  const actual = await vi.importActual<typeof import('../functions/api/auth/_oauth')>('../functions/api/auth/_oauth');
  return {
    ...actual,
    createAppleClientSecret,
    verifyAppleIdToken,
    verifyState,
    signSessionJwt,
  };
});

const { onRequest } = await import('../functions/api/auth/apple/callback');
type AppleCallbackContext = Parameters<typeof onRequest>[0];

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
        async run() {
          runs.push({ sql, binds: this.binds });
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };
}

function hasAdminPromotion(db: ReturnType<typeof makeDb>) {
  return db.runs.some((run) => run.sql.includes('INSERT OR IGNORE INTO user_roles') && run.sql.includes("'admin'"));
}

async function postAppleCallback(db: ReturnType<typeof makeDb>, idPayload: Record<string, unknown>, formEmail = 'admin@example.com') {
  verifyAppleIdToken.mockResolvedValue(idPayload);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id_token: 'apple-id-token' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })));

  const form = new FormData();
  form.set('code', 'apple-code');
  form.set('state', 'oauth-state');
  form.set('user', JSON.stringify({
    email: formEmail,
    name: { firstName: 'Admin', lastName: 'User' },
  }));

  const context: AppleCallbackContext = {
    request: new Request('https://fitfocus.test/api/auth/apple/callback', {
      method: 'POST',
      headers: { Cookie: 'ff_oauth_nonce=nonce', 'x-forwarded-proto': 'https' },
      body: form,
    }),
    env: {
      AUTH_JWT_SECRET: 'unit-test-secret',
      APPLE_CLIENT_ID: 'apple-client-id',
      DB: db as unknown as D1Database,
      ADMIN_EMAILS: 'admin@example.com',
    },
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
  };
  return onRequest(context);
}

describe('/api/auth/apple admin promotion', () => {
  beforeEach(() => {
    createAppleClientSecret.mockResolvedValue('apple-client-secret');
    verifyState.mockResolvedValue({ r: 'https://fitfocus.test', n: 'nonce' });
    signSessionJwt.mockResolvedValue('session-jwt');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('does not auto-promote an admin email supplied only through the form user field', async () => {
    const db = makeDb();
    const response = await postAppleCallback(db, { sub: 'apple-user-1' });

    expect(response.status).toBe(302);
    expect(hasAdminPromotion(db)).toBe(false);
  });

  it('does not auto-promote an admin email when the id_token email is unverified', async () => {
    const db = makeDb();
    const response = await postAppleCallback(db, {
      sub: 'apple-user-1',
      email: 'admin@example.com',
      email_verified: 'false',
    });

    expect(response.status).toBe(302);
    expect(hasAdminPromotion(db)).toBe(false);
  });

  it('auto-promotes an admin email only when it comes from a verified id_token email', async () => {
    const db = makeDb();
    const response = await postAppleCallback(db, {
      sub: 'apple-user-1',
      email: 'admin@example.com',
      email_verified: 'true',
    }, 'ignored@example.com');

    expect(response.status).toBe(302);
    expect(hasAdminPromotion(db)).toBe(true);
  });
});
