import { describe, expect, it } from 'vitest';
import { onRequestPost } from '../functions/api/support/feedback/my';

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

function makeDb(captured: { messageAttachmentsJson?: string | null }) {
  return {
    prepare(sql: string) {
      return {
        binds: [] as unknown[],
        bind(...args: unknown[]) {
          this.binds = args;
          return this;
        },
        async first() {
          if (sql.includes('FROM sessions')) return { id: 'sid-1', revoked: 0, expires_at: NOW + 3600 };
          if (sql.includes('FROM users')) return { is_active: 1, deleted_at: null };
          if (sql.includes('SELECT id, status')) return { id: 'ticket-1', status: 'new' };
          if (sql.includes('SELECT * FROM support_feedback')) return { id: 'ticket-1', attachments_json: null };
          return null;
        },
        async all() {
          if (sql.includes('FROM user_roles')) return { results: [{ role: 'user' }] };
          if (sql.includes('FROM support_feedback_messages')) return { results: [] };
          return { results: [] };
        },
        async run() {
          if (sql.includes('INSERT INTO support_feedback_messages')) {
            captured.messageAttachmentsJson = this.binds[5] as string | null;
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
    },
  };
}

describe('/api/support/feedback/my', () => {
  it('stores large reply attachments in R2 with message-scoped keys', async () => {
    const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
    const captured: { messageAttachmentsJson?: string | null } = {};
    let storedKey = '';
    const bucket = {
      async put(key: string) {
        storedKey = key;
      },
      async get() {
        return null;
      },
    };
    const form = new FormData();
    form.set('ticket_id', 'ticket-1');
    form.set('message', 'reply');
    form.append(
      'attachments',
      new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'reply.bin', { type: 'application/octet-stream' }),
    );

    const response = await onRequestPost({
      request: new Request('https://fitfocus.test/api/support/feedback/my', {
        method: 'POST',
        headers: { Cookie: `ff_session=${token}` },
        body: form,
      }),
      env: { AUTH_JWT_SECRET: SECRET, DB: makeDb(captured), SUPPORT_ATTACHMENTS: bucket } as any,
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
      functionPath: '/api/support/feedback/my',
    } as any);

    expect(response.status).toBe(200);
    expect(storedKey).toMatch(/^support\/ticket-1\/messages\/[^/]+\/00-reply\.bin$/);
    const records = JSON.parse(String(captured.messageAttachmentsJson));
    expect(records[0].storage_key).toBe(storedKey);
    expect(records[0].data_url).toBeUndefined();
  });
});
