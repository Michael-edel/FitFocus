import { STORAGE_KEYS } from './keys';

export type LegacyQueueRecord = {
  type: 'put' | 'delete';
  key: string;
  value?: string;
  baseVersion?: number;
  retryCount?: number;
};

export type NormalizedLegacyQueueRecord =
  | { type: 'put'; key: string; value: string; baseVersion: number; retryCount: number }
  | { type: 'delete'; key: string; baseVersion: number; retryCount: number };

export type LegacyMigrationResolution =
  | { kind: 'keep-latest-local'; atMs: number; serverVersion: number; replacementOpId: string }
  | { kind: 'accept-server'; atMs: number; serverVersion: number };

export type LegacyInvalidReason =
  | 'not-an-object'
  | 'invalid-type'
  | 'invalid-key'
  | 'put-without-value'
  | 'delete-with-value'
  | 'invalid-baseVersion'
  | 'invalid-retryCount';

export type UnknownLegacyRecord = {
  fingerprint: string;
  rawRecord: unknown;
  reason: LegacyInvalidReason;
  detectedAt: string;
};

export type LegacyNormalization =
  | { ok: true; value: NormalizedLegacyQueueRecord }
  | { ok: false; reason: LegacyInvalidReason };

/** Validate the old persisted shape before assigning ownership or importing it. */
export function normalizeLegacyRecord(record: unknown): LegacyNormalization {
  if (typeof record !== 'object' || record === null) return { ok: false, reason: 'not-an-object' };
  const r = record as Record<string, unknown>;
  const type = r.type;
  if (type !== 'put' && type !== 'delete') return { ok: false, reason: 'invalid-type' };
  const key = r.key;
  if (typeof key !== 'string' || key.length === 0) return { ok: false, reason: 'invalid-key' };
  if (type === 'put' && typeof r.value !== 'string') return { ok: false, reason: 'put-without-value' };
  if (type === 'delete' && 'value' in r) return { ok: false, reason: 'delete-with-value' };

  let baseVersion = 0;
  if ('baseVersion' in r) {
    const bv = r.baseVersion;
    if (typeof bv !== 'number' || !Number.isInteger(bv) || bv < 0) {
      return { ok: false, reason: 'invalid-baseVersion' };
    }
    baseVersion = bv;
  }
  let retryCount = 0;
  if ('retryCount' in r) {
    const rc = r.retryCount;
    if (typeof rc !== 'number' || !Number.isInteger(rc) || rc < 0) {
      return { ok: false, reason: 'invalid-retryCount' };
    }
    retryCount = rc;
  }

  return type === 'put'
    ? { ok: true, value: { type, key, value: r.value as string, baseVersion, retryCount } }
    : { ok: true, value: { type, key, baseVersion, retryCount } };
}

/** Canonical identity excludes array position, retryCount and property insertion order. */
export function legacyFingerprintFields(record: NormalizedLegacyQueueRecord): string {
  const fields: [string, string, string | null, number] = [
    record.type,
    record.key,
    record.type === 'put' ? record.value : null,
    record.baseVersion,
  ];
  return JSON.stringify(fields);
}

/** Compute before opening an IDB transaction; compare canonical fields on hash matches. */
export async function legacyFingerprint(record: NormalizedLegacyQueueRecord): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(legacyFingerprintFields(record)));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `legacy:v1:${hash}`;
}

export const LEGACY_QUEUE_SOURCE_KEY = 'fitfocus.remote-kv-outbox.v1';
export const LEGACY_MIGRATION_META_ID = 'legacy-migration:v1';
export const LEGACY_DELETED_ACCOUNT_META_PREFIX = 'legacy-deleted-account:v1:';
export const legacyMigrationItemId = (fingerprint: string) => `legacy-item:${fingerprint}`;

/** A local tombstone key that does not store the deleted account ID in plaintext. */
export async function legacyDeletedAccountMetaId(accountId: string): Promise<string> {
  const normalized = accountId.trim();
  if (!normalized) throw new Error('LEGACY_INVALID_ACCOUNT_ID');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${LEGACY_DELETED_ACCOUNT_META_PREFIX}${hash}`;
}

/**
 * Unknown legacy records cannot be proven unrelated to an account unless their
 * key is clearly scoped to a different account. Keep them and report partial
 * cleanup instead of treating a global or malformed key as account-free.
 */
export function legacyRecordMayBelongToAccount(record: unknown, accountId: string): boolean {
  const normalizedAccountId = accountId.trim();
  if (!normalizedAccountId || typeof record !== 'object' || record === null || Array.isArray(record)) return true;
  const key = (record as Record<string, unknown>).key;
  if (typeof key !== 'string') return true;

  const accountPrefix = `${STORAGE_KEYS.dataPrefix}${normalizedAccountId}_`;
  if (key.startsWith(accountPrefix)) return true;

  if (!key.startsWith(STORAGE_KEYS.dataPrefix)) return true;
  const scopedKey = key.slice(STORAGE_KEYS.dataPrefix.length);
  return scopedKey.indexOf('_') < 1;
}
