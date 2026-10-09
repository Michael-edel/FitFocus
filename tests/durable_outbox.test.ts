import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DurableOutbox, type OutboxClaim } from '../storage/durableOutbox';
import { StateDatabase } from '../storage/stateDatabase';

let factory: IDBFactory;
let firstConnection: StateDatabase;
let secondConnection: StateDatabase;
let first: DurableOutbox;
let second: DurableOutbox;
const accountId = 'account-a';
const key = `fitfocus_data_${accountId}_diary`;
const otherKey = `fitfocus_data_${accountId}_history`;

beforeEach(() => {
  factory = new IDBFactory();
  firstConnection = new StateDatabase({ factory });
  secondConnection = new StateDatabase({ factory });
  first = new DurableOutbox(firstConnection);
  second = new DurableOutbox(secondConnection);
});
afterEach(() => { vi.restoreAllMocks(); firstConnection.close(); secondConnection.close(); });

function write(value = 'first', overrides: Partial<Parameters<DurableOutbox['write']>[0]> = {}) {
  return first.write({ accountId, writerId: 'writer-a', intent: { type: 'put', key, value }, expectedRevision: 0, baseVersion: 0, ...overrides });
}
async function claim(outbox = first, overrides: Partial<Parameters<DurableOutbox['claim']>[0]> = {}): Promise<OutboxClaim> {
  const result = await outbox.claim({ accountId, owner: 'tab-a', sessionEpoch: 'session-a', nowMs: Date.now(), leaseMs: 1_000, ...overrides });
  expect(result).not.toBeNull();
  if (!result) throw new Error('Missing claim');
  return result;
}

