import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { FoodItem, MealType } from './types';

export function useFoodSelection(
  setFoodDiary: Dispatch<SetStateAction<FoodItem[]>>,
  deleteFoodEntry: (id: string) => void,
  persistFoodDiary?: (nextDiary: FoodItem[]) => void,
) {
  const [selectedFoodIds, setSelectedFoodIds] = useState<Set<string>>(new Set<string>());

  const toggleFoodSelected = useCallback((id: string) => {
    setSelectedFoodIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearFoodSelection = useCallback(() => setSelectedFoodIds(new Set()), []);

  const bulkUpdateMealType = useCallback((mealType: MealType) => {
    if (!selectedFoodIds.size) return;
    setFoodDiary(prev => {
      const next = prev.map(x => (selectedFoodIds.has(x.id) ? { ...x, mealType } : x));
      persistFoodDiary?.(next);
      return next;
    });
    clearFoodSelection();
  }, [clearFoodSelection, persistFoodDiary, selectedFoodIds, setFoodDiary]);

  const bulkRemoveSelectedFoods = useCallback(() => {
    if (!selectedFoodIds.size) return;
    selectedFoodIds.forEach((id: string) => deleteFoodEntry(id));
    clearFoodSelection();
  }, [clearFoodSelection, deleteFoodEntry, selectedFoodIds]);

  return {
    selectedFoodIds,
    toggleFoodSelected,
    clearFoodSelection,
    bulkUpdateMealType,
    bulkRemoveSelectedFoods,
  };
}
