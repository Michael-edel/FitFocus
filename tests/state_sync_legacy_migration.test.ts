import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DurableOutbox } from '../storage/durableOutbox';
import { LegacyQueueMigration } from '../storage/legacyMigration';
import { LEGACY_QUEUE_SOURCE_KEY } from '../storage/legacyQueue';
import { StateDatabase } from '../storage/stateDatabase';
import { StateSync } from '../storage/stateSync';
import type { LegacyWriterFenceProof } from '../storage/legacyWriterFence';

const accountId = 'authenticated-account';
const ownKey = `fitfocus_data_${accountId}_settings`;
const otherKey = 'fitfocus_data_other-account_settings';
const legacySourceValue = JSON.stringify([
  { type: 'put', key: ownKey, value: '{"theme":"dark"}' },
  { type: 'put', key: otherKey, value: '{"theme":"light"}' },
]);
const proof = (sessionId = 'b'.repeat(64)) => ({ user: { sub: accountId }, hasAccess: true,
  stateSync: { protocol: 2, guard: 1, accountId, sessionId } });
const writerFence = (): LegacyWriterFenceProof => ({
  buildId: 'build-123', checkedAtMs: Date.now(), challengeId: crypto.randomUUID(), clientIds: ['tab-a'],
});
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
let db: StateDatabase;
let outbox: DurableOutbox;
let source: { getItem(key: string): string | null };
let migration: LegacyQueueMigration;
let sync: StateSync;

beforeEach(() => {
  const factory = new IDBFactory();
  db = new StateDatabase({ factory });
  outbox = new DurableOutbox(db);
  source = { getItem: vi.fn((key: string) => key === LEGACY_QUEUE_SOURCE_KEY ? legacySourceValue : null) };
  migration = new LegacyQueueMigration(source, db);
});
afterEach(() => { sync?.stop(); db.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('imports only records owned by the freshly authenticated account and preserves other owners in quarantine', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => json(proof()));
  sync = new StateSync({ outbox, fetchImpl, legacyRuntime: true, legacySource: source, legacyMigration: migration,
    verifyLegacyWritersStopped: async () => writerFence() });
  expect(await sync.connect(accountId)).toBe(true);
  expect(await migration.progress()).toMatchObject({ status: 'partial', writersStopped: true, sendAllowed: true, importedRecords: 1, unresolvedRecords: 2 });
  expect(await outbox.list(accountId)).toMatchObject([{ key: ownKey, value: '{"theme":"dark"}', status: 'conflicted',
    reason: 'legacy-server-generation-unproven', baseVersion: 0 }]);
  expect(await outbox.list('other-account')).toEqual([]);
  expect(await migration.unknown()).toMatchObject([{ rawRecord: { type: 'put', key: otherKey, value: '{"theme":"light"}' }, reason: 'unknown-owner' }]);
  const active = (await outbox.sessionState()).active!;
  expect(await outbox.claim({ accountId, sessionEpoch: active.sessionEpoch, owner: 'test-sender', nowMs: Date.now(), leaseMs: 30_000 }))
    .toBeNull();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(source.getItem(LEGACY_QUEUE_SOURCE_KEY)).toBe(legacySourceValue);
});

it('retains a value-only write from an open legacy tab as a non-sendable conflict', async () => {
  const eventTarget = new EventTarget();
  vi.stubGlobal('window', eventTarget);
  vi.stubGlobal('navigator', {});
  const fetchImpl = vi.fn<typeof fetch>(async (input) => String(input) === '/api/me'
    ? json(proof())
    : new Response(JSON.stringify({ error: 'offline' }), { status: 503 }));
  sync = new StateSync({ outbox, fetchImpl, legacyRuntime: true, legacySource: source, legacyMigration: migration,
    verifyLegacyWritersStopped: async () => writerFence() });
  sync.start(accountId);

  await expect.poll(async () => (await migration.progress())?.sendAllowed).toBe(true);
  await expect.poll(async () => (await outbox.list(accountId)).some((operation) => operation.key === ownKey)).toBe(true);
  eventTarget.dispatchEvent(Object.assign(new Event('storage'), {
    key: ownKey,
    newValue: '{"theme":"light"}',
  }));

  await expect.poll(async () => (await outbox.list(accountId)).find((operation) => operation.reason === 'legacy-writer-local-only'))
    .toMatchObject({ type: 'put', key: ownKey, value: '{"theme":"light"}', status: 'conflicted' });
  expect((await outbox.snapshot(accountId, ownKey)).value).toBe('{"theme":"dark"}');
  expect(await outbox.list('other-account')).toEqual([]);
});