describe('atomic local values and outgoing intent', () => {
  it('commits value, revision and operation together and restores them from a fresh connection', async () => {
    const operation = await write();
    firstConnection.close();
    expect(await second.snapshot(accountId, key)).toEqual({ value: 'first', revision: 1, confirmedVersion: 0 });
    expect(await second.list(accountId)).toEqual([operation]);
    expect(operation.status).toBe('pending');
  });

  it('rolls back a value write when storing its operation fails with quota', async () => {
    const put = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>) {
      if (this.name === 'outbox') throw new DOMException('Injected storage fault', 'QuotaExceededError');
      return put.apply(this, args);
    });
    await expect(write()).rejects.toMatchObject({ kind: 'quota' });
    expect(await second.snapshot(accountId, key)).toEqual({ value: null, revision: 0, confirmedVersion: 0 });
    expect(await second.list(accountId)).toEqual([]);
    vi.restoreAllMocks();
    expect((await write()).revision).toBe(1);
  });

  it('preserves concurrent writes to different keys without Web Locks', async () => {
    await Promise.all([
      write('diary'),
      second.write({ accountId, writerId: 'writer-b', intent: { type: 'put', key: otherKey, value: 'history' }, expectedRevision: 0, baseVersion: 0 }),
    ]);
    expect((await first.list(accountId)).map((op) => op.key).sort()).toEqual([key, otherKey].sort());
    expect((await second.snapshot(accountId, key)).value).toBe('diary');
    expect((await first.snapshot(accountId, otherKey)).value).toBe('history');
  });

  it('retains the losing independent full snapshot as a conflict instead of overwriting data', async () => {
    const records = await Promise.all([
      write('snapshot-a'),
      second.write({ accountId, writerId: 'writer-b', intent: { type: 'put', key, value: 'snapshot-b' }, expectedRevision: 0, baseVersion: 0 }),
    ]);
    const accepted = records.find((op) => op.status === 'pending');
    const conflicted = records.find((op) => op.status === 'conflicted');
    expect(accepted?.type).toBe('put');
    expect(conflicted).toMatchObject({ status: 'conflicted', reason: 'local-revision-conflict' });
    expect(new Set((await first.list(accountId)).map((op) => op.type === 'put' ? op.value : 'delete'))).toEqual(new Set(['snapshot-a', 'snapshot-b']));
    expect((await first.snapshot(accountId, key)).value).toBe(accepted?.type === 'put' ? accepted.value : null);
  });

  it('requires an explicit same-writer parent before accepting a continuation', async () => {
    const initial = await write();
    const independent = await write('independent', { expectedRevision: 1 });
    expect(independent).toMatchObject({ status: 'conflicted', reason: 'independent-snapshot' });
    const wrongWriter = await second.write({ accountId, writerId: 'writer-b', intent: { type: 'put', key, value: 'other' }, expectedRevision: 1, baseVersion: 0, parentOpId: initial.opId });
    expect(wrongWriter).toMatchObject({ status: 'conflicted', reason: 'invalid-parent' });
    const child = await write('child', { expectedRevision: 1, parentOpId: initial.opId });
    expect(child).toMatchObject({ status: 'pending', revision: 4, parentOpId: initial.opId });
    expect((await second.snapshot(accountId, key)).value).toBe('child');
  });

  it('keeps deletion and its intent atomic, with no value property', async () => {
    const initial = await write();
    const deletion = await first.write({ accountId, writerId: 'writer-a', intent: { type: 'delete', key }, expectedRevision: 1, baseVersion: 0, parentOpId: initial.opId });
    expect('value' in deletion).toBe(false);
    expect(await second.snapshot(accountId, key)).toMatchObject({ value: null, revision: 2 });
    expect((await second.list(accountId)).find((op) => op.opId === deletion.opId)).toEqual(deletion);
  });

  it('rejects another account key and never guesses ownership for global legacy keys', async () => {
    await expect(write('other', { accountId: 'account-b' })).rejects.toThrow('OUTBOX_KEY_OWNERSHIP');
    await expect(write('global', { intent: { type: 'put', key: 'ff_ai_last_status_v1', value: 'global' } })).rejects.toThrow('OUTBOX_KEY_OWNERSHIP');
    expect(await first.list(accountId)).toEqual([]);
  });

  it('does not expose a value owned by an account whose id extends another id', async () => {
    const extended = 'account-a_child';
    const extendedKey = `fitfocus_data_${extended}_diary`;
    await first.write({ accountId: extended, writerId: 'child-writer', intent: { type: 'put', key: extendedKey, value: 'private' }, expectedRevision: 0, baseVersion: 0 });
    await expect(second.snapshot(accountId, extendedKey)).rejects.toMatchObject({ kind: 'transaction' });
    await expect(write('overwrite', { intent: { type: 'put', key: extendedKey, value: 'wrong owner' } })).rejects.toMatchObject({ kind: 'transaction' });
    expect((await first.snapshot(extended, extendedKey)).value).toBe('private');
    expect(await first.list(accountId)).toEqual([]);
  });

  it('retains explicit key ownership even when a deletion removes its local value', async () => {
    const extended = 'account-a_child';
    const extendedKey = `fitfocus_data_${extended}_diary`;
    await first.write({ accountId: extended, writerId: 'child-writer', intent: { type: 'delete', key: extendedKey }, expectedRevision: 0, baseVersion: 0 });
    await expect(write('wrong owner', { intent: { type: 'put', key: extendedKey, value: 'wrong owner' } })).rejects.toMatchObject({ kind: 'transaction' });
    expect(await first.list(extended)).toEqual([expect.objectContaining({ type: 'delete', accountId: extended })]);
  });
});

