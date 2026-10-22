import { afterEach, describe, expect, it, vi } from 'vitest';
import { appUiStorageKeys, clearAppUiStorage } from '../features/profile/clearUiState';

describe('profile UI state cleanup', () => {
  it('keeps cleanup keys scoped to one profile', () => {
    const keys = appUiStorageKeys('user-1');
    expect(keys).toHaveLength(12);
    expect(keys.every((key) => key.endsWith(':user-1'))).toBe(true);
  });

  it('clears the selected diary day only for the requested profile', () => {
    const values = new Map<string, string>([
      ['fitfocus.nutrition.selected-day.v1:user-1', '2026-10-16'],
      ['fitfocus.nutrition.selected-day.v1:user-2', '2026-10-15'],
      ['fitfocus_data_user-1_profile', '{"name":"Profile"}'],
    ]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });

    clearAppUiStorage('user-1');

    expect(values.has('fitfocus.nutrition.selected-day.v1:user-1')).toBe(false);
    expect(values.get('fitfocus.nutrition.selected-day.v1:user-2')).toBe('2026-10-15');
    expect(values.get('fitfocus_data_user-1_profile')).toBe('{"name":"Profile"}');
  });

  it('does not require browser storage when no profile is active', () => {
    expect(() => clearAppUiStorage(null)).not.toThrow();
  });
});

afterEach(() => vi.unstubAllGlobals());
