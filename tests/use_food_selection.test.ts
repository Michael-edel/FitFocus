import { describe, expect, it } from 'vitest';
import {
  clearScopedFoodSelection,
  getScopedFoodSelectionIds,
  isFoodSelectionScopeActive,
  moveSelectedFoodEntries,
  removeSelectedFoodEntries,
  toggleScopedFoodSelection,
  type ScopedFoodSelection,
} from '../useFoodSelection';

describe('account-scoped food selection', () => {
  it('moves only selected diary entries and reuses the snapshot when nothing changes', () => {
    const diary = [
      { id: 'food-a', name: 'Завтрак', calories: 300, protein: 10, fat: 8, carbs: 40, timestamp: '2026-10-17T08:00:00.000Z', mealType: 'breakfast' as const },
      { id: 'food-b', name: 'Обед', calories: 500, protein: 20, fat: 12, carbs: 60, timestamp: '2026-10-17T12:00:00.000Z', mealType: 'lunch' as const },
    ];

    const moved = moveSelectedFoodEntries(diary, new Set(['food-b']), 'dinner');
    expect(moved).toEqual([
      diary[0],
      { ...diary[1], mealType: 'dinner' },
    ]);
    expect(diary[1].mealType).toBe('lunch');
    expect(moveSelectedFoodEntries(diary, new Set(['food-a']), 'breakfast')).toBe(diary);
  });

  it('removes selected diary entries together and reuses the snapshot when none match', () => {
    const diary = [
      { id: 'food-a', name: 'Завтрак', calories: 300, protein: 10, fat: 8, carbs: 40, timestamp: '2026-10-17T08:00:00.000Z', mealType: 'breakfast' as const },
      { id: 'food-b', name: 'Обед', calories: 500, protein: 20, fat: 12, carbs: 60, timestamp: '2026-10-17T12:00:00.000Z', mealType: 'lunch' as const },
      { id: 'food-c', name: 'Ужин', calories: 600, protein: 30, fat: 15, carbs: 70, timestamp: '2026-10-17T18:00:00.000Z', mealType: 'dinner' as const },
    ];

    expect(removeSelectedFoodEntries(diary, new Set(['food-a', 'food-c']))).toEqual([diary[1]]);
    expect(removeSelectedFoodEntries(diary, new Set(['missing']))).toBe(diary);
  });

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
