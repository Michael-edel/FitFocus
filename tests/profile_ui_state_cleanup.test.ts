import { describe, expect, it } from 'vitest';
import { appUiStorageKeys, clearAppUiStorage } from '../features/profile/clearUiState';

describe('profile UI state cleanup', () => {
  it('keeps cleanup keys scoped to one profile', () => {
    const keys = appUiStorageKeys('user-1');
    expect(keys).toHaveLength(11);
    expect(keys.every((key) => key.endsWith(':user-1'))).toBe(true);
  });

  it('does not require browser storage when no profile is active', () => {
    expect(() => clearAppUiStorage(null)).not.toThrow();
  });
});