import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeRemoveItem, safeSetItem, shouldMirrorKey } from '../storage/hybrid';

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

describe('hybrid storage remote mirror policy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', createLocalStorage());
    vi.stubGlobal('window', {
      setTimeout: (handler: () => void, delay?: number) => setTimeout(handler, delay) as unknown as number,
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps legacy all-users snapshots local only', () => {
    expect(shouldMirrorKey('fitfocus_data_user-1_food:1')).toBe(true);
    expect(shouldMirrorKey('fitfocus_data_user-1_all_users')).toBe(false);
    expect(shouldMirrorKey('fitfocus_data_user-1_all_users__ffv')).toBe(false);
  });

  it('sends only the latest operation for a key', async () => {
    const key = 'fitfocus_data_user-1_food:1';
    safeSetItem(key, 'saved');
    safeRemoveItem(key);

    await vi.advanceTimersByTimeAsync(400);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(`/api/state?key=${encodeURIComponent(key)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
  });
});
