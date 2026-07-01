import { describe, expect, it } from 'vitest';
import { onRequestGet, onRequestPost } from '../functions/api/support/feedback/my';
import type { SupportAttachmentBucket } from '../functions/api/_lib/support_attachments';
type SupportFeedbackMyGetContext = Parameters<typeof onRequestGet>[0];
type SupportFeedbackMyContext = Parameters<typeof onRequestPost>[0];

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

function makeDb(
  captured: { messageAttachmentsJson?: string | null },
  options: {
    messageInsertChanges?: number;
    updateChanges?: number;
    latestTicketAfterFailedWrite?: { id: string; status: string } | null;
  } = {},
) {
  const batches: Array<Array<{ sql: string; binds: unknown[] }>> = [];
  let ticketReadCount = 0;
  return {
    batches,
    prepare(sql: string) {
      return {
        sql,
        binds: [] as unknown[],
        bind(...args: unknown[]) {
          this.binds = args;
          return this;
        },
        async first() {
          if (sql.includes('FROM sessions')) return { id: 'sid-1', revoked: 0, expires_at: NOW + 3600 };
          if (sql.includes('FROM users')) return { is_active: 1, deleted_at: null };
          if (sql.includes('SELECT id, status')) {
            ticketReadCount += 1;
            if (ticketReadCount > 1 && 'latestTicketAfterFailedWrite' in options) {
              return options.latestTicketAfterFailedWrite;
            }
            return { id: 'ticket-1', status: 'new' };
          }
          if (sql.includes('FROM support_feedback') && sql.includes('WHERE id = ?')) {
            return {
              id: 'ticket-1',
              created_at: 1000,
              updated_at: 1001,
              category: 'Ошибка',
              section: 'Настройки',
              subject: 'Push',
              message: 'Пользовательское описание\n\n---\nСистемная диагностика\nUser-Agent: secret',
              status: 'new',
              priority: 'normal',
              attachment_count: 0,
              attachments_json: null,
              app_version: 'test',
              last_reply_at: null,
              last_reply_by: null,
              resolved_at: null,
              closed_at: null,
              admin_note: 'internal admin note',
              assigned_admin_user_id: 'admin-1',
            };
          }
          return null;
        },
        async all() {
          if (sql.includes('FROM user_roles')) return { results: [{ role: 'user' }] };
          if (sql.includes('FROM support_feedback_messages')) {
            return {
              results: [{
                id: 'message-1',
                ticket_id: 'ticket-1',
                author_user_id: 'user-1',
                author_role: 'user',
                message: 'Ответ пользователя\n\n---\nСистемная диагностика\nCF-Ray: secret',
                attachment_count: 0,
                attachments_json: null,
                created_at: 1002,
              }],
            };
          }
          return { results: [] };
        },
        async run() {
          return { success: true, meta: { changes: 1 } };
        },
      };
    },
    async batch(stmts: Array<{ sql: string; binds: unknown[] }>) {
      batches.push(stmts.map((stmt) => ({ sql: stmt.sql, binds: stmt.binds })));
      return stmts.map((stmt) => {
        if (stmt.sql.includes('INSERT INTO support_feedback_messages')) {
          captured.messageAttachmentsJson = stmt.binds[5] as string | null;
          return { success: true, meta: { changes: options.messageInsertChanges ?? 1 } };
        }
        if (stmt.sql.includes('UPDATE support_feedback')) {
          return { success: true, meta: { changes: options.updateChanges ?? 1 } };
        }
        return { success: true, meta: { changes: 1 } };
      });
    },
  };
}

async function getMyTicket(db: ReturnType<typeof makeDb>, ticketId: string) {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
  const context: SupportFeedbackMyGetContext = {
    request: new Request(`https://fitfocus.test/api/support/feedback/my?id=${encodeURIComponent(ticketId)}`, {
      headers: { Cookie: `ff_session=${token}` },
    }),
    env: { AUTH_JWT_SECRET: SECRET, DB: db as unknown as D1Database },
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
  };
  return onRequestGet(context);
}

