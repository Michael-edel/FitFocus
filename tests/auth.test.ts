import { describe, expect, it } from 'vitest';
import { requireMobileUser, requireUser } from '../functions/api/_lib/auth';

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

function makeDb() {
  return {
    prepare(sql: string) {
      return {
        bind() {
          return this;
        },
        async first() {
          if (sql.includes('FROM sessions')) return { id: 'sid-1', revoked: 0, expires_at: NOW + 3600 };
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

describe('auth audience scope', () => {
  it('accepts a normal web session token in ff_session cookie', async () => {
    const token = await signJwt({ sub: 'user-1', sid: 'sid-1', email: 'u@example.com' });
    const user = await requireUser(
      new Request('https://fitfocus.test/api/me', { headers: { Cookie: `ff_session=${token}` } }),
      { AUTH_JWT_SECRET: SECRET, DB: makeDb() },
    );

    expect(user.sub).toBe('user-1');
    expect(user.roles).toEqual(['user']);
  });

  it('rejects mobile audience tokens in generic requireUser', async () => {
    const token = await signJwt({ sub: 'user-1', sid: 'sid-1', aud: 'mobile' });

    await expect(requireUser(
      new Request('https://fitfocus.test/api/me', { headers: { Authorization: `Bearer ${token}` } }),
      { AUTH_JWT_SECRET: SECRET, DB: makeDb() },
    )).rejects.toThrow('UNAUTH');
  });

  it('accepts mobile audience tokens only through requireMobileUser bearer auth', async () => {
    const token = await signJwt({ sub: 'user-1', sid: 'sid-1', aud: 'mobile' });
    const user = await requireMobileUser(
      new Request('https://fitfocus.test/api/wearable/sync', { headers: { Authorization: `Bearer ${token}` } }),
      { AUTH_JWT_SECRET: SECRET, DB: makeDb() },
    );

    expect(user.sub).toBe('user-1');
  });

  it('treats malformed JWT bytes as an unauthenticated request', async () => {
    await expect(requireUser(
      new Request('https://fitfocus.test/api/me', { headers: { Authorization: 'Bearer a.%%%.b' } }),
      { AUTH_JWT_SECRET: SECRET, DB: makeDb() },
    )).rejects.toThrow('UNAUTH');
  });
});
