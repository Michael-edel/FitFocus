// Reviewed prefix prototype literals; no runtime SQL/files supplied by callers.
// Prefix fencing covers create/claim only, not account lifecycle or a global hold.
export const PREFIX_FENCE_SCHEMA = {
  "family_prefix_fence_control": {
    "type": "table",
    "tbl_name": "family_prefix_fence_control",
    "sql": "CREATE TABLE family_prefix_fence_control (\n  singleton INTEGER PRIMARY KEY CHECK(singleton=1),\n  approved_revision INTEGER NOT NULL CHECK(approved_revision=1),\n  bridge_enabled INTEGER NOT NULL CHECK(bridge_enabled IN (0,1))\n);"
  },
  "family_prefix_fence_token": {
    "type": "table",
    "tbl_name": "family_prefix_fence_token",
    "sql": "CREATE TABLE family_prefix_fence_token (\n singleton INTEGER PRIMARY KEY CHECK(singleton=1),\n revision INTEGER NOT NULL CHECK(revision=1),\n permitted INTEGER NOT NULL CHECK(permitted=1),\n operation TEXT NOT NULL CHECK(operation IN ('create','join')),\n request_id TEXT NOT NULL CHECK(length(request_id)>0),\n actor_user_id TEXT NOT NULL CHECK(length(actor_user_id)>0),\n target_family_id TEXT NOT NULL CHECK(length(target_family_id)>0),\n invite_code TEXT,\n must_absent_id INTEGER NOT NULL DEFAULT 1 CHECK(must_absent_id=1)\n   REFERENCES family_prefix_fence_must_stay_empty(id) DEFERRABLE INITIALLY DEFERRED,\n CHECK((operation='create' AND invite_code IS NULL)\n    OR (operation='join' AND invite_code IS NOT NULL AND length(invite_code)>0))\n);"
  },
  "family_prefix_fence_must_stay_empty": {
    "type": "table",
    "tbl_name": "family_prefix_fence_must_stay_empty",
    "sql": "CREATE TABLE family_prefix_fence_must_stay_empty (\n id INTEGER PRIMARY KEY CHECK(0)\n);"
  },
  "family_prefix_create_guard": {
    "type": "trigger",
    "tbl_name": "families",
    "sql": "CREATE TRIGGER family_prefix_create_guard BEFORE INSERT ON families\nWHEN NOT EXISTS (\n SELECT 1 FROM family_prefix_fence_token t JOIN family_prefix_fence_control c ON c.singleton=t.singleton\n WHERE t.singleton=1 AND t.revision=c.approved_revision AND t.permitted=1 AND c.bridge_enabled=1\n   AND t.operation='create' AND t.actor_user_id=NEW.owner_user_id AND t.target_family_id=NEW.id\n)\nBEGIN\n SELECT RAISE(ABORT,'FAMILY_ATOMIC_WRITER_REQUIRED');\nEND;"
  },
  "family_prefix_invite_claim_guard": {
    "type": "trigger",
    "tbl_name": "family_invites",
    "sql": "CREATE TRIGGER family_prefix_invite_claim_guard BEFORE UPDATE OF used_by_user_id ON family_invites\nWHEN OLD.used_by_user_id IS NULL AND NEW.used_by_user_id IS NOT NULL AND NOT EXISTS (\n SELECT 1 FROM family_prefix_fence_token t JOIN family_prefix_fence_control c ON c.singleton=t.singleton\n WHERE t.singleton=1 AND t.revision=c.approved_revision AND t.permitted=1 AND c.bridge_enabled=1\n   AND t.operation='join' AND t.actor_user_id=NEW.used_by_user_id\n   AND t.target_family_id=NEW.family_id AND t.invite_code=NEW.code\n   AND NEW.code=OLD.code AND NEW.family_id=OLD.family_id\n)\nBEGIN\n SELECT RAISE(ABORT,'FAMILY_ATOMIC_WRITER_REQUIRED');\nEND;"
  }
} as const;
const BLOCKS = {
  "join": [
    {
      "name": "token",
      "params": [
        "revision",
        "revision",
        "operation",
        "requestId",
        "actor",
        "target",
        "code"
      ],
      "sql": "INSERT INTO family_prefix_fence_token\n (singleton,revision,permitted,operation,request_id,actor_user_id,target_family_id,invite_code)\nVALUES(1,?,CASE WHEN EXISTS(SELECT 1 FROM family_prefix_fence_control\n WHERE singleton=1 AND approved_revision=? AND bridge_enabled=1) THEN 1 ELSE 0 END,?,?,?,?,?);"
    },
    {
      "name": "join-member",
      "params": [
        "memberId",
        "actor",
        "now",
        "now",
        "code",
        "target",
        "now",
        "nowMs",
        "actor"
      ],
      "sql": "INSERT INTO family_members(id,family_id,user_id,role,status,is_active,created_at,updated_at)\nSELECT ?,i.family_id,?,'member','active',1,?,? FROM family_invites i JOIN families f ON f.id=i.family_id\nWHERE i.code=? AND i.family_id=? AND i.used_by_user_id IS NULL AND i.expires_at>=? AND f.is_active=1\nAND EXISTS(SELECT 1 FROM subscriptions s WHERE s.user_id=f.owner_user_id AND s.plan='family'\n AND s.status IN ('active','trialing') AND (s.current_period_end IS NULL OR s.current_period_end>?))\nAND (SELECT count(*) FROM family_members c WHERE c.family_id=i.family_id AND c.is_active=1 AND c.status='active')<5\nAND NOT EXISTS(SELECT 1 FROM family_members m JOIN families other ON other.id=m.family_id\n WHERE m.user_id=? AND m.is_active=1 AND m.status='active' AND other.is_active=1)\nON CONFLICT(family_id,user_id) DO UPDATE SET id=excluded.id,status='active',is_active=1,updated_at=excluded.updated_at;"
    },
    {
      "name": "join-claim",
      "params": [
        "actor",
        "now",
        "code",
        "target",
        "memberId",
        "actor",
        "target"
      ],
      "sql": "UPDATE family_invites SET used_by_user_id=?,used_at=? WHERE code=? AND family_id=? AND used_by_user_id IS NULL\nAND EXISTS(SELECT 1 FROM family_members WHERE id=? AND user_id=? AND family_id=? AND is_active=1 AND status='active');"
    },
    {
      "name": "assert-join",
      "params": [
        "requestId",
        "actor",
        "target",
        "code",
        "memberId",
        "actor",
        "target",
        "code",
        "target",
        "actor"
      ],
      "sql": "UPDATE family_prefix_fence_token SET permitted=CASE WHEN\n request_id=? AND operation='join' AND actor_user_id=? AND target_family_id=? AND invite_code=?\n AND (NOT EXISTS(SELECT 1 FROM family_members WHERE id=? AND user_id=? AND family_id=? AND is_active=1 AND status='active')\n OR EXISTS(SELECT 1 FROM family_invites WHERE code=? AND family_id=? AND used_by_user_id=?))\nTHEN 1 ELSE 0 END WHERE singleton=1;"
    },
    {
      "name": "delete-token",
      "params": [
        "requestId",
        "actor",
        "target"
      ],
      "sql": "DELETE FROM family_prefix_fence_token WHERE singleton=1 AND request_id=? AND actor_user_id=? AND target_family_id=?;"
    }
  ],
  "create": [
    {
      "name": "token",
      "params": [
        "revision",
        "revision",
        "operation",
        "requestId",
        "actor",
        "target",
        "code"
      ],
      "sql": "INSERT INTO family_prefix_fence_token\n (singleton,revision,permitted,operation,request_id,actor_user_id,target_family_id,invite_code)\nVALUES(1,?,CASE WHEN EXISTS(SELECT 1 FROM family_prefix_fence_control\n WHERE singleton=1 AND approved_revision=? AND bridge_enabled=1) THEN 1 ELSE 0 END,?,?,?,?,?);"
    },
    {
      "name": "create-family",
      "params": [
        "target",
        "name",
        "actor",
        "now",
        "actor",
        "actor",
        "nowMs"
      ],
      "sql": "INSERT INTO families(id,name,owner_user_id,created_at)\nSELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM family_members m JOIN families f ON f.id=m.family_id\n WHERE m.user_id=? AND m.is_active=1 AND m.status='active' AND f.is_active=1)\nAND EXISTS(SELECT 1 FROM subscriptions WHERE user_id=? AND plan='family'\n AND status IN ('active','trialing') AND (current_period_end IS NULL OR current_period_end>?));"
    },
    {
      "name": "create-owner",
      "params": [
        "memberId",
        "target",
        "actor",
        "now",
        "now",
        "target",
        "actor",
        "now",
        "actor",
        "nowMs",
        "actor"
      ],
      "sql": "INSERT INTO family_members\n (id,family_id,user_id,role,status,is_active,sex,age,height_cm,weight_kg,activity,goal,created_at,updated_at)\nSELECT ?,?,?,'owner','active',1,NULL,NULL,NULL,NULL,NULL,NULL,?,?\nWHERE EXISTS(SELECT 1 FROM families WHERE id=? AND owner_user_id=? AND created_at=?)\nAND EXISTS(SELECT 1 FROM subscriptions WHERE user_id=? AND plan='family'\n AND status IN ('active','trialing') AND (current_period_end IS NULL OR current_period_end>?))\nAND NOT EXISTS(\n SELECT 1 FROM family_members m JOIN families f ON f.id=m.family_id\n WHERE m.user_id=? AND m.status='active' AND m.is_active=1 AND f.is_active=1);"
    },
    {
      "name": "assert-create",
      "params": [
        "requestId",
        "actor",
        "target",
        "target",
        "memberId",
        "actor",
        "target"
      ],
      "sql": "UPDATE family_prefix_fence_token SET permitted=CASE WHEN\n request_id=? AND operation='create' AND actor_user_id=? AND target_family_id=? AND invite_code IS NULL\n AND (NOT EXISTS(SELECT 1 FROM families WHERE id=?) OR EXISTS(\n SELECT 1 FROM family_members m JOIN families f ON f.id=m.family_id\n WHERE m.id=? AND m.user_id=? AND m.family_id=? AND m.role='owner' AND m.is_active=1 AND m.status='active'\n AND f.owner_user_id=m.user_id))\nTHEN 1 ELSE 0 END WHERE singleton=1;"
    },
    {
      "name": "delete-token",
      "params": [
        "requestId",
        "actor",
        "target"
      ],
      "sql": "DELETE FROM family_prefix_fence_token WHERE singleton=1 AND request_id=? AND actor_user_id=? AND target_family_id=?;"
    }
  ]
} as const;

