import { STORAGE_KEYS } from './keys';
import { STATE_STORES, afterIndexedRequests, stateTransaction, userStateDatabase, type StateDatabase, type StateStore } from './stateDatabase';
import { outboxKeyOwnerId } from './durableOutbox';
import { USER_STATE_KEYS } from './userStateRepository';
import { LEGACY_QUEUE_SOURCE_KEY, legacyDeletedAccountMetaId, legacyRecordMayBelongToAccount } from './legacyQueue';

const STORE_NAME = STATE_STORES.values;

type IndexedValue = { key: string; value: string; updatedAt: number; accountId?: string };
type AccountStateCleanupResult = { cleared: boolean; legacyEvidenceRetained: boolean };

// Match council_history before history so a suffix is never mistaken for part of the owner id.
const VOLUME_STATE_SUFFIXES = [...USER_STATE_KEYS].sort((left, right) => right.length - left.length);

function openDatabase(): Promise<IDBDatabase | null> {
  return userStateDatabase.open().catch(() => null);
}

function requestResult<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<boolean> {
  return new Promise((resolve) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => resolve(false);
    transaction.onabort = () => resolve(false);
  });
}

export function isIndexedUserStateStorageKey(key: string): boolean {
  if (!key.startsWith(STORAGE_KEYS.dataPrefix)) return false;
  return VOLUME_STATE_SUFFIXES.some((suffix) => key.endsWith(`_${suffix}`));
}

export function indexedUserStateAccountId(key: string): string | null {
  if (!key.startsWith(STORAGE_KEYS.dataPrefix)) return null;
  const suffix = VOLUME_STATE_SUFFIXES.find((candidate) => key.endsWith(`_${candidate}`));
  if (!suffix) return null;
  const accountId = key.slice(STORAGE_KEYS.dataPrefix.length, -suffix.length - 1);
  return accountId || null;
}

/** Reads a raw user-state value without depending on synchronous localStorage. */
export async function readIndexedUserStateRaw(key: string): Promise<string | null> {
  if (!isIndexedUserStateStorageKey(key)) return null;
  const database = await openDatabase();
  if (!database) return null;
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const completed = transactionDone(transaction);
    const result = await requestResult(transaction.objectStore(STORE_NAME).get(key));
    if (!await completed) return null;
    return result && typeof (result as IndexedValue).value === 'string' ? (result as IndexedValue).value : null;
  } catch {
    return null;
  }
}

/** Persists a raw user-state value in IndexedDB. Returns false when it is unavailable. */
export async function writeIndexedUserStateRaw(key: string, value: string): Promise<boolean> {
  if (!isIndexedUserStateStorageKey(key)) return false;
  const database = await openDatabase();
  if (!database) return false;
  try {
    return await stateTransaction(database, [STATE_STORES.values, STATE_STORES.meta], 'readwrite', (tx) => {
      const ownerRequest = tx.objectStore(STATE_STORES.meta).get(outboxKeyOwnerId(key));
      return afterIndexedRequests(tx, [ownerRequest as unknown as IDBRequest<unknown>], ([owner]) => {
        if (owner) return false;
        tx.objectStore(STORE_NAME).put({ key, value, updatedAt: Date.now() } satisfies IndexedValue);
        return true;
      });
    });
  } catch {
    return false;
  }
}

/** Restores a legacy backup volume as one transaction; durable-owned keys reject the whole batch. */
export async function restoreIndexedUserStateBackup(entries: Record<string, string>): Promise<boolean> {
  const rows = Object.entries(entries);
  if (rows.length === 0) return true;
  if (rows.some(([key, value]) => !isIndexedUserStateStorageKey(key) || typeof value !== 'string')) return false;
  const accountIds = rows.map(([key]) => indexedUserStateAccountId(key));
  if (accountIds.some((accountId) => accountId === null)) return false;
  const deletionMarkerIds = await Promise.all(accountIds.map((accountId) => legacyDeletedAccountMetaId(accountId!)));
  const database = await openDatabase();
  if (!database) return false;
  try {
    return await stateTransaction(database, [STATE_STORES.values, STATE_STORES.meta], 'readwrite', (tx) => {
      const meta = tx.objectStore(STATE_STORES.meta);
      const store = tx.objectStore(STORE_NAME);
      const reads = rows.flatMap(([key], index) => [
        meta.get(outboxKeyOwnerId(key)) as unknown as IDBRequest<unknown>,
        store.get(key) as unknown as IDBRequest<unknown>,
        meta.get(deletionMarkerIds[index]) as unknown as IDBRequest<unknown>,
      ]);
      return afterIndexedRequests(tx, reads, (results) => {
        const restorableIndexes = rows.map((_, index) => index).filter((index) => !results[index * 3 + 2]);
        const owners = restorableIndexes.map((index) => results[index * 3]);
        const currentValues = restorableIndexes.map((index) => results[index * 3 + 1]);
        if (owners.some(Boolean) || currentValues.some((value) => !!value && typeof value === 'object' && 'accountId' in value)) return false;
        const updatedAt = Date.now();
        for (const index of restorableIndexes) {
          const [key, value] = rows[index];
          store.put({ key, value, updatedAt } satisfies IndexedValue);
        }
        return true;
      });
    });
  } catch {
    return false;
  }
}