it('preserves a legacy local write while source-change re-verification is in flight', async () => {
  const eventTarget = new EventTarget();
  vi.stubGlobal('window', eventTarget);
  vi.stubGlobal('navigator', {});
  let meRequests = 0;
  let releaseSecondRequest!: () => void;
  let markSecondRequestStarted!: () => void;
  const secondRequestGate = new Promise<void>(resolve => { releaseSecondRequest = resolve; });
  const secondRequestStarted = new Promise<void>(resolve => { markSecondRequestStarted = resolve; });
  const fetchImpl = vi.fn<typeof fetch>(async input => {
    if (String(input) === '/api/me') {
      meRequests += 1;
      if (meRequests === 2) {
        markSecondRequestStarted();
        await secondRequestGate;
      }
      return json(proof());
    }
    return new Response(JSON.stringify({ error: 'unexpected-request' }), { status: 500 });
  });
  sync = new StateSync({ outbox, fetchImpl, legacyRuntime: true, legacySource: source, legacyMigration: migration,
    verifyLegacyWritersStopped: async () => writerFence() });
  sync.start(accountId);

  await expect.poll(async () => (await migration.progress())?.sendAllowed).toBe(true);
  await expect.poll(async () => (await outbox.list(accountId)).some(operation => operation.key === ownKey)).toBe(true);

  // The legacy queue retry event starts /api/me re-verification. Its current
  // implementation temporarily clears the in-memory session while the request waits.
  eventTarget.dispatchEvent(Object.assign(new Event('storage'), {
    key: LEGACY_QUEUE_SOURCE_KEY,
    oldValue: legacySourceValue,
    newValue: legacySourceValue,
  }));
  await secondRequestStarted;

  try {
    eventTarget.dispatchEvent(Object.assign(new Event('storage'), {
      key: ownKey,
      oldValue: '{"theme":"dark"}',
      newValue: '{"theme":"light"}',
    }));
    await expect.poll(async () => (await outbox.list(accountId)).find(operation =>
      operation.key === ownKey && operation.writerId === 'legacy-local-storage' && operation.type === 'put'))
      .toMatchObject({ key: ownKey, value: '{"theme":"light"}', status: 'conflicted', reason: 'legacy-writer-local-only' });
  } finally {
    releaseSecondRequest();
  }

  await expect.poll(async () => (await migration.progress())?.sendAllowed).toBe(true);
  expect((await outbox.snapshot(accountId, ownKey)).value).toBe('{"theme":"dark"}');
  expect(await outbox.list('other-account')).toEqual([]);
  expect(fetchImpl.mock.calls.filter(([input]) => String(input) !== '/api/me')).toEqual([]);
});

