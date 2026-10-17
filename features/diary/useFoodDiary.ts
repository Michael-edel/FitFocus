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
  loginGuard: OutboxCommitGuard['readGuard'] | null;
  isCurrentSession: () => boolean;
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
  loginGuard,
  isCurrentSession,
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
  const scopeRef = useRef({ userId, repository, generation: 0 });
  if (scopeRef.current.userId !== userId || scopeRef.current.repository !== repository) {
    scopeRef.current = { userId, repository, generation: scopeRef.current.generation + 1 };
  }

  const makeCommitGuard = useCallback((guard?: OutboxCommitGuard): OutboxCommitGuard | null => {
    const activeGuard = guard ?? (loginGuard ? { readGuard: loginGuard, canCommit: isCurrentSession } : null);
    if (!userId || !repository || repository.accountId !== userId || !activeGuard || activeGuard.readGuard.accountId !== userId
      || !isCurrentSession() || !activeGuard.canCommit()) return null;
    return activeGuard;
  }, [isCurrentSession, loginGuard, repository, userId]);

  const commitDiaryUpdate = useCallback(async (
    update: (current: FoodItem[]) => FoodItem[],
    suppliedGuard?: OutboxCommitGuard,
  ): Promise<FoodItem[] | null> => {
    const accountId = userId;
    const activeRepository = repository;
    const generation = scopeRef.current.generation;
    const guard = makeCommitGuard(suppliedGuard);
    if (!accountId || !activeRepository || !guard) return null;
    try {
      const result = await activeRepository.updateJson(
        'diary',
        foodDiaryRef.current,
        (value): value is FoodItem[] => Array.isArray(value),
        current => update(current).map(sanitizeFoodEntryForStorage).slice(0, MAX_DIARY_ITEMS),
        guard,
      );
      if (result.operation && result.operation.status !== 'pending') return null;
      if (scopeRef.current.generation !== generation || scopeRef.current.userId !== accountId
        || scopeRef.current.repository !== activeRepository || !isCurrentSession() || !guard.canCommit()
        || !await activeRepository.isReadSessionCurrent(guard.readGuard)) return null;
      foodDiaryRef.current = result.value;
      setFoodDiary(result.value);
      return result.value;
    } catch {
      return null;
    }
  }, [isCurrentSession, makeCommitGuard, repository, setFoodDiary, userId]);

  const commitHistoryUpdate = useCallback(async (
    update: (current: FastLogItem[]) => FastLogItem[],
    suppliedGuard?: OutboxCommitGuard,
  ): Promise<FastLogItem[] | null> => {
    const accountId = userId;
    const activeRepository = repository;
    const generation = scopeRef.current.generation;
    const guard = makeCommitGuard(suppliedGuard);
    if (!accountId || !activeRepository || !guard) return null;
    try {
      const result = await activeRepository.updateJson(
        'history',
        foodHistoryRef.current,
        (value): value is FastLogItem[] => Array.isArray(value),
        update,
        guard,
      );
      if (result.operation && result.operation.status !== 'pending') return null;
      if (scopeRef.current.generation !== generation || scopeRef.current.userId !== accountId
        || scopeRef.current.repository !== activeRepository || !isCurrentSession() || !guard.canCommit()
        || !await activeRepository.isReadSessionCurrent(guard.readGuard)) return null;
      foodHistoryRef.current = result.value;
      setFoodHistory(result.value);
      return result.value;
    } catch {
      return null;
    }
  }, [isCurrentSession, makeCommitGuard, repository, setFoodHistory, userId]);

  const persistFoodDiary = useCallback((update: (current: FoodItem[]) => FoodItem[]) =>
    commitDiaryUpdate(update), [commitDiaryUpdate]);

  const addFoodToDiary = useCallback(async (item: FastLogItem) => {
    if (!userId || !repository) return;
    const guard = makeCommitGuard();
    if (!guard) return;
    const entryForState = createFoodDiaryEntry(item, Date.now().toString(), inferMealType);
    const savedDiary = await commitDiaryUpdate(current => [entryForState, ...current], guard);
    if (!savedDiary || !guard.canCommit() || !await repository.isReadSessionCurrent(guard.readGuard)) return;
    await commitHistoryUpdate(current => appendFoodHistory(current, item), guard);
    if (!guard.canCommit() || !await repository.isReadSessionCurrent(guard.readGuard)) return;
    const dayKey = toLocalDayKey(entryForState.timestamp);
    if (dayKey) setSelectedDiaryDayKey(dayKey);

    const hasAiPhoto = Boolean(item.photo || item.photoThumb);
    void checkAchievements(hasAiPhoto ? 'ai_photo_success' : 'food_manual_added', {
      foodDiaryCount: savedDiary.length,
      hasAiPhoto,
    });
    return entryForState;
  }, [checkAchievements, commitDiaryUpdate, commitHistoryUpdate, inferMealType, makeCommitGuard, repository, setSelectedDiaryDayKey, userId]);

  const addFoodToDiaryGuarded = useCallback(async (
    item: FastLogItem,
    guard: OutboxCommitGuard,
    isCurrent: () => boolean,
  ): Promise<FoodItem | undefined> => {
    if (!userId || !repository || guard.readGuard.accountId !== userId || !isCurrent() || !guard.canCommit()) return;

    const entry = createFoodDiaryEntry(item, Date.now().toString(), inferMealType);
    const commitGuard: OutboxCommitGuard = { readGuard: guard.readGuard, canCommit: () => isCurrent() && guard.canCommit() };
    const savedDiary = await commitDiaryUpdate(current => [entry, ...current], commitGuard);
    if (!savedDiary || !isCurrent() || !guard.canCommit()) return;
    await commitHistoryUpdate(current => appendFoodHistory(current, item), commitGuard);
    if (!isCurrent() || !guard.canCommit() || !await repository.isReadSessionCurrent(guard.readGuard)) return;
    const dayKey = toLocalDayKey(entry.timestamp);
    if (dayKey) setSelectedDiaryDayKey(dayKey);

    const hasAiPhoto = Boolean(item.photo || item.photoThumb);
    void checkAchievements(hasAiPhoto ? 'ai_photo_success' : 'food_manual_added', {
      foodDiaryCount: savedDiary.length,
      hasAiPhoto,
    });
    return entry;
  }, [checkAchievements, commitDiaryUpdate, commitHistoryUpdate, inferMealType, repository, setSelectedDiaryDayKey, userId]);

  const updateFoodEntry = useCallback(async (id: string, patch: Partial<FoodItem>): Promise<boolean> => {
    const nextDiary = await commitDiaryUpdate(current => {
      if (!current.some(entry => entry.id === id)) return current;
      return current.map(entry => entry.id === id ? { ...entry, ...patch } : entry);
    });
    if (!nextDiary?.some(entry => entry.id === id)) return false;
    const updated = nextDiary.find((entry) => entry.id === id);
    if (updated?.timestamp) setSelectedDiaryDayKey(toLocalDayKey(updated.timestamp));
    return true;
  }, [commitDiaryUpdate, setSelectedDiaryDayKey]);

  const updateFoodEntryGuarded = useCallback(async (
    id: string,
    patch: Partial<FoodItem>,
    guard: OutboxCommitGuard,
    isCurrent: () => boolean,
  ): Promise<boolean> => {
    if (!userId || !repository || guard.readGuard.accountId !== userId || !isCurrent() || !guard.canCommit()) return false;
    const commitGuard: OutboxCommitGuard = { readGuard: guard.readGuard, canCommit: () => isCurrent() && guard.canCommit() };
    const nextDiary = await commitDiaryUpdate(current => {
      if (!current.some(entry => entry.id === id)) return current;
      return current.map(entry => entry.id === id ? { ...entry, ...patch } : entry);
    }, commitGuard);
    return Boolean(nextDiary?.some(entry => entry.id === id) && isCurrent() && guard.canCommit());
  }, [commitDiaryUpdate, repository, userId]);

  const deleteFoodPhoto = useCallback((id: string) => {
    return updateFoodEntry(id, { photo: undefined, photoThumb: undefined });
  }, [updateFoodEntry]);

  const deleteFoodEntry = useCallback(async (id: string): Promise<boolean> => {
    const nextDiary = await commitDiaryUpdate(current => current.filter(entry => entry.id !== id));
    return Boolean(nextDiary);
  }, [commitDiaryUpdate]);

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
