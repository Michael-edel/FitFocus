import { useEffect, useMemo, useRef, useState } from 'react';
import type { FoodItem } from '../../types';
import { toLocalDayKey } from '../../dateUtils';

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

export function useDiaryDaySelection(userId: string | null | undefined, foodDiary: FoodItem[]) {
  const storageKey = useMemo(
    () => `fitfocus.nutrition.selected-day.v1:${userId ?? 'anon'}`,
    [userId],
  );
  const skipSaveRef = useRef(false);
  const [selectedDiaryDayKey, setSelectedDiaryDayKey] = useState('');

  useEffect(() => {
    try {
      const todayKey = toLocalDayKey(new Date()) || '';
      const savedKey = localStorage.getItem(storageKey) || '';
      skipSaveRef.current = true;
      setSelectedDiaryDayKey(savedKey === todayKey ? savedKey : '');
    } catch {
      skipSaveRef.current = true;
      setSelectedDiaryDayKey('');
    }
  }, [storageKey]);

  useEffect(() => {
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    try {
      if (selectedDiaryDayKey) {
        localStorage.setItem(storageKey, selectedDiaryDayKey);
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // The day selection is an optional browser preference.
    }
  }, [selectedDiaryDayKey, storageKey]);

  const diaryDayKeys = useMemo(() => getDiaryDayKeys(foodDiary), [foodDiary]);
  const resolvedDiaryDayKey = useMemo(
    () => resolveDiaryDayKey(diaryDayKeys, selectedDiaryDayKey),
    [diaryDayKeys, selectedDiaryDayKey],
  );
  const selectedDiaryStats = useMemo(
    () => calculateDiaryDayStats(foodDiary, resolvedDiaryDayKey),
    [foodDiary, resolvedDiaryDayKey],
  );

  return {
    selectedDiaryDayKey,
    setSelectedDiaryDayKey,
    resolvedDiaryDayKey,
    selectedDiaryStats,
  };
}
