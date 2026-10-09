import { STORAGE_KEYS } from './keys';
import { STATE_STORES, indexedRequest, stateTransaction, userStateDatabase } from './stateDatabase';
import { outboxKeyOwnerId } from './durableOutbox';

const STORE_NAME = STATE_STORES.values;

type IndexedValue = { key: string; value: string; updatedAt: number };

const VOLUME_STATE_SUFFIXES = [
  'diary',
  'history',
  'weekly_reports',
  'favorite_recipes',
  'last_coach_card',
  'settings',
] as const;

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
    const result = await requestResult(transaction.objectStore(STORE_NAME).get(key));
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

/** Removes volume data for one local account without touching cloud state. */
export function clearIndexedUserStateForUser(userId: string): Promise<boolean> {
  return updateKeys(`${STORAGE_KEYS.dataPrefix}${userId}_`, (store, entry) => store.delete(entry.key));
}

/** Keeps IndexedDB records aligned when an anonymous local account receives its server identity. */
export function renameIndexedUserStatePrefix(oldPrefix: string, newPrefix: string): Promise<boolean> {
  if (!oldPrefix || !newPrefix || oldPrefix === newPrefix) return Promise.resolve(true);
  return updateKeys(oldPrefix, (store, entry) => {
    store.put({ ...entry, key: newPrefix + entry.key.slice(oldPrefix.length), updatedAt: Date.now() });
    store.delete(entry.key);
  });
}
