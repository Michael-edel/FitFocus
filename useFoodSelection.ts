import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useAccountScopedUiSetter } from './features/state/accountScopedUi';
import { FoodItem, MealType } from './types';

export type ScopedFoodSelection = {
  scopeKey: string | null;
  ids: Set<string>;
};

const EMPTY_FOOD_IDS: ReadonlySet<string> = new Set<string>();

export function isFoodSelectionScopeActive(
  ownerScopeKey: string | null,
  activeScopeKey: string | null,
): boolean {
  return ownerScopeKey !== null && ownerScopeKey === activeScopeKey;
}

export function getScopedFoodSelectionIds(
  state: ScopedFoodSelection,
  scopeKey: string | null,
): ReadonlySet<string> {
  return scopeKey !== null && state.scopeKey === scopeKey ? state.ids : EMPTY_FOOD_IDS;
}

export function toggleScopedFoodSelection(
  state: ScopedFoodSelection,
  scopeKey: string | null,
  id: string,
): ScopedFoodSelection {
  if (scopeKey === null) return state;

  const ids = new Set(state.scopeKey === scopeKey ? state.ids : EMPTY_FOOD_IDS);
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);

  return { scopeKey, ids };
}

export function clearScopedFoodSelection(
  state: ScopedFoodSelection,
  scopeKey: string | null,
): ScopedFoodSelection {
  return scopeKey === null ? state : { scopeKey, ids: new Set<string>() };
}

export function useFoodSelection(
  setFoodDiary: Dispatch<SetStateAction<FoodItem[]>>,
  deleteFoodEntry: (id: string) => void,
  persistFoodDiary?: (nextDiary: FoodItem[]) => void,
  scopeKey: string | null = null,
) {
  const [selectionState, setSelectionState] = useState<ScopedFoodSelection>(() => ({
    scopeKey,
    ids: new Set<string>(),
  }));
  const currentScopeKeyRef = useRef(scopeKey);
  currentScopeKeyRef.current = scopeKey;
  const setScopedSelectionState = useAccountScopedUiSetter(
    scopeKey,
    setSelectionState,
    scopeKey !== null,
  );
  const selectedFoodIds = getScopedFoodSelectionIds(selectionState, scopeKey);

  const toggleFoodSelected = useCallback((id: string) => {
    if (scopeKey === null) return;
    setScopedSelectionState(prev => toggleScopedFoodSelection(prev, scopeKey, id));
  }, [scopeKey, setScopedSelectionState]);

  const clearFoodSelection = useCallback(() => {
    if (scopeKey === null) return;
    setScopedSelectionState(prev => clearScopedFoodSelection(prev, scopeKey));
  }, [scopeKey, setScopedSelectionState]);

  const bulkUpdateMealType = useCallback((mealType: MealType) => {
    if (
      !isFoodSelectionScopeActive(scopeKey, currentScopeKeyRef.current) ||
      selectedFoodIds.size === 0
    ) return;

    const idsToUpdate = new Set(selectedFoodIds);
    setFoodDiary(prev => {
      if (!isFoodSelectionScopeActive(scopeKey, currentScopeKeyRef.current)) return prev;
      const next = prev.map(x => (idsToUpdate.has(x.id) ? { ...x, mealType } : x));
      persistFoodDiary?.(next);
      return next;
    });
    clearFoodSelection();
  }, [clearFoodSelection, persistFoodDiary, scopeKey, selectedFoodIds, setFoodDiary]);

  const bulkRemoveSelectedFoods = useCallback(() => {
    if (
      !isFoodSelectionScopeActive(scopeKey, currentScopeKeyRef.current) ||
      selectedFoodIds.size === 0
    ) return;
    selectedFoodIds.forEach((id: string) => deleteFoodEntry(id));
    clearFoodSelection();
  }, [clearFoodSelection, deleteFoodEntry, scopeKey, selectedFoodIds]);

  return {
    selectedFoodIds,
    toggleFoodSelected,
    clearFoodSelection,
    bulkUpdateMealType,
    bulkRemoveSelectedFoods,
  };
}
