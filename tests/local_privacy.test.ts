import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearLocalUserData } from '../storage/hybrid';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

describe('clearLocalUserData', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('removes all user-scoped data and version metadata without touching another account', () => {
    const storage = new MemoryStorage();
    storage.setItem('fitfocus_data_user-1_diary', 'private diary');
    storage.setItem('fitfocus_data_user-1_diary__ffv', '4');
    storage.setItem('fitfocus.nutrition.selected-day.v1:user-1', '2026-08-29');
    storage.setItem('fitfocus.nutrition.selected-day.v1:user-1__ffv', '2');
    storage.setItem('fitfocus.achievements.counters.v1:user-1', '{"x":1}');
    storage.setItem('ff_last_weekly_ai_attempt_user-1', '123');
    storage.setItem('fitfocus_data_user-2_diary', 'keep this');
    storage.setItem('fitfocus.nutrition.selected-day.v1:user-2', 'keep this too');

    vi.stubGlobal('localStorage', storage);

    expect(clearLocalUserData('user-1')).toBe(6);
    expect(storage.getItem('fitfocus_data_user-1_diary')).toBeNull();
    expect(storage.getItem('fitfocus_data_user-1_diary__ffv')).toBeNull();
    expect(storage.getItem('fitfocus.nutrition.selected-day.v1:user-1')).toBeNull();
    expect(storage.getItem('fitfocus.nutrition.selected-day.v1:user-1__ffv')).toBeNull();
    expect(storage.getItem('fitfocus.achievements.counters.v1:user-1')).toBeNull();
    expect(storage.getItem('ff_last_weekly_ai_attempt_user-1')).toBeNull();
    expect(storage.getItem('fitfocus_data_user-2_diary')).toBe('keep this');
    expect(storage.getItem('fitfocus.nutrition.selected-day.v1:user-2')).toBe('keep this too');
  });

  it('does nothing for an empty user id', () => {
    const storage = new MemoryStorage();
    storage.setItem('fitfocus_data_user-1_diary', 'keep');
    vi.stubGlobal('localStorage', storage);

    expect(clearLocalUserData('')).toBe(0);
    expect(storage.getItem('fitfocus_data_user-1_diary')).toBe('keep');
  });
});
