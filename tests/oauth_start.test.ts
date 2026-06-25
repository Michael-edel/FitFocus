import { describe, expect, it } from 'vitest';
import { onRequestGet as googleStart } from '../functions/api/auth/google/start';
import { verifyState } from '../functions/api/auth/_oauth';

const SECRET = 'unit-test-secret';

function cookieValue(setCookie: string | null, name: string) {
  const part = String(setCookie || '').split(';')[0] || '';
  const [cookieName, value] = part.split('=');
  return cookieName === name ? decodeURIComponent(value || '') : '';
}

describe('Google OAuth start', () => {
  it('creates state that verifies through the shared OAuth verifier', async () => {
    const response = await googleStart({
      request: new Request('https://fitfocus.test/api/auth/google/start?redirect=https%3A%2F%2Ffitfocus.test%2Fdashboard&invite=ABC123', {
        headers: { 'x-forwarded-proto': 'https' },
      }),
      env: {
        GOOGLE_CLIENT_ID: 'google-client-id',
        AUTH_JWT_SECRET: SECRET,
      } as any,
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
      functionPath: '/api/auth/google/start',
    } as any);

    expect(response.status).toBe(302);

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
