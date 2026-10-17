import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import type { AchievementEvaluationContext } from '../../achievements/engine';
import type { AchievementCheckReason } from '../../useAchievements';
import { toLocalDayKey } from '../../dateUtils';
import { MAX_DIARY_ITEMS, MAX_HISTORY_ITEMS, sanitizeFoodEntryForStorage, type FastLogItem } from '../../storage/foodDiary';
import type { UserStateRepository } from '../../storage/userStateRepository';
import type { OutboxCommitGuard } from '../../storage/durableOutbox';
import type { FoodItem, MealType } from '../../types';

type CheckAchievements = (
  reason: AchievementCheckReason,
  context?: AchievementEvaluationContext,
) => unknown;

type UseFoodDiaryParams = {
  userId: string | null | undefined;
  repository: UserStateRepository | null;
  foodDiary: FoodItem[];
  foodHistory: FastLogItem[];
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
  foodHistory,
  setFoodDiary,
  inferMealType,
  setFoodHistory,
  setSelectedDiaryDayKey,
  checkAchievements,
}: UseFoodDiaryParams) {
  const foodDiaryRef = useRef(foodDiary);
  foodDiaryRef.current = foodDiary;
  const foodHistoryRef = useRef(foodHistory);
  foodHistoryRef.current = foodHistory;

  const persistFoodDiary = useCallback((nextDiary: FoodItem[]) => {
    if (!repository) return;
    repository.writeJson('diary', nextDiary.map(sanitizeFoodEntryForStorage).slice(0, MAX_DIARY_ITEMS));
  }, [repository]);

  const commitFoodDiary = useCallback((nextDiary: FoodItem[]) => {
    foodDiaryRef.current = nextDiary;
    setFoodDiary(nextDiary);
    persistFoodDiary(nextDiary);
  }, [persistFoodDiary, setFoodDiary]);

  const addFoodToDiary = useCallback((item: FastLogItem) => {
    if (!userId) return;
    const entryForState = createFoodDiaryEntry(item, Date.now().toString(), inferMealType);
    const nextDiary = [entryForState, ...foodDiaryRef.current].slice(0, MAX_DIARY_ITEMS);
    commitFoodDiary(nextDiary);
    const dayKey = toLocalDayKey(entryForState.timestamp);
    if (dayKey) setSelectedDiaryDayKey(dayKey);

    const nextHistory = appendFoodHistory(foodHistoryRef.current, item);
    foodHistoryRef.current = nextHistory;
    setFoodHistory(nextHistory);
    repository?.writeJson('history', nextHistory);

    const hasAiPhoto = Boolean(item.photo || item.photoThumb);
    void checkAchievements(hasAiPhoto ? 'ai_photo_success' : 'food_manual_added', {
      foodDiaryCount: nextDiary.length,
      hasAiPhoto,
    });
    return entryForState;
  }, [checkAchievements, commitFoodDiary, inferMealType, repository, setFoodHistory, setSelectedDiaryDayKey, userId]);

  const addFoodToDiaryGuarded = useCallback(async (
    item: FastLogItem,
    guard: OutboxCommitGuard,
    isCurrent: () => boolean,
  ): Promise<FoodItem | undefined> => {
    if (!userId || !repository || guard.readGuard.accountId !== userId || !isCurrent() || !guard.canCommit()) return;

    const [currentDiary, currentHistory] = await Promise.all([
      repository.readJsonAsync('diary', foodDiaryRef.current, (value): value is FoodItem[] => Array.isArray(value)),
      repository.readJsonAsync('history', foodHistoryRef.current, (value): value is FastLogItem[] => Array.isArray(value)),
    ]);
    if (!isCurrent() || !guard.canCommit() || !await repository.isReadSessionCurrent(guard.readGuard)) return;

    const entry = createFoodDiaryEntry(item, Date.now().toString(), inferMealType);
    const nextDiary = [entry, ...currentDiary].slice(0, MAX_DIARY_ITEMS);
    const nextHistory = appendFoodHistory(currentHistory, item);
    const [diaryOperation, historyOperation] = await Promise.all([
      repository.writeJson('diary', nextDiary, guard),
      repository.writeJson('history', nextHistory, guard),
    ]);
    if (diaryOperation.status !== 'pending' || historyOperation.status !== 'pending'
      || !isCurrent() || !guard.canCommit() || !await repository.isReadSessionCurrent(guard.readGuard)) return;

    setFoodDiary(previous => isCurrent() ? [entry, ...previous].slice(0, MAX_DIARY_ITEMS) : previous);
    setFoodHistory(previous => isCurrent() ? appendFoodHistory(previous, item) : previous);
    const dayKey = toLocalDayKey(entry.timestamp);
    if (dayKey) setSelectedDiaryDayKey(dayKey);

    const hasAiPhoto = Boolean(item.photo || item.photoThumb);
    void checkAchievements(hasAiPhoto ? 'ai_photo_success' : 'food_manual_added', {
      foodDiaryCount: currentDiary.length + 1,
      hasAiPhoto,
    });
    return entry;
  }, [checkAchievements, inferMealType, repository, setFoodDiary, setFoodHistory, setSelectedDiaryDayKey, userId]);

  const updateFoodEntry = useCallback((id: string, patch: Partial<FoodItem>) => {
    if (!userId) return;
    const previousDiary = foodDiaryRef.current;
    if (!previousDiary.some(entry => entry.id === id)) return;
    const nextDiary = previousDiary.map((entry) => entry.id === id ? { ...entry, ...patch } : entry);
    commitFoodDiary(nextDiary);
    const updated = nextDiary.find((entry) => entry.id === id);
    if (updated?.timestamp) setSelectedDiaryDayKey(toLocalDayKey(updated.timestamp));
  }, [commitFoodDiary, setSelectedDiaryDayKey, userId]);

  const updateFoodEntryGuarded = useCallback(async (
    id: string,
    patch: Partial<FoodItem>,
    guard: OutboxCommitGuard,
    isCurrent: () => boolean,
  ): Promise<boolean> => {
    if (!userId || !repository || guard.readGuard.accountId !== userId || !isCurrent() || !guard.canCommit()) return false;
    const result = await repository.updateJson(
      'diary',
      foodDiaryRef.current,
      (value): value is FoodItem[] => Array.isArray(value),
      current => {
        if (!current.some(entry => entry.id === id)) return current;
        const next = current.map(entry => entry.id === id ? { ...entry, ...patch } : entry);
        return next.map(sanitizeFoodEntryForStorage).slice(0, MAX_DIARY_ITEMS);
      },
      guard,
    );
    if (result.operation?.status !== 'pending' || !isCurrent() || !guard.canCommit()
      || !await repository.isReadSessionCurrent(guard.readGuard)) return false;

    setFoodDiary(previous => isCurrent() && guard.canCommit()
      ? previous.map(entry => entry.id === id ? { ...entry, ...patch } : entry)
      : previous);
    return true;
  }, [repository, setFoodDiary, userId]);

  const deleteFoodPhoto = useCallback((id: string) => {
    updateFoodEntry(id, { photo: undefined, photoThumb: undefined });
  }, [updateFoodEntry]);

  const deleteFoodEntry = useCallback((id: string) => {
    if (!userId) return;
    const previousDiary = foodDiaryRef.current;
    const nextDiary = previousDiary.filter((entry) => entry.id !== id);
    if (nextDiary.length === previousDiary.length) return;
    commitFoodDiary(nextDiary);
  }, [commitFoodDiary, userId]);

  return {
    persistFoodDiary,
    addFoodToDiary,
    addFoodToDiaryGuarded,
    updateFoodEntry,
    updateFoodEntryGuarded,
    deleteFoodPhoto,
    deleteFoodEntry,
  };
}
