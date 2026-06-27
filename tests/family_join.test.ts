import { describe, expect, it } from 'vitest';
import { onRequestPost } from '../functions/api/family/join';
type FamilyJoinContext = Parameters<typeof onRequestPost>[0];
type FamilyJoinBody = { familyId?: string; alreadyMember?: boolean; error?: { code?: string } };

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

function makeDb(options: { inviteClaimChanges?: number; memberInsertChanges?: number; existingFamilyAfterConflict?: string | null } = {}) {
  const runs: Array<{ sql: string; binds: unknown[] }> = [];
  let familyAccessReadCount = 0;
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
          if (sql.includes('FROM users')) return { is_active: 1, deleted_at: null };
          if (sql.includes('JOIN family_members')) {
            familyAccessReadCount += 1;
            if (familyAccessReadCount > 1 && options.existingFamilyAfterConflict) {
              return { id: options.existingFamilyAfterConflict, owner_user_id: 'owner-2', role: 'member' };
            }
            return null;
          }
          if (sql.includes('FROM family_invites WHERE code = ?')) {
            return { code: 'JOINME', family_id: 'family-1', expires_at: NOW + 3600, used_by_user_id: null };
          }
          if (sql.includes('FROM families WHERE id = ? AND is_active = 1')) {
            return { id: 'family-1', owner_user_id: 'owner-1' };
          }
          if (sql.includes('FROM subscriptions')) return { plan: 'family' };
          if (sql.includes('COUNT(*) as c FROM family_members')) return { c: 4 };
          return null;
        },
        async all() {
          if (sql.includes('FROM user_roles')) return { results: [{ role: 'user' }] };
          return { results: [] };
        },
        async run() {
          runs.push({ sql, binds: this.binds });
          if (sql.includes('UPDATE family_invites SET used_by_user_id = ?, used_at = ?')) {
            return { success: true, meta: { changes: options.inviteClaimChanges ?? 1 } };
          }
          if (sql.includes('INSERT INTO family_members')) {
            return { success: true, meta: { changes: options.memberInsertChanges ?? 1 } };
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };
}

async function postJoin(db: ReturnType<typeof makeDb>) {
  const token = await signJwt({ sub: 'user-1', sid: 'sid-1' });
  const context: FamilyJoinContext = {
    request: new Request('https://fitfocus.test/api/family/join', {
      method: 'POST',
      headers: { Cookie: `ff_session=${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'joinme' }),
    }),
    env: { AUTH_JWT_SECRET: SECRET, DB: db as unknown as D1Database },
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
  };
  return onRequestPost(context);
}

describe('/api/family/join', () => {
  it('claims an invite with a conditional update before inserting the member', async () => {
    const db = makeDb();
    const response = await postJoin(db);

    expect(response.status).toBe(200);
    const body = await response.json() as FamilyJoinBody;
    expect(body.familyId).toBe('family-1');
    expect(db.runs.some((run) => run.sql.includes('WHERE code = ? AND used_by_user_id IS NULL'))).toBe(true);
    expect(db.runs.some((run) => run.sql.includes('AND expires_at >= ?'))).toBe(true);
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO family_members'))).toBe(true);
  });

  it('rejects the join if the invite expires before the atomic claim', async () => {
    const db = makeDb({ inviteClaimChanges: 0 });
    const response = await postJoin(db);

    expect(response.status).toBe(400);
    const body = await response.json() as FamilyJoinBody;
    expect(body.error.code).toBe('INVITE_INVALID');
    expect(db.runs.some((run) => run.sql.includes('AND expires_at >= ?'))).toBe(true);
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO family_members'))).toBe(false);
  });

  it('releases the invite when the conditional member insert fails on family limit', async () => {
    const db = makeDb({ memberInsertChanges: 0 });
    const response = await postJoin(db);

    expect(response.status).toBe(400);
    const body = await response.json() as FamilyJoinBody;
    expect(body.error.code).toBe('FAMILY_JOIN_CONFLICT');
    expect(db.runs.some((run) => run.sql.includes('UPDATE family_invites SET used_by_user_id = NULL'))).toBe(true);
  });

  it('returns the latest family when the user loses a concurrent join race', async () => {
    const db = makeDb({ memberInsertChanges: 0, existingFamilyAfterConflict: 'family-2' });
    const response = await postJoin(db);

    expect(response.status).toBe(200);
    const body = await response.json() as FamilyJoinBody;
    expect(body.familyId).toBe('family-2');
    expect(body.alreadyMember).toBe(true);
    expect(db.runs.some((run) => run.sql.includes('UPDATE family_invites SET used_by_user_id = NULL'))).toBe(true);
  });
});
