import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DurableOutbox, type OutboxOperation } from '../storage/durableOutbox';
import { LegacyQueueMigration, type MigrationItem } from '../storage/legacyMigration';
import { LEGACY_QUEUE_SOURCE_KEY, LEGACY_MIGRATION_META_ID, legacyFingerprint, legacyMigrationItemId, normalizeLegacyRecord } from '../storage/legacyQueue';
import { StateDatabase, STATE_STORES, indexedRequest, stateTransaction, type StateStore } from '../storage/stateDatabase';

const accountId = 'migration-account';
const key = `fitfocus_data_${accountId}_diary`;
const otherKey = `fitfocus_data_${accountId}_history`;
const put = { type: 'put', key, value: 'local intent' };
let rawSource: string | null;
let factory: IDBFactory;
let connection: StateDatabase;
let otherConnection: StateDatabase;
let migration: LegacyQueueMigration;
let outbox: DurableOutbox;
let source: { getItem: ReturnType<typeof vi.fn<(key: string) => string | null>> };
const verifiedOwners = () => new Map([[key, [accountId]], [otherKey, [accountId]]]);
const options = () => ({ verifiedOwners: verifiedOwners(), writersStopped: true });

beforeEach(() => {
  rawSource = JSON.stringify([put]);
  factory = new IDBFactory();
  connection = new StateDatabase({ factory }); otherConnection = new StateDatabase({ factory });
  source = { getItem: vi.fn((requested) => { expect(requested).toBe(LEGACY_QUEUE_SOURCE_KEY); return rawSource; }) };
  migration = new LegacyQueueMigration(source, connection);
  outbox = new DurableOutbox(otherConnection);
});
afterEach(() => { vi.restoreAllMocks(); connection.close(); otherConnection.close(); });

async function rows<T>(store: StateStore): Promise<T[]> {
  return stateTransaction(await otherConnection.open(), [store], 'readonly', (tx) => indexedRequest(tx.objectStore(store).getAll())) as Promise<T[]>;
}
async function claim() {
  await outbox.activateSession(accountId, 'session');
  return outbox.claim({ accountId, sessionEpoch: 'session', owner: 'sender', nowMs: Date.now(), leaseMs: 1_000 });
}

