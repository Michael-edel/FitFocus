import { describe, expect, it } from 'vitest';
import { onRequestGet as getBootstrap } from '../functions/api/bootstrap';
import { onRequestGet as getExport } from '../functions/api/export';
import { onRequestPost as postMobileToken } from '../functions/api/mobile/token';

type BootstrapContext = Parameters<typeof getBootstrap>[0];
type ExportContext = Parameters<typeof getExport>[0];
type MobileTokenContext = Parameters<typeof postMobileToken>[0];

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

async function signJwt() {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { exp: NOW + 3600, sub: 'user-1', sid: 'sid-1', email: 'u@example.com' };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(signature)}`;
}

function makeDb() {
  const queries: string[] = [];
  const db = {
    queries,
    prepare(sql: string) {
      queries.push(sql);
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
  return db;
}

function baseContext(request: Request) {
  return {
    request,
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
  };
}

describe('beta access route boundaries', () => {
  it('blocks bootstrap, export, and mobile token issuance without an invite', async () => {
    const token = await signJwt();
    const db = makeDb();
    const env = { AUTH_JWT_SECRET: SECRET, DB: db, REQUIRE_INVITE: '1' };

    const bootstrapResponse = await getBootstrap({
      ...baseContext(new Request('https://fitfocus.test/api/bootstrap', { headers: { Cookie: `ff_session=${token}` } })),
      env,
    } as unknown as BootstrapContext);
    const exportResponse = await getExport({
      ...baseContext(new Request('https://fitfocus.test/api/export', { headers: { Cookie: `ff_session=${token}` } })),
      env,
    } as unknown as ExportContext);
    const mobileResponse = await postMobileToken({
      ...baseContext(new Request('https://fitfocus.test/api/mobile/token', { method: 'POST', headers: { Cookie: `ff_session=${token}` } })),
      env,
    } as unknown as MobileTokenContext);

    for (const response of [bootstrapResponse, exportResponse, mobileResponse]) {
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ error: 'ACCESS_REQUIRED' });
    }

    expect(db.queries.filter((sql) => sql.includes('SELECT profile_json') || sql.includes('SELECT k, v') || sql.includes('SELECT id, email'))).toHaveLength(0);
  });
});
