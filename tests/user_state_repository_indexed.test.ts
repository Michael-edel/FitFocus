import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DurableOutbox } from '../storage/durableOutbox';
import { StateDatabase, userStateDatabase } from '../storage/stateDatabase';
import { readIndexedUserStateRaw, removeIndexedUserStateRaw, writeIndexedUserStateRaw } from '../storage/indexedUserState';
import { UserStateRepository } from '../storage/userStateRepository';
import { getStateSaveIssues } from '../storage/stateSaveStatus';

function localStore(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(), getItem: (k) => values.get(k) ?? null,
    key: (i) => [...values.keys()][i] ?? null, removeItem: (k) => { values.delete(k); }, setItem: (k, v) => { values.set(k, String(v)); } };
}
let factory: IDBFactory;
let connection: StateDatabase;
let outbox: DurableOutbox;
let repository: UserStateRepository;
const accountId = 'repository-account';
const key = `fitfocus_data_${accountId}_diary`;
const diary = (id: string) => [{ id, name: 'Суп', calories: 100, protein: 2, fat: 3, carbs: 4, timestamp: '2026-10-09T08:00:00Z' }];

beforeEach(() => {
  userStateDatabase.close();
  factory = new IDBFactory();
  vi.stubGlobal('indexedDB', factory);
  vi.stubGlobal('localStorage', localStore());
  vi.stubGlobal('fetch', vi.fn());
  connection = new StateDatabase({ factory });
  outbox = new DurableOutbox(connection);
  repository = new UserStateRepository(accountId, { outbox, writerId: 'writer-a' });
});
afterEach(() => { connection.close(); userStateDatabase.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('runtime repository and durable intent', () => {
  it('commits values and outgoing intent together and survives a fresh repository', async () => {
    const operation = await repository.writeJson('diary', diary('meal-1'));
    expect(operation).toMatchObject({ status: 'pending', accountId, type: 'put' });
    expect(await new UserStateRepository(accountId, { outbox }).readJsonAsync('diary', [], Array.isArray)).toEqual(diary('meal-1'));
    expect(await outbox.list(accountId)).toEqual([operation]);
    expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem('fitfocus.remote-kv-outbox.v1')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retains the write/delete causal chain and never revives stale localStorage', async () => {
    const first = repository.writeJson('diary', diary('meal-1'));
    const deletion = repository.remove('diary');
    expect(await deletion).toMatchObject({ type: 'delete', status: 'pending', parentOpId: (await first).opId });
    localStorage.setItem(key, JSON.stringify(diary('stale')));
    expect(await repository.readJsonAsync('diary', [], Array.isArray)).toEqual([]);
    expect(await outbox.list(accountId)).toHaveLength(2);
    expect(await readIndexedUserStateRaw(key)).toBeNull();
  });

  it('keeps consecutive editor snapshots in order without dropping the earlier intent', async () => {
    const first = repository.writeJson('diary', diary('old'));
    const second = repository.writeJson('diary', diary('new'));
    expect(await second).toMatchObject({ parentOpId: (await first).opId, status: 'pending' });
    expect(await repository.readJsonAsync('diary', [], Array.isArray)).toEqual(diary('new'));
    expect(await outbox.list(accountId)).toHaveLength(2);
  });

  it('retains a stale independent editor as a conflict instead of adopting a fresh revision', async () => {
    const second = new UserStateRepository(accountId, { outbox, writerId: 'writer-b' });
    await Promise.all([repository.readJsonAsync('diary', [], Array.isArray), second.readJsonAsync('diary', [], Array.isArray)]);
    await repository.writeJson('diary', diary('winner'));
    expect(await second.writeJson('diary', diary('loser'))).toMatchObject({ status: 'conflicted', reason: 'local-revision-conflict' });
    expect((await outbox.snapshot(accountId, key)).value).toContain('winner');
    expect((await outbox.list(accountId)).find((op) => op.status === 'conflicted')).toMatchObject({ value: JSON.stringify(diary('loser')) });
  });

  it('rolls back value and intent on quota failure, reports it, and permits retry', async () => {
    const add = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>) {
      if (this.name === 'outbox') throw new DOMException('Injected fault', 'QuotaExceededError');
      return add.apply(this, args);
    });
    await expect(repository.writeJson('diary', diary('lost'))).rejects.toMatchObject({ kind: 'quota' });
    expect(await outbox.snapshot(accountId, key)).toMatchObject({ value: null, revision: 0 });
    expect(await outbox.list(accountId)).toEqual([]);
    expect(localStorage.getItem(key)).toBeNull();
    expect(getStateSaveIssues()).toContainEqual(expect.objectContaining({ accountId, key, kind: 'error' }));
    vi.restoreAllMocks();
    expect(await repository.writeJson('diary', diary('retry'))).toMatchObject({ status: 'pending' });
    expect(getStateSaveIssues().some((issue) => issue.accountId === accountId && issue.key === key && issue.kind === 'error')).toBe(false);
  });

  it('continues the exact same writer after its parent was acknowledged', async () => {
    await repository.writeJson('diary', diary('first'));
    await outbox.activateSession(accountId, 'session-a');
    const claim = await outbox.claim({ accountId, sessionEpoch: 'session-a', owner: 'tab-a', nowMs: Date.now(), leaseMs: 1000 });
    expect(claim).not.toBeNull();
    await outbox.finish(claim!, { kind: 'acknowledged', version: 1 });
    expect(await repository.writeJson('diary', diary('second'))).toMatchObject({ status: 'pending', baseVersion: 1 });
  });

  it('persists settings in the same transaction and reloads them asynchronously', async () => {
    const settings = { theme: 'light', language: 'ru', soundEnabled: true, musicEnabled: false } as const;
    await repository.writeJson('settings', settings);
    expect(await new UserStateRepository(accountId, { outbox }).readJsonAsync('settings', null, (v): v is typeof settings => !!v)).toEqual(settings);
    expect((await outbox.list(accountId))[0]).toMatchObject({ key: `fitfocus_data_${accountId}_settings`, type: 'put' });
  });

  it('rejects old raw writers and remote hydration while local intent is pending', async () => {
    await repository.writeJson('diary', diary('local'));
    expect(await writeIndexedUserStateRaw(key, 'remote')).toBe(false);
    expect(await removeIndexedUserStateRaw(key)).toBe(false);
    expect(await repository.hydrate('diary', { value: 'remote', version: 2, exists: true }, 1)).toBe(false);
    expect(await repository.readJsonAsync('diary', [], Array.isArray)).toEqual(diary('local'));
  });

  it('imports a clean remote generation and protects it against a late hydration', async () => {
    const revision = (await repository.observe('diary')).revision;
    expect(await repository.hydrate('diary', { value: JSON.stringify(diary('remote')), version: 4, exists: true }, revision)).toBe(true);
    await repository.readJsonAsync('diary', [], Array.isArray);
    expect(await repository.writeJson('diary', diary('local'))).toMatchObject({ status: 'pending', baseVersion: 4 });
    expect(await repository.hydrate('diary', { value: 'late', version: 5, exists: true }, revision)).toBe(false);
  });
});