it('retains a legacy localStorage removal as a non-sendable delete conflict when the old queue is auth-blocked', async () => {
  const eventTarget = new EventTarget();
  vi.stubGlobal('window', eventTarget);
  vi.stubGlobal('navigator', {});
  const fetchImpl = vi.fn<typeof fetch>(async () => json(proof()));
  sync = new StateSync({ outbox, fetchImpl, legacyRuntime: true, legacySource: source, legacyMigration: migration,
    verifyLegacyWritersStopped: async () => writerFence() });
  sync.start(accountId);

  await expect.poll(async () => (await migration.progress())?.sendAllowed).toBe(true);
  await expect.poll(async () => (await outbox.list(accountId)).some((operation) => operation.key === ownKey)).toBe(true);
  eventTarget.dispatchEvent(Object.assign(new Event('storage'), {
    key: ownKey,
    oldValue: '{"theme":"dark"}',
    newValue: null,
  }));

  await expect.poll(async () => (await outbox.list(accountId)).find((operation) =>
    operation.key === ownKey && operation.writerId === 'legacy-local-storage' && operation.type === 'delete'))
    .toMatchObject({ key: ownKey, type: 'delete', status: 'conflicted', reason: 'legacy-writer-local-only' });
  expect((await outbox.snapshot(accountId, ownKey)).value).toBe('{"theme":"dark"}');
  expect(await outbox.list('other-account')).toEqual([]);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it('does not duplicate a legacy delete already recorded in the migration source', async () => {
  const eventTarget = new EventTarget();
  vi.stubGlobal('window', eventTarget);
  vi.stubGlobal('navigator', {});
  const sourceValue = JSON.stringify([{ type: 'delete', key: ownKey, baseVersion: 1 }]);
  source = { getItem: vi.fn((key: string) => key === LEGACY_QUEUE_SOURCE_KEY ? sourceValue : null) };
  migration = new LegacyQueueMigration(source, db);
  const fetchImpl = vi.fn<typeof fetch>(async () => json(proof()));
  sync = new StateSync({ outbox, fetchImpl, legacyRuntime: true, legacySource: source, legacyMigration: migration,
    verifyLegacyWritersStopped: async () => writerFence() });
  sync.start(accountId);

  await expect.poll(async () => (await outbox.list(accountId)).filter((operation) =>
    operation.key === ownKey && operation.type === 'delete')).toHaveLength(1);
  eventTarget.dispatchEvent(Object.assign(new Event('storage'), {
    key: ownKey,
    oldValue: '{"theme":"dark"}',
    newValue: null,
  }));
  await sync.syncNow(accountId);

  const deletes = (await outbox.list(accountId)).filter((operation) => operation.key === ownKey && operation.type === 'delete');
  expect(deletes).toHaveLength(1);
  expect(deletes[0].writerId).toMatch(/^legacy:/);
  expect(deletes[0]).toMatchObject({ status: 'conflicted', reason: 'legacy-server-generation-unproven' });
});

it('preserves a newer removal when the legacy source still contains an older delete', async () => {
  const eventTarget = new EventTarget();
  vi.stubGlobal('window', eventTarget);
  vi.stubGlobal('navigator', {});
  const sourceValue = JSON.stringify([{ type: 'delete', key: ownKey, baseVersion: 1 }]);
  source = { getItem: vi.fn((key: string) => key === LEGACY_QUEUE_SOURCE_KEY ? sourceValue : null) };
  migration = new LegacyQueueMigration(source, db);
  const fetchImpl = vi.fn<typeof fetch>(async () => json(proof()));
  sync = new StateSync({ outbox, fetchImpl, legacyRuntime: true, legacySource: source, legacyMigration: migration,
    verifyLegacyWritersStopped: async () => writerFence() });
  sync.start(accountId);

  await expect.poll(async () => (await outbox.list(accountId)).filter((operation) =>
    operation.key === ownKey && operation.type === 'delete')).toHaveLength(1);
  eventTarget.dispatchEvent(Object.assign(new Event('storage'), {
    key: ownKey,
    oldValue: null,
    newValue: '{"theme":"light"}',
  }));
  await expect.poll(async () => (await outbox.list(accountId)).filter((operation) =>
    operation.key === ownKey && operation.writerId === 'legacy-local-storage' && operation.type === 'put')).toHaveLength(1);

  eventTarget.dispatchEvent(Object.assign(new Event('storage'), {
    key: ownKey,
    oldValue: '{"theme":"light"}',
    newValue: null,
  }));
  await expect.poll(async () => {
    const latest = (await outbox.list(accountId)).filter((operation) => operation.key === ownKey)
      .sort((left, right) => right.revision - left.revision)[0];
    return latest;
  }).toMatchObject({ type: 'delete', writerId: 'legacy-local-storage', status: 'conflicted', reason: 'legacy-writer-local-only' });
});

it('imports durably but cannot claim or send when the service-worker writer fence is unavailable', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => json(proof()));
  sync = new StateSync({ outbox, fetchImpl, legacyRuntime: true, legacySource: source, legacyMigration: migration,
    verifyLegacyWritersStopped: async () => null });
  expect(await sync.connect(accountId)).toBe(true);
  expect(await migration.progress()).toMatchObject({ status: 'partial', writersStopped: false, sendAllowed: false });
  expect(await outbox.list(accountId)).toHaveLength(1);
  expect(await outbox.claim({ accountId, sessionEpoch: (await outbox.sessionState()).active!.sessionEpoch,
    owner: 'test-sender', nowMs: Date.now(), leaseMs: 30_000 })).toBeNull();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it('retries a missed writer fence during polling without waiting for another browser event', async () => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { onLine: true });
  const fetchImpl = vi.fn<typeof fetch>(async () => json(proof()));
  const verifyLegacyWritersStopped = vi.fn<() => Promise<LegacyWriterFenceProof | null>>()
    .mockResolvedValueOnce(null)
    .mockResolvedValue(writerFence());
  sync = new StateSync({ outbox, fetchImpl, legacyRuntime: true, legacySource: source, legacyMigration: migration,
    verifyLegacyWritersStopped });
  sync.start(accountId);

  await expect.poll(async () => (await migration.progress())?.sendAllowed, { timeout: 5_000 }).toBe(true);
  expect(verifyLegacyWritersStopped).toHaveBeenCalledTimes(2);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

it('rechecks the read guard when another tab changes the session during migration', async () => {
  const fetchImpl = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(json(proof()))
    .mockResolvedValueOnce(json(proof('c'.repeat(64))));
  let replacedSession = false;
  sync = new StateSync({ outbox, fetchImpl, legacyRuntime: true, legacySource: source, legacyMigration: migration,
    verifyLegacyWritersStopped: async () => {
      if (!replacedSession) {
        replacedSession = true;
        const current = await outbox.sessionState();
        await outbox.acceptReadSession(accountId, 'c'.repeat(64), current.fence);
      }
      return writerFence();
    } });

  expect(await sync.connect(accountId)).toBe(true);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect((await outbox.sessionState()).active?.serverSessionId).toBe('c'.repeat(64));
  expect(await migration.progress()).toMatchObject({ status: 'partial', sendAllowed: true, importedRecords: 1 });
});

it('coalesces overlapping verification requests for one page and generation', async () => {
  source = { getItem: () => null };
  migration = new LegacyQueueMigration(source, db);
  let releaseFetch!: (response: Response) => void;
  const pendingResponse = new Promise<Response>(resolve => { releaseFetch = resolve; });
  const fetchImpl = vi.fn<typeof fetch>(() => pendingResponse);
  sync = new StateSync({ outbox, fetchImpl, legacyRuntime: true, legacySource: source, legacyMigration: migration,
    verifyLegacyWritersStopped: async () => writerFence() });

  const connecting = sync.connect(accountId);
  const synchronizing = sync.syncNow(accountId);
  releaseFetch(json(proof()));

  expect(await connecting).toBe(true);
  expect(await synchronizing).toBe(true);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it('holds the sender until runtime migration and the all-client fence finish', async () => {
  let releaseFence!: (value: LegacyWriterFenceProof) => void;
  let signalFenceCheck!: () => void;
  const fenceCheckStarted = new Promise<void>(resolve => { signalFenceCheck = resolve; });
  const pendingFence = new Promise<LegacyWriterFenceProof>(resolve => { releaseFence = resolve; });
  const writes: string[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (input) => {
    if (String(input) === '/api/me') return json(proof());
    writes.push(String(input));
    return new Response(JSON.stringify({ error: 'offline' }), { status: 503 });
  });
  sync = new StateSync({ outbox, fetchImpl, legacyRuntime: true, legacySource: source, legacyMigration: migration,
    verifyLegacyWritersStopped: async () => { signalFenceCheck(); return pendingFence; } });

  const connecting = sync.connect(accountId);
  await fenceCheckStarted;
  expect(await outbox.list(accountId)).toHaveLength(1);
  const flush = sync.flush();
  expect((await outbox.sessionState()).active?.pause).toBeUndefined();

  releaseFence(writerFence());
  await connecting;
  await flush;
  expect(writes).toEqual([]);
  expect(await outbox.list(accountId)).toMatchObject([{ status: 'conflicted', reason: 'legacy-server-generation-unproven' }]);
  expect((await outbox.sessionState()).active?.pause).toBeUndefined();
  expect(await migration.progress()).toMatchObject({ status: 'partial', sendAllowed: true });
});

it('returns a storage error instead of treating the legacy source as empty', async () => {
  const unavailable = { getItem: () => { throw new Error('blocked storage'); } };
  migration = new LegacyQueueMigration(unavailable, db);
  sync = new StateSync({ outbox, fetchImpl: async () => json(proof()), legacyRuntime: true, legacySource: unavailable,
    legacyMigration: migration, verifyLegacyWritersStopped: async () => writerFence() });
  expect(await sync.connect(accountId)).toBe(true);
  expect(await migration.progress()).toBeNull();
});
