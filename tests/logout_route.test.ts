import { describe, expect, it, vi } from 'vitest';
import { onRequestPost } from '../functions/api/logout';
import { stateSessionId } from '../functions/api/_lib/state_session';

type LogoutContext = Parameters<typeof onRequestPost>[0];
const SECRET = 'logout-route-test-secret';

function b64url(input: string | Uint8Array | ArrayBuffer) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input)
    : input instanceof Uint8Array ? input : new Uint8Array(input);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signJwt(sub: string, sid: string) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ sub, sid, exp: Math.floor(Date.now() / 1000) + 3600 }));
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(signature)}`;
}

function makeDb() {
  const run = vi.fn(async () => ({ success: true }));
  const prepare = vi.fn(() => ({ bind: () => ({ run }) }));
  return { db: { prepare } as unknown as D1Database, prepare, run };
}

const invoke = (request: Request, env: LogoutContext['env'] = {}) => onRequestPost({
  request, env, params: {}, data: {}, waitUntil: () => undefined,
  next: () => Promise.resolve(new Response(null, { status: 404 })),
} as LogoutContext);

describe('/api/logout', () => {
  it('rejects logout without a session proof and leaves the cookie untouched', async () => {
    const response = await invoke(new Request('https://fitfocus.test/api/logout', {
      method: 'POST',
      headers: { 'X-Request-ID': 'logout-route-test-01' },
    }));

    expect(response.status).toBe(401);
    expect(response.headers.get('X-Request-ID')).toBe('logout-route-test-01');
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(response.headers.get('X-FitFocus-Logout-Protocol')).toBe('1');
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'UNAUTH' });
  });

  it.each([
    {},
    { 'X-FitFocus-State-Account': 'account-a' },
    { 'X-FitFocus-State-Session': 'a'.repeat(64) },
  ])('rejects missing or partial proof before revoking the cookie session', async (scopeHeaders) => {
    const token = await signJwt('account-a', 'session-a');
    const { db, run } = makeDb();
    const response = await invoke(new Request('https://fitfocus.test/api/logout', {
      method: 'POST',
      headers: { Cookie: `ff_session=${token}`, ...scopeHeaders },
    }), { AUTH_JWT_SECRET: SECRET, DB: db });

    expect(response.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
    expect(response.headers.get('Set-Cookie')).toBeNull();
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'UNAUTH' });
  });

  it('revokes only the captured session and does not clear a shared cookie on a scoped logout', async () => {
    const token = await signJwt('account-a', 'session-a');
    const scope = await stateSessionId({ sub: 'account-a', sid: 'session-a' });
    const { db, run } = makeDb();
    const request = new Request('https://fitfocus.test/api/logout', {
      method: 'POST',
      headers: {
        Cookie: `ff_session=${token}`,
        'X-FitFocus-State-Account': 'account-a',
        'X-FitFocus-State-Session': scope,
      },
    });

    const response = await invoke(request, { AUTH_JWT_SECRET: SECRET, DB: db });

    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledOnce();
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(response.headers.get('X-FitFocus-Logout-Protocol')).toBe('1');
    expect(response.headers.get('X-FitFocus-State-Account')).toBe('account-a');
    expect(response.headers.get('X-FitFocus-State-Session')).toBe(scope);
  });

  it('does not revoke or clear the new session when a stale logout proof arrives with its cookie', async () => {
    const token = await signJwt('account-b', 'session-b');
    const staleScope = await stateSessionId({ sub: 'account-a', sid: 'session-a' });
    const { db, run } = makeDb();
    const response = await invoke(new Request('https://fitfocus.test/api/logout', {
      method: 'POST',
      headers: {
        Cookie: `ff_session=${token}`,
        'X-FitFocus-State-Account': 'account-a',
        'X-FitFocus-State-Session': staleScope,
      },
    }), { AUTH_JWT_SECRET: SECRET, DB: db });

    expect(response.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
    expect(response.headers.get('Set-Cookie')).toBeNull();
    await expect(response.json()).resolves.toMatchObject({ error: 'STATE_SESSION_CHANGED' });
  });
});
