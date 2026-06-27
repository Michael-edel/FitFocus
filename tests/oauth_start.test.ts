import { describe, expect, it } from 'vitest';
import { onRequestGet as googleStart } from '../functions/api/auth/google/start';
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
        headers: { 'x-forwarded-proto': 'https' },
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
