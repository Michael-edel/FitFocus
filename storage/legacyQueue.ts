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
export const legacyMigrationItemId = (fingerprint: string) => `legacy-item:${fingerprint}`;
