import { describe, expect, it } from 'vitest';
import {
  clearScopedFoodSelection,
  getScopedFoodSelectionIds,
  isFoodSelectionScopeActive,
  toggleScopedFoodSelection,
  type ScopedFoodSelection,
} from '../useFoodSelection';

describe('account-scoped food selection', () => {
  it('hides one account selection from another account and starts the new scope empty', () => {
    const accountA: ScopedFoodSelection = {
      scopeKey: 'account-a:session-1',
      ids: new Set(['food-a']),
    };

    expect([...getScopedFoodSelectionIds(accountA, 'account-a:session-1')]).toEqual(['food-a']);
    expect(getScopedFoodSelectionIds(accountA, 'account-b:session-1').size).toBe(0);

    const accountB = toggleScopedFoodSelection(accountA, 'account-b:session-1', 'food-b');
    expect([...accountB.ids]).toEqual(['food-b']);
    expect(accountB.scopeKey).toBe('account-b:session-1');
    expect([...accountA.ids]).toEqual(['food-a']);
  });

  it('clears selection when the same account enters a new session', () => {
    const oldSession: ScopedFoodSelection = {
      scopeKey: 'account-a:session-1',
      ids: new Set(['food-a']),
    };

    const newSession = toggleScopedFoodSelection(oldSession, 'account-a:session-2', 'food-b');
    expect(newSession.scopeKey).toBe('account-a:session-2');
    expect([...newSession.ids]).toEqual(['food-b']);
    expect(getScopedFoodSelectionIds(newSession, 'account-a:session-1').size).toBe(0);
  });

  it('does not expose or mutate selection while the account session is unavailable', () => {
    const accountA: ScopedFoodSelection = {
      scopeKey: 'account-a:session-1',
      ids: new Set(['food-a']),
    };

    expect(getScopedFoodSelectionIds(accountA, null).size).toBe(0);
    expect(toggleScopedFoodSelection(accountA, null, 'food-b')).toBe(accountA);
    expect(clearScopedFoodSelection(accountA, null)).toBe(accountA);
  });

  it('resets selection into the active scope without carrying prior ids', () => {
    const accountA: ScopedFoodSelection = {
      scopeKey: 'account-a:session-1',
      ids: new Set(['food-a']),
    };

    const clearedForB = clearScopedFoodSelection(accountA, 'account-b:session-1');
    expect(clearedForB.scopeKey).toBe('account-b:session-1');
    expect([...clearedForB.ids]).toEqual([]);
    expect([...accountA.ids]).toEqual(['food-a']);
    expect([...clearScopedFoodSelection(accountA, 'account-a:session-1').ids]).toEqual([]);
  });

  it('rejects a bulk action captured by a previous account session', () => {
    expect(isFoodSelectionScopeActive('account-a:session-1', 'account-a:session-1')).toBe(true);
    expect(isFoodSelectionScopeActive('account-a:session-1', 'account-b:session-1')).toBe(false);
    expect(isFoodSelectionScopeActive('account-a:session-1', null)).toBe(false);
    expect(isFoodSelectionScopeActive(null, null)).toBe(false);
  });
});