describe('atomic resumable legacy migration', () => {
  it('normalizes missing metadata, commits value/operation/ledger and retains the source', async () => {
    const before = rawSource;
    const progress = await migration.migrate(options());
    expect(progress).toMatchObject({ status: 'completed', totalRecords: 1, processedRecords: 1, importedRecords: 1, unresolvedRecords: 0, sendAllowed: true });
    const [operation] = await outbox.list(accountId);
    expect(operation).toMatchObject({ type: 'put', value: put.value, baseVersion: 0, retryCount: 0, status: 'pending', accountId });
    const [ledger] = await rows<MigrationItem>(STATE_STORES.migrationItems);
    expect(ledger).toMatchObject({ state: 'imported', opId: operation.opId, accountId, fingerprint: operation.migrationFingerprint });
    expect((await outbox.snapshot(accountId, key)).value).toBe(put.value);
    expect(rawSource).toBe(before);
    expect((await claim())?.opId).toBe(operation.opId);
  });

  it('imports a delete with no value property and preserves its retry metadata', async () => {
    rawSource = JSON.stringify([{ type: 'delete', key, retryCount: 3 }]);
    await migration.migrate(options());
    const [operation] = await outbox.list(accountId);
    expect(operation).toMatchObject({ type: 'delete', baseVersion: 0, retryCount: 3 });
    expect('value' in operation).toBe(false);
  });

  it('does not authorize sending or completed migration without a verified writer fence', async () => {
    const progress = await migration.migrate({ verifiedOwners: verifiedOwners() });
    expect(progress).toMatchObject({ status: 'partial', writersStopped: false, sendAllowed: false, processedRecords: 1 });
    expect(await claim()).toBeNull();
    expect(await migration.migrate(options())).toMatchObject({ status: 'completed', sendAllowed: true });
    expect(await outbox.list(accountId)).toHaveLength(1);
    expect(await claim()).not.toBeNull();
  });

  it('does not duplicate imported operations after reload, array reorder or retry metadata changes', async () => {
    rawSource = JSON.stringify([put, { type: 'delete', key: otherKey }]);
    await migration.migrate({ ...options(), batchSize: 1 });
    const initial = await outbox.list(accountId);
    connection.close();
    rawSource = JSON.stringify([{ type: 'delete', key: otherKey, baseVersion: 0, retryCount: 19 }, { ...put, retryCount: 9, baseVersion: 0 }]);
    const restarted = new LegacyQueueMigration(source, otherConnection);
    expect(await restarted.migrate(options())).toMatchObject({ status: 'completed', importedRecords: 2 });
    expect((await outbox.list(accountId)).map((op) => op.opId).sort()).toEqual(initial.map((op) => op.opId).sort());
    expect(await rows(STATE_STORES.migrationItems)).toHaveLength(2);
  });

  it('does not reimport an acknowledged operation after its outbox row was removed', async () => {
    await migration.migrate(options());
    const sending = await claim();
    if (!sending) throw new Error('Expected a claim');
    expect(await outbox.finish(sending, { kind: 'acknowledged', version: 1 })).toBe(true);
    expect(await outbox.list(accountId)).toEqual([]);
    expect((await rows<MigrationItem>(STATE_STORES.migrationItems))[0]).toMatchObject({ state: 'imported', acknowledgedVersion: 1 });
    expect(await migration.migrate({ ...options(), verifiedOwners: new Map() })).toMatchObject({ status: 'completed', importedRecords: 1 });
    expect(await outbox.list(accountId)).toEqual([]);
  });

  it('rolls back value, operation, ledger and batch progress if the migration item cannot be saved', async () => {
    const originalPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === STATE_STORES.migrationItems) throw new DOMException('Injected ledger failure', 'QuotaExceededError');
      return originalPut.apply(this, args);
    });
    await expect(migration.migrate(options())).rejects.toMatchObject({ kind: 'quota' });
    expect(await rows(STATE_STORES.migrationItems)).toEqual([]);
    expect(await outbox.list(accountId)).toEqual([]);
    expect((await outbox.snapshot(accountId, key)).value).toBeNull();
    expect(await migration.progress()).toMatchObject({ status: 'importing', processedRecords: 0, sendAllowed: false });
    vi.restoreAllMocks();
    expect(await migration.migrate(options())).toMatchObject({ status: 'completed', importedRecords: 1 });
    expect(await outbox.list(accountId)).toHaveLength(1);
  });

  it('resumes committed batches after a later batch abort without marking unfinished records complete', async () => {
    rawSource = JSON.stringify([put, { type: 'delete', key: otherKey }]);
    const originalPut = IDBObjectStore.prototype.put;
    let attempts = 0;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === STATE_STORES.migrationItems && ++attempts === 2) throw new DOMException('Second batch aborted', 'AbortError');
      return originalPut.apply(this, args);
    });
    await expect(migration.migrate({ ...options(), batchSize: 1 })).rejects.toMatchObject({ kind: 'aborted' });
    expect(await outbox.list(accountId)).toHaveLength(1);
    expect(await rows(STATE_STORES.migrationItems)).toHaveLength(1);
    expect(await migration.progress()).toMatchObject({ status: 'importing', processedRecords: 1, sendAllowed: false });
    vi.restoreAllMocks();
    expect(await new LegacyQueueMigration(source, otherConnection).migrate({ ...options(), batchSize: 1 })).toMatchObject({ status: 'completed', processedRecords: 2 });
    expect(await outbox.list(accountId)).toHaveLength(2);
  });

  it('detects a changed legacy source before opening the sender gate', async () => {
    const first = rawSource;
    const changed = JSON.stringify([put, { type: 'delete', key: otherKey }]);
    source.getItem.mockReturnValueOnce(first).mockReturnValue(changed);
    expect(await migration.migrate(options())).toMatchObject({ status: 'partial', sourceMatches: false, sendAllowed: false });
    expect(await claim()).toBeNull();
    expect(await migration.migrate(options())).toMatchObject({ status: 'completed', importedRecords: 2 });
    expect(await outbox.list(accountId)).toHaveLength(2);
  });

  it('does not overwrite a newer local value while importing an older full snapshot', async () => {
    await stateTransaction(await connection.open(), [STATE_STORES.values], 'readwrite', (tx) => {
      tx.objectStore(STATE_STORES.values).put({ key, value: 'newer local value', updatedAt: 1 });
    });
    await migration.migrate(options());
    expect((await outbox.list(accountId))[0]).toMatchObject({ status: 'conflicted', reason: 'legacy-local-value-conflict', value: put.value });
    expect((await outbox.snapshot(accountId, key)).value).toBe('newer local value');
  });

  it('preserves an existing new-queue operation and the independent imported intent', async () => {
    const modern = await outbox.write({ accountId, writerId: 'modern', intent: { type: 'put', key, value: 'new queue' }, expectedRevision: 0, baseVersion: 0 });
    await migration.migrate(options());
    expect(await outbox.list(accountId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ opId: modern.opId, status: 'pending', value: 'new queue' }),
      expect.objectContaining({ status: 'conflicted', value: put.value }),
    ]));
    expect((await outbox.snapshot(accountId, key)).value).toBe('new queue');
  });

  it('preserves valid but unsupported integer metadata as a conflicted operation, not a corrupt record', async () => {
    rawSource = JSON.stringify([{ ...put, baseVersion: 1e20 }]);
    expect(await migration.migrate(options())).toMatchObject({ status: 'completed', importedRecords: 1, unresolvedRecords: 0 });
    expect((await outbox.list(accountId))[0]).toMatchObject({ baseVersion: 1e20, status: 'conflicted', reason: 'legacy-unsupported-metadata' });
    expect(await migration.unknown()).toEqual([]);
  });
});

