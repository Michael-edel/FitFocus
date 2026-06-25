import { describe, expect, it } from 'vitest';
import { onRequestPatch } from '../functions/api/support/feedback';

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

function makeDb() {
  const runs: Array<{ sql: string; binds: unknown[] }> = [];
  const currentTicket = {
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
  };

  const db = {
    runs,
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
  };

  return db;
}

async function patchTicket(db: ReturnType<typeof makeDb>, body: Record<string, unknown>) {
  const token = await signJwt({ sub: 'admin-1', sid: 'sid-admin', email: 'a@example.com' });
  const request = new Request('https://fitfocus.test/api/support/feedback', {
    method: 'PATCH',
    headers: {
      Cookie: `ff_session=${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return onRequestPatch({
    request,
    env: { AUTH_JWT_SECRET: SECRET, DB: db as any },
    params: {},
    waitUntil() {},
    next: async () => new Response(null, { status: 404 }),
    data: {},
  } as any);
}

describe('admin support ticket updates', () => {
  it('rejects invalid statuses before writing', async () => {
    const db = makeDb();

    const res = await patchTicket(db, { id: 'ticket-1', status: 'done', message: 'reply' });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'BAD_STATUS' });
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
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO support_feedback_messages'))).toBe(true);
    expect(db.runs.some((run) => run.sql.includes('UPDATE support_feedback'))).toBe(true);
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO admin_events') && String(run.binds[3]) === 'support_ticket_update')).toBe(true);
  });
});