describe('transactional claims and late responses', () => {
  beforeEach(async () => { await first.activateSession(accountId, 'session-a'); });

  it('gives one operation to exactly one of two concurrent senders', async () => {
    await write();
    const input = { accountId, sessionEpoch: 'session-a', nowMs: Date.now(), leaseMs: 1_000 };
    const results = await Promise.all([first.claim({ ...input, owner: 'tab-a' }), second.claim({ ...input, owner: 'tab-b' })]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await first.list(accountId))[0]).toMatchObject({ status: 'sending', attempt: { startedAtMs: input.nowMs } });
  });

  it('reclaims an expired lease and ignores the previous attempt response', async () => {
    await write();
    const start = Date.now();
    const old = await claim(first, { nowMs: start });
    expect(await second.claim({ accountId, sessionEpoch: 'session-a', owner: 'tab-b', nowMs: start + 999, leaseMs: 1_000 })).toBeNull();
    const renewed = await claim(second, { owner: 'tab-b', nowMs: start + 1_000 });
    expect(renewed.attempt.attemptId).not.toBe(old.attempt.attemptId);
    expect(await first.finish(old, { kind: 'acknowledged', version: 1 }, start + 1_001)).toBe(false);
    expect((await first.snapshot(accountId, key)).confirmedVersion).toBe(0);
    expect(await second.finish(renewed, { kind: 'acknowledged', version: 1 }, start + 1_002)).toBe(true);
    expect(await first.list(accountId)).toEqual([]);
  });

  it('rebases only an explicit dependent child and never confirms or removes its value', async () => {
    const initial = await write();
    const sending = await claim();
    const child = await write('second', { expectedRevision: 1, parentOpId: initial.opId });
    expect(await first.finish(sending, { kind: 'acknowledged', version: 1 })).toBe(true);
    expect(await first.list(accountId)).toEqual([expect.objectContaining({ opId: child.opId, value: 'second', baseVersion: 1, status: 'pending' })]);
    expect(await second.snapshot(accountId, key)).toMatchObject({ value: 'second', revision: 2 });
    expect((await claim(second)).opId).toBe(child.opId);
  });

  it('does not rebase an independent conflict after the earlier operation succeeds', async () => {
    await write();
    const sending = await claim();
    const conflict = await write('independent', { writerId: 'writer-b', expectedRevision: 0 });
    await first.finish(sending, { kind: 'acknowledged', version: 1 });
    expect(await second.list(accountId)).toEqual([expect.objectContaining({ opId: conflict.opId, baseVersion: 0, status: 'conflicted', value: 'independent' })]);
    expect(await second.claim({ accountId, sessionEpoch: 'session-a', owner: 'tab-b', nowMs: Date.now(), leaseMs: 1_000 })).toBeNull();
  });

  it('retains update conflicts and server snapshots across reopening', async () => {
    await write('local');
    const sending = await claim();
    await first.finish(sending, { kind: 'conflicted', reason: 'KV_CONFLICT', serverSnapshot: { value: 'remote', version: 9 } });
    firstConnection.close();
    expect(await second.list(accountId)).toEqual([expect.objectContaining({ value: 'local', status: 'conflicted', serverSnapshot: { value: 'remote', version: 9 } })]);
    expect((await second.snapshot(accountId, key)).value).toBe('local');
  });

  it('retains delete intent when the server rejects deletion', async () => {
    await first.write({ accountId, writerId: 'writer-a', intent: { type: 'delete', key }, expectedRevision: 0, baseVersion: 0 });
    const sending = await claim();
    await first.finish(sending, { kind: 'conflicted', reason: 'KV_CONFLICT', serverSnapshot: { value: 'remote', version: 3 } });
    expect((await second.list(accountId))[0]).toMatchObject({ type: 'delete', status: 'conflicted' });
    expect((await second.snapshot(accountId, key)).value).toBeNull();
  });

  it('keeps permanent errors as failed and prevents a dependent operation skipping them', async () => {
    const initial = await write();
    const sending = await claim();
    await write('child', { expectedRevision: 1, parentOpId: initial.opId });
    await first.finish(sending, { kind: 'failed', reason: 'FORBIDDEN_KEYSPACE' });
    expect((await second.list(accountId)).find((op) => op.opId === initial.opId)).toMatchObject({ status: 'failed', reason: 'FORBIDDEN_KEYSPACE', value: 'first' });
    expect(await first.claim({ accountId, sessionEpoch: 'session-a', owner: 'tab-a', nowMs: Date.now(), leaseMs: 1_000 })).toBeNull();
  });

  it('keeps a retry deadline and does not send its child first', async () => {
    const initial = await write();
    const sending = await claim();
    await write('child', { expectedRevision: 1, parentOpId: initial.opId });
    const now = Date.now();
    await first.finish(sending, { kind: 'retry', reason: 'network', nextAttemptAtMs: now + 2_000 }, now);
    expect(await first.claim({ accountId, sessionEpoch: 'session-a', owner: 'tab-a', nowMs: now + 1_999, leaseMs: 1_000 })).toBeNull();
    expect((await claim(second, { nowMs: now + 2_000 })).opId).toBe(initial.opId);
  });

  it('does not acknowledge or send account A after the shared session switches to B', async () => {
    await write();
    const sending = await claim();
    await second.activateSession('account-b', 'session-b');
    expect(await first.finish(sending, { kind: 'acknowledged', version: 1 })).toBe(false);
    expect(await first.claim({ accountId, sessionEpoch: 'session-a', owner: 'tab-a', nowMs: Date.now() + 2_000, leaseMs: 1_000 })).toBeNull();
    expect(await first.list('account-b')).toEqual([]);
    expect((await first.list(accountId))[0].status).toBe('sending');
  });

  it('resumes the same account in a new session and ignores old-session logout and response', async () => {
    await write();
    const old = await claim();
    await second.activateSession(accountId, 'new-session');
    await first.clearSession(accountId, 'session-a');
    expect(await first.finish(old, { kind: 'acknowledged', version: 1 })).toBe(false);
    const renewed = await claim(second, { sessionEpoch: 'new-session', nowMs: Date.now() + 1_000 });
    expect(renewed.accountId).toBe(accountId);
    expect(await second.finish(renewed, { kind: 'acknowledged', version: 1 })).toBe(true);
  });

  it('cannot claim until a confirmed session is activated', async () => {
    await write();
    await first.clearSession(accountId, 'session-a');
    expect(await second.claim({ accountId, sessionEpoch: 'session-a', owner: 'tab-b', nowMs: Date.now(), leaseMs: 1_000 })).toBeNull();
    expect((await second.list(accountId))[0].status).toBe('pending');
  });

  it('rolls back acknowledgement, rebasing and metadata if the final commit fails', async () => {
    const initial = await write();
    const sending = await claim();
    const child = await write('child', { expectedRevision: 1, parentOpId: initial.opId });
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'outbox_meta') throw new DOMException('Injected failure at acknowledgement', 'QuotaExceededError');
      return put.apply(this, args);
    });
    await expect(first.finish(sending, { kind: 'acknowledged', version: 1 })).rejects.toMatchObject({ kind: 'quota' });
    const operations = await second.list(accountId);
    expect(operations.find((op) => op.opId === initial.opId)).toMatchObject({ status: 'sending', attempt: sending.attempt });
    expect(operations.find((op) => op.opId === child.opId)).toMatchObject({ status: 'pending', baseVersion: 0 });
    expect((await second.snapshot(accountId, key)).confirmedVersion).toBe(0);
  });

  it('checks the revision, payload, owner and numeric start time on completion', async () => {
    await write();
    const sending = await claim();
    for (const changed of [
      { ...sending, revision: sending.revision + 1 },
      { ...sending, value: 'different payload' },
      { ...sending, attempt: { ...sending.attempt, owner: 'different-tab' } },
      { ...sending, attempt: { ...sending.attempt, startedAtMs: sending.attempt.startedAtMs + 1 } },
    ]) {
      expect(await first.finish(changed, { kind: 'acknowledged', version: 1 })).toBe(false);
    }
    expect((await second.list(accountId))[0]).toEqual(sending);
  });
});
