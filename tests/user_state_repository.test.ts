import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserStateRepository, userStateStorageKey } from '../storage/userStateRepository';

function createLocalStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, String(value));
    },
  };
}

describe('UserStateRepository', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', createLocalStorage());
    vi.stubGlobal('window', {
      setTimeout: (handler: () => void, delay?: number) => setTimeout(handler, delay) as unknown as number,
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses the existing user-scoped state key format', () => {
    expect(userStateStorageKey('user-1', 'diary')).toBe('fitfocus_data_user-1_diary');
    expect(userStateStorageKey('user-1', 'favorite_recipes')).toBe('fitfocus_data_user-1_favorite_recipes');
  });

  it('persists JSON through the cloud-mirrored storage layer', async () => {
    const repository = new UserStateRepository('user-1');
    repository.writeJson('diary', [{
      id: 'meal-1',
      name: 'Овсянка',
      calories: 350,
      protein: 12,
      fat: 8,
      carbs: 54,
      timestamp: '2026-10-06T08:00:00.000Z',
    }]);

    expect(localStorage.getItem('fitfocus_data_user-1_diary')).toContain('"id":"meal-1"');
    await vi.advanceTimersByTimeAsync(400);
    expect(fetch).toHaveBeenCalledWith('/api/state', expect.objectContaining({ method: 'PUT' }));
  });

  it('returns a fallback when stored JSON does not match the requested shape', () => {
    localStorage.setItem('fitfocus_data_user-1_settings', '{"theme":42}');
    const repository = new UserStateRepository('user-1');

    const settings = repository.readJson('settings', { theme: 'dark' }, (value): value is { theme: string } =>
      !!value && typeof value === 'object' && typeof (value as { theme?: unknown }).theme === 'string',
    );

    expect(settings).toEqual({ theme: 'dark' });
  });
});
