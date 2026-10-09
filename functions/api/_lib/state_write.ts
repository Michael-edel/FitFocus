import { isJsonObject } from './json';
import { isAllowedStateKey } from './state_keyspace';

type StatePutItem = { key: unknown; value: unknown; baseVersion?: unknown };

export type StateWriteItem = {
  key: string;
  value: string;
  baseVersion: number;
};

export type StateWriteValidation =
  | { ok: true; items: StateWriteItem[] }
  | { ok: false; error: 'NO_ITEMS' | 'FORBIDDEN_KEYSPACE' | 'DUPLICATE_KEY' | 'BAD_VALUE' | 'BAD_BASE_VERSION'; key?: string };

export function parseStateBaseVersion(value: unknown): number | null {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'string' && value.trim() === '') return 0;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsedBaseVersion = Number(value);
  if (!Number.isFinite(parsedBaseVersion) || !Number.isInteger(parsedBaseVersion) || parsedBaseVersion < 0) return null;
  return parsedBaseVersion;
}

function readItems(body: unknown): StatePutItem[] {
  if (!isJsonObject(body)) return [];
  if (Array.isArray(body.items)) {
    return body.items.map((item) => (
      isJsonObject(item)
        ? { key: item.key, value: item.value, baseVersion: item.baseVersion }
        : { key: null, value: null }
    ));
  }
  return body.key ? [{ key: body.key, value: body.value ?? '', baseVersion: body.baseVersion }] : [];
}

/** Validate a state-write request before it reaches the D1 persistence use case. */
export function normalizeStateWrite(body: unknown, userId: string): StateWriteValidation {
  const items = readItems(body);
  if (!items.length) return { ok: false, error: 'NO_ITEMS' };

  const normalizedItems: StateWriteItem[] = [];
  const seenKeys = new Set<string>();
  for (const item of items) {
    const key = String(item?.key || '');
    if (!key) continue;
    if (!isAllowedStateKey(userId, key)) return { ok: false, error: 'FORBIDDEN_KEYSPACE' };
    if (seenKeys.has(key)) return { ok: false, error: 'DUPLICATE_KEY', key };
    seenKeys.add(key);
    if (item.value !== undefined && item.value !== null && typeof item.value !== 'string') {
      return { ok: false, error: 'BAD_VALUE', key };
    }
    const baseVersion = parseStateBaseVersion(item.baseVersion);
    if (baseVersion === null) return { ok: false, error: 'BAD_BASE_VERSION', key };
    normalizedItems.push({ key, value: String(item.value ?? ''), baseVersion });
  }

  return normalizedItems.length ? { ok: true, items: normalizedItems } : { ok: false, error: 'NO_ITEMS' };
}