export async function removeIndexedUserStateRaw(key: string): Promise<boolean> {
  if (!isIndexedUserStateStorageKey(key)) return false;
  const database = await openDatabase();
  if (!database) return false;
  try {
    return await stateTransaction(database, [STATE_STORES.values, STATE_STORES.meta], 'readwrite', (tx) => {
      const ownerRequest = tx.objectStore(STATE_STORES.meta).get(outboxKeyOwnerId(key));
      return afterIndexedRequests(tx, [ownerRequest as unknown as IDBRequest<unknown>], ([owner]) => {
        if (owner) return false;
        tx.objectStore(STORE_NAME).delete(key);
        return true;
      });
    });
  } catch {
    return false;
  }
}

/** Returns all volume-state records so backups can include data outside localStorage. */
export async function listIndexedUserStateRaw(): Promise<Record<string, string>> {
  const database = await openDatabase();
  if (!database) return {};
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const completed = transactionDone(transaction);
    const store = transaction.objectStore(STORE_NAME);
    const entries: Record<string, string> = {};
    await new Promise<void>((resolve) => {
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        const entry = cursor.value as IndexedValue;
        if (typeof entry.key === 'string' && typeof entry.value === 'string' && isIndexedUserStateStorageKey(entry.key)) {
          entries[entry.key] = entry.value;
        }
        cursor.continue();
      };
      request.onerror = () => resolve();
    });
    if (!await completed) return {};
    return entries;
  } catch {
    return {};
  }
}

function rawRecordsMayBelongToAccount(records: unknown, accountId: string): boolean {
  if (!Array.isArray(records)) return true;
  return records.some((record) => legacyRecordMayBelongToAccount(record, accountId));
}

function rawSourceMayBelongToAccount(rawSource: unknown, accountId: string): boolean {
  if (rawSource === null) return false;
  if (typeof rawSource !== 'string') return true;
  try {
    return rawRecordsMayBelongToAccount(JSON.parse(rawSource), accountId);
  } catch {
    return true;
  }
}

/**
 * Removes rows explicitly owned by one account from every durable store. The
 * global legacy source, snapshots, and unresolved evidence are retained when
 * their ownership cannot be separated without risking another account's data.
 */
