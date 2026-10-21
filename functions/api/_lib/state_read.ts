import { isAllowedStateKey } from './state_keyspace';

export type StoredStateItem = {
  key: string;
  value: unknown;
  version?: number;
  updated_at?: number;
  exists: boolean;
};

/** Read only keys owned by the authenticated user and allowed for remote sync. */
export async function readStateItems(
  db: D1Database,
  userId: string,
  prefix: string,
  includeDeleted = false,
): Promise<StoredStateItem[]> {
  const { results } = await db
    .prepare('SELECT k, v, version, updated_at, deleted_at FROM user_kv WHERE user_id = ? AND substr(k, 1, length(?)) = ?' +
      (includeDeleted ? '' : ' AND deleted_at IS NULL'))
    .bind(userId, prefix, prefix)
    .all<{ k?: unknown; v?: unknown; version?: number; updated_at?: number; deleted_at?: number | null }>();

  return (results || [])
    .filter((item) => typeof item.k === 'string' && item.k.startsWith(prefix) && isAllowedStateKey(userId, item.k) &&
      (includeDeleted || item.deleted_at == null))
    .map((item) => ({
      key: item.k as string,
      value: item.deleted_at == null ? item.v : '',
      version: item.version,
      updated_at: item.updated_at,
      exists: item.deleted_at == null,
    }));
}
