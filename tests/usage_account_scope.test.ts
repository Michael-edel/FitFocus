import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bumpRecipeUsage, canGenerateRecipe, loadUsage, saveUsage } from '../domain/usage';

const legacyKey = 'fitfocus_usage_counters_v1';
const accountA = 'usage-account-a';
const accountB = 'usage-account-b';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe('account-scoped recipe usage', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('keeps weekly recipe counters isolated by account', () => {
    const aUsage = { ...loadUsage(accountA), recipes: 10 };
    expect(saveUsage(accountA, aUsage)).toBe(true);

    expect(canGenerateRecipe('pro', accountA)).toEqual({ allowed: false, used: 10, limit: 10 });
    expect(canGenerateRecipe('pro', accountB)).toEqual({ allowed: true, used: 0, limit: 10 });
    expect(bumpRecipeUsage(accountB).recipes).toBe(1);
    expect(loadUsage(accountA).recipes).toBe(10);
    expect(loadUsage(accountB).recipes).toBe(1);
  });

  it('does not guess an owner for the old shared counter key', () => {
    localStorage.setItem(legacyKey, JSON.stringify({ ...loadUsage(accountA), recipes: 7 }));

    expect(loadUsage(accountA).recipes).toBe(0);
    expect(loadUsage(accountB).recipes).toBe(0);
    expect(localStorage.getItem(legacyKey)).not.toBeNull();
  });

  it('keeps a completed recipe successful when local usage storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('storage unavailable'); },
      setItem: () => { throw new Error('storage unavailable'); },
    });

    expect(() => bumpRecipeUsage(accountA)).not.toThrow();
    expect(bumpRecipeUsage(accountA).recipes).toBe(1);
  });

  it('does not write a counter without an account owner', () => {
    expect(canGenerateRecipe('pro', null)).toEqual({ allowed: true, used: 0, limit: 10 });
    expect(bumpRecipeUsage(null).recipes).toBe(0);
    expect(saveUsage(null, { ...loadUsage(null), recipes: 1 })).toBe(false);
  });
});
