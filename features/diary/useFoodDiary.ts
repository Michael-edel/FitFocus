import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { AchievementEvaluationContext } from '../../achievements/engine';
import type { AchievementCheckReason } from '../../useAchievements';
import { toLocalDayKey } from '../../dateUtils';
import { MAX_DIARY_ITEMS, MAX_HISTORY_ITEMS, sanitizeFoodEntryForStorage, type FastLogItem } from '../../storage/foodDiary';
import type { UserStateRepository } from '../../storage/userStateRepository';
import type { FoodItem, MealType } from '../../types';

type CheckAchievements = (
  reason: AchievementCheckReason,
  context?: AchievementEvaluationContext,
) => unknown;

type UseFoodDiaryParams = {
  userId: string | null | undefined;
  repository: UserStateRepository | null;
  foodDiary: FoodItem[];
  setFoodDiary: Dispatch<SetStateAction<FoodItem[]>>;
  inferMealType: (timestamp: string) => MealType;
  setFoodHistory: Dispatch<SetStateAction<FastLogItem[]>>;
  setSelectedDiaryDayKey: Dispatch<SetStateAction<string>>;
  checkAchievements: CheckAchievements;
};

export function createFoodDiaryEntry(
  item: FastLogItem,
  id: string,
  inferMealType: (timestamp: string) => MealType,
): FoodItem {
  const timestamp = item.timestamp ?? new Date().toISOString();
  return {
    ...item,
    id,
    timestamp,
    mealType: item.mealType ?? inferMealType(timestamp),
  };
}

export function appendFoodHistory(previousHistory: FastLogItem[], item: FastLogItem): FastLogItem[] {
  const historyItem = { ...item };
  delete historyItem.photo;
  if (historyItem.insight) delete historyItem.insight.recipe;
  return [historyItem, ...previousHistory.filter((history) => history.name !== item.name)]
    .slice(0, MAX_HISTORY_ITEMS);
}

export function useFoodDiary({
  userId,
  repository,
  foodDiary,
  setFoodDiary,
  inferMealType,
  setFoodHistory,
  setSelectedDiaryDayKey,
  checkAchievements,
}: UseFoodDiaryParams) {
  const persistFoodDiary = useCallback((nextDiary: FoodItem[]) => {
    if (!repository) return;
    repository.writeJson('diary', nextDiary.map(sanitizeFoodEntryForStorage).slice(0, MAX_DIARY_ITEMS));
  }, [repository]);

  const addFoodToDiary = useCallback((item: FastLogItem) => {
    if (!userId) return;
    const entryForState = createFoodDiaryEntry(item, Date.now().toString(), inferMealType);
    const entryForStorage = sanitizeFoodEntryForStorage(entryForState);

    setFoodDiary((previousDiary) => {
      const nextState = [entryForState, ...previousDiary].slice(0, MAX_DIARY_ITEMS);
      const nextStorage = [entryForStorage, ...previousDiary.map(sanitizeFoodEntryForStorage)]
        .slice(0, MAX_DIARY_ITEMS);
      repository?.writeJson('diary', nextStorage);
      const dayKey = toLocalDayKey(entryForState.timestamp);
      if (dayKey) setSelectedDiaryDayKey(dayKey);
      return nextState;
    });

    setFoodHistory((previousHistory) => {
      const nextHistory = appendFoodHistory(previousHistory, item);
      repository?.writeJson('history', nextHistory);
      return nextHistory;
    });

    const hasAiPhoto = Boolean(item.photo || item.photoThumb);
    void checkAchievements(hasAiPhoto ? 'ai_photo_success' : 'food_manual_added', {
      foodDiaryCount: foodDiary.length + 1,
      hasAiPhoto,
    });
    return entryForState;
  }, [checkAchievements, foodDiary.length, inferMealType, repository, setFoodHistory, setSelectedDiaryDayKey, userId]);

  const updateFoodEntry = useCallback((id: string, patch: Partial<FoodItem>) => {
    if (!userId) return;
    setFoodDiary((previousDiary) => {
      const nextDiary = previousDiary.map((entry) => entry.id === id ? { ...entry, ...patch } : entry);
      persistFoodDiary(nextDiary);
      const updated = nextDiary.find((entry) => entry.id === id);
      if (updated?.timestamp) setSelectedDiaryDayKey(toLocalDayKey(updated.timestamp));
      return nextDiary;
    });
  }, [persistFoodDiary, setSelectedDiaryDayKey, userId]);

  const deleteFoodPhoto = useCallback((id: string) => {
    updateFoodEntry(id, { photo: undefined, photoThumb: undefined });
  }, [updateFoodEntry]);

  const deleteFoodEntry = useCallback((id: string) => {
    if (!userId) return;
    setFoodDiary((previousDiary) => {
      const nextDiary = previousDiary.filter((entry) => entry.id !== id);
      persistFoodDiary(nextDiary);
      return nextDiary;
    });
  }, [persistFoodDiary, userId]);

  return {
    persistFoodDiary,
    addFoodToDiary,
    updateFoodEntry,
    deleteFoodPhoto,
    deleteFoodEntry,
  };
}
