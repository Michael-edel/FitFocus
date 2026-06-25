import { describe, expect, it } from 'vitest';
import { onRequestPost } from '../functions/api/account/restore';

describe('/api/account/restore', () => {
  it('requires OAuth re-authentication instead of restoring through a stale session', async () => {
    const response = await onRequestPost({
      request: new Request('https://fitfocus.test/api/account/restore', { method: 'POST' }),
      env: {} as any,
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
      functionPath: '/api/account/restore',
    } as any);

    expect(response.status).toBe(409);
    const body = await response.json() as any;
    expect(body.error).toBe('RESTORE_REQUIRES_REAUTH');
    expect(body.restored).toBe(false);
  });
});
