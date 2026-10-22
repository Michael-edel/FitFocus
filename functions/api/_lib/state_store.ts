import type { StateWriteItem } from './state_write';

type CurrentStateRow = { v: string; version: number; deleted_at: number | null };
export type StoredStateItem = { key: string; version: number; exists: boolean };
export type StateConflict = { key?: string; value?: string; version?: number; exists?: boolean };
type StateWriteResult = { ok: true; items: StoredStateItem[] } | { ok: false; conflict: StateConflict };

async function findStateConflict(db: D1Database, userId: string, item: StateWriteItem): Promise<StateConflict | null> {
  const current = await db
    .prepare('SELECT v, version, deleted_at FROM user_kv WHERE user_id = ? AND k = ? LIMIT 1')
    .bind(userId, item.key)
    .first<CurrentStateRow>();
  const version = current?.version ?? 0;
  if ((item.baseVersion === 0 && current) ||
    (item.baseVersion > 0 && (!current || version !== item.baseVersion)) ||
    (current && (!Number.isSafeInteger(version) || version < 1 || version >= Number.MAX_SAFE_INTEGER))) {
    const exists = !!current && current.deleted_at == null;
    return { key: item.key, value: exists ? current.v : '', version, exists };
  }
  return null;
}

/** One conditional statement checks the whole batch and returns only its own committed generations. */
async function mutateStateItems(
  db: D1Database, userId: string, items: StateWriteItem[], updatedAt: number, deletedAt: number | null,
): Promise<StateWriteResult> {
  const values = items.map(() => '(?, ?, ?)').join(', ');
  const atomicWriteSql =
    'WITH input(k, v, base_version) AS (VALUES ' + values + '), ' +
    'context AS MATERIALIZED (SELECT ? AS user_id, ? AS updated_at, ? AS deleted_at), ' +
    'conflict AS MATERIALIZED (' +
      'SELECT 1 FROM input CROSS JOIN context ' +
      'LEFT JOIN user_kv current ON current.user_id = context.user_id AND current.k = input.k ' +
      'WHERE (input.base_version = 0 AND current.version IS NOT NULL) ' +
        'OR (input.base_version > 0 AND (current.version IS NULL OR current.version != input.base_version)) ' +
        "OR (current.version IS NOT NULL AND (typeof(current.version) != 'integer' OR current.version < 1 OR current.version >= 9007199254740991))" +
    ') ' +
    'INSERT INTO user_kv (user_id, k, v, updated_at, version, deleted_at) ' +
    'SELECT context.user_id, input.k, input.v, context.updated_at, COALESCE(current.version, 0) + 1, context.deleted_at ' +
    'FROM input CROSS JOIN context ' +
    'LEFT JOIN user_kv current ON current.user_id = context.user_id AND current.k = input.k ' +
    'WHERE NOT EXISTS (SELECT 1 FROM conflict) ' +
    'ON CONFLICT(user_id, k) DO UPDATE SET ' +
      'v = excluded.v, updated_at = excluded.updated_at, version = excluded.version, deleted_at = excluded.deleted_at ' +
    'RETURNING k, version';

  const { results = [] } = await db.prepare(atomicWriteSql)
    .bind(...items.flatMap((item) => [item.key, item.value, item.baseVersion]), userId, updatedAt, deletedAt)
    .all<{ k: string; version: number }>();

  if (results.length !== items.length) {
    for (const item of items) {
      const conflict = await findStateConflict(db, userId, item);
      if (conflict) return { ok: false, conflict };
    }
    // A diagnostic reread may already see another generation. It never becomes an acknowledgement.
    return { ok: false, conflict: {} };
  }
  const versions = new Map(results.map((item) => [item.k, item.version]));
  return { ok: true, items: items.map((item) => ({ key: item.key, version: versions.get(item.key)!, exists: deletedAt === null })) };
}

/** baseVersion=0 means never-created, including when a tombstone exists. */
export function writeStateItems(db: D1Database, userId: string, items: StateWriteItem[], updatedAt: number): Promise<StateWriteResult> {
  return mutateStateItems(db, userId, items, updatedAt, null);
}

/** Clear the payload but keep its generation; an absent key at base 0 receives a generation-1 tombstone. */
export async function deleteStateItem(
  db: D1Database, userId: string, key: string, baseVersion: number, updatedAt = Date.now(),
): Promise<{ ok: true; item: StoredStateItem } | { ok: false; conflict: StateConflict }> {
  const result = await mutateStateItems(db, userId, [{ key, value: '', baseVersion }], updatedAt, updatedAt);
  return result.ok === false ? result : { ok: true, item: result.items[0] };
}
