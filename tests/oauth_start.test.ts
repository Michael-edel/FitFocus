import { describe, expect, it } from 'vitest';
import { onRequestGet as googleStart } from '../functions/api/auth/google/start';
import { onRequestGet as appleStart } from '../functions/api/auth/apple/start';
import { verifyState } from '../functions/api/auth/_oauth';
type GoogleStartContext = Parameters<typeof googleStart>[0];

const SECRET = 'unit-test-secret';

function cookieValue(setCookie: string | null, name: string) {
  const part = String(setCookie || '').split(';')[0] || '';
  const [cookieName, value] = part.split('=');
  return cookieName === name ? decodeURIComponent(value || '') : '';
}

describe('Google OAuth start', () => {
  it('creates state that verifies through the shared OAuth verifier', async () => {
    const context: GoogleStartContext = {
      request: new Request('https://fitfocus.test/api/auth/google/start?redirect=https%3A%2F%2Ffitfocus.test%2Fdashboard&invite=ABC123', {
        headers: { 'x-forwarded-proto': 'https', 'x-request-id': 'google-oauth-start-01' },
      }),
      env: {
        DB: {} as unknown as D1Database,
        GOOGLE_CLIENT_ID: 'google-client-id',
        AUTH_JWT_SECRET: SECRET,
      },
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
    };
    const response = await googleStart(context);

    expect(response.status).toBe(302);
    expect(response.headers.get('X-Request-ID')).toBe('google-oauth-start-01');

    const location = response.headers.get('Location') || '';
    const authUrl = new URL(location);
    const nonce = cookieValue(response.headers.get('Set-Cookie'), 'ff_oauth_nonce');
    const state = authUrl.searchParams.get('state') || '';
    const parsed = await verifyState(state, SECRET, { expectedNonce: nonce });

    expect(authUrl.origin).toBe('https://accounts.google.com');
    expect(parsed?.r).toBe('https://fitfocus.test');
    expect(parsed?.i).toBe('ABC123');
    expect(parsed?.n).toBe(nonce);
  });
});

describe('Apple OAuth start', () => {
  it('returns a correlation ID without exposing OAuth state in telemetry', async () => {
    const response = await appleStart({
      request: new Request('https://fitfocus.test/api/auth/apple/start', {
        headers: { 'x-request-id': 'apple-oauth-start-01' },
      }),
      env: { APPLE_CLIENT_ID: 'apple-client-id', AUTH_JWT_SECRET: SECRET },
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
    } as Parameters<typeof appleStart>[0]);

    expect(response.status).toBe(302);
    expect(response.headers.get('X-Request-ID')).toBe('apple-oauth-start-01');
    expect(new URL(response.headers.get('Location') || '').origin).toBe('https://appleid.apple.com');
  });
});
