import { afterIndexedRequests, StateStorageError, STATE_STORES, indexedRequest, stateTransaction, userStateDatabase, type StateStore } from './stateDatabase';
import { LEGACY_DELETED_ACCOUNT_META_PREFIX, LEGACY_MIGRATION_META_ID, LEGACY_QUEUE_SOURCE_KEY,
  legacyDeletedAccountMetaId, legacyMigrationItemId } from './legacyQueue';
import { indexedUserStateAccountId } from './indexedUserState';

const STORE_NAMES = Object.values(STATE_STORES) as StateStore[];
const DURABLE_META_EXCLUDED = new Set(['active-session', 'auth-fence']);
const UNKNOWN_REASONS = new Set([
  'not-an-object', 'invalid-type', 'invalid-key', 'put-without-value', 'delete-with-value',
  'invalid-baseVersion', 'invalid-retryCount', 'invalid-json', 'invalid-container',
  'unknown-owner', 'ambiguous-owner', 'ownership-conflict', 'forbidden-key',
  'ambiguous-duplicate', 'ambiguous-key', 'fingerprint-collision', 'missing-imported-operation',
]);

export type DurableStateBackup = {
  formatVersion: 1;
  stores: Record<StateStore, unknown[]>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function integer(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every((entry) => typeof entry === 'string'); }
function ownedKey(accountId: string, key: string): boolean {
  return key.startsWith(`fitfocus_data_${accountId}_`) && !key.endsWith('_all_users') && !key.endsWith('__ffv');
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  const result = JSON.stringify(value);
  if (result === undefined) throw new Error('BACKUP_INVALID_VALUE');
  return result;
}

/** One IndexedDB readonly transaction gives the backup a consistent cross-store snapshot. */
export async function createDurableStateBackup(): Promise<DurableStateBackup> {
  const database = await userStateDatabase.open();
  return stateTransaction(database, STORE_NAMES, 'readonly', async (tx) => {
    const values = tx.objectStore(STATE_STORES.values);
    const outbox = tx.objectStore(STATE_STORES.outbox);
    const migrationItems = tx.objectStore(STATE_STORES.migrationItems);
    const migrationUnknown = tx.objectStore(STATE_STORES.migrationUnknown);
    const meta = tx.objectStore(STATE_STORES.meta);
    const [valueRows, operationRows, itemRows, unknownRows, metaRows] = await Promise.all([
      indexedRequest(values.getAll()), indexedRequest(outbox.getAll()),
      indexedRequest(migrationItems.getAll()), indexedRequest(migrationUnknown.getAll()),
      indexedRequest(meta.getAll()),
    ]);
    const snapshot: DurableStateBackup = {
      formatVersion: 1,
      stores: {
        [STATE_STORES.values]: valueRows,
        [STATE_STORES.outbox]: operationRows,
        [STATE_STORES.migrationItems]: itemRows,
        [STATE_STORES.migrationUnknown]: unknownRows,
        [STATE_STORES.meta]: (metaRows as unknown[]).filter((row) => !isRecord(row) || !DURABLE_META_EXCLUDED.has(String(row.id))),
      },
    };
    validateSnapshot(snapshot);
    return snapshot;
  });
}

function validateValue(row: unknown): row is Record<string, unknown> {
  if (!isRecord(row) || !text(row.key) || typeof row.value !== 'string' || !integer(row.updatedAt)) return false;
  return row.accountId === undefined || (text(row.accountId) && ownedKey(row.accountId, row.key));
}

function validateOperation(row: unknown): row is Record<string, unknown> {
  if (!isRecord(row) || !text(row.opId) || !text(row.accountId) || !text(row.key) || !ownedKey(row.accountId, row.key)
    || !text(row.writerId) || !integer(row.revision) || row.revision < 1 || !integer(row.baseVersion)
    || !integer(row.retryCount) || !integer(row.nextAttemptAtMs) || !integer(row.createdAtMs) || !integer(row.updatedAtMs)
    || !['put', 'delete'].includes(String(row.type)) || !['pending', 'sending', 'conflicted', 'failed'].includes(String(row.status))) return false;
  if (row.type === 'put' ? typeof row.value !== 'string' : 'value' in row) return false;
  if (row.resource !== undefined && row.resource !== 'profile' && row.resource !== 'familyMenu') return false;
  if (row.parentOpId !== undefined && !text(row.parentOpId)) return false;
  if (row.reason !== undefined && typeof row.reason !== 'string') return false;
  if (row.attempt !== undefined) {
    if (!isRecord(row.attempt) || !text(row.attempt.attemptId) || !text(row.attempt.owner)
      || !text(row.attempt.sessionEpoch) || !integer(row.attempt.startedAtMs)) return false;
    if (row.attempt.deletedAccountMarkerId !== undefined
      && (typeof row.attempt.deletedAccountMarkerId !== 'string'
        || !new RegExp(`^${LEGACY_DELETED_ACCOUNT_META_PREFIX}[a-f0-9]{64}$`).test(row.attempt.deletedAccountMarkerId))) return false;
  }
  if (row.serverSnapshot !== undefined) {
    const snapshot = row.serverSnapshot;
    if (!isRecord(snapshot) || !integer(snapshot.version)
      || (snapshot.exists !== undefined && typeof snapshot.exists !== 'boolean')
      || (snapshot.value !== undefined && typeof snapshot.value !== 'string')) return false;
  }
  for (const field of ['migrationSourceKey', 'migrationFingerprint', 'migrationCanonical']) {
    if (row[field] !== undefined && typeof row[field] !== 'string') return false;
  }
  return true;
}

function validateMigrationItem(row: unknown): row is Record<string, unknown> {
  if (!isRecord(row) || !text(row.fingerprint) || row.id !== legacyMigrationItemId(row.fingerprint)
    || row.sourceKey !== LEGACY_QUEUE_SOURCE_KEY || !text(row.canonical)
    || !strings(row.canonicalVariants) || !Array.isArray(row.rawRecords) || !strings(row.rawCanonicals)
    || row.rawRecords.length !== row.rawCanonicals.length || !['imported', 'unknown'].includes(String(row.state))
    || !strings(row.unknownIds)) return false;
  if (row.resolution !== undefined) {
    if (!isRecord(row.resolution) || !integer(row.resolution.atMs) || !integer(row.resolution.serverVersion)) return false;
    if (row.resolution.kind === 'keep-latest-local') {
      if (!text(row.resolution.replacementOpId)) return false;
    } else if (row.resolution.kind !== 'accept-server' || row.resolution.replacementOpId !== undefined) return false;
  }
  return (row.accountId === undefined || text(row.accountId)) && (row.opId === undefined || text(row.opId))
    && (row.reason === undefined || typeof row.reason === 'string')
    && (row.acknowledgedVersion === undefined || integer(row.acknowledgedVersion))
    && (row.acknowledgedAtMs === undefined || integer(row.acknowledgedAtMs));
}

function validateMigrationUnknown(row: unknown): row is Record<string, unknown> {
  if (!isRecord(row) || !text(row.id) || !text(row.sourceKey) || !text(row.fingerprint)
    || !('rawRecord' in row) || !Array.isArray(row.rawRecords) || !text(row.canonicalEvidence)
    || !UNKNOWN_REASONS.has(String(row.reason)) || !text(row.detectedAt)) return false;
  if (row.resolved !== undefined) {
    if (!isRecord(row.resolved) || !text(row.resolved.opId) || !text(row.resolved.accountId) || !integer(row.resolved.atMs)) return false;
  }
  return true;
}

function validateMeta(row: unknown): row is Record<string, unknown> {
  if (!isRecord(row) || !text(row.id) || DURABLE_META_EXCLUDED.has(row.id)) return false;
  if (row.id.startsWith('owner:')) {
    let key: unknown;
    try { key = JSON.parse(row.id.slice('owner:'.length)); } catch { return false; }
    return text(key) && row.key === key && text(row.accountId) && ownedKey(row.accountId, key);
  }
  if (row.id.startsWith('key:')) {
    let tuple: unknown;
    try { tuple = JSON.parse(row.id.slice('key:'.length)); } catch { return false; }
    return Array.isArray(tuple) && tuple.length === 2 && text(tuple[0]) && text(tuple[1])
      && row.accountId === tuple[0] && row.key === tuple[1] && ownedKey(tuple[0], tuple[1])
      && integer(row.lastRevision) && integer(row.valueRevision) && row.valueRevision <= row.lastRevision
      && integer(row.confirmedVersion)
      && (row.headOpId === undefined || text(row.headOpId))
      && (row.acknowledgedOpId === undefined || text(row.acknowledgedOpId))
      && (row.acknowledgedWriterId === undefined || text(row.acknowledgedWriterId))
      && (row.acknowledgedRevision === undefined || integer(row.acknowledgedRevision));
  }
  if (row.id === LEGACY_MIGRATION_META_ID) {
    return row.sourceKey === LEGACY_QUEUE_SOURCE_KEY && text(row.snapshotId) && text(row.runId)
      && ['importing', 'partial', 'completed'].includes(String(row.status))
      && ['totalRecords', 'processedRecords', 'importedRecords', 'unresolvedRecords', 'pendingSnapshotRecords'].every((field) => integer(row[field]))
      && typeof row.snapshotAuditComplete === 'boolean' && typeof row.sourceMatches === 'boolean'
      && typeof row.writersStopped === 'boolean' && typeof row.sendAllowed === 'boolean';
  }
  if (row.id.startsWith(LEGACY_DELETED_ACCOUNT_META_PREFIX)) {
    return new RegExp(`^${LEGACY_DELETED_ACCOUNT_META_PREFIX}[a-f0-9]{64}$`).test(row.id)
      && row.kind === 'legacy-deleted-account' && row.version === 1 && integer(row.deletedAtMs);
  }
  if (row.id.startsWith('legacy-snapshot:v1:')) {
    return /^legacy-snapshot:v1:[a-f0-9]{64}$/.test(row.id) && row.sourceKey === LEGACY_QUEUE_SOURCE_KEY
      && (row.rawSource === null || typeof row.rawSource === 'string') && strings(row.processed);
  }
  return false;
}

function validateSnapshot(value: unknown): asserts value is DurableStateBackup {
  if (!isRecord(value) || value.formatVersion !== 1) throw new Error('BACKUP_INVALID_DURABLE_STATE');
  const stores = value.stores;
  if (!isRecord(stores)) throw new Error('BACKUP_INVALID_DURABLE_STATE');
  const expected = STORE_NAMES;
  if (Object.keys(stores).length !== expected.length || expected.some((name) => !Array.isArray(stores[name]))) {
    throw new Error('BACKUP_INVALID_DURABLE_STATE');
  }
  const validators: Record<StateStore, (row: unknown) => boolean> = {
    [STATE_STORES.values]: validateValue,
    [STATE_STORES.outbox]: validateOperation,
    [STATE_STORES.migrationItems]: validateMigrationItem,
    [STATE_STORES.migrationUnknown]: validateMigrationUnknown,
    [STATE_STORES.meta]: validateMeta,
  };
  for (const storeName of expected) {
    const seen = new Set<string>();
    for (const row of stores[storeName] as unknown[]) {
      if (!validators[storeName](row)) throw new Error(`BACKUP_INVALID_DURABLE_STATE:${storeName}`);
      const key = rowKey(storeName, row as Record<string, unknown>);
      if (seen.has(key)) throw new Error('BACKUP_DUPLICATE_DURABLE_STATE');
      seen.add(key);
    }
  }
}

function rowKey(store: StateStore, row: Record<string, unknown>): string {
  if (store === STATE_STORES.values) return String(row.key);
  if (store === STATE_STORES.outbox) return String(row.opId);
  return String(row.id);
}

/** Merge a backup in one transaction. Exact repeats are idempotent; divergent keys abort every store. */
export async function restoreDurableStateBackup(value: unknown): Promise<void> {
  validateSnapshot(value);
  const stores = value.stores;
  const candidateAccounts = new Set<string>();
  const addAccount = (accountId: unknown) => { if (text(accountId)) candidateAccounts.add(accountId); };
  for (const row of stores[STATE_STORES.values] as Record<string, unknown>[]) {
    addAccount(row.accountId);
    if (text(row.key)) addAccount(indexedUserStateAccountId(row.key));
  }
  for (const row of stores[STATE_STORES.outbox] as Record<string, unknown>[]) addAccount(row.accountId);
  for (const row of stores[STATE_STORES.migrationItems] as Record<string, unknown>[]) addAccount(row.accountId);
  for (const row of stores[STATE_STORES.migrationUnknown] as Record<string, unknown>[]) {
    if (isRecord(row.resolved)) addAccount(row.resolved.accountId);
  }
  for (const row of stores[STATE_STORES.meta] as Record<string, unknown>[]) addAccount(row.accountId);
  const candidateMarkerIds = new Map<string, string>();
  for (const accountId of candidateAccounts) {
    candidateMarkerIds.set(accountId, await legacyDeletedAccountMetaId(accountId));
  }
  const backupMarkers = new Set((stores[STATE_STORES.meta] as Record<string, unknown>[])
    .filter((row) => typeof row.id === 'string' && row.id.startsWith(LEGACY_DELETED_ACCOUNT_META_PREFIX))
    .map((row) => String(row.id)));
  const ownedAccountsByKey = new Map<string, string>();
  for (const row of stores[STATE_STORES.outbox] as Record<string, unknown>[]) {
    if (text(row.accountId) && text(row.key)) ownedAccountsByKey.set(row.key, row.accountId);
  }
  for (const row of stores[STATE_STORES.meta] as Record<string, unknown>[]) {
    if (text(row.accountId) && text(row.key) && (String(row.id).startsWith('owner:') || String(row.id).startsWith('key:'))) {
      ownedAccountsByKey.set(row.key, row.accountId);
    }
  }
  const database = await userStateDatabase.open();
  try {
    await stateTransaction(database, STORE_NAMES, 'readwrite', (tx) => {
      const metaStore = tx.objectStore(STATE_STORES.meta);
      return afterIndexedRequests(tx, [metaStore.getAll() as IDBRequest<unknown>], ([metadata]) => {
        const existingMeta = metadata as Array<Record<string, unknown>>;
        const existingMarkers = new Set(existingMeta
          .filter((row) => typeof row.id === 'string' && row.id.startsWith(LEGACY_DELETED_ACCOUNT_META_PREFIX)
            && row.kind === 'legacy-deleted-account' && row.version === 1)
          .map((row) => String(row.id)));
        const deletedAccounts = new Set([...candidateMarkerIds]
          .filter(([, markerId]) => backupMarkers.has(markerId) || existingMarkers.has(markerId))
          .map(([accountId]) => accountId));
        const candidates: Array<{ storeName: StateStore; store: IDBObjectStore; row: Record<string, unknown>; key: IDBValidKey }> = [];

        for (const storeName of STORE_NAMES) {
          const store = tx.objectStore(storeName);
          const rows = value.stores[storeName] as Record<string, unknown>[];
          for (const savedRow of rows) {
            // A stored all-client proof is ephemeral. Re-audit the imported source
            // against the current Service Worker and every open window before send.
            const row = storeName === STATE_STORES.meta && savedRow.id === LEGACY_MIGRATION_META_ID
              ? { ...savedRow, status: 'partial', snapshotAuditComplete: false, sourceMatches: false,
                writersStopped: false, sendAllowed: false }
              : savedRow;
            const owner = storeName === STATE_STORES.values && !text(row.accountId) && text(row.key)
              ? ownedAccountsByKey.get(row.key)
              : undefined;
            const resolvedOwner = storeName === STATE_STORES.migrationUnknown && isRecord(row.resolved)
              ? row.resolved.accountId
              : undefined;
            const valueKeyOwner = storeName === STATE_STORES.values && text(row.key)
              ? indexedUserStateAccountId(row.key)
              : undefined;
            if (deletedAccounts.has(String(row.accountId ?? owner ?? resolvedOwner ?? valueKeyOwner ?? ''))) continue;
            candidates.push({ storeName, store, row, key: rowKey(storeName, row) });
          }
        }

        const reads = candidates.map(({ store, key }) => store.get(key) as IDBRequest<unknown>);
        return afterIndexedRequests(tx, reads, (existingRows) => {
          const additions: IDBRequest<unknown>[] = [];
          candidates.forEach(({ storeName, store, row }, index) => {
            const existing = existingRows[index];
            if (existing !== undefined) {
              if (storeName === STATE_STORES.meta && typeof row.id === 'string'
                && row.id.startsWith(LEGACY_DELETED_ACCOUNT_META_PREFIX) && isRecord(existing)
                && existing.kind === 'legacy-deleted-account' && existing.version === 1) return;
              if (canonical(existing) !== canonical(row)) throw new Error('BACKUP_DURABLE_STATE_CONFLICT');
              return;
            }
            additions.push(store.add(row) as IDBRequest<unknown>);
          });
          return afterIndexedRequests(tx, additions, () => undefined);
        });
      });
    });
  } catch (error) {
    if (error instanceof StateStorageError && error.cause instanceof Error
      && error.cause.message.startsWith('BACKUP_')) throw error.cause;
    throw error;
  }
}

export function getBackupIndexedValues(value: DurableStateBackup): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of value.stores[STATE_STORES.values]) {
    if (isRecord(row) && typeof row.key === 'string' && typeof row.value === 'string'
      && row.key.startsWith('fitfocus_data_')) result[row.key] = row.value;
  }
  return result;
}
