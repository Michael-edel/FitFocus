import { afterEach, describe, expect, it, vi } from 'vitest';
import { MobileTokenApiError, requestMobileToken } from '../features/settings/mobileTokenApi';

describe('mobile token feature API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the shared POST transport and preserves the issued token payload', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('X-Request-ID')).toMatch(/^web-/);
      return new Response(JSON.stringify({ token: 'mobile-token', expiresAt: 123 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestMobileToken()).resolves.toEqual({ token: 'mobile-token', expiresAt: 123 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps public unauthenticated responses to the existing user message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'UNAUTH' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })));

    await expect(requestMobileToken()).rejects.toMatchObject({
      code: 'UNAUTH',
      message: 'Сначала войдите в аккаунт FitFocus.',
    });
  });
});