describe('quarantine and identity ambiguity', () => {
  it.each([
    [null, 'not-an-object'],
    [{ type: 'other', key }, 'invalid-type'],
    [{ type: 'delete', key: '' }, 'invalid-key'],
    [{ type: 'put', key }, 'put-without-value'],
    [{ type: 'delete', key, value: '' }, 'delete-with-value'],
    [{ ...put, baseVersion: -1 }, 'invalid-baseVersion'],
    [{ ...put, retryCount: 0.5 }, 'invalid-retryCount'],
  ])('retains raw invalid record %j with reason %s', async (rawRecord, reason) => {
    rawSource = JSON.stringify([rawRecord]);
    expect(await migration.migrate(options())).toMatchObject({ status: 'partial', importedRecords: 0, unresolvedRecords: 1 });
    expect(await migration.unknown()).toEqual([expect.objectContaining({ rawRecord, rawRecords: [rawRecord], reason })]);
    expect(await outbox.list(accountId)).toEqual([]);
  });

  it.each(['{not-json', '{"items":[]}', 'null'])('retains the exact damaged container bytes: %s', async (raw) => {
    rawSource = raw;
    expect(await migration.migrate(options())).toMatchObject({ status: 'partial', processedRecords: 1, importedRecords: 0 });
    expect((await migration.unknown())[0].rawRecord).toBe(raw);
    expect(rawSource).toBe(raw);
  });

  it('does not guess ownership from the active session or a global key', async () => {
    await outbox.activateSession(accountId, 'active');
    rawSource = JSON.stringify([put, { type: 'put', key: 'ff_ai_last_status_v1', value: 'global' }]);
    expect(await migration.migrate({ ...options(), verifiedOwners: new Map() })).toMatchObject({ status: 'partial', importedRecords: 0, unresolvedRecords: 2 });
    expect((await migration.unknown()).every((entry) => entry.reason === 'unknown-owner')).toBe(true);
    expect(await outbox.list(accountId)).toEqual([]);
  });

  it('can import after ownership is verified while retaining the resolved raw quarantine evidence', async () => {
    await migration.migrate({ ...options(), verifiedOwners: new Map() });
    expect(await migration.migrate(options())).toMatchObject({ status: 'completed', importedRecords: 1, unresolvedRecords: 0 });
    expect((await migration.unknown())[0]).toMatchObject({ rawRecord: put, resolved: { accountId } });
    expect(await outbox.list(accountId)).toHaveLength(1);
  });

  it('quarantines ambiguous owners and rejects an explicit owner of another account key', async () => {
    expect(await migration.migrate({ ...options(), verifiedOwners: new Map([[key, [accountId, 'other']]]) })).toMatchObject({ status: 'partial' });
    expect((await migration.unknown())[0].reason).toBe('ambiguous-owner');
    expect(await migration.migrate({ ...options(), verifiedOwners: new Map([[key, ['other']]]) })).toMatchObject({ status: 'partial' });
    expect((await migration.unknown()).some((entry) => entry.reason === 'ownership-conflict')).toBe(true);
    expect(await outbox.list('other')).toEqual([]);
  });

  it('keeps every identical duplicate including differing retryCount without choosing a winner', async () => {
    const retried = { ...put, retryCount: 3 };
    rawSource = JSON.stringify([put, retried, put]);
    expect(await migration.migrate(options())).toMatchObject({ status: 'partial', processedRecords: 3, importedRecords: 0 });
    const [entry] = await migration.unknown();
    expect(entry.reason).toBe('ambiguous-duplicate');
    expect(entry.rawRecords).toHaveLength(3);
    expect(entry.rawRecords).toEqual(expect.arrayContaining([put, retried]));
    await migration.migrate(options());
    expect(await migration.unknown()).toHaveLength(1);
    expect((await migration.unknown())[0].rawRecords).toHaveLength(3);
    expect(await outbox.list(accountId)).toEqual([]);
  });

  it('retains different operations of one legacy Map key without inferring array order as causality', async () => {
    rawSource = JSON.stringify([put, { type: 'delete', key }]);
    expect(await migration.migrate(options())).toMatchObject({ status: 'partial', importedRecords: 0, unresolvedRecords: 2 });
    expect((await migration.unknown()).every((entry) => entry.reason === 'ambiguous-key')).toBe(true);
    expect(await outbox.list(accountId)).toEqual([]);
  });

  it('compares canonical fields on a fingerprint match and preserves both colliding records', async () => {
    const normalized = normalizeLegacyRecord(put);
    if (normalized.ok === false) throw new Error('Unexpected invalid fixture');
    const fingerprint = await legacyFingerprint(normalized.value);
    const previous = { type: 'put', key, value: 'different canonical payload', baseVersion: 0, retryCount: 0 };
    await stateTransaction(await connection.open(), [STATE_STORES.migrationItems], 'readwrite', (tx) => {
      tx.objectStore(STATE_STORES.migrationItems).put({ id: legacyMigrationItemId(fingerprint), sourceKey: LEGACY_QUEUE_SOURCE_KEY,
        fingerprint, canonical: JSON.stringify(['put', key, previous.value, 0]), canonicalVariants: [JSON.stringify(['put', key, previous.value, 0])],
        rawRecords: [previous], rawCanonicals: ['prior-raw'], state: 'unknown', reason: 'unknown-owner', unknownIds: [] } satisfies MigrationItem);
    });
    expect(await migration.migrate(options())).toMatchObject({ status: 'partial', importedRecords: 0 });
    expect((await migration.unknown())[0]).toMatchObject({ reason: 'fingerprint-collision', rawRecords: expect.arrayContaining([previous, put]) });
    expect(await outbox.list(accountId)).toEqual([]);
  });

  it('quarantines a missing operation without an acknowledgement receipt instead of marking it imported', async () => {
    await migration.migrate(options());
    await stateTransaction(await connection.open(), [STATE_STORES.outbox], 'readwrite', (tx) => { tx.objectStore(STATE_STORES.outbox).clear(); });
    expect(await migration.migrate(options())).toMatchObject({ status: 'partial', importedRecords: 0 });
    expect((await migration.unknown())[0].reason).toBe('missing-imported-operation');
  });

  it('does not collapse overflow numeric metadata to the fingerprint of null', async () => {
    rawSource = `[{"type":"put","key":${JSON.stringify(key)},"value":"x","baseVersion":1e309},{"type":"put","key":${JSON.stringify(key)},"value":"x","baseVersion":null}]`;
    await migration.migrate(options());
    const unknown = await migration.unknown();
    expect(unknown).toHaveLength(2);
    expect(new Set(unknown.map((entry) => entry.fingerprint)).size).toBe(2);
    expect(unknown.map((entry) => (entry.rawRecord as { baseVersion: unknown }).baseVersion)).toEqual(expect.arrayContaining([Infinity, null]));
  });

  it('keeps unresolved records partial even if they disappear from a later source snapshot', async () => {
    rawSource = '[null]';
    await migration.migrate(options());
    rawSource = '[]';
    expect(await migration.migrate(options())).toMatchObject({ status: 'partial', totalRecords: 0, unresolvedRecords: 1 });
    expect((await migration.unknown())[0].rawRecord).toBeNull();
  });

  it('reports source access failure instead of treating it as an empty queue', async () => {
    source.getItem.mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
    await expect(migration.migrate(options())).rejects.toMatchObject({ kind: 'unavailable' });
    expect(await migration.progress()).toBeNull();
    expect(await outbox.list(accountId)).toEqual([]);
  });
});

