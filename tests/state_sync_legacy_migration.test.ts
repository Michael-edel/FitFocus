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
  expect(await migration.progress()).toMatchObject({ status: 'partial', writersStopped: true, sendAllowed: true, importedRecords: 1, unresolvedRecords: 1 });
  expect(await outbox.list(accountId)).toMatchObject([{ key: ownKey, value: '{"theme":"dark"}', status: 'pending' }]);
  expect(await outbox.list('other-account')).toEqual([]);
  expect(await migration.unknown()).toMatchObject([{ rawRecord: { type: 'put', key: otherKey, value: '{"theme":"light"}' }, reason: 'unknown-owner' }]);
  const active = (await outbox.sessionState()).active!;
  expect(await outbox.claim({ accountId, sessionEpoch: active.sessionEpoch, owner: 'test-sender', nowMs: Date.now(), leaseMs: 30_000 }))
    .toMatchObject({ key: ownKey, value: '{"theme":"dark"}' });
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
  expect(writes).toContain('/api/state');
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
