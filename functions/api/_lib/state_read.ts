import { isAllowedStateKey } from './state_keyspace';

export type StoredStateItem = {
  key: string;
  value: unknown;
  version?: number;
  updated_at?: number;
};

/** Read only keys owned by the authenticated user and allowed for remote sync. */
export async function readStateItems(
  db: D1Database,
  userId: string,
  prefix: string,
): Promise<StoredStateItem[]> {
  const { results } = await db
    .prepare('SELECT k, v, version, updated_at FROM user_kv WHERE user_id = ? AND k LIKE ?')
    .bind(userId, `${prefix}%`)
    .all<{ k?: unknown; v?: unknown; version?: number; updated_at?: number }>();

  return (results || [])
    .filter((item) => typeof item.k === 'string' && isAllowedStateKey(userId, item.k))
    .map((item) => ({
      key: item.k as string,
      value: item.v,
      version: item.version,
      updated_at: item.updated_at,
    }));
}