type SchemaObject = { type: string; name: string; tbl_name: string; sql: string };
type BatchInput = {
  operation: 'create' | 'join'; verifiedUserId: string; targetFamilyId: string;
  requestId: string; memberId: string; name?: string; inviteCode?: string; nowSeconds: number;
};
const denied = (): never => { throw new Error('FAMILY_ATOMIC_WRITER_REQUIRED'); };
const normalizeSql = (sql: string) => sql.replace(/^--[^\n]*(?:\n|$)/gm, '').replace(/;\s*$/, '').replace(/\s+/g, ' ').trim();
const canonical = (value: unknown): string => JSON.stringify(value, (_key, child) => child && typeof child === 'object' && !Array.isArray(child)
  ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b))) : child);
async function readRows<T>(db: D1Database, sql: string): Promise<T[]> {
  const result = await db.prepare(sql).all<T>();
  if (result.success !== true || !Array.isArray(result.results)) return denied();
  return result.results;
}

/** No error-based missing-table fallback and no cached absence proof. */
async function prefixMode(db: D1Database): Promise<'absent' | 'token'> {
  const objects = await readRows<SchemaObject>(db,
    "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name GLOB 'family_prefix_*' ORDER BY name");
  if (!objects.length) return 'absent';
  // Base tokens without the deferred FK are intentionally incompatible.
  const expected: Record<string, { type: string; tbl_name: string; sql: string }> = PREFIX_FENCE_SCHEMA;
  if (objects.length !== Object.keys(expected).length || new Set(objects.map(item => item.name)).size !== objects.length) return denied();
  for (const item of objects) {
    const contract = expected[item.name];
    if (!contract || item.type !== contract.type || item.tbl_name !== contract.tbl_name || typeof item.sql !== 'string'
      || normalizeSql(item.sql) !== normalizeSql(contract.sql)) return denied();
  }
  const control = await readRows<{ singleton: number; approved_revision: number; bridge_enabled: number }>(db, 'SELECT * FROM family_prefix_fence_control');
  if (canonical(control) !== canonical([{ singleton: 1, approved_revision: 1, bridge_enabled: 1 }])) return denied();
  if ((await readRows(db, 'SELECT * FROM family_prefix_fence_token LIMIT 1')).length) return denied();
  if (canonical(await readRows(db, 'PRAGMA foreign_keys')) !== canonical([{ foreign_keys: 1 }])) return denied();
  const foreignKeys = await readRows(db, 'PRAGMA foreign_key_list(family_prefix_fence_token)');
  if (canonical(foreignKeys) !== canonical([{ id: 0, seq: 0, table: 'family_prefix_fence_must_stay_empty', from: 'must_absent_id', to: 'id', on_update: 'NO ACTION', on_delete: 'NO ACTION', match: 'NONE' }])) return denied();
  if ((await readRows(db, 'SELECT * FROM family_prefix_fence_must_stay_empty LIMIT 1')).length) return denied();
  return 'token';
}

