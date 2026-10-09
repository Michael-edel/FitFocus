import { describe, expect, it } from 'vitest';
import { onRequestGet } from '../functions/api/admin/ai-cost';

describe('admin AI cost route', () => {
  it('correlates denied requests without logging report data', async () => {
    const response = await onRequestGet({
      request: new Request('https://fitfocus.test/api/admin/ai-cost', { headers: { 'X-Request-ID': 'ai-cost-route-01' } }),
      env: {},
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('X-Request-ID')).toBe('ai-cost-route-01');
  });
});
