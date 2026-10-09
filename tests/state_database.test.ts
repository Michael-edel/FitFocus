import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StateDatabase, STATE_DATABASE_NAME, STATE_STORES, indexedRequest, stateTransaction, type DatabaseStatus } from '../storage/stateDatabase';

const opened: IDBDatabase[] = [];
const connections: StateDatabase[] = [];
afterEach(() => { for (const connection of connections.splice(0)) connection.close(); for (const database of opened.splice(0)) database.close(); vi.unstubAllGlobals(); });

function connection(factory: IDBFactory): StateDatabase {
  const value = new StateDatabase({ factory }); connections.push(value); return value;
}

async function oldDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  const request = factory.open(STATE_DATABASE_NAME, 1);
  request.onupgradeneeded = () => request.result.createObjectStore('values', { keyPath: 'key' });
  const database = await indexedRequest(request);
  opened.push(database);
  await stateTransaction(database, [STATE_STORES.values], 'readwrite', (tx) => {
    tx.objectStore('values').put({ key: 'fitfocus_data_owner_diary', value: '["preserved"]', updatedAt: 1 });
  });
  return database;
}

describe('shared IndexedDB schema and lifecycle', () => {
  it('upgrades v1 without replacing values and creates all outbox stores', async () => {
    const factory = new IDBFactory();
    (await oldDatabase(factory)).close();
    const manager = connection(factory);
    const database = await manager.open();
    expect(database.version).toBe(2);
    expect(Array.from(database.objectStoreNames)).toEqual(Object.values(STATE_STORES).sort());
    expect(await stateTransaction(database, ['values'], 'readonly', (tx) => indexedRequest(tx.objectStore('values').get('fitfocus_data_owner_diary'))))
      .toMatchObject({ value: '["preserved"]' });
    expect(manager.status).toBe('ready');
  });

  it('keeps the original blocked upgrade alive and resumes after the old connection closes', async () => {
    const factory = new IDBFactory();
    const old = await oldDatabase(factory);
    const manager = connection(factory);
    const statuses: DatabaseStatus[] = [];
    let blocked!: () => void;
    const observedBlocked = new Promise<void>((resolve) => { blocked = resolve; });
    manager.subscribe((status) => { statuses.push(status); if (status === 'blocked') blocked(); });
    const pending = manager.open();
    await observedBlocked;
    expect(manager.status).toBe('blocked');
    expect(manager.open()).toBe(pending);
    old.close();
    expect((await pending).version).toBe(2);
    expect(statuses).toEqual(['opening', 'blocked', 'ready']);
  });

  it('closes on versionchange so a future schema can upgrade', async () => {
    const factory = new IDBFactory();
    const manager = connection(factory);
    await manager.open();
    const request = factory.open(STATE_DATABASE_NAME, 3);
    const newer = await indexedRequest(request);
    opened.push(newer);
    expect(newer.version).toBe(3);
    expect(manager.status).toBe('closed');
    await expect(manager.open()).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('can retry after storage was unavailable instead of caching a failed open', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const manager = new StateDatabase(); connections.push(manager);
    await expect(manager.open()).rejects.toMatchObject({ kind: 'unavailable' });
    expect(manager.status).toBe('unavailable');
    vi.stubGlobal('indexedDB', new IDBFactory());
    expect((await manager.open()).version).toBe(2);
  });

  it('returns a rejected promise when the browser denies access to indexedDB', async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, get: () => { throw new DOMException('Denied', 'SecurityError'); } });
    try {
      const manager = new StateDatabase(); connections.push(manager);
      await expect(manager.open()).rejects.toMatchObject({ kind: 'unavailable' });
      expect(manager.status).toBe('unavailable');
    } finally {
      if (previous) Object.defineProperty(globalThis, 'indexedDB', previous);
      else Reflect.deleteProperty(globalThis, 'indexedDB');
    }
  });

  it('publishes opening only after caching the request for reentrant observers', async () => {
    const manager = connection(new IDBFactory());
    let observed: Promise<IDBDatabase> | undefined;
    manager.subscribe((status) => { if (status === 'opening') observed = manager.open(); });
    const pending = manager.open();
    expect(observed).toBe(pending);
    await pending;
  });

  it('does not keep a cancelled blocked request as a usable cached connection', async () => {
    const factory = new IDBFactory();
    const old = await oldDatabase(factory);
    const manager = connection(factory);
    let blocked!: () => void;
    const observed = new Promise<void>((resolve) => { blocked = resolve; });
    manager.subscribe((status) => { if (status === 'blocked') blocked(); });
    const pending = manager.open();
    const rejected = expect(pending).rejects.toMatchObject({ kind: 'closed' });
    await observed;
    manager.close();
    await rejected;
    old.close();
    expect((await manager.open()).version).toBe(2);
  });

  it('rejects only after rollback and can start a fresh transaction', async () => {
    const database = await connection(new IDBFactory()).open();
    await expect(stateTransaction(database, ['values'], 'readwrite', (tx) => {
      tx.objectStore('values').put({ key: 'aborted', value: 'should not persist' });
      tx.abort();
    })).rejects.toMatchObject({ kind: 'aborted' });
    expect(await stateTransaction(database, ['values'], 'readonly', (tx) => indexedRequest(tx.objectStore('values').get('aborted')))).toBeUndefined();
  });
});
