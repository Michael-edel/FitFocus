import { describe, expect, it } from 'vitest';
import { onRequestPost } from '../functions/api/invite/validate';

type InviteValidateContext = Parameters<typeof onRequestPost>[0];

function makeDb(invite: Record<string, unknown> | null) {
  let binds: unknown[] = [];
  return {
    get lastBinds() {
      return binds;
    },
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          binds = values;
          return this;
        },
        async first() {
          expect(sql).toContain('FROM invite_codes');
          return invite;
        },
      };
    },
  } as unknown as D1Database & { readonly lastBinds: unknown[] };
}

function context(request: Request, db: D1Database): InviteValidateContext {
  return {
    request,
    env: { DB: db },
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
  };
}

describe('/api/invite/validate', () => {
  it('validates a code from a bounded POST body without returning invite metadata', async () => {
    const db = makeDb({
      code: 'BETA-123',
      note: 'internal note',
      max_uses: 10,
      uses: 2,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      revoked: 0,
    });
    const request = new Request('https://fitfocus.test/api/invite/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'BETA-123' }),
    });

    const response = await onRequestPost(context(request, db));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ valid: true, schema_version: 3 });
    expect(body).not.toHaveProperty('code');
    expect(body).not.toHaveProperty('note');
    expect(body).not.toHaveProperty('remainingUses');
    expect(db.lastBinds).toEqual(['BETA-123']);
    expect(request.url).toBe('https://fitfocus.test/api/invite/validate');
  });

  it('does not reveal whether a missing code exists', async () => {
    const response = await onRequestPost(context(
      new Request('https://fitfocus.test/api/invite/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'UNKNOWN' }),
      }),
      makeDb(null),
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ valid: false, schema_version: 3 });
  });
});
