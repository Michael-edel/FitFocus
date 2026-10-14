import { describe, expect, it } from 'vitest';
import { onRequestPost } from '../functions/api/mobile/token';
import { verifySessionJwt } from '../functions/api/_lib/auth';
import { stateSessionId } from '../functions/api/_lib/state_session';
type MobileTokenContext = Parameters<typeof onRequestPost>[0];
type MobileTokenBody = { tokenType?: string; token?: string; error?: string; user?: { id?: string } };

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

function makeDb(options: { revoked?: number; expiresAt?: number } = {}) {
  const calls = { tokenSessionReads: 0 };
  const db = {
    prepare(sql: string) {
      return {
        bind() {
          return this;
        },
        async first() {
          if (sql.includes('FROM sessions')) {
            if (sql.startsWith('SELECT id, expires_at, revoked FROM sessions')) calls.tokenSessionReads += 1;
            return { id: 'sid-1', revoked: options.revoked ?? 0, expires_at: options.expiresAt ?? NOW + 3600 };
          }
          if (sql.includes('FROM users')) return { is_active: 1, deleted_at: null };
          return null;
        },
        async all() {
          if (sql.includes('FROM user_roles')) return { results: [{ role: 'user' }] };
          return { results: [] };
        },
        async run() {
          return { success: true };
        },
      };
    },
  };
  return { db, calls };
}

async function postMobileToken(
  fake: ReturnType<typeof makeDb>,
  requestId = 'mobile-token-test-01',
  scope: { account?: string; session?: string } | false = {},
) {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-1', email: 'u@example.com', name: 'User' });
  const headers = new Headers({ Cookie: `ff_session=${token}`, 'X-Request-ID': requestId });
  if (scope !== false) {
    headers.set('X-FitFocus-State-Account', scope.account ?? 'user-1');
    headers.set('X-FitFocus-State-Session', scope.session ?? await stateSessionId({ sub: 'user-1', sid: 'sid-1' }));
  }
  const context: MobileTokenContext = {
    request: new Request('https://fitfocus.test/api/mobile/token', {
      method: 'POST',
      headers,
    }),
    env: { AUTH_JWT_SECRET: SECRET, DB: fake.db as unknown as D1Database },
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
  };
  return onRequestPost(context);
}

describe('/api/mobile/token', () => {
  it('issues a mobile-audience bearer token from a valid web session', async () => {
    const response = await postMobileToken(makeDb());

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-ID')).toBe('mobile-token-test-01');
    expect(response.headers.get('X-FitFocus-Mobile-Token-Protocol')).toBe('1');
    expect(response.headers.get('X-FitFocus-Mobile-Token-Guard')).toBe('1');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-FitFocus-State-Account')).toBe('user-1');
    expect(response.headers.get('X-FitFocus-State-Session')).toBe(await stateSessionId({ sub: 'user-1', sid: 'sid-1' }));
    expect(fake.calls.tokenSessionReads).toBe(1);
    const body = await response.json() as MobileTokenBody;
    expect(body.tokenType).toBe('Bearer');
    expect(body.user.id).toBe('user-1');

    const payload = await verifySessionJwt(body.token, SECRET);
    expect(payload).toMatchObject({ sub: 'user-1', sid: 'sid-1', aud: 'mobile', v: 2 });
    expect(payload?.iat).toBeGreaterThan(1_000_000_000);
    expect(payload?.iat).toBeLessThan(10_000_000_000);
  });

  it('rejects revoked source sessions', async () => {
    const response = await postMobileToken(makeDb({ revoked: 1 }));

    expect(response.status).toBe(401);
    const body = await response.json() as MobileTokenBody;
    expect(body.error).toBe('UNAUTH');
  });

  it('rejects a stale session scope before token issuance', async () => {
    const fake = makeDb();
    const response = await postMobileToken(fake, 'mobile-token-stale-scope', { session: 'f'.repeat(64) });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'UNAUTH' });
    expect(fake.calls.tokenSessionReads).toBe(0);
    expect(response.headers.get('X-FitFocus-Mobile-Token-Guard')).toBeNull();
  });

  it('keeps compatibility for unscoped legacy callers without claiming an echoed scope', async () => {
    const response = await postMobileToken(makeDb(), 'mobile-token-legacy-client', false);

    expect(response.status).toBe(200);
    expect(response.headers.get('X-FitFocus-Mobile-Token-Protocol')).toBe('1');
    expect(response.headers.get('X-FitFocus-Mobile-Token-Guard')).toBe('1');
    expect(response.headers.get('X-FitFocus-State-Account')).toBeNull();
    expect(response.headers.get('X-FitFocus-State-Session')).toBeNull();
  });
});
