import { describe, expect, it } from 'vitest';
import { onRequestPost as postAdminPushSend } from '../functions/api/admin/push/send';
type AdminPushSendContext = Parameters<typeof postAdminPushSend>[0];

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

type Row = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  content_encoding: string;
  device_label: string;
  user_agent: string;
  created_at: number;
  updated_at: number;
  last_sent_at: number | null;
  last_error: string | null;
  enabled: number;
  email: string;
  user_created_at: number;
  deleted_at: string | null;
  deletion_scheduled_at: string | null;
  is_active: number;
  subscription_plan: string;
  subscription_status: string;
  current_period_end: number | null;
  profile_json: string;
  roles_csv: string;
  active_family_ids?: string | null;
};

function makeDb(rows: Row[] = []) {
  const runs: Array<{ sql: string; binds: unknown[] }> = [];
  const batches: Array<Array<{ sql: string; binds: unknown[] }>> = [];
  return {
    runs,
    batches,
    prepare(sql: string) {
      const stmt = {
        sql,
        binds: [] as unknown[],
        bind(...args: unknown[]) {
          this.binds = args;
          return this;
        },
        async first() {
          if (sql.includes('FROM sessions')) return { id: 'sid-admin', revoked: 0, expires_at: NOW + 3600 };
          if (sql.includes('SELECT is_active, deleted_at FROM users')) return { is_active: 1, deleted_at: null };
          return null;
        },
        async all() {
          if (sql.includes('SELECT role FROM user_roles WHERE user_id = ?')) {
            return { results: [{ role: 'admin' }] };
          }
          if (sql.includes("FROM user_roles WHERE user_id = ? AND role = 'admin'")) {
            return { results: [{ ok: 1 }] };
          }
          if (sql.includes('FROM push_subscriptions ps')) {
            return { results: rows };
          }
          return { results: [] };
        },
        async run() {
          runs.push({ sql, binds: this.binds });
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
    async batch(stmts: Array<{ sql: string; binds: unknown[] }>) {
      batches.push(stmts.map((stmt) => ({ sql: stmt.sql, binds: stmt.binds })));
      return stmts.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };
}

async function adminRequest(body: Record<string, unknown>) {
  const token = await signJwt({ sub: 'admin-1', sid: 'sid-admin', email: 'admin@example.com' });
  return new Request('https://fitfocus.test/api/admin/push/send', {
    method: 'POST',
    headers: {
      Cookie: `ff_session=${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function context(request: Request, db: ReturnType<typeof makeDb>) {
  const context: AdminPushSendContext = {
    request,
    env: { AUTH_JWT_SECRET: SECRET, DB: db as unknown as D1Database },
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
  };
  return context;
}

const rows: Row[] = [
  {
    id: 'sub-1',
    user_id: 'user-1',
    endpoint: 'https://push.example/1',
    p256dh: 'k1',
    auth: 'a1',
    content_encoding: 'aes128gcm',
    device_label: 'Windows',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    created_at: 100,
    updated_at: 10,
    last_sent_at: 1,
    last_error: null,
    enabled: 1,
    email: 'alpha@example.com',
    user_created_at: 1000,
    deleted_at: null,
    deletion_scheduled_at: null,
    is_active: 1,
    subscription_plan: 'pro',
    subscription_status: 'active',
    current_period_end: null,
    profile_json: JSON.stringify({ name: 'Alpha' }),
    roles_csv: 'user',
  },
  {
    id: 'sub-2',
    user_id: 'user-2',
    endpoint: 'https://push.example/2',
    p256dh: 'k2',
    auth: 'a2',
    content_encoding: 'aes128gcm',
    device_label: 'Windows',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) YaBrowser/26.0.0.0 Safari/537.36',
    created_at: 200,
    updated_at: 20,
    last_sent_at: null,
    last_error: null,
    enabled: 1,
    email: 'beta@example.com',
    user_created_at: 2000,
    deleted_at: null,
    deletion_scheduled_at: null,
    is_active: 1,
    subscription_plan: 'family',
    subscription_status: 'active',
    current_period_end: null,
    profile_json: JSON.stringify({
      name: 'Beta',
      familyMembers: [{ familyId: 'family-1', isActive: true }],
    }),
    roles_csv: 'family_parent,user',
    active_family_ids: 'family-1',
  },
  {
    id: 'sub-3',
    user_id: 'user-3',
    endpoint: 'https://push.example/3',
    p256dh: 'k3',
    auth: 'a3',
    content_encoding: 'aes128gcm',
    device_label: 'iPhone',
    user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    created_at: 300,
    updated_at: 30,
    last_sent_at: 9,
    last_error: null,
    enabled: 1,
    email: 'gamma@example.com',
    user_created_at: 3000,
    deleted_at: null,
    deletion_scheduled_at: null,
    is_active: 1,
    subscription_plan: 'free',
    subscription_status: 'inactive',
    current_period_end: null,
    profile_json: JSON.stringify({ name: 'Gamma' }),
    roles_csv: 'support,user',
  },
];

describe('/api/admin/push/send', () => {
  it('returns a sorted dry-run preview for all subscribers', async () => {
    const db = makeDb(rows);
    const request = await adminRequest({
      dryRun: true,
      sort: 'browser_desc',
      limit: 2,
      title: 'Broadcast',
      body: 'Everyone',
      url: '/news',
    });

    const response = await postAdminPushSend(context(request, db));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      dry_run: true,
      total_candidates: 3,
      matched: 3,
      selected: 2,
      sort: 'browser_desc',
      preview: [
        { subscription_id: 'sub-2', browser: 'Yandex' },
        { subscription_id: 'sub-3', browser: 'Safari' },
      ],
      payload: {
        title: 'Broadcast',
        body: 'Everyone',
        url: '/news',
      },
    });
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO admin_events') && String(run.binds[3]) === 'push_send_dry_run')).toBe(true);
  });

  it('filters a family segment before broadcasting', async () => {
    const db = makeDb(rows);
    const request = await adminRequest({
      dryRun: true,
      sort: 'updated_desc',
      segment: {
        plan: 'family',
        role: 'family_parent',
        familyId: 'family-1',
        device: 'Windows',
        browser: 'Yandex',
      },
    });

    const response = await postAdminPushSend(context(request, db));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      dry_run: true,
      total_candidates: 3,
      matched: 1,
      selected: 1,
      preview: [
        {
          subscription_id: 'sub-2',
          user_id: 'user-2',
          device: 'Windows',
          browser: 'Yandex',
          plan: 'family',
          roles: ['family_parent', 'user'],
        },
      ],
    });
  });
});
