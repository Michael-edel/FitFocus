import { describe, expect, it } from 'vitest';
import { onRequestGet } from '../functions/api/admin/stats';

describe('admin stats observability', () => {
  it('returns the supplied request ID even when the request is unauthorized', async () => {
    const response = await onRequestGet({
      request: new Request('https://fitfocus.test/api/admin/stats', { headers: { 'X-Request-ID': 'admin-stats-test-01' } }),
      env: {} as { DB: D1Database; AUTH_JWT_SECRET: string },
      params: {},
      data: {},
      waitUntil() {},
      next: async () => new Response(null, { status: 404 }),
    } as Parameters<typeof onRequestGet>[0]);

    expect(response.status).toBe(401);
    expect(response.headers.get('X-Request-ID')).toBe('admin-stats-test-01');
  });
});
