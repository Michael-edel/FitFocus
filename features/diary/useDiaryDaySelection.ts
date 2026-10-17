import { useEffect, useMemo, useState } from 'react';
import type { FoodItem } from '../../types';
import { toLocalDayKey } from '../../dateUtils';
import { getAccountScopedUiValue, useAccountScopedUiSetter } from '../state/accountScopedUi';

export type DiaryDayStats = {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

const EMPTY_DAY_STATS: DiaryDayStats = { calories: 0, protein: 0, fat: 0, carbs: 0 };

export function getDiaryDayKeys(foodDiary: FoodItem[]): string[] {
  const keys = new Set<string>();
  for (const item of foodDiary) {
    const key = toLocalDayKey(item.timestamp);
    if (key) keys.add(key);
  }
  return [...keys].sort((a, b) => (a < b ? 1 : -1));
}

export function resolveDiaryDayKey(dayKeys: string[], selectedDayKey: string, now = new Date()): string {
  const todayKey = toLocalDayKey(now) || '';
  if (selectedDayKey && dayKeys.includes(selectedDayKey)) return selectedDayKey;
  if (dayKeys.includes(todayKey)) return todayKey;
  return dayKeys[0] || todayKey;
}

export function calculateDiaryDayStats(foodDiary: FoodItem[], dayKey: string): DiaryDayStats {
  if (!dayKey) return EMPTY_DAY_STATS;
  return foodDiary
    .filter((item) => toLocalDayKey(item.timestamp) === dayKey)
    .reduce<DiaryDayStats>((total, item) => ({
      calories: total.calories + (item.calories || 0),
      protein: total.protein + (item.protein || 0),
      fat: total.fat + (item.fat || 0),
      carbs: total.carbs + (item.carbs || 0),
    }), EMPTY_DAY_STATS);
}

export function useDiaryDaySelection(
  userId: string | null | undefined,
  foodDiary: FoodItem[],
  allowCachedUiStateRestore = true,
) {
  const storageKey = useMemo(
    () => `fitfocus.nutrition.selected-day.v1:${userId ?? 'anon'}`,
    [userId],
  );
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null);
  const [selectedDiaryDayKey, setSelectedDiaryDayKey] = useState('');

  useEffect(() => {
    if (!allowCachedUiStateRestore) {
      setSelectedDiaryDayKey('');
      setHydratedStorageKey(null);
      return;
    }
    try {
      const todayKey = toLocalDayKey(new Date()) || '';
      const savedKey = localStorage.getItem(storageKey) || '';
      setSelectedDiaryDayKey(savedKey === todayKey ? savedKey : '');
    } catch {
      setSelectedDiaryDayKey('');
    }
    setHydratedStorageKey(storageKey);
  }, [allowCachedUiStateRestore, storageKey]);

  useEffect(() => {
    if (!allowCachedUiStateRestore || hydratedStorageKey !== storageKey) return;
    try {
      const visibleSelection = getAccountScopedUiValue(storageKey, hydratedStorageKey, selectedDiaryDayKey, '', allowCachedUiStateRestore);
      if (visibleSelection) {
        localStorage.setItem(storageKey, visibleSelection);
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // The day selection is an optional browser preference.
    }
  }, [allowCachedUiStateRestore, hydratedStorageKey, selectedDiaryDayKey, storageKey]);

  const visibleSelectedDiaryDayKey = getAccountScopedUiValue(storageKey, hydratedStorageKey, selectedDiaryDayKey, '', allowCachedUiStateRestore);

  const diaryDayKeys = useMemo(() => getDiaryDayKeys(foodDiary), [foodDiary]);
  const resolvedDiaryDayKey = useMemo(
    () => resolveDiaryDayKey(diaryDayKeys, visibleSelectedDiaryDayKey),
    [diaryDayKeys, visibleSelectedDiaryDayKey],
  );
  const selectedDiaryStats = useMemo(
    () => calculateDiaryDayStats(foodDiary, resolvedDiaryDayKey),
    [foodDiary, resolvedDiaryDayKey],
  );
  const setSelectedDayForScope = useAccountScopedUiSetter(storageKey, setSelectedDiaryDayKey, allowCachedUiStateRestore);

  return {
    selectedDiaryDayKey: visibleSelectedDiaryDayKey,
    setSelectedDiaryDayKey: setSelectedDayForScope,
    resolvedDiaryDayKey,
    selectedDiaryStats,
  };
}
