import { describe, expect, it } from 'vitest';
import { onRequestPatch } from '../functions/api/family/member';
import { stateSessionId } from '../functions/api/_lib/state_session';
type FamilyMemberContext = Parameters<typeof onRequestPatch>[0];

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

function makeDb(options: { updateChanges?: number; memberExists?: boolean } = {}) {
  const runs: Array<{ sql: string; binds: unknown[] }> = [];
  return {
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
          if (sql.includes('JOIN family_members')) return options.memberExists === false
            ? null
            : { id: String(this.binds[0] || 'family-1'), owner_user_id: 'owner-1', role: 'member' };
          return null;
        },
        async all() {
          if (sql.includes('SELECT role FROM user_roles')) return { results: [{ role: 'user' }] };
          return { results: [] };
        },
        async run() {
          runs.push({ sql, binds: this.binds });
          if (sql.includes('UPDATE family_members')) {
            return { success: true, meta: { changes: options.updateChanges ?? 1 } };
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };
}

async function patchMember(db: ReturnType<typeof makeDb>, body: Record<string, unknown>, requestId?: string) {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
  const sessionProof = await stateSessionId({ sub: 'user-1', sid: 'sid-1' });
  const context: FamilyMemberContext = {
    request: new Request('https://fitfocus.test/api/family/member', {
      method: 'PATCH',
      headers: { Cookie: `ff_session=${token}`, 'Content-Type': 'application/json', 'X-FitFocus-State-Account': 'user-1',
        'X-FitFocus-State-Session': sessionProof, ...(requestId ? { 'X-Request-ID': requestId } : {}) },
      body: JSON.stringify(body),
    }),
    env: { AUTH_JWT_SECRET: SECRET, DB: db as unknown as D1Database },
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
  };
  return onRequestPatch(context);
}

describe('/api/family/member', () => {
  it('rejects invalid goal values', async () => {
    const response = await patchMember(makeDb(), { familyId: 'family-1', goal: 'bulk' }, 'family-member-request-1');
    expect(response.status).toBe(400);
    expect(response.headers.get('X-Request-ID')).toBe('family-member-request-1');
    await expect(response.json()).resolves.toMatchObject({ error: 'BAD_GOAL' });
  });

  it('rejects invalid numeric ranges', async () => {
    const response = await patchMember(makeDb(), { familyId: 'family-1', age: 500 });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'BAD_AGE' });
  });

  it('updates only the explicitly targeted family membership', async () => {
    const db = makeDb();
    const response = await patchMember(db, { familyId: 'family-2', goal: 'LOSS' });

    expect(response.status).toBe(200);
    const update = db.runs.find(run => run.sql.includes('UPDATE family_members'));
    expect(update?.sql).toContain('EXISTS (SELECT 1 FROM families');
    expect(update?.binds).toContain('family-2');
    expect(update?.binds.slice(-3)).toEqual(['family-2', 'user-1', 'family-2']);
  });

  it('returns 404 when the targeted family member row is not updated', async () => {
    const response = await patchMember(makeDb({ updateChanges: 0 }), { familyId: 'family-1', goal: 'LOSS' });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: 'NOT_FOUND' });
  });

  it('rejects a missing family target before checking membership or updating', async () => {
    const db = makeDb();
    const response = await patchMember(db, { goal: 'LOSS' });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'BAD_TARGET' });
    expect(db.runs.some(run => run.sql.includes('UPDATE family_members'))).toBe(false);
  });

  it('rejects a family target the caller does not belong to', async () => {
    const db = makeDb({ memberExists: false });
    const response = await patchMember(db, { familyId: 'family-other', goal: 'LOSS' });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'NOT_IN_FAMILY' });
    expect(db.runs.some(run => run.sql.includes('UPDATE family_members'))).toBe(false);
  });
});
