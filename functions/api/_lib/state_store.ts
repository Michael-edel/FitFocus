import type { StateWriteItem } from './state_write';

type D1WriteResult = { meta?: { changes?: number } | null; changes?: number };

type CurrentStateRow = { v?: string; version?: number };

export type StoredStateItem = { key: string; version?: number };
export type StateConflict = { key?: string; value?: string; version?: number };

async function findStateConflict(
  db: D1Database,
  userId: string,
  item: StateWriteItem,
): Promise<StateConflict | null> {
  const current = await db
    .prepare('SELECT v, version FROM user_kv WHERE user_id = ? AND k = ? LIMIT 1')
    .bind(userId, item.key)
    .first<CurrentStateRow>();
  const currentVersion = Number(current?.version || 0);
  if (
    (item.baseVersion > 0 && (!current || currentVersion !== item.baseVersion)) ||
    (item.baseVersion === 0 && current)
  ) {
    return { key: item.key, value: current?.v ?? '', version: currentVersion };
  }
  return null;
}

/** Persist a whole validated state mutation or report the current conflicting value. */
export async function writeStateItems(
  db: D1Database,
  userId: string,
  items: StateWriteItem[],
  updatedAt: number,
): Promise<{ ok: true; items: StoredStateItem[] } | { ok: false; conflict: StateConflict }> {
  for (const item of items) {
    const conflict = await findStateConflict(db, userId, item);
    if (conflict) return { ok: false, conflict };
  }

  const values = items.map(() => '(?, ?, ?)').join(', ');
  const atomicWriteSql =
    'WITH input(k, v, base_version) AS (VALUES ' + values + '), ' +
    'conflict AS (' +
      'SELECT 1 FROM input ' +
      'LEFT JOIN user_kv current ON current.user_id = ? AND current.k = input.k ' +
      'WHERE (input.base_version = 0 AND current.version IS NOT NULL) ' +
        'OR (input.base_version > 0 AND (current.version IS NULL OR current.version != input.base_version))' +
    ') ' +
    'INSERT INTO user_kv (user_id, k, v, updated_at, version) ' +
    'SELECT ?, input.k, input.v, ?, COALESCE(current.version, 0) + 1 ' +
    'FROM input ' +
    'LEFT JOIN user_kv current ON current.user_id = ? AND current.k = input.k ' +
    'WHERE NOT EXISTS (SELECT 1 FROM conflict) ' +
    'ON CONFLICT(user_id, k) DO UPDATE SET ' +
      'v = excluded.v, updated_at = excluded.updated_at, version = excluded.version ' +
    'RETURNING k, version';

  const writeResult = await db
    .prepare(atomicWriteSql)
    .bind(
      ...items.flatMap((item) => [item.key, item.value, item.baseVersion]),
      userId,
      userId,
      updatedAt,
      userId,
    )
    .all<{ k: string; version: number }>();

  const written = writeResult.results || [];
  if (written.length !== items.length) {
    for (const item of items) {
      const conflict = await findStateConflict(db, userId, item);
      if (conflict) return { ok: false, conflict };
    }
    return { ok: false, conflict: {} };
  }

  const versionByKey = new Map(written.map((item) => [item.k, item.version]));
  return {
    ok: true,
    items: items.map((item) => ({ key: item.key, version: versionByKey.get(item.key) })),
  };
}

/** Delete an already-authorized state key and return its newest version on conflict. */
export async function deleteStateItem(
  db: D1Database,
  userId: string,
  key: string,
  baseVersion: number,
): Promise<StateConflict | null> {
  const deleted = await db
    .prepare('DELETE FROM user_kv WHERE user_id = ? AND k = ? AND (? = 0 OR version = ?)')
    .bind(userId, key, baseVersion, baseVersion)
    .run<D1WriteResult>();

  const deletedChanges = Number((deleted.meta as { changes?: number } | undefined)?.changes || 0);
  if (baseVersion <= 0 || deletedChanges) return null;

  const current = await db
    .prepare('SELECT v, version FROM user_kv WHERE user_id = ? AND k = ? LIMIT 1')
    .bind(userId, key)
    .first<CurrentStateRow>();
  if (current && Number(current.version || 0) !== baseVersion) {
    return { key, value: current.v ?? '', version: Number(current.version || 0) };
  }
  return null;
}