export async function clearIndexedUserStateForUser(
  userId: string,
  connection: StateDatabase = userStateDatabase,
): Promise<AccountStateCleanupResult> {
  const accountId = userId.trim();
  if (!accountId) return { cleared: false, legacyEvidenceRetained: false };
  let deletionMarkerId: string;
  try {
    deletionMarkerId = await legacyDeletedAccountMetaId(accountId);
  } catch {
    return { cleared: false, legacyEvidenceRetained: true };
  }
  const prefix = `${STORAGE_KEYS.dataPrefix}${accountId}_`;
  const database = await connection.open().catch(() => null);
  if (!database) return { cleared: false, legacyEvidenceRetained: true };

  try {
    return await stateTransaction(database, Object.values(STATE_STORES) as StateStore[], 'readwrite', (tx) => {
      const valuesStore = tx.objectStore(STATE_STORES.values);
      const outboxStore = tx.objectStore(STATE_STORES.outbox);
      const itemsStore = tx.objectStore(STATE_STORES.migrationItems);
      const unknownStore = tx.objectStore(STATE_STORES.migrationUnknown);
      const metaStore = tx.objectStore(STATE_STORES.meta);
      const reads: IDBRequest<unknown>[] = [
        valuesStore.getAll() as unknown as IDBRequest<unknown>,
        outboxStore.getAll() as unknown as IDBRequest<unknown>,
        itemsStore.getAll() as unknown as IDBRequest<unknown>,
        unknownStore.getAll() as unknown as IDBRequest<unknown>,
        metaStore.getAll() as unknown as IDBRequest<unknown>,
      ];
      return afterIndexedRequests(tx, reads, ([valueRows, operationRows, itemRows, unknownRows, metadataRows]) => {
        const values = valueRows as Array<IndexedValue & { accountId?: string }>;
        const operations = operationRows as Array<{ opId: string; accountId?: string }>;
        const items = itemRows as Array<{
          id: string; sourceKey?: string; fingerprint?: string; accountId?: string; unknownIds?: string[]; rawRecords?: unknown[];
        }>;
        const unknown = unknownRows as Array<{
          id: string; sourceKey?: string; fingerprint?: string; rawRecord?: unknown; rawRecords?: unknown[];
          resolved?: { accountId?: string };
        }>;
        const metadata = metadataRows as Array<Record<string, unknown> & { id: string; accountId?: string }>;

        let legacyEvidenceRetained = false;
        let ownershipConflict = false;
        const accountItems = items.filter((item) => item.accountId === accountId);
        const linkedUnknowns = new Map<string, { sourceKey?: string; fingerprint?: string }>();
        for (const item of accountItems) {
          for (const id of item.unknownIds ?? []) linkedUnknowns.set(id, {
            sourceKey: item.sourceKey,
            fingerprint: item.fingerprint,
          });
          itemsStore.delete(item.id);
        }

        for (const row of values) {
          if (!row.key.startsWith(prefix)) continue;
          if (row.accountId && row.accountId !== accountId) {
            ownershipConflict = true;
            continue;
          }
          valuesStore.delete(row.key);
        }

        for (const operation of operations) {
          if (operation.accountId === accountId) outboxStore.delete(operation.opId);
        }

        for (const row of unknown) {
          const linkedEvidence = linkedUnknowns.get(row.id);
          const linkedToOwnedItem = !!linkedEvidence && linkedEvidence.sourceKey === row.sourceKey
            && linkedEvidence.fingerprint === row.fingerprint;
          if (row.resolved?.accountId === accountId || linkedToOwnedItem) {
            if (row.resolved?.accountId && row.resolved.accountId !== accountId) {
              ownershipConflict = true;
              legacyEvidenceRetained = true;
              continue;
            }
            unknownStore.delete(row.id);
            continue;
          }
          if (rawRecordsMayBelongToAccount(row.rawRecords?.length ? row.rawRecords : [row.rawRecord], accountId)) {
            legacyEvidenceRetained = true;
          }
        }

        for (const row of items) {
          if (row.accountId === accountId) continue;
          if (rawRecordsMayBelongToAccount(row.rawRecords, accountId)) legacyEvidenceRetained = true;
        }

        const active = metadata.find((row) => row.id === 'active-session');
        const fence = metadata.find((row) => row.id === 'auth-fence');
        if (active?.accountId === accountId) {
          const revision = fence?.revision === undefined ? 0 : fence.revision;
          if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) {
            throw new Error('OUTBOX_AUTH_FENCE_EXHAUSTED');
          }
          metaStore.put({
            ...(fence ?? {}),
            id: 'auth-fence',
            revision: revision + 1,
            ...(typeof active.serverSessionId === 'string' && active.serverSessionId.length
              ? { loggedOutSession: active.serverSessionId }
              : {}),
          });
          metaStore.delete('active-session');
        }

        for (const row of metadata) {
          if (row.id === 'auth-fence' || row.id === 'active-session') continue;
          if (row.accountId === accountId) {
            metaStore.delete(row.id);
            continue;
          }
          if (row.sourceKey === LEGACY_QUEUE_SOURCE_KEY && row.id.startsWith('legacy-snapshot:v1:')
            && rawSourceMayBelongToAccount(row.rawSource, accountId)) {
            legacyEvidenceRetained = true;
          }
        }

        const migrationProgress = metadata.find((row) => row.id === 'legacy-migration:v1');
        if (migrationProgress) {
          metaStore.put({
            ...migrationProgress,
            status: 'partial',
            sourceMatches: false,
            writersStopped: false,
            snapshotAuditComplete: false,
            sendAllowed: false,
          });
        }

        // Keep this marker outside account-owned metadata so later legacy imports
        // cannot recreate an operation after the same account authenticates again.
        const existingDeletionMarker = metadata.find((row) => row.id === deletionMarkerId);
        if (!(existingDeletionMarker?.kind === 'legacy-deleted-account' && existingDeletionMarker.version === 1
          && typeof existingDeletionMarker.deletedAtMs === 'number' && Number.isSafeInteger(existingDeletionMarker.deletedAtMs)
          && existingDeletionMarker.deletedAtMs >= 0)) {
          metaStore.put({
            id: deletionMarkerId,
            kind: 'legacy-deleted-account',
            version: 1,
            deletedAtMs: Date.now(),
          });
        }

        return { cleared: !ownershipConflict, legacyEvidenceRetained };
      });
    });
  } catch {
    return { cleared: false, legacyEvidenceRetained: true };
  }
}