/** Queue an independent committed mutation immediately before the final audit transaction. */
async function changeBeforeFinal(change: (tx: IDBTransaction) => void) {
  const database = await connection.open();
  const transaction = database.transaction.bind(database);
  let audits = 0;
  let injected = false;
  vi.spyOn(database, 'transaction').mockImplementation((...args: Parameters<IDBDatabase['transaction']>) => {
    const names = typeof args[0] === 'string' ? [args[0]] : Array.from(args[0]);
    if (!injected && names.includes(STATE_STORES.migrationItems) && names.includes(STATE_STORES.migrationUnknown) && ++audits === 2) {
      injected = true;
      change(transaction([STATE_STORES.outbox, STATE_STORES.migrationItems, STATE_STORES.migrationUnknown], 'readwrite'));
    }
    return transaction(...args);
  });
  return () => expect(injected).toBe(true);
}

describe('migration completion and concurrent recovery', () => {
  it.each([true, false])('requires the new attempt writer fence after a batch abort (previous fence %s)', async (previousFence) => {
    const originalPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === STATE_STORES.migrationItems) throw new DOMException('Interrupted import', 'AbortError');
      return originalPut.apply(this, args);
    });
    await expect(migration.migrate({ verifiedOwners: verifiedOwners(), writersStopped: previousFence })).rejects.toMatchObject({ kind: 'aborted' });
    vi.restoreAllMocks();
    const writersStopped = !previousFence;
    expect(await migration.migrate({ verifiedOwners: verifiedOwners(), writersStopped })).toMatchObject({
      status: writersStopped ? 'completed' : 'partial', writersStopped, sendAllowed: writersStopped,
    });
  });

  it('recovers unfinished records from an earlier snapshot after the legacy source was replaced', async () => {
    rawSource = JSON.stringify([put, { type: 'delete', key: otherKey }]);
    const originalPut = IDBObjectStore.prototype.put;
    let attempts = 0;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === STATE_STORES.migrationItems && ++attempts === 2) throw new DOMException('Interrupted migration', 'AbortError');
      return originalPut.apply(this, args);
    });
    await expect(migration.migrate({ ...options(), batchSize: 1 })).rejects.toMatchObject({ kind: 'aborted' });
    vi.restoreAllMocks();
    rawSource = '[]';
    expect(await migration.migrate(options())).toMatchObject({ status: 'completed', totalRecords: 0, pendingSnapshotRecords: 0 });
    expect(await outbox.list(accountId)).toHaveLength(2);
    expect(await outbox.list(accountId)).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'delete', key: otherKey })]));
    expect(await rows(STATE_STORES.migrationItems)).toHaveLength(2);
  });

  it('keeps an earlier unprocessed snapshot partial if its ownership is still unverified', async () => {
    rawSource = JSON.stringify([put, { type: 'delete', key: otherKey }]);
    const originalPut = IDBObjectStore.prototype.put;
    let attempts = 0;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === STATE_STORES.migrationItems && ++attempts === 2) throw new DOMException('Interrupted migration', 'AbortError');
      return originalPut.apply(this, args);
    });
    await expect(migration.migrate({ ...options(), batchSize: 1 })).rejects.toMatchObject({ kind: 'aborted' });
    vi.restoreAllMocks();
    rawSource = '[]';
    expect(await migration.migrate({ ...options(), verifiedOwners: new Map([[key, [accountId]]]) })).toMatchObject({ status: 'partial', unresolvedRecords: 1 });
    expect((await migration.unknown())[0]).toMatchObject({ rawRecord: { type: 'delete', key: otherKey }, reason: 'unknown-owner' });
    expect(await outbox.list(accountId)).toHaveLength(1);
  });

  it('captures verified ownership before awaiting storage instead of reading a later account selection', async () => {
    const owners = verifiedOwners();
    const pending = migration.migrate({ ...options(), verifiedOwners: owners });
    owners.set(key, ['other']);
    expect(await pending).toMatchObject({ status: 'completed', importedRecords: 1 });
    expect(await outbox.list(accountId)).toHaveLength(1);
    expect(await outbox.list('other')).toEqual([]);
  });

  it('joins concurrent imports of the same source without duplicate operations or superseding the other tab', async () => {
    const other = new LegacyQueueMigration(source, otherConnection);
    const results = await Promise.all([migration.migrate(options()), other.migrate(options())]);
    expect(results.every((result) => result.status === 'completed')).toBe(true);
    expect(await outbox.list(accountId)).toHaveLength(1);
    expect(await rows(STATE_STORES.migrationItems)).toHaveLength(1);
  });

  it('audits the actual operation after all batches, before marking migration complete', async () => {
    const injected = await changeBeforeFinal((tx) => { tx.objectStore(STATE_STORES.outbox).clear(); });
    expect(await migration.migrate(options())).toMatchObject({ status: 'partial', importedRecords: 0, unresolvedRecords: 1 });
    injected();
    expect((await migration.unknown())[0].reason).toBe('missing-imported-operation');
    expect(await claim()).toBeNull();
  });

  it('does not create another operation if its ledger disappears before final verification', async () => {
    const injected = await changeBeforeFinal((tx) => { tx.objectStore(STATE_STORES.migrationItems).clear(); });
    expect(await migration.migrate(options())).toMatchObject({ status: 'partial', importedRecords: 0, unresolvedRecords: 1 });
    injected();
    expect(await outbox.list(accountId)).toHaveLength(1);
    expect(await claim()).toBeNull();
  });

  it('restores missing quarantine evidence during the final audit and keeps the result partial', async () => {
    rawSource = '[null]';
    const injected = await changeBeforeFinal((tx) => { tx.objectStore(STATE_STORES.migrationUnknown).clear(); });
    expect(await migration.migrate(options())).toMatchObject({ status: 'partial', importedRecords: 0, unresolvedRecords: 1 });
    injected();
    expect((await migration.unknown())[0]).toMatchObject({ rawRecord: null, reason: 'not-an-object' });
  });

  it.each([
    { acknowledgedVersion: 0, acknowledgedAtMs: 1 },
    { acknowledgedVersion: '1', acknowledgedAtMs: 1 },
    { acknowledgedVersion: 1 },
  ])('requires a valid acknowledgement receipt after an operation disappears: %j', async (receipt) => {
    await migration.migrate(options());
    const [ledger] = await rows<MigrationItem>(STATE_STORES.migrationItems);
    await stateTransaction(await connection.open(), [STATE_STORES.outbox, STATE_STORES.migrationItems], 'readwrite', (tx) => {
      tx.objectStore(STATE_STORES.outbox).clear();
      tx.objectStore(STATE_STORES.migrationItems).put({ ...ledger, ...receipt });
    });
    expect(await migration.migrate(options())).toMatchObject({ status: 'partial', importedRecords: 0 });
    expect((await migration.unknown())[0].reason).toBe('missing-imported-operation');
    expect(await outbox.list(accountId)).toEqual([]);
  });

  it('verifies the persisted payload instead of trusting only its fingerprint fields', async () => {
    await migration.migrate(options());
    const [operation] = await outbox.list(accountId);
    await stateTransaction(await connection.open(), [STATE_STORES.outbox], 'readwrite', (tx) => {
      tx.objectStore(STATE_STORES.outbox).put({ ...operation, value: 'a different payload' });
    });
    expect(await migration.migrate(options())).toMatchObject({ status: 'partial', importedRecords: 0 });
    expect((await migration.unknown())[0].reason).toBe('missing-imported-operation');
    expect((await outbox.list(accountId))[0]).toMatchObject({ status: 'conflicted', value: 'a different payload' });
    expect(await claim()).toBeNull();
  });

  it('rolls back acknowledgement and version changes if the migration receipt cannot commit', async () => {
    await migration.migrate(options());
    const sending = await claim();
    if (!sending) throw new Error('Expected a claim');
    const originalPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === STATE_STORES.migrationItems) throw new DOMException('Receipt quota', 'QuotaExceededError');
      return originalPut.apply(this, args);
    });
    await expect(outbox.finish(sending, { kind: 'acknowledged', version: 1 })).rejects.toMatchObject({ kind: 'quota' });
    expect((await outbox.list(accountId))[0]).toMatchObject({ opId: sending.opId, status: 'sending' });
    expect((await outbox.snapshot(accountId, key)).confirmedVersion).toBe(0);
    expect((await rows<MigrationItem>(STATE_STORES.migrationItems))[0].acknowledgedVersion).toBeUndefined();
    vi.restoreAllMocks();
    expect(await outbox.finish(sending, { kind: 'acknowledged', version: 1 })).toBe(true);
    expect(await migration.migrate(options())).toMatchObject({ status: 'completed' });
  });

  it('closes an existing sender gate when the source cannot be read on a later attempt', async () => {
    await migration.migrate(options());
    source.getItem.mockImplementation(() => { throw new DOMException('Source now denied', 'SecurityError'); });
    await expect(migration.migrate(options())).rejects.toMatchObject({ kind: 'unavailable' });
    expect(await claim()).toBeNull();
    expect(await migration.progress()).toMatchObject({ sendAllowed: false });
  });

  it('leaves the gate closed if the final source verification throws', async () => {
    source.getItem.mockImplementationOnce(() => rawSource).mockImplementation(() => { throw new DOMException('Final read denied', 'SecurityError'); });
    await expect(migration.migrate(options())).rejects.toMatchObject({ kind: 'unavailable' });
    expect(await migration.progress()).toMatchObject({ status: 'importing', sendAllowed: false });
    expect(await outbox.list(accountId)).toHaveLength(1);
    expect(await claim()).toBeNull();
  });

  it('does not apply a late acknowledgement while a new migration has closed the gate', async () => {
    await migration.migrate(options());
    const sending = await claim();
    if (!sending) throw new Error('Expected a claim');
    await migration.migrate({ verifiedOwners: verifiedOwners() });
    expect(await outbox.finish(sending, { kind: 'acknowledged', version: 1 })).toBe(false);
    expect((await outbox.list(accountId))[0]).toMatchObject({ opId: sending.opId, status: 'sending' });
    expect((await outbox.snapshot(accountId, key)).confirmedVersion).toBe(0);
  });

  it.each([
    { sourceKey: 'another-source' },
    { accountId: 'another-account' },
    { acknowledgedVersion: 1, acknowledgedAtMs: 1 },
    { canonicalVariants: ['one', 'two'] },
  ])('does not claim an imported operation with a mismatched migration receipt: %j', async (changed) => {
    await migration.migrate(options());
    const [ledger] = await rows<MigrationItem>(STATE_STORES.migrationItems);
    await stateTransaction(await connection.open(), [STATE_STORES.migrationItems], 'readwrite', (tx) => {
      tx.objectStore(STATE_STORES.migrationItems).put({ ...ledger, ...changed });
    });
    expect(await claim()).toBeNull();
    expect((await outbox.list(accountId))[0].status).toBe('pending');
  });

  it('does not claim a changed payload even when its stored fingerprint and canonical fields were left intact', async () => {
    await migration.migrate(options());
    const [operation] = await outbox.list(accountId);
    await stateTransaction(await connection.open(), [STATE_STORES.outbox], 'readwrite', (tx) => {
      tx.objectStore(STATE_STORES.outbox).put({ ...operation, value: 'different outgoing value' });
    });
    expect(await claim()).toBeNull();
  });

  it('allows a verified known operation in a partial migration while keeping unrelated unknown records quarantined', async () => {
    rawSource = JSON.stringify([put, null]);
    expect(await migration.migrate(options())).toMatchObject({ status: 'partial', importedRecords: 1, unresolvedRecords: 1, sendAllowed: true });
    expect(await claim()).toMatchObject({ type: 'put', value: put.value });
    expect((await migration.unknown())[0].rawRecord).toBeNull();
  });

  it('requires the writer fence even for an empty source', async () => {
    rawSource = null;
    expect(await migration.migrate({ verifiedOwners: new Map() })).toMatchObject({ status: 'partial', totalRecords: 0, sendAllowed: false });
    expect(await migration.migrate(options())).toMatchObject({ status: 'completed', totalRecords: 0, sendAllowed: true });
  });

  it('keeps operation identity when ownership ambiguity is resolved after an earlier import', async () => {
    await migration.migrate(options());
    const [original] = await outbox.list(accountId);
    await migration.migrate({ ...options(), verifiedOwners: new Map([[key, [accountId, 'other']]]) });
    expect(await claim()).toBeNull();
    expect(await migration.migrate(options())).toMatchObject({ status: 'completed', importedRecords: 1 });
    expect(await outbox.list(accountId)).toEqual([expect.objectContaining({ opId: original.opId, status: 'conflicted' })]);
    expect((await migration.unknown())[0].resolved?.opId).toBe(original.opId);
  });

  it('rolls back quarantine, ledger and progress together when raw evidence cannot be stored', async () => {
    rawSource = '[null]';
    const originalPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === STATE_STORES.migrationUnknown) throw new DOMException('Quarantine quota', 'QuotaExceededError');
      return originalPut.apply(this, args);
    });
    await expect(migration.migrate(options())).rejects.toMatchObject({ kind: 'quota' });
    expect(await migration.unknown()).toEqual([]);
    expect(await rows(STATE_STORES.migrationItems)).toEqual([]);
    expect(await migration.progress()).toMatchObject({ processedRecords: 0, sendAllowed: false });
    vi.restoreAllMocks();
    expect(await migration.migrate(options())).toMatchObject({ status: 'partial', unresolvedRecords: 1 });
  });

  it('preserves colliding quarantine evidence and reuses the matching row on a subsequent restart', async () => {
    rawSource = '[null]';
    await migration.migrate(options());
    const [previous] = await migration.unknown();
    await stateTransaction(await connection.open(), [STATE_STORES.migrationUnknown], 'readwrite', (tx) => {
      tx.objectStore(STATE_STORES.migrationUnknown).put({ ...previous, canonicalEvidence: 'other evidence', rawRecord: 'older raw', rawRecords: ['older raw'] });
    });
    await migration.migrate(options());
    expect(await migration.unknown()).toHaveLength(2);
    expect((await migration.unknown()).map((row) => row.rawRecord)).toEqual(expect.arrayContaining(['older raw', null]));
    await migration.migrate(options());
    expect(await migration.unknown()).toHaveLength(2);
  });

  it('keeps fingerprint collisions above a previous quarantine reason and retains an imported payload', async () => {
    await migration.migrate(options());
    const [ledger] = await rows<MigrationItem>(STATE_STORES.migrationItems);
    const [operation] = await outbox.list(accountId);
    const priorRaw = { ...put, value: 'previous colliding payload' };
    const canonical = JSON.stringify(['put', key, priorRaw.value, 0]);
    await stateTransaction(await connection.open(), [STATE_STORES.outbox, STATE_STORES.migrationItems], 'readwrite', (tx) => {
      tx.objectStore(STATE_STORES.outbox).put({ ...operation, value: priorRaw.value, migrationCanonical: canonical });
      tx.objectStore(STATE_STORES.migrationItems).put({ ...ledger, state: 'unknown', reason: 'ambiguous-duplicate', canonical,
        canonicalVariants: [canonical], rawRecords: [priorRaw], rawCanonicals: ['previous-raw'] });
    });
    expect(await migration.migrate(options())).toMatchObject({ status: 'partial', importedRecords: 0 });
    expect((await migration.unknown())[0]).toMatchObject({ reason: 'fingerprint-collision', rawRecords: expect.arrayContaining([priorRaw, put]) });
    expect((await outbox.list(accountId))[0]).toMatchObject({ opId: operation.opId, status: 'conflicted', value: priorRaw.value });
    expect(await claim()).toBeNull();
  });
});
