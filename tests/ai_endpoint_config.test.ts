import { describe, expect, it } from 'vitest';
import { onRequestPost } from '../functions/api/ai';
type AiPostContext = Parameters<typeof onRequestPost>[0];
type AiErrorBody = { error?: { code?: string; message?: string } };

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

function makeDb() {
  const prepared: Array<{ sql: string; binds: unknown[] }> = [];
  const runs: Array<{ sql: string; binds: unknown[] }> = [];

  return {
    prepared,
    runs,
    prepare(sql: string) {
      const stmt = {
        sql,
        binds: [] as unknown[],
        bind(...args: unknown[]) {
          this.binds = args;
          return this;
        },
        async first() {
          if (sql.includes('FROM sessions')) return { id: 'sid-1', revoked: 0, expires_at: NOW + 3600 };
          if (sql.includes('FROM users WHERE id = ? LIMIT 1')) return { is_active: 1, deleted_at: null };
          return null;
        },
        async all() {
          if (sql.includes('FROM user_roles')) return { results: [{ role: 'user' }] };
          if (sql.includes('FROM feature_flags')) return { results: [] };
          if (sql.includes('FROM feature_settings')) return { results: [] };
          return { results: [] };
        },
        async run() {
          runs.push({ sql, binds: this.binds });
          return { success: true, meta: { changes: 1 } };
        },
      };
      prepared.push(stmt);
      return stmt;
    },
  };
}

async function postAi(db: ReturnType<typeof makeDb>) {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
  const context: AiPostContext = {
    request: new Request('https://fitfocus.test/api/ai', {
      method: 'POST',
      headers: { Cookie: `ff_session=${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'coach', contents: 'hello' }),
    }),
    env: { AUTH_JWT_SECRET: SECRET, DB: db as unknown as D1Database, GEMINI_API_KEY: '' },
  };
  return onRequestPost(context);
}

describe('/api/ai server configuration', () => {
  it('does not mutate strict rate-limit buckets when Gemini API key is missing', async () => {
    const db = makeDb();
    const response = await postAi(db);
    const body = await response.json() as AiErrorBody;

    expect(response.status).toBe(500);
    expect(body.error?.code).toBe('AI_UNAVAILABLE');
    expect(body.error?.message).not.toContain('GEMINI_API_KEY');
    expect(db.prepared.some((stmt) => stmt.sql.includes('FROM subscriptions'))).toBe(false);
    expect(db.runs.some((run) => run.sql.includes('ai_rate_limits'))).toBe(false);
    expect(db.runs.some((run) => run.sql.includes('usage_daily'))).toBe(false);
  });
});
