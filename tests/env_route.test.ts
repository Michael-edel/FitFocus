import { describe, expect, it } from 'vitest';
import { onRequestGet } from '../functions/api/env';

describe('/api/env', () => {
  it('returns a caller request ID without exposing configuration in telemetry', async () => {
    const response = await onRequestGet({
      request: new Request('https://fitfocus.test/api/env', { headers: { 'X-Request-ID': 'env-route-test-01' } }),
      env: { REQUIRE_INVITE: '1', GOOGLE_CLIENT_ID_LOCAL: 'public-client-id' },
    } as Parameters<typeof onRequestGet>[0]);

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-ID')).toBe('env-route-test-01');
    await expect(response.json()).resolves.toEqual({ googleClientIdLocal: 'public-client-id', googleClientIdProd: '', requireInvite: true });
  });
});
