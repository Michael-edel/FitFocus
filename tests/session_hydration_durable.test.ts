import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hydrateSessionFromCloud } from '../sessionHydration';
import { UserStateRepository } from '../storage/userStateRepository';
import { DurableOutbox } from '../storage/durableOutbox';
import { userStateDatabase } from '../storage/stateDatabase';
import type { UserProfile } from '../types';

vi.mock('../coach', () => ({ createTask: async (user: unknown) => user }));
const user = { id: 'hydration-account', name: 'Тест' } as UserProfile;
const key = `fitfocus_data_${user.id}_diary`;
const meal = (id: string) => [{ id, name: 'Суп', calories: 100, protein: 2, fat: 3, carbs: 4, timestamp: '2026-10-09T08:00:00Z' }];
const response = (items: unknown, protocol = '2') => new Response(JSON.stringify({ items }), {
  headers: protocol ? { 'X-FitFocus-State-Protocol': protocol } : {},
});
const remote = (id: string) => ({ key, value: JSON.stringify(meal(id)), version: 4, exists: true });
const hydrate = (fetchImpl: typeof fetch) => hydrateSessionFromCloud(user, { fetchImpl, initialHabits: [], resetUsageIfNewTime: (u) => u });
beforeEach(() => {
  userStateDatabase.close();
  vi.stubGlobal('indexedDB', new IDBFactory());
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { get length() { return values.size; }, clear: () => values.clear(),
    getItem: (k: string) => values.get(k) ?? null, key: (i: number) => [...values.keys()][i] ?? null,
    setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } });
});
afterEach(() => { userStateDatabase.close(); vi.unstubAllGlobals(); });

describe('cloud hydration with the runtime durable repository', () => {
  it('loads a clean protocol-2 snapshot and hands its actual editor revision to the app', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => response(String(url).includes('fitfocus_data_') ? [remote('cloud')] : []));
    const hydrated = await hydrate(fetchImpl);
    expect(hydrated.foodDiary).toEqual(meal('cloud'));
    expect(fetchImpl.mock.calls[0][0]).toContain('includeDeleted=1');
    expect(await hydrated.repository!.writeJson('diary', meal('local'))).toMatchObject({ status: 'pending', baseVersion: 4 });
  });

  it('does not overwrite a pending local snapshot with a bootstrap/cloud value', async () => {
    await new UserStateRepository(user.id).writeJson('diary', meal('local'));
    const hydrated = await hydrate(async (url) => response(String(url).includes('fitfocus_data_') ? [remote('cloud')] : []));
    expect(hydrated.foodDiary).toEqual(meal('local'));
    expect(await new DurableOutbox().list(user.id)).toHaveLength(1);
  });

  it('keeps pending deletion and its revision while cloud still returns the old live value', async () => {
    const repository = new UserStateRepository(user.id);
    await repository.writeJson('diary', meal('old'));
    await repository.remove('diary');
    const hydrated = await hydrate(async (url) => response(String(url).includes('fitfocus_data_') ? [remote('cloud')] : []));
    expect(hydrated.foodDiary).toEqual([]);
    expect((await new DurableOutbox().list(user.id)).find((op) => op.type === 'delete')).toMatchObject({ type: 'delete', status: 'pending' });
  });

  it('reads a tombstone generation and recreates by that version', async () => {
    const hydrated = await hydrate(async (url) => response(String(url).includes('fitfocus_data_') ? [{ key, value: '', version: 5, exists: false }] : []));
    expect(hydrated.foodDiary).toEqual([]);
    expect(await hydrated.repository!.writeJson('diary', meal('recreated'))).toMatchObject({ baseVersion: 5, status: 'pending' });
  });

  it('requires valid protocol-2 items before treating missing keys as absent', async () => {
    const hydrated = await hydrate(async () => response(null));
    expect(hydrated.foodDiary).toEqual([]);
    expect(await new DurableOutbox().snapshot(user.id, key)).toMatchObject({ revision: 0, confirmedVersion: 0 });
  });

  it('does not trust an old server or replace legacy local content', async () => {
    localStorage.setItem(key, JSON.stringify(meal('legacy')));
    const source = JSON.stringify([{ type: 'put', key, value: JSON.stringify(meal('legacy')) }]);
    localStorage.setItem('fitfocus.remote-kv-outbox.v1', source);
    const hydrated = await hydrate(async (url) => response(String(url).includes('fitfocus_data_') ? [remote('cloud')] : [], ''));
    expect(hydrated.foodDiary).toEqual(meal('legacy'));
    expect(localStorage.getItem('fitfocus.remote-kv-outbox.v1')).toBe(source);
    expect(await new DurableOutbox().snapshot(user.id, key)).toMatchObject({ revision: 0 });
  });

  it('keeps a write that committed after the cloud request started', async () => {
    let release!: (r: Response) => void;
    let began!: () => void;
    const started = new Promise<void>((resolve) => { began = resolve; });
    const pending = hydrate(async (url) => {
      if (!String(url).includes('fitfocus_data_')) return response([]);
      began();
      return new Promise<Response>((resolve) => { release = resolve; });
    });
    await started;
    const editor = new UserStateRepository(user.id);
    await editor.readJsonAsync('diary', [], Array.isArray);
    await editor.writeJson('diary', meal('during-request'));
    release(response([remote('stale')]));
    expect((await pending).foodDiary).toEqual(meal('during-request'));
  });
});
