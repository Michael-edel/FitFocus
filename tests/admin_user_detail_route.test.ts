import { describe, expect, it } from 'vitest';
import { onRequestGet } from '../functions/api/admin/user_detail';

describe('admin user-detail route', () => {
  it('correlates an unauthenticated response without accessing user data', async () => {
    const response = await onRequestGet({
      request: new Request('https://fitfocus.test/api/admin/user_detail?user_id=user-1', { headers: { 'X-Request-ID': 'user-detail-route-01' } }),
      env: { AUTH_JWT_SECRET: 'test-secret', DB: {} as D1Database },
    } as Parameters<typeof onRequestGet>[0]);

    expect(response.status).toBe(401);
    expect(response.headers.get('X-Request-ID')).toBe('user-detail-route-01');
  });
});
