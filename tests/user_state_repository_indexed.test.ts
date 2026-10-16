import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readIndexedUserStateRaw } from '../storage/indexedUserState';
import { UserStateRepository } from '../storage/userStateRepository';

function createLocalStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

describe('UserStateRepository IndexedDB path', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorage());
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('writes volume data to IndexedDB while retaining the existing cloud synchronization contract', async () => {
    const repository = new UserStateRepository('indexed-repository-user');
    const diary = [{
      id: 'meal-1', name: 'Овсянка', calories: 350, protein: 12, fat: 8, carbs: 54,
      timestamp: '2026-10-07T08:00:00.000Z',
    }];

    repository.writeJson('diary', diary);

    const restored = await repository.readJsonAsync('diary', [], Array.isArray);
    expect(restored).toEqual(diary);
    expect(localStorage.getItem('fitfocus_data_indexed-repository-user_diary')).toBeNull();
    expect(await readIndexedUserStateRaw('fitfocus_data_indexed-repository-user_diary')).toContain('meal-1');

    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(fetch).toHaveBeenCalledWith('/api/state', expect.objectContaining({ method: 'PUT' }));
  });

  it('removes the IndexedDB value and queues its cloud deletion', async () => {
    const repository = new UserStateRepository('indexed-remove-user');
    repository.writeJson('weekly_reports', []);
    await repository.readJsonAsync('weekly_reports', [], Array.isArray);

    repository.remove('weekly_reports');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(await readIndexedUserStateRaw('fitfocus_data_indexed-remove-user_weekly_reports')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/state?key=fitfocus_data_indexed-remove-user_weekly_reports'), expect.objectContaining({ method: 'DELETE' }));
  });
  it('keeps a pending IndexedDB write from reviving a removed cloud value', async () => {
    const repository = new UserStateRepository('indexed-race-user');
    repository.writeJson('diary', [{
      id: 'meal-race', name: 'Суп', calories: 120, protein: 6, fat: 4, carbs: 14,
      timestamp: '2026-10-08T08:00:00.000Z',
    }]);
    repository.remove('diary');

    await new Promise((resolve) => setTimeout(resolve, 450));
    const calls = (fetch as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls;
    expect(calls.some(([url, init]) => url === '/api/state' && init.method === 'PUT')).toBe(false);
    expect(calls.some(([url, init]) => url.includes('fitfocus_data_indexed-race-user_diary') && init.method === 'DELETE')).toBe(true);
  });

  it('keeps only the newest IndexedDB value in the cloud queue', async () => {
    const repository = new UserStateRepository('indexed-latest-user');
    repository.writeJson('diary', [{
      id: 'meal-old', name: 'Старое', calories: 100, protein: 1, fat: 1, carbs: 1,
      timestamp: '2026-10-08T08:00:00.000Z',
    }]);
    repository.writeJson('diary', [{
      id: 'meal-new', name: 'Новое', calories: 200, protein: 2, fat: 2, carbs: 2,
      timestamp: '2026-10-08T09:00:00.000Z',
    }]);

    await new Promise((resolve) => setTimeout(resolve, 450));
    const calls = (fetch as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls;
    const putBodies = calls
      .filter(([url, init]) => url === '/api/state' && init.method === 'PUT')
      .map(([, init]) => String(init.body));
    expect(putBodies).toHaveLength(1);
    expect(putBodies[0]).toContain('meal-new');
    expect(putBodies[0]).not.toContain('meal-old');
  });
});
