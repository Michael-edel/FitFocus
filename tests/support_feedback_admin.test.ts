import { describe, expect, it } from 'vitest';
import { onRequestGet, onRequestPatch, onRequestPost } from '../functions/api/support/feedback';
type SupportFeedbackGetContext = Parameters<typeof onRequestGet>[0];
type SupportFeedbackPatchContext = Parameters<typeof onRequestPatch>[0];
type SupportFeedbackPostContext = Parameters<typeof onRequestPost>[0];

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
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = b64url(JSON.stringify(header));
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

type PreparedStatement = {
  sql: string;
  binds: unknown[];
  bind: (...args: unknown[]) => PreparedStatement;
  first: () => Promise<unknown>;
  all: () => Promise<{ results: unknown[] }>;
  run: () => Promise<{ success: boolean; meta: { changes: number } }>;
};

function makeDb(options: { updateChanges?: number; messageInsertChanges?: number; currentTicket?: Record<string, unknown> | null } = {}) {
  const runs: Array<{ sql: string; binds: unknown[] }> = [];
  const allCalls: Array<{ sql: string; binds: unknown[] }> = [];
  const batches: Array<Array<{ sql: string; binds: unknown[] }>> = [];
  const auditEvents: Array<{ sql: string; binds: unknown[] }> = [];
  let lastChanges = 0;
  const currentTicket = options.currentTicket === undefined ? {
    id: 'ticket-1',
    user_id: 'user-1',
    status: 'new',
    priority: 'normal',
    admin_note: null,
    assigned_admin_user_id: null,
    resolved_at: null,
    closed_at: null,
    last_reply_at: null,
    last_reply_by: null,
    attachments_json: null,
    attachment_count: 0,
  } : options.currentTicket;

  const db = {
    runs,
    allCalls,
    batches,
    auditEvents,
    prepare(sql: string): PreparedStatement {
      const stmt: PreparedStatement = {
        sql,
        binds: [],
        bind(...args: unknown[]) {
          this.binds = args;
          return this;
        },
        async first() {
          if (sql.includes('FROM sessions')) return { id: 'sid-admin', revoked: 0, expires_at: NOW + 3600 };
          if (sql.includes('SELECT is_active, deleted_at FROM users')) return { is_active: 1, deleted_at: null };
          if (sql.includes('FROM support_feedback') && sql.includes('WHERE id = ?')) return currentTicket;
          return null;
        },
        async all() {
          allCalls.push({ sql, binds: this.binds });
          if (sql.includes('FROM user_roles WHERE user_id = ?') && sql.includes("role = 'admin'")) {
            return { results: [{ ok: 1 }] };
          }
          if (sql.includes('FROM user_roles WHERE user_id = ?')) {
            return { results: [{ role: 'admin' }, { role: 'user' }] };
          }
          if (sql.includes('FROM support_feedback_messages')) return { results: [] };
          return { results: [] };
        },
        async run() {
          runs.push({ sql, binds: this.binds });
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
    async batch(stmts: PreparedStatement[]) {
      batches.push(stmts.map((stmt) => ({ sql: stmt.sql, binds: stmt.binds })));
      return stmts.map((stmt) => {
        let changes = 1;
        runs.push({ sql: stmt.sql, binds: stmt.binds });
        if (stmt.sql.includes('INSERT INTO support_feedback_messages')) {
          changes = options.messageInsertChanges ?? 1;
        } else if (stmt.sql.includes('UPDATE support_feedback')) {
          changes = options.updateChanges ?? 1;
        } else if (stmt.sql.includes('INSERT INTO admin_events')) {
          const conditional = stmt.sql.includes('WHERE changes() > 0');
          changes = conditional && lastChanges === 0 ? 0 : 1;
          if (changes > 0) auditEvents.push({ sql: stmt.sql, binds: stmt.binds });
        }
        lastChanges = changes;
        return { success: true, meta: { changes } };
      });
    },
  };

  return db;
}

async function getTickets(db: ReturnType<typeof makeDb>, query = '') {
  const token = await signJwt({ sub: 'admin-1', sid: 'sid-admin', email: 'a@example.com' });
  const request = new Request(`https://fitfocus.test/api/support/feedback${query}`, {
    headers: {
      Cookie: `ff_session=${token}`,
    },
  });

  const context: SupportFeedbackGetContext = {
    request,
    env: { AUTH_JWT_SECRET: SECRET, DB: db as unknown as D1Database },
    params: {},
    waitUntil() {},
    next: async () => new Response(null, { status: 404 }),
    data: {},
  };
  return onRequestGet(context);
}

async function patchTicket(db: ReturnType<typeof makeDb>, body: Record<string, unknown>) {
  return patchTicketRaw(db, JSON.stringify(body));
}

async function patchTicketRaw(db: ReturnType<typeof makeDb>, body: string) {
  const token = await signJwt({ sub: 'admin-1', sid: 'sid-admin', email: 'a@example.com' });
  const request = new Request('https://fitfocus.test/api/support/feedback', {
    method: 'PATCH',
    headers: {
      Cookie: `ff_session=${token}`,
      'Content-Type': 'application/json',
    },
    body,
  });

  const context: SupportFeedbackPatchContext = {
    request,
    env: { AUTH_JWT_SECRET: SECRET, DB: db as unknown as D1Database },
    params: {},
    waitUntil() {},
    next: async () => new Response(null, { status: 404 }),
    data: {},
  };
  return onRequestPatch(context);
}

async function postTicketRaw(db: ReturnType<typeof makeDb>, body: BodyInit, contentType = 'multipart/form-data; boundary=x') {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-admin', email: 'u@example.com' });
  const request = new Request('https://fitfocus.test/api/support/feedback', {
    method: 'POST',
    headers: {
      Cookie: `ff_session=${token}`,
      'Content-Type': contentType,
    },
    body,
  });

  const context: SupportFeedbackPostContext = {
    request,
    env: { AUTH_JWT_SECRET: SECRET, DB: db as unknown as D1Database },
    params: {},
    waitUntil() {},
    next: async () => new Response(null, { status: 404 }),
    data: {},
  };
  return onRequestPost(context);
}

async function postTicketForm(db: ReturnType<typeof makeDb>, form: FormData, extraHeaders: Record<string, string> = {}) {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-admin', email: 'u@example.com' });
  const headers = new Headers({
    Cookie: `ff_session=${token}`,
    ...extraHeaders,
  });
  const request = new Request('https://fitfocus.test/api/support/feedback', {
    method: 'POST',
    headers,
    body: form,
  });

  const context: SupportFeedbackPostContext = {
    request,
    env: { AUTH_JWT_SECRET: SECRET, DB: db as unknown as D1Database },
    params: {},
    waitUntil() {},
    next: async () => new Response(null, { status: 404 }),
    data: {},
  };
  return onRequestPost(context);
}

describe('admin support ticket updates', () => {
  it('falls back invalid list limits to a bounded default', async () => {
    const db = makeDb();

    const res = await getTickets(db, '?limit=abc');

    expect(res.status).toBe(200);
    const query = db.allCalls.find((call) => call.sql.includes('FROM support_feedback s'));
    expect(query?.binds.at(-1)).toBe(20);
  });

  it('rejects invalid statuses before writing', async () => {
    const db = makeDb();

    const res = await patchTicket(db, { id: 'ticket-1', status: 'done', message: 'reply' });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'BAD_STATUS' });
    expect(db.runs.some((run) => run.sql.includes('support_feedback_messages'))).toBe(false);
    expect(db.runs.some((run) => run.sql.includes('UPDATE support_feedback'))).toBe(false);
  });

  it('rejects oversized support ticket forms before writing', async () => {
    const db = makeDb();

    const res = await postTicketRaw(db, 'x'.repeat(9 * 1024 * 1024));

    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO support_feedback'))).toBe(false);
    expect(db.runs.some((run) => run.sql.includes('support_feedback_messages'))).toBe(false);
  });

  it('returns safe validation details for missing required support fields', async () => {
    const db = makeDb();
    const form = new FormData();
    form.set('category', 'Ошибка');
    form.set('section', 'Обзор');
    form.set('message', 'Кнопка не отправляет обращение.');

    const res = await postTicketForm(db, form);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: 'VALIDATION_ERROR',
      code: 'REQUIRED_FIELDS',
      public_message: 'Заполните обязательные поля.',
      fields: ['subject'],
    });
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO support_feedback'))).toBe(false);
    expect(db.runs.some((run) => run.sql.includes('support_feedback_messages'))).toBe(false);
  });

  it('accepts a new support ticket with a required subject and attachment-only message body', async () => {
    const db = makeDb();
    const form = new FormData();
    form.set('category', 'Ошибка');
    form.set('section', 'Обзор');
    form.set('subject', 'Кнопка не нажимается');
    form.append('attachments', new File([new Uint8Array([1, 2, 3])], 'voice.webm', { type: 'audio/webm' }));

    const res = await postTicketForm(db, form, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    });

    expect(res.status).toBe(200);
    const ticketInsert = db.runs.find((run) => run.sql.includes('INSERT INTO support_feedback ('));
    expect(ticketInsert?.binds[6]).toBe('Кнопка не нажимается');
    expect(ticketInsert?.binds[7]).toBe('');
    expect(ticketInsert?.binds[13]).toBe(1);
    expect(ticketInsert?.binds[15]).toContain('Системная диагностика');
    const messageInsert = db.runs.find((run) => run.sql.includes('INSERT INTO support_feedback_messages'));
    expect(messageInsert?.binds[4]).toBe('');
    expect(messageInsert?.binds[5]).toBe(1);
  });

  it('adds automatic device and browser diagnostics to user bug reports', async () => {
    const db = makeDb();
    const form = new FormData();
    form.set('category', 'Ошибка');
    form.set('section', 'Настройки');
    form.set('subject', 'Push не пришел');
    form.set('message', 'Проблема с push на компьютере.');
    form.set('system_context', 'Notification permission: granted\nPush API: supported');

    const res = await postTicketForm(db, form, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Sec-CH-UA': '"Chromium";v="126", "Google Chrome";v="126"',
      'Sec-CH-UA-Platform': '"Windows"',
      'CF-IPCountry': 'KZ',
      'CF-Ray': 'ray-1',
    });

    expect(res.status).toBe(200);
    const ticketInsert = db.runs.find((run) => run.sql.includes('INSERT INTO support_feedback ('));
    expect(ticketInsert).toBeTruthy();
    expect(ticketInsert?.binds[7]).toBe('Проблема с push на компьютере.');
    expect(ticketInsert?.binds[15]).toContain('Системная диагностика');
    expect(ticketInsert?.binds[15]).toContain('Detected device: Windows');
    expect(ticketInsert?.binds[15]).toContain('Detected browser: Chrome');
    expect(ticketInsert?.binds[15]).toContain('Notification permission: granted');
    expect(ticketInsert?.binds[15]).toContain('CF-Ray: ray-1');
    expect(ticketInsert?.binds[9]).toBe('Windows');
    expect(ticketInsert?.binds[10]).toBe('Chrome');

    const messageInsert = db.runs.find((run) => run.sql.includes('INSERT INTO support_feedback_messages'));
    expect(messageInsert?.binds[4]).toBe('Проблема с push на компьютере.');
  });

  it('rejects oversized admin support JSON before writing', async () => {
    const db = makeDb();

    const res = await patchTicketRaw(db, `{"id":"ticket-1","message":"reply","payload":"${'x'.repeat(70 * 1024)}"}`);

    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
    expect(db.runs.some((run) => run.sql.includes('support_feedback_messages'))).toBe(false);
    expect(db.runs.some((run) => run.sql.includes('UPDATE support_feedback'))).toBe(false);
  });

  it('rejects invalid assignment modes before writing', async () => {
    const db = makeDb();

    const res = await patchTicket(db, { id: 'ticket-1', assign_to: 'admin-2' });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'BAD_ASSIGN_TO' });
    expect(db.runs.some((run) => run.sql.includes('UPDATE support_feedback'))).toBe(false);
  });

  it('updates tickets and writes an admin audit event', async () => {
    const db = makeDb();

    const res = await patchTicket(db, {
      id: 'ticket-1',
      status: 'in_progress',
      priority: 'high',
      assign_to: 'me',
      message: 'We are checking this.',
    });

    expect(res.status).toBe(200);
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0].some((run) => run.sql.includes('INSERT INTO support_feedback_messages'))).toBe(true);
    expect(db.batches[0].some((run) => run.sql.includes('UPDATE support_feedback'))).toBe(true);
    expect(db.batches[0].some((run) => run.sql.includes('INSERT INTO admin_events') && run.sql.includes('WHERE changes() > 0'))).toBe(true);
    expect(db.auditEvents.some((run) => String(run.binds[3]) === 'support_ticket_update')).toBe(true);
  });

  it('rejects a ticket update race when the guarded write changes no rows', async () => {
    const db = makeDb({ updateChanges: 0, messageInsertChanges: 0 });

    const res = await patchTicket(db, {
      id: 'ticket-1',
      message: 'Race reply',
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'NOT_FOUND' });
    expect(db.auditEvents.some((run) => run.sql.includes('INSERT INTO admin_events'))).toBe(false);
  });
});
