import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { DurableOutbox, outboxKeyStateId, type OutboxOperation, type OutboxReadGuard, type OutboxWrite } from '../storage/durableOutbox';
import { STATE_STORES, StateDatabase, indexedRequest, stateTransaction } from '../storage/stateDatabase';
import { userProfile } from './_helpers/userProfile';

const account = 'profile-ack-owner';
const profileKey = `fitfocus_data_${account}_profile`;
const initial = JSON.stringify(userProfile(account, { version: 0, targetWeight: 65 }));
const updated = JSON.stringify(userProfile(account, { version: 0, targetWeight: 60 }));
let db: StateDatabase, outbox: DurableOutbox, guard: OutboxReadGuard;
beforeEach(async () => {
  db = new StateDatabase({ factory: new IDBFactory() }); outbox = new DurableOutbox(db);
  guard = (await outbox.acceptReadSession(account, 'a'.repeat(64), 0))!;
});
afterEach(() => db.close());

async function acknowledged(key = profileKey, resource: OutboxWrite['resource'] = key === profileKey ? 'profile' : undefined) {
  const operation = await outbox.write({ accountId: account, writerId: 'registration', resource,
    intent: { type: 'put', key, value: initial }, expectedRevision: 0, baseVersion: 0 });
  const claim = await outbox.claim({ accountId: account, owner: 'sender', sessionEpoch: guard.sessionEpoch,
    nowMs: Date.now() + 100, leaseMs: 30000 });
  expect(claim).not.toBeNull();
  expect(await outbox.finish(claim!, { kind: 'acknowledged', version: 1 })).toBe(true);
  return operation;
}
function write(overrides: Partial<OutboxWrite> = {}) {
  return outbox.write({ accountId: account, writerId: 'mounted-editor', resource: 'profile',
    intent: { type: 'put', key: profileKey, value: updated }, expectedRevision: 1, baseVersion: 0,
    observedValue: initial, ...overrides });
}
async function alterMeta(change: (meta: Record<string, unknown>) => void) {
  await stateTransaction(await db.open(), [STATE_STORES.meta], 'readwrite', async tx => {
    const store = tx.objectStore(STATE_STORES.meta);
    const meta = await indexedRequest(store.get(outboxKeyStateId(account, profileKey))) as Record<string, unknown>;
    change(meta); store.put(meta);
  });
}

it.each(['registration', 'mounted-editor'])('accepts only the unchanged acknowledged profile observed by %s', async writerId => {
  await acknowledged();
  const operation = await write({ writerId });
  expect(operation).toMatchObject({ status: 'pending', baseVersion: 1 });
  expect(operation).not.toHaveProperty('observedValue');
});
it.each([undefined, null, 'changed'])('rejects an absent/null/different loaded observation: %s', async observedValue => {
  await acknowledged();
  expect(await write({ observedValue: observedValue as string | undefined })).toMatchObject({ status: 'conflicted', reason: 'base-version-conflict' });
  expect((await outbox.snapshot(account, profileKey)).value).toBe(initial);
});
it('rejects changed bytes even if corrupt metadata retained the acknowledged revision', async () => {
  await acknowledged();
  await stateTransaction(await db.open(), [STATE_STORES.values], 'readwrite', tx => {
    tx.objectStore(STATE_STORES.values).put({ key: profileKey, accountId: account, value: 'different', updatedAt: Date.now() });
  });
  expect(await write()).toMatchObject({ status: 'conflicted', reason: 'base-version-conflict' });
  expect((await outbox.snapshot(account, profileKey)).value).toBe('different');
});
it.each(['acknowledgedOpId', 'acknowledgedWriterId', 'acknowledgedRevision'])('requires persisted %s evidence', async field => {
  await acknowledged(); await alterMeta(meta => { delete meta[field]; });
  expect(await write()).toMatchObject({ status: 'conflicted', reason: 'base-version-conflict' });
});
it('rejects an ACK for a different revision', async () => {
  await acknowledged(); await alterMeta(meta => { meta.acknowledgedRevision = 0; });
  expect(await write()).toMatchObject({ status: 'conflicted', reason: 'base-version-conflict' });
});
it('does not adopt a remote hydration even when its bytes equal the observed profile', async () => {
  await acknowledged();
  expect(await outbox.hydrate(account, profileKey, { value: initial, exists: true, version: 2 }, 1)).toBe(true);
  expect(await write()).toMatchObject({ status: 'conflicted', reason: 'local-revision-conflict' });
});
it.each(['pending', 'sending', 'failed', 'conflicted'] as const)('preserves a %s sibling instead of advancing the base', async status => {
  const original = await acknowledged();
  await stateTransaction(await db.open(), [STATE_STORES.outbox], 'readwrite', tx => {
    const sibling: OutboxOperation = { ...original, opId: 'retained-sibling', status };
    tx.objectStore(STATE_STORES.outbox).put(sibling);
  });
  expect(await write()).toMatchObject({ status: 'conflicted', reason: 'base-version-conflict' });
  expect((await outbox.list(account)).some(op => op.opId === 'retained-sibling')).toBe(true);
});
it('does not accept a dangling head as completed', async () => {
  await acknowledged(); await alterMeta(meta => { meta.headOpId = 'missing-head'; });
  expect(await write()).toMatchObject({ status: 'conflicted', reason: 'base-version-conflict' });
});
it('keeps an independent live head conflicted', async () => {
  await acknowledged();
  expect((await write({ baseVersion: 1 })).status).toBe('pending');
  expect(await write({ expectedRevision: 2, observedValue: updated })).toMatchObject({ status: 'conflicted', reason: 'independent-snapshot' });
});
it('keeps an invalid parent conflicted', async () => {
  await acknowledged();
  expect(await write({ parentOpId: 'unobserved-parent' })).toMatchObject({ status: 'conflicted', reason: 'invalid-parent' });
});
it('does not erase editor-not-loaded protection', async () => {
  await acknowledged();
  expect(await write({ conflictReason: 'editor-not-loaded' })).toMatchObject({ status: 'conflicted', reason: 'editor-not-loaded' });
});
it('does not advance a caller whose base is ahead of confirmed version', async () => {
  await acknowledged();
  expect(await write({ baseVersion: 2 })).toMatchObject({ status: 'conflicted', reason: 'base-version-conflict' });
});
it('never applies the profile exception to ordinary state writes', async () => {
  const key = `fitfocus_data_${account}_diary`;
  await acknowledged(key, undefined);
  expect(await write({ resource: undefined, intent: { type: 'put', key, value: updated } })).toMatchObject({ status: 'conflicted', reason: 'base-version-conflict' });
});
it.each(['read-session', 'local-session', 'auth-fence', 'canCommit'] as const)('preserves %s rejection without writing', async change => {
  await acknowledged();
  if (change === 'read-session' || change === 'local-session') await outbox.invalidateSessions();
  const options = change === 'local-session'
    ? { localCommitGuard: guard, canCommit: () => true }
    : { readGuard: { ...guard, ...(change === 'auth-fence' ? { authFence: guard.authFence + 1 } : {}) }, canCommit: () => change !== 'canCommit' };
  await expect(write(options)).rejects.toThrow();
  expect(await outbox.list(account)).toEqual([]);
  expect((await outbox.snapshot(account, profileKey)).value).toBe(initial);
});
it('accepts only one of two editors racing after the same ACK', async () => {
  await acknowledged();
  const operations = await Promise.all([write(), write({ writerId: 'another-editor' })]);
  expect(operations.filter(op => op.status === 'pending')).toHaveLength(1);
  expect(operations.filter(op => op.reason === 'local-revision-conflict')).toHaveLength(1);
});
