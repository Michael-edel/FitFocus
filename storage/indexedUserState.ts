import { STORAGE_KEYS } from './keys';
import { STATE_STORES, indexedRequest, stateTransaction, userStateDatabase, type StateDatabase, type StateStore } from './stateDatabase';
import { outboxKeyOwnerId } from './durableOutbox';
import { USER_STATE_KEYS } from './userStateRepository';
import { LEGACY_QUEUE_SOURCE_KEY, legacyDeletedAccountMetaId } from './legacyQueue';

const STORE_NAME = STATE_STORES.values;

type IndexedValue = { key: string; value: string; updatedAt: number; accountId?: string };
type AccountStateCleanupResult = { cleared: boolean; legacyEvidenceRetained: boolean };

const VOLUME_STATE_SUFFIXES = USER_STATE_KEYS;

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
    return await stateTransaction(database, [STATE_STORES.values, STATE_STORES.meta], 'readwrite', async (tx) => {
      if (await indexedRequest(tx.objectStore(STATE_STORES.meta).get(outboxKeyOwnerId(key)))) return false;
      tx.objectStore(STORE_NAME).put({ key, value, updatedAt: Date.now() } satisfies IndexedValue);
      return true;
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
  const database = await openDatabase();
  if (!database) return false;
  try {
    return await stateTransaction(database, [STATE_STORES.values, STATE_STORES.meta], 'readwrite', async (tx) => {
      const meta = tx.objectStore(STATE_STORES.meta);
      const store = tx.objectStore(STORE_NAME);
      const [owners, currentValues] = await Promise.all([
        Promise.all(rows.map(([key]) => indexedRequest(meta.get(outboxKeyOwnerId(key))))),
        Promise.all(rows.map(([key]) => indexedRequest(store.get(key)))),
      ]);
      if (owners.some(Boolean) || currentValues.some((value) => !!value && typeof value === 'object' && 'accountId' in value)) return false;
      const updatedAt = Date.now();
      for (const [key, value] of rows) store.put({ key, value, updatedAt } satisfies IndexedValue);
      return true;
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
    return await stateTransaction(database, [STATE_STORES.values, STATE_STORES.meta], 'readwrite', async (tx) => {
      if (await indexedRequest(tx.objectStore(STATE_STORES.meta).get(outboxKeyOwnerId(key)))) return false;
      tx.objectStore(STORE_NAME).delete(key);
      return true;
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

async function updateKeys(prefix: string, update: (store: IDBObjectStore, entry: IndexedValue) => void) {
  const database = await openDatabase();
  if (!database) return false;
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const cursorRequest = store.openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      const entry = cursor.value as IndexedValue;
      if (entry.key.startsWith(prefix)) update(store, entry);
      cursor.continue();
    };
    return await transactionDone(transaction);
  } catch {
    return false;
  }
}

function rawRecordsMayBelongToAccount(records: unknown, prefix: string): boolean {
  if (!Array.isArray(records)) return true;
  return records.some((record) => {
    if (typeof record !== 'object' || record === null || Array.isArray(record)) return true;
    const key = (record as Record<string, unknown>).key;
    return typeof key !== 'string' || key.startsWith(prefix);
  });
}

function rawSourceMayBelongToAccount(rawSource: unknown, prefix: string): boolean {
  if (rawSource === null) return false;
  if (typeof rawSource !== 'string') return true;
  try {
    return rawRecordsMayBelongToAccount(JSON.parse(rawSource), prefix);
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
    return await stateTransaction(database, Object.values(STATE_STORES) as StateStore[], 'readwrite', async (tx) => {
      const valuesStore = tx.objectStore(STATE_STORES.values);
      const outboxStore = tx.objectStore(STATE_STORES.outbox);
      const itemsStore = tx.objectStore(STATE_STORES.migrationItems);
      const unknownStore = tx.objectStore(STATE_STORES.migrationUnknown);
      const metaStore = tx.objectStore(STATE_STORES.meta);
      const [values, operations, items, unknown, metadata] = await Promise.all([
        indexedRequest(valuesStore.getAll()) as Promise<Array<IndexedValue & { accountId?: string }>>,
        indexedRequest(outboxStore.getAll()) as Promise<Array<{ opId: string; accountId?: string }>>,
        indexedRequest(itemsStore.getAll()) as Promise<Array<{
          id: string; sourceKey?: string; fingerprint?: string; accountId?: string; unknownIds?: string[]; rawRecords?: unknown[];
        }>>,
        indexedRequest(unknownStore.getAll()) as Promise<Array<{
          id: string; sourceKey?: string; fingerprint?: string; rawRecord?: unknown; rawRecords?: unknown[];
          resolved?: { accountId?: string };
        }>>,
        indexedRequest(metaStore.getAll()) as Promise<Array<Record<string, unknown> & { id: string; accountId?: string }>>,
      ]);

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
        if (rawRecordsMayBelongToAccount(row.rawRecords?.length ? row.rawRecords : [row.rawRecord], prefix)) {
          legacyEvidenceRetained = true;
        }
      }

      for (const row of items) {
        if (row.accountId === accountId) continue;
        if (rawRecordsMayBelongToAccount(row.rawRecords ?? [], prefix)) legacyEvidenceRetained = true;
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
          && rawSourceMayBelongToAccount(row.rawSource, prefix)) {
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
  } catch {
    return { cleared: false, legacyEvidenceRetained: true };
  }
}

/** Keeps IndexedDB records aligned when an anonymous local account receives its server identity. */
export function renameIndexedUserStatePrefix(oldPrefix: string, newPrefix: string): Promise<boolean> {
  if (!oldPrefix || !newPrefix || oldPrefix === newPrefix) return Promise.resolve(true);
  return updateKeys(oldPrefix, (store, entry) => {
    store.put({ ...entry, key: newPrefix + entry.key.slice(oldPrefix.length), updatedAt: Date.now() });
    store.delete(entry.key);
  });
}
