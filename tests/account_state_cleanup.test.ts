import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { DurableOutbox, outboxKeyOwnerId } from '../storage/durableOutbox';
import { clearIndexedUserStateForUser } from '../storage/indexedUserState';
import { LEGACY_MIGRATION_META_ID, LEGACY_QUEUE_SOURCE_KEY } from '../storage/legacyQueue';
import { StateDatabase, STATE_STORES, indexedRequest, stateTransaction } from '../storage/stateDatabase';

const deletedAccount = 'cleanup-target';
const otherAccount = 'cleanup-other';
const deletedKey = `fitfocus_data_${deletedAccount}_diary`;
const otherKey = `fitfocus_data_${otherAccount}_diary`;
let connection: StateDatabase | null = null;

function createDatabase(): StateDatabase {
  connection = new StateDatabase({ factory: new IDBFactory(), name: `account-cleanup-${crypto.randomUUID()}` });
  return connection;
}

afterEach(() => {
  connection?.close();
  connection = null;
});

describe('account-scoped IndexedDB cleanup', () => {
  it('removes only proven account rows and preserves unrelated or ambiguous migration data', async () => {
    const database = createDatabase();
    const rawSource = JSON.stringify([
      { type: 'put', key: deletedKey, value: 'legacy target data' },
      { type: 'put', key: otherKey, value: 'other account data' },
    ]);
    const db = await database.open();
    await stateTransaction(db, Object.values(STATE_STORES), 'readwrite', (tx) => {
      tx.objectStore(STATE_STORES.values).put({ key: deletedKey, value: 'target', updatedAt: 1, accountId: deletedAccount });
      tx.objectStore(STATE_STORES.values).put({ key: otherKey, value: 'other', updatedAt: 1, accountId: otherAccount });
      tx.objectStore(STATE_STORES.outbox).put({ opId: 'target-op', accountId: deletedAccount, key: deletedKey });
      tx.objectStore(STATE_STORES.outbox).put({ opId: 'other-op', accountId: otherAccount, key: otherKey });
      tx.objectStore(STATE_STORES.migrationItems).put({
        id: 'target-item', sourceKey: LEGACY_QUEUE_SOURCE_KEY, fingerprint: 'target-fingerprint',
        accountId: deletedAccount, unknownIds: ['target-unknown'], rawRecords: [{ key: deletedKey }],
      });
      tx.objectStore(STATE_STORES.migrationItems).put({
        id: 'other-item', sourceKey: LEGACY_QUEUE_SOURCE_KEY, fingerprint: 'other-fingerprint',
        accountId: otherAccount, unknownIds: ['other-unknown'], rawRecords: [{ key: otherKey }],
      });
      tx.objectStore(STATE_STORES.migrationUnknown).put({
        id: 'target-unknown', sourceKey: LEGACY_QUEUE_SOURCE_KEY, fingerprint: 'target-fingerprint',
        rawRecord: { key: deletedKey }, rawRecords: [{ key: deletedKey }],
        resolved: { opId: 'target-op', accountId: deletedAccount, atMs: 1 },
      });
      tx.objectStore(STATE_STORES.migrationUnknown).put({
        id: 'other-unknown', sourceKey: LEGACY_QUEUE_SOURCE_KEY, fingerprint: 'other-fingerprint',
        rawRecord: { key: otherKey }, rawRecords: [{ key: otherKey }],
        resolved: { opId: 'other-op', accountId: otherAccount, atMs: 1 },
      });
      tx.objectStore(STATE_STORES.migrationUnknown).put({
        id: 'unresolved-target-evidence', sourceKey: LEGACY_QUEUE_SOURCE_KEY, fingerprint: 'unresolved-fingerprint',
        rawRecord: { key: deletedKey }, rawRecords: [{ key: deletedKey }],
      });
      const meta = tx.objectStore(STATE_STORES.meta);
      meta.put({ id: outboxKeyOwnerId(deletedKey), accountId: deletedAccount, key: deletedKey });
      meta.put({ id: outboxKeyOwnerId(otherKey), accountId: otherAccount, key: otherKey });
      meta.put({ id: `key:${JSON.stringify([deletedAccount, deletedKey])}`, accountId: deletedAccount, key: deletedKey });
      meta.put({ id: `key:${JSON.stringify([otherAccount, otherKey])}`, accountId: otherAccount, key: otherKey });
      meta.put({ id: 'auth-fence', revision: 4, loggedOutSession: 'older-session' });
      meta.put({ id: 'active-session', accountId: deletedAccount, sessionEpoch: 'target-epoch', serverSessionId: 'target-session' });
      meta.put({ id: LEGACY_MIGRATION_META_ID, sourceKey: LEGACY_QUEUE_SOURCE_KEY, status: 'partial', sendAllowed: false });
      meta.put({ id: 'legacy-snapshot:v1:test', sourceKey: LEGACY_QUEUE_SOURCE_KEY, rawSource, processed: [] });
    });

    const result = await clearIndexedUserStateForUser(deletedAccount, database);
    expect(result).toEqual({ cleared: true, legacyEvidenceRetained: true });

    const snapshot = await stateTransaction(db, Object.values(STATE_STORES), 'readonly', async (tx) => {
      const [values, outbox, items, unknown, meta] = await Promise.all([
        indexedRequest(tx.objectStore(STATE_STORES.values).getAll()),
        indexedRequest(tx.objectStore(STATE_STORES.outbox).getAll()),
        indexedRequest(tx.objectStore(STATE_STORES.migrationItems).getAll()),
        indexedRequest(tx.objectStore(STATE_STORES.migrationUnknown).getAll()),
        indexedRequest(tx.objectStore(STATE_STORES.meta).getAll()),
      ]);
      return { values, outbox, items, unknown, meta };
    });

    expect(snapshot.values).toEqual([expect.objectContaining({ key: otherKey, value: 'other' })]);
    expect(snapshot.outbox).toEqual([expect.objectContaining({ opId: 'other-op', accountId: otherAccount })]);
    expect(snapshot.items).toEqual([expect.objectContaining({ id: 'other-item', accountId: otherAccount })]);
    expect(snapshot.unknown).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'other-unknown' }),
      expect.objectContaining({ id: 'unresolved-target-evidence' }),
    ]));
    expect(snapshot.unknown).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'target-unknown' })]));
    expect(snapshot.meta).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: outboxKeyOwnerId(otherKey), accountId: otherAccount }),
      expect.objectContaining({ id: `key:${JSON.stringify([otherAccount, otherKey])}` }),
      expect.objectContaining({ id: LEGACY_MIGRATION_META_ID, sendAllowed: false }),
      expect.objectContaining({ id: 'legacy-snapshot:v1:test', rawSource }),
      expect.objectContaining({ id: 'auth-fence', revision: 5, loggedOutSession: 'target-session' }),
    ]));
    expect(snapshot.meta).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: outboxKeyOwnerId(deletedKey) }),
      expect.objectContaining({ id: `key:${JSON.stringify([deletedAccount, deletedKey])}` }),
      expect.objectContaining({ id: 'active-session', accountId: deletedAccount }),
    ]));
  });

  it('does not invalidate another account session during scoped cleanup', async () => {
    const database = createDatabase();
    const db = await database.open();
    await stateTransaction(db, [STATE_STORES.meta], 'readwrite', (tx) => {
      tx.objectStore(STATE_STORES.meta).put({ id: 'auth-fence', revision: 7 });
      tx.objectStore(STATE_STORES.meta).put({ id: 'active-session', accountId: otherAccount, sessionEpoch: 'other-epoch' });
    });

    const result = await clearIndexedUserStateForUser(deletedAccount, database);
    expect(result).toEqual({ cleared: true, legacyEvidenceRetained: false });
    const metadata = await stateTransaction(db, [STATE_STORES.meta], 'readonly', async (tx) =>
      indexedRequest(tx.objectStore(STATE_STORES.meta).getAll()));
    expect(metadata).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'auth-fence', revision: 7 }),
      expect.objectContaining({ id: 'active-session', accountId: otherAccount, sessionEpoch: 'other-epoch' }),
    ]));
  });

  it('preserves a value whose explicit owner conflicts with its key prefix', async () => {
    const database = createDatabase();
    const db = await database.open();
    await stateTransaction(db, [STATE_STORES.values], 'readwrite', (tx) => {
      tx.objectStore(STATE_STORES.values).put({ key: deletedKey, value: 'conflicting owner', updatedAt: 1, accountId: otherAccount });
    });

    await expect(clearIndexedUserStateForUser(deletedAccount, database)).resolves.toEqual({
      cleared: false,
      legacyEvidenceRetained: false,
    });
    await expect(stateTransaction(db, [STATE_STORES.values], 'readonly', (tx) =>
      indexedRequest(tx.objectStore(STATE_STORES.values).get(deletedKey)))).resolves.toMatchObject({
      value: 'conflicting owner',
      accountId: otherAccount,
    });
  });

  it('rejects an in-flight sender acknowledgement after account cleanup', async () => {
    const database = createDatabase();
    const outbox = new DurableOutbox(database);
    const serverSessionId = 'a'.repeat(64);
    const session = await outbox.acceptSession(deletedAccount, serverSessionId, 0);
    expect(session).not.toBeNull();
    const operation = await outbox.write({
      accountId: deletedAccount,
      writerId: 'account-cleanup-test',
      intent: { type: 'put', key: deletedKey, value: 'pending' },
      expectedRevision: 0,
      baseVersion: 0,
    });
    const claim = await outbox.claim({
      accountId: deletedAccount,
      sessionEpoch: session!.sessionEpoch,
      owner: 'sender',
      nowMs: Date.now() + 1,
      leaseMs: 10_000,
    });
    expect(claim?.opId).toBe(operation.opId);

    const cleanup = await clearIndexedUserStateForUser(deletedAccount, database);

    expect(cleanup).toEqual({ cleared: true, legacyEvidenceRetained: false });
    await expect(outbox.finish(claim!, { kind: 'acknowledged', version: 1 }, Date.now() + 2)).resolves.toBe(false);
    await expect(outbox.list(deletedAccount)).resolves.toEqual([]);
    await expect(outbox.sessionState()).resolves.toMatchObject({ fence: 2, active: undefined });
  });
});
