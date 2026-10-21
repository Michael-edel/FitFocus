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

export function moveSelectedFoodEntries(
  diary: FoodItem[],
  selectedIds: ReadonlySet<string>,
  mealType: MealType,
): FoodItem[] {
  let changed = false;
  const next = diary.map(item => {
    if (!selectedIds.has(item.id) || item.mealType === mealType) return item;
    changed = true;
    return { ...item, mealType };
  });
  return changed ? next : diary;
}

export function removeSelectedFoodEntries(
  diary: FoodItem[],
  selectedIds: ReadonlySet<string>,
): FoodItem[] {
  const next = diary.filter(item => !selectedIds.has(item.id));
  return next.length === diary.length ? diary : next;
}

export function useFoodSelection(
  foodDiary: FoodItem[],
  setFoodDiary: Dispatch<SetStateAction<FoodItem[]>>,
  persistFoodDiary?: (update: (currentDiary: FoodItem[]) => FoodItem[]) => Promise<FoodItem[] | null>,
  scopeKey: string | null = null,
) {
  const foodDiaryRef = useRef(foodDiary);
  foodDiaryRef.current = foodDiary;
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

  const bulkUpdateMealType = useCallback(async (mealType: MealType): Promise<boolean> => {
    if (
      !isFoodSelectionScopeActive(scopeKey, currentScopeKeyRef.current) ||
      selectedFoodIds.size === 0
    ) return false;

    const idsToUpdate = new Set(selectedFoodIds);
    const previousDiary = foodDiaryRef.current;
    const nextDiary = moveSelectedFoodEntries(previousDiary, idsToUpdate, mealType);
    if (nextDiary !== previousDiary) {
      if (persistFoodDiary) {
        const committed = await persistFoodDiary(currentDiary => moveSelectedFoodEntries(currentDiary, idsToUpdate, mealType));
        if (!committed || !isFoodSelectionScopeActive(scopeKey, currentScopeKeyRef.current)) return false;
        foodDiaryRef.current = committed;
      } else {
        foodDiaryRef.current = nextDiary;
        setFoodDiary(nextDiary);
      }
    }
    clearFoodSelection();
    return true;
  }, [clearFoodSelection, persistFoodDiary, scopeKey, selectedFoodIds, setFoodDiary]);

  const bulkRemoveSelectedFoods = useCallback(async (): Promise<boolean> => {
    if (
      !isFoodSelectionScopeActive(scopeKey, currentScopeKeyRef.current) ||
      selectedFoodIds.size === 0
    ) return false;
    const previousDiary = foodDiaryRef.current;
    const nextDiary = removeSelectedFoodEntries(previousDiary, selectedFoodIds);
    if (nextDiary !== previousDiary) {
      const idsToRemove = new Set(selectedFoodIds);
      if (persistFoodDiary) {
        const committed = await persistFoodDiary(currentDiary => removeSelectedFoodEntries(currentDiary, idsToRemove));
        if (!committed || !isFoodSelectionScopeActive(scopeKey, currentScopeKeyRef.current)) return false;
        foodDiaryRef.current = committed;
      } else {
        foodDiaryRef.current = nextDiary;
        setFoodDiary(nextDiary);
      }
    }
    clearFoodSelection();
    return true;
  }, [clearFoodSelection, persistFoodDiary, scopeKey, selectedFoodIds, setFoodDiary]);

  return {
    selectedFoodIds,
    toggleFoodSelected,
    clearFoodSelection,
    bulkUpdateMealType,
    bulkRemoveSelectedFoods,
  };
}
