import { describe, expect, it } from 'vitest';
import { onRequestPost } from '../functions/api/logout';

type LogoutContext = Parameters<typeof onRequestPost>[0];

describe('/api/logout', () => {
  it('clears the session and returns the caller request ID even without a valid session', async () => {
    const response = await onRequestPost({
      request: new Request('https://fitfocus.test/api/logout', {
        method: 'POST',
        headers: { 'X-Request-ID': 'logout-route-test-01' },
      }),
      env: {},
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
    } as LogoutContext);

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-ID')).toBe('logout-route-test-01');
    expect(response.headers.get('Set-Cookie')).toContain('ff_session=');
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