// SQLite documents lazy CASE and abs(minimum signed integer) as integer overflow:
// https://www.sqlite.org/lang_expr.html#the_case_expression
// https://www.sqlite.org/lang_corefunc.html#abs
// Keep this assertion in the SAME batch. No prefix table, DDL or compensation is
// available before installer; checking results after commit would be too late.
const BARE_ASSERT = {
  create: {
    sql: `SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM families WHERE id=?) OR EXISTS(
      SELECT 1 FROM family_members m JOIN families f ON f.id=m.family_id
      WHERE m.id=? AND m.user_id=? AND m.family_id=? AND m.role='owner' AND m.is_active=1 AND m.status='active'
      AND f.owner_user_id=m.user_id AND f.created_at=?) THEN 1 ELSE abs(-9223372036854775808) END AS family_prefix_consistent`,
    params: ['target', 'memberId', 'actor', 'target', 'now'],
  },
  join: {
    sql: `SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM family_members WHERE id=? AND user_id=? AND family_id=? AND is_active=1 AND status='active')
      OR EXISTS(SELECT 1 FROM family_invites WHERE code=? AND family_id=? AND used_by_user_id=?)
      THEN 1 ELSE abs(-9223372036854775808) END AS family_prefix_consistent`,
    params: ['memberId', 'actor', 'target', 'code', 'target', 'actor'],
  },
} as const;

