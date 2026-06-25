import { describe, expect, it } from 'vitest';
import { onRequestGet } from '../functions/api/support/attachment';

const SECRET = 'unit-test-secret';
const NOW = Math.floor(Date.now() / 1000);

function b64url(input: string | Uint8Array | ArrayBuffer) {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signJwt(payload: Record<string, unknown>) {
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64url(JSON.stringify({ exp: NOW + 3600, ...payload }));
  const data = `${h}.${p}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(sig)}`;
}

function makeDb(ticketOwner = 'user-1') {
  return {
    prepare(sql: string) {
      return {
        bind() {
          return this;
        },
        async first() {
          if (sql.includes('FROM sessions')) return { id: 'sid-1', revoked: 0, expires_at: NOW + 3600 };
          if (sql.includes('FROM users')) return { is_active: 1, deleted_at: null };
          if (sql.includes('SELECT id, user_id')) return { id: 'ticket-1', user_id: ticketOwner };
          if (sql.includes('FROM support_feedback_messages')) {
            return {
              attachments_json: JSON.stringify([
                { name: 'voice.txt', mime: 'text/plain', size: 5, storage_key: 'support/ticket-1/00-voice.txt' },
              ]),
            };
          }
          return null;
        },
        async all() {
          if (sql.includes('FROM user_roles')) return { results: [{ role: 'user' }] };
          return { results: [] };
        },
        async run() {
          return { success: true };
        },
      };
    },
  };
}

function makeContext(userId: string, ticketOwner = 'user-1') {
  return async () => {
    const token = await signJwt({ sub: userId, sid: 'sid-1' });
    const request = new Request('https://fitfocus.test/api/support/attachment?id=ticket-1&messageId=message-1&index=0', {
      headers: { Cookie: `ff_session=${token}` },
    });
    const encoder = new TextEncoder();
    const bucket = {
      put: async () => undefined,
      delete: async () => undefined,
      get: async () => ({
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('hello'));
            controller.close();
          },
        }),
      }),
    };

    return onRequestGet({
      request,
      env: { AUTH_JWT_SECRET: SECRET, DB: makeDb(ticketOwner), SUPPORT_ATTACHMENTS: bucket } as any,
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
      functionPath: '/api/support/attachment',
    } as any);
  };
}

describe('/api/support/attachment', () => {
  it('serves an R2-backed message attachment to the ticket owner', async () => {
    const response = await makeContext('user-1')();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(await response.text()).toBe('hello');
  });

  it('rejects a non-admin user who does not own the ticket', async () => {
    const response = await makeContext('user-2', 'user-1')();

    expect(response.status).toBe(403);
    const body = await response.json() as any;
    expect(body.error).toBe('FORBIDDEN');
  });
});
