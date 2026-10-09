export type AiDedupCache = {
  get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' }): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<unknown>;
};

/** Reads the optional AI response cache without allowing a KV outage to fail delivery. */
export async function readAiDedupCache(cache: AiDedupCache | undefined, key: string): Promise<unknown | null> {
  if (!cache) return null;
  try {
    return await cache.get(key, { type: 'json' });
  } catch {
    return null;
  }
}

/** Stores the optional AI response cache as best-effort reliability data. */
export async function writeAiDedupCache(
  cache: AiDedupCache | undefined,
  key: string,
  value: unknown,
  expirationTtl = 60,
): Promise<boolean> {
  if (!cache) return false;
  try {
    await cache.put(key, JSON.stringify(value), { expirationTtl });
    return true;
  } catch {
    return false;
  }
}