/** Caller retains exactly one db.batch and its existing canonical readers.
 * If installer races an absent probe, the new trigger aborts the entire bare
 * batch. Never catch that error to retry bare SQL or fall back to split writes.
 */
export async function prepareFamilyPrefixBatch(db: D1Database, input: BatchInput): Promise<D1PreparedStatement[]> {
  if (!['create', 'join'].includes(input.operation) || ![input.verifiedUserId, input.targetFamilyId, input.requestId, input.memberId]
    .every(value => typeof value === 'string' && value.length > 0)
    || !Number.isSafeInteger(input.nowSeconds) || input.nowSeconds < 0 || !Number.isSafeInteger(input.nowSeconds * 1000)
    || (input.operation === 'create' ? typeof input.name !== 'string' || !input.name.trim() || input.name.length > 60 || input.inviteCode !== undefined : typeof input.inviteCode !== 'string' || !input.inviteCode)) return denied();
  const values = { revision: 1, operation: input.operation, actor: input.verifiedUserId, target: input.targetFamilyId,
    requestId: input.requestId, memberId: input.memberId, name: input.name ?? '', code: input.inviteCode ?? null,
    now: input.nowSeconds, nowMs: input.nowSeconds * 1000 };
  const bind = (block: { sql: string; params: readonly string[] }) => db.prepare(block.sql).bind(...block.params.map(key => {
    if (!Object.hasOwn(values, key)) return denied();
    return values[key as keyof typeof values];
  }));
  const mode = await prefixMode(db);
  const blocks = BLOCKS[input.operation];
  return mode === 'token' ? blocks.map(bind) : [...blocks.slice(1, 3).map(bind), bind(BARE_ASSERT[input.operation])];
}