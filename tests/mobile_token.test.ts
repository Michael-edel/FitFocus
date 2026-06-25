import { describe, expect, it } from 'vitest';
import { onRequestPost } from '../functions/api/mobile/token';
import { verifySessionJwt } from '../functions/api/_lib/auth';

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
  return {
    prepare(sql: string) {
      return {
        bind() {
          return this;
        },
        async first() {
          if (sql.includes('FROM sessions')) {
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
}

async function postMobileToken(db: ReturnType<typeof makeDb>) {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-1', email: 'u@example.com', name: 'User' });
  return onRequestPost({
    request: new Request('https://fitfocus.test/api/mobile/token', {
      method: 'POST',
      headers: { Cookie: `ff_session=${token}` },
    }),
    env: { AUTH_JWT_SECRET: SECRET, DB: db } as any,
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    functionPath: '/api/mobile/token',
  } as any);
}

describe('/api/mobile/token', () => {
  it('issues a mobile-audience bearer token from a valid web session', async () => {
    const response = await postMobileToken(makeDb());

    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.tokenType).toBe('Bearer');
    expect(body.user.id).toBe('user-1');

    const payload = await verifySessionJwt(body.token, SECRET);
    expect(payload).toMatchObject({ sub: 'user-1', sid: 'sid-1', aud: 'mobile', v: 2 });
  });

  it('rejects revoked source sessions', async () => {
    const response = await postMobileToken(makeDb({ revoked: 1 }));

    expect(response.status).toBe(401);
    const body = await response.json() as any;
    expect(body.error).toBe('UNAUTH');
  });
});
