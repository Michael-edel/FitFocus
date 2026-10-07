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
});
