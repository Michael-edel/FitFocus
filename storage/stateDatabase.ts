export const STATE_DATABASE_NAME = 'fitfocus-user-state-v1';
export const STATE_DATABASE_VERSION = 2;
export const STATE_STORES = {
  values: 'values',
  outbox: 'outbox',
  migrationItems: 'outbox_migration_items',
  migrationUnknown: 'outbox_migration_unknown',
  meta: 'outbox_meta',
} as const;

export type StateStore = typeof STATE_STORES[keyof typeof STATE_STORES];
export type DatabaseStatus = 'closed' | 'opening' | 'blocked' | 'ready' | 'unavailable';

export class StateStorageError extends Error {
  constructor(readonly kind: 'unavailable' | 'closed' | 'quota' | 'aborted' | 'transaction', readonly cause?: unknown) {
    super(`STATE_STORAGE_${kind.toUpperCase()}`);
    this.name = 'StateStorageError';
  }
}

function storageError(error: unknown): StateStorageError {
  if (error instanceof StateStorageError) return error;
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return new StateStorageError('quota', error);
  if (error instanceof DOMException && error.name === 'AbortError') return new StateStorageError('aborted', error);
  return new StateStorageError('transaction', error);
}

/** All user values and outgoing intents share this schema and connection lifecycle. */
export class StateDatabase {
  private opening: Promise<IDBDatabase> | null = null;
  private database: IDBDatabase | null = null;
  private cancelOpen: (() => void) | null = null;
  private generation = 0;
  private listeners = new Set<(status: DatabaseStatus) => void>();
  private currentStatus: DatabaseStatus = 'closed';

  constructor(private readonly options: { factory?: IDBFactory; name?: string } = {}) {}

  get status(): DatabaseStatus { return this.currentStatus; }

  subscribe(listener: (status: DatabaseStatus) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private publish(status: DatabaseStatus): void {
    this.currentStatus = status;
    for (const listener of this.listeners) {
      try { listener(status); } catch { /* Observers cannot break storage. */ }
    }
  }

  open(): Promise<IDBDatabase> {
    if (this.opening) return this.opening;
    let factory: IDBFactory | undefined;
    try { factory = this.options.factory ?? globalThis.indexedDB; } catch (error) {
      this.publish('unavailable');
      return Promise.reject(new StateStorageError('unavailable', error));
    }
    if (!factory) {
      this.publish('unavailable');
      return Promise.reject(new StateStorageError('unavailable'));
    }
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(this.options.name ?? STATE_DATABASE_NAME, STATE_DATABASE_VERSION);
    } catch (error) {
      this.publish('unavailable');
      return Promise.reject(new StateStorageError('unavailable', error));
    }
    const generation = this.generation;
    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      this.cancelOpen = () => reject(new StateStorageError('closed'));
      request.onupgradeneeded = () => {
        if (generation !== this.generation) { request.transaction?.abort(); return; }
        const database = request.result;
        for (const name of Object.values(STATE_STORES)) {
          if (!database.objectStoreNames.contains(name)) {
            const store = database.createObjectStore(name, { keyPath: name === STATE_STORES.values ? 'key' : name === STATE_STORES.outbox ? 'opId' : 'id' });
            if (name === STATE_STORES.outbox) {
              store.createIndex('accountId', 'accountId');
              store.createIndex('accountKey', ['accountId', 'key']);
            }
          }
        }
      };
      request.onblocked = () => {
        // Keep this request alive: closing the old tab allows the same upgrade to finish.
        if (generation === this.generation) this.publish('blocked');
      };
      request.onerror = () => {
        if (generation === this.generation) {
          this.opening = null;
          this.cancelOpen = null;
          this.publish('unavailable');
        }
        reject(new StateStorageError('unavailable', request.error));
      };
      request.onsuccess = () => {
        const database = request.result;
        if (generation !== this.generation) { database.close(); reject(new StateStorageError('closed')); return; }
        this.database = database;
        this.cancelOpen = null;
        database.onversionchange = () => this.close();
        database.onclose = () => { if (this.database === database) this.close(); };
        this.publish('ready');
        resolve(database);
      };
    });
    this.opening = pending;
    this.publish('opening');
    return pending;
  }

  close(): void {
    this.generation += 1;
    this.cancelOpen?.();
    this.cancelOpen = null;
    this.database?.close();
    this.database = null;
    this.opening = null;
    this.publish('closed');
  }
}

export const userStateDatabase = new StateDatabase();

export function indexedRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new StateStorageError('transaction'));
  });
}

/** Await only IDB requests inside work; hashes, timers and HTTP belong outside. */
export async function stateTransaction<T>(
  database: IDBDatabase,
  stores: StateStore[],
  mode: IDBTransactionMode,
  work: (transaction: IDBTransaction) => T | Promise<T>,
): Promise<T> {
  let transaction: IDBTransaction;
  try { transaction = database.transaction(stores, mode); } catch (error) { throw storageError(error); }
  const completed = new Promise<{ ok: true } | { ok: false; error: unknown }>((resolve) => {
    transaction.oncomplete = () => resolve({ ok: true });
    transaction.onabort = () => resolve({ ok: false, error: transaction.error ?? new DOMException('Transaction aborted', 'AbortError') });
    // A request error normally aborts the transaction. Wait for onabort rather than
    // reporting before rollback; an error handler may also recover a request error.
  });
  try {
    const result = await work(transaction);
    const outcome = await completed;
    if (outcome.ok === false) throw outcome.error;
    return result;
  } catch (error) {
    try { transaction.abort(); } catch { /* Already complete or aborted. */ }
    await completed;
    throw storageError(error);
  }
}
