import { describe, expect, it } from 'vitest';
import { onRequestPost } from '../functions/api/account/restore';
type AccountRestoreContext = Parameters<typeof onRequestPost>[0];
type AccountRestoreBody = { error?: string; restored?: boolean };

describe('/api/account/restore', () => {
  it('requires OAuth re-authentication instead of restoring through a stale session', async () => {
    const context: AccountRestoreContext = {
      request: new Request('https://fitfocus.test/api/account/restore', { method: 'POST' }),
      env: {} as { DB: D1Database; AUTH_JWT_SECRET: string },
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
    };
    const response = await onRequestPost(context);

    expect(response.status).toBe(409);
    const body = await response.json() as AccountRestoreBody;
    expect(body.error).toBe('RESTORE_REQUIRES_REAUTH');
    expect(body.restored).toBe(false);
  });
});
