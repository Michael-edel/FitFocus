import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const verifyState = vi.fn();

vi.mock('../functions/api/auth/_oauth', async () => {
  const actual = await vi.importActual<typeof import('../functions/api/auth/_oauth')>('../functions/api/auth/_oauth');
  return { ...actual, verifyState };
});

const { onRequestGet } = await import('../functions/api/auth/google/callback');
type GoogleCallbackContext = Parameters<typeof onRequestGet>[0];

function makeContext(): GoogleCallbackContext {
  return {
    request: new Request('https://fitfocus.test/api/auth/google/callback?code=code&state=state', {
      headers: { Cookie: 'ff_oauth_nonce=nonce', 'x-request-id': 'google-oauth-subject-test' },
    }),
    env: {
      DB: {} as D1Database,
      GOOGLE_CLIENT_ID: 'google-client-id',
      GOOGLE_CLIENT_SECRET: 'google-client-secret',
      AUTH_JWT_SECRET: 'unit-test-secret',
    },
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
  };
}

function mockProviderInfo(info: Record<string, unknown>, token: Record<string, unknown> = { id_token: 'google-id-token' }) {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(token), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(info), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('Google OAuth callback identity validation', () => {
  beforeEach(() => {
    verifyState.mockResolvedValue({ r: 'https://fitfocus.test', n: 'nonce' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('rejects a whitespace-only token endpoint id_token before tokeninfo', async () => {
    const fetchMock = mockProviderInfo({}, { id_token: '   ' });

    const response = await onRequestGet(makeContext());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'No id_token returned' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('rejects tokeninfo without a stable subject before database access', async () => {
    mockProviderInfo({ aud: 'google-client-id', iss: 'https://accounts.google.com' });

    const response = await onRequestGet(makeContext());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid subject' });
  });

  it('rejects tokeninfo from an unexpected issuer', async () => {
    mockProviderInfo({ aud: 'google-client-id', iss: 'https://attacker.test', sub: 'user-1' });

    const response = await onRequestGet(makeContext());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid iss' });
  });
});