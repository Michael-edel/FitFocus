import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StateEditor, type StateCodec } from '../storage/stateEditor';
import { UserStateRepository, type UserStateKey } from '../storage/userStateRepository';
import { DurableOutbox } from '../storage/durableOutbox';
import { StateDatabase, userStateDatabase } from '../storage/stateDatabase';
import { writeIndexedUserStateRaw } from '../storage/indexedUserState';
const codec: StateCodec<string> = { decode: (raw, fallback) => raw ?? fallback, encode: (v) => v };
let db: StateDatabase; let outbox: DurableOutbox;
const repo = (owner = 'owner') => new UserStateRepository(owner, { outbox });
const editor = (owner = 'owner') => new StateEditor(repo(owner), 'refeed', '', codec);
beforeEach(() => {
  userStateDatabase.close(); const factory = new IDBFactory(); vi.stubGlobal('indexedDB', factory);
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null,
    removeItem: (k: string) => values.delete(k), setItem: (k: string, v: string) => values.set(k, v) });
  db = new StateDatabase({ factory }); outbox = new DurableOutbox(db);
});
afterEach(() => { db.close(); userStateDatabase.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('loads old raw preferences without writing defaults or changing the legacy source', async () => {
  localStorage.setItem('fitfocus_data_owner_refeed', '2026-10-12');
  localStorage.setItem('fitfocus.remote-kv-outbox.v1', '[{"unowned":true}]');
  const state = editor(); await state.load();
  expect(state.getSnapshot()).toEqual({ value: '2026-10-12', phase: 'ready' });
  expect(await outbox.list('owner')).toEqual([]);
  expect(localStorage.getItem('fitfocus.remote-kv-outbox.v1')).toBe('[{"unowned":true}]');
});
it('commits raw values and causal write/delete intents, surviving a new editor', async () => {
  const state = editor(); await state.load();
  const first = await state.set('2026-10-12'); const second = await state.set('2026-10-13');
  expect(second).toMatchObject({ status: 'pending', parentOpId: first!.opId });
  const reloaded = editor(); await reloaded.load(); expect(reloaded.getSnapshot().value).toBe('2026-10-13');
  expect(await writeIndexedUserStateRaw('fitfocus_data_owner_refeed', 'raw overwrite')).toBe(false);
  expect(await state.remove()).toMatchObject({ type: 'delete', status: 'pending', parentOpId: second!.opId });
  localStorage.setItem('fitfocus_data_owner_refeed', 'stale');
  const afterDelete = editor(); await afterDelete.load(); expect(afterDelete.getSnapshot().value).toBe('');
});
it('retains an edit made during loading as conflict and never replaces it with the late read', async () => {
  await outbox.hydrate('owner', 'fitfocus_data_owner_refeed', { value: 'cloud', exists: true, version: 4 }, 0);
  const state = editor(); const reading = state.load(); const writing = state.set('early edit');
  await reading; expect(await writing).toMatchObject({ status: 'conflicted', reason: 'editor-not-loaded', value: 'early edit' });
  expect(state.getSnapshot().value).toBe('early edit');
  expect((await outbox.snapshot('owner', 'fitfocus_data_owner_refeed')).value).toBe('cloud');
  expect(await state.set('continued early edit')).toMatchObject({ status: 'conflicted', reason: 'editor-not-loaded' });
});
it('preserves an independent edit in another tab instead of rebasing it', async () => {
  const a = editor(); const b = editor(); await Promise.all([a.load(), b.load()]);
  await a.set('first'); expect(await b.set('second')).toMatchObject({ status: 'conflicted', value: 'second' });
  expect((await outbox.snapshot('owner', 'fitfocus_data_owner_refeed')).value).toBe('first');
});
it('keeps captured editors bound to their own account across a switch', async () => {
  const a = editor('a'); const b = editor('b'); await Promise.all([a.load(), b.load()]);
  await b.set('B'); await a.set('late A');
  expect((await outbox.list('a'))[0]).toMatchObject({ accountId: 'a', value: 'late A' });
  expect(b.getSnapshot().value).toBe('B'); expect((await outbox.snapshot('b', 'fitfocus_data_b_refeed')).value).toBe('B');
});
it('rolls back a failed delete and leaves the visible history intact', async () => {
  const state = editor(); await state.load(); await state.set('keep');
  vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
  await expect(state.remove()).rejects.toThrow('STATE_STORAGE_QUOTA'); expect(state.getSnapshot().value).toBe('keep');
  expect((await outbox.snapshot('owner', 'fitfocus_data_owner_refeed')).value).toBe('keep');
  expect(await outbox.list('owner')).toHaveLength(1);
});

it('rejects a guarded delete after another account becomes active', async () => {
  const login = await outbox.acceptReadSession('owner', 'a'.repeat(64), 0);
  expect(login).not.toBeNull();
  const state = editor(); await state.load(); await state.set('keep');
  const guard = { readGuard: login!, canCommit: () => true };
  const localGuard = { localCommitGuard: { accountId: login!.accountId,
    serverSessionId: login!.serverSessionId, sessionEpoch: login!.sessionEpoch }, canCommit: () => true };
  const { fence } = await outbox.sessionState();
  await outbox.acceptReadSession('other-account', 'b'.repeat(64), fence);

  await expect(state.remove(guard)).rejects.toMatchObject({
    kind: 'transaction', cause: { message: 'OUTBOX_WRITE_SESSION_CHANGED' },
  });
  await expect(state.remove(localGuard)).rejects.toMatchObject({
    kind: 'transaction', cause: { message: 'OUTBOX_WRITE_SESSION_CHANGED' },
  });
  expect(state.getSnapshot().value).toBe('keep');
  expect((await outbox.snapshot('owner', 'fitfocus_data_owner_refeed')).value).toBe('keep');
  expect((await outbox.list('owner')).map(operation => operation.type)).toEqual(['put']);
});

it('keeps session-bound local edits writable during sender pauses', async () => {
  const login = await outbox.acceptReadSession('owner', 'a'.repeat(64), 0);
  expect(login).not.toBeNull();
  const state = editor(); await state.load(); await state.set('history');
  const now = Date.now();
  const sending = await outbox.claim({ accountId: 'owner', owner: 'tab-a', sessionEpoch: login!.sessionEpoch,
    nowMs: now, leaseMs: 1_000 });
  expect(sending).not.toBeNull();
  await outbox.finish(sending!, { kind: 'retry', reason: 'PROTOCOL', nextAttemptAtMs: now + 10, pause: 'protocol' }, now);

  const deletion = await state.remove({
    localCommitGuard: { accountId: login!.accountId, serverSessionId: login!.serverSessionId, sessionEpoch: login!.sessionEpoch },
    canCommit: () => true,
  });

  expect(deletion).toMatchObject({ type: 'delete', status: 'pending' });
  expect((await outbox.snapshot('owner', 'fitfocus_data_owner_refeed')).value).toBeNull();
  expect((await outbox.sessionState()).active?.pause).toBe('protocol');
  expect(await outbox.claim({ accountId: 'owner', owner: 'tab-a', sessionEpoch: login!.sessionEpoch,
    nowMs: now + 20, leaseMs: 1_000 })).toBeNull();
});

it('does not clear a newer working edit when an earlier delete completes late', async () => {
  const repository = repo();
  const state = new StateEditor(repository, 'refeed', '', codec);
  await state.load(); await state.set('old');
  const remove = repository.remove.bind(repository);
  let release!: () => void;
  let committed = false;
  const delivered = new Promise<void>((resolve) => { release = resolve; });
  vi.spyOn(repository, 'remove').mockImplementation(async (...args) => {
    const operation = await remove(...args);
    committed = true;
    await delivered;
    return operation;
  });
  const deleting = state.remove();
  await vi.waitFor(() => expect(committed).toBe(true));
  await state.set('new edit');
  release(); await deleting;
  expect(state.getSnapshot().value).toBe('new edit');
  expect((await outbox.snapshot('owner', 'fitfocus_data_owner_refeed')).value).toBe('new edit');
  expect((await outbox.list('owner')).sort((a, b) => a.revision - b.revision).map((operation) => operation.type)).toEqual(['put', 'delete', 'put']);
});

it.each<[UserStateKey, string]>([
  ['habits', '[{"id":"habit","completed":true}]'], ['favorites', '[{"name":"meal"}]'],
  ['adapt_read', '1'], ['adapt_expanded', '0'], ['plan_task_done', '{"task":true}'],
  ['council_history', '[{"id":"message","role":"user","text":"question","createdAt":"2026-10-11"}]'],
  ['family_menu_prefs', '{"includeIds":["owner"],"cookingMode":"all_meals","currency":"KZT","budgetPerWeek":"100"}'],
  ['invite_code', 'invite-test'],
])('retains the raw %s format across owned write, reload and delete', async (key, raw) => {
  const fullKey = `fitfocus_data_owner_${key}`;
  localStorage.setItem(fullKey, raw);
  const state = new StateEditor(repo(), key, '', codec); await state.load();
  expect(state.getSnapshot().value).toBe(raw);
  expect(await outbox.list('owner')).toEqual([]);
  expect(await state.set(raw)).toMatchObject({ key: fullKey, type: 'put', value: raw, status: 'pending' });
  const next = new StateEditor(repo(), key, '', codec); await next.load();
  expect(next.getSnapshot().value).toBe(raw);
  expect(await state.remove()).toMatchObject({ type: 'delete', status: 'pending' });
  localStorage.setItem(fullKey, raw);
  const after = new StateEditor(repo(), key, '', codec); await after.load();
  expect(after.getSnapshot().value).toBe('');
});

it('retains a stale delete as conflict without clearing the visible history', async () => {
  localStorage.setItem('fitfocus_data_owner_refeed', 'original');
  const first = editor(); const stale = editor(); await Promise.all([first.load(), stale.load()]);
  await first.set('newer');
  expect(await stale.remove()).toMatchObject({ type: 'delete', status: 'conflicted' });
  expect(stale.getSnapshot().value).toBe('original');
  expect((await outbox.snapshot('owner', 'fitfocus_data_owner_refeed')).value).toBe('newer');
});