describe('/api/support/feedback/my', () => {
  it('does not return admin-only notes or system diagnostics to the ticket owner', async () => {
    const captured: { messageAttachmentsJson?: string | null } = {};
    const response = await getMyTicket(makeDb(captured), 'ticket-1');

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ticket.message).toBe('Пользовательское описание');
    expect(payload.ticket).not.toHaveProperty('admin_note');
    expect(payload.ticket).not.toHaveProperty('assigned_admin_user_id');
    expect(JSON.stringify(payload)).not.toContain('Системная диагностика');
    expect(JSON.stringify(payload)).not.toContain('User-Agent: secret');
    expect(JSON.stringify(payload)).not.toContain('CF-Ray: secret');
    expect(payload.ticket.messages[0].message).toBe('Ответ пользователя');
  });

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

    const context: SupportFeedbackMyContext = {
      request: new Request('https://fitfocus.test/api/support/feedback/my', {
        method: 'POST',
        headers: { Cookie: `ff_session=${token}` },
        body: form,
      }),
      env: {
        AUTH_JWT_SECRET: SECRET,
        DB: makeDb(captured) as unknown as D1Database,
        SUPPORT_ATTACHMENTS: bucket as SupportAttachmentBucket,
      },
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
    };
    const response = await onRequestPost(context);

    expect(response.status).toBe(200);
    expect(storedKey).toMatch(/^support\/ticket-1\/messages\/[^/]+\/00-reply\.bin$/);
    const records = JSON.parse(String(captured.messageAttachmentsJson));
    expect(records[0].storage_key).toBe(storedKey);
    expect(records[0].data_url).toBeUndefined();
  });

  it('removes stored R2 reply attachments when the conditional ticket write loses a race', async () => {
    const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
    const captured: { messageAttachmentsJson?: string | null } = {};
    let storedKey = '';
    let deletedKeys: string[] = [];
    const bucket = {
      async put(key: string) {
        storedKey = key;
      },
      async get() {
        return null;
      },
      async delete(keys: string | string[]) {
        deletedKeys = Array.isArray(keys) ? keys : [keys];
      },
    };
    const form = new FormData();
    form.set('ticket_id', 'ticket-1');
    form.set('message', 'reply');
    form.append(
      'attachments',
      new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'reply.bin', { type: 'application/octet-stream' }),
    );

    const context: SupportFeedbackMyContext = {
      request: new Request('https://fitfocus.test/api/support/feedback/my', {
        method: 'POST',
        headers: { Cookie: `ff_session=${token}` },
        body: form,
      }),
      env: {
        AUTH_JWT_SECRET: SECRET,
        DB: makeDb(captured, { messageInsertChanges: 0, updateChanges: 0, latestTicketAfterFailedWrite: null }) as unknown as D1Database,
        SUPPORT_ATTACHMENTS: bucket as SupportAttachmentBucket,
      },
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
    };
    const response = await onRequestPost(context);

    expect(response.status).toBe(404);
    expect(storedKey).toMatch(/^support\/ticket-1\/messages\/[^/]+\/00-reply\.bin$/);
    expect(deletedKeys).toEqual([storedKey]);
  });

  it('rejects oversized reply forms before writing', async () => {
    const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
    const captured: { messageAttachmentsJson?: string | null } = {};
    const db = makeDb(captured);

    const context: SupportFeedbackMyContext = {
      request: new Request('https://fitfocus.test/api/support/feedback/my', {
        method: 'POST',
        headers: {
          Cookie: `ff_session=${token}`,
          'Content-Type': 'multipart/form-data; boundary=x',
        },
        body: 'x'.repeat(9 * 1024 * 1024),
      }),
      env: { AUTH_JWT_SECRET: SECRET, DB: db as unknown as D1Database },
      params: {},
      data: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
    };
    const response = await onRequestPost(context);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
    expect(db.batches).toHaveLength(0);
    expect(captured.messageAttachmentsJson).toBeUndefined();
  });
});
