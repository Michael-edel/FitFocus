import { toLocalDayKey } from '../dateUtils';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function previousLocalDayKey(dayKey: string): string {
  if (!dayKey) return '';
  const date = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() - 1);
  return toLocalDayKey(date);
}

function uniqueDaySet(foodDiary: Array<{ timestamp?: string | number | Date | null }>) {
  const daySet = new Set<string>();
  for (const item of foodDiary || []) {
    const key = toLocalDayKey(item?.timestamp ?? null);
    if (key) daySet.add(key);
  }
  return daySet;
}

export function calculateFoodStreak(foodDiary: Array<{ timestamp?: string | number | Date | null }>, referenceDate = new Date()) {
  const daySet = uniqueDaySet(foodDiary);
  const todayKey = toLocalDayKey(referenceDate);
  const yesterdayKey = toLocalDayKey(new Date(referenceDate.getTime() - ONE_DAY_MS));
  const anchorDayKey = daySet.has(todayKey) ? todayKey : yesterdayKey;

  if (!anchorDayKey || !daySet.has(anchorDayKey)) {
    return {
      streak: 0,
      todayKey,
      yesterdayKey,
      anchorDayKey: '',
      hasTodayFood: false,
    };
  }

  let streak = 0;
  let cursor = anchorDayKey;
  while (cursor && daySet.has(cursor)) {
    streak += 1;
    cursor = previousLocalDayKey(cursor);
  }

  return {
    streak,
    todayKey,
    yesterdayKey,
    anchorDayKey,
    hasTodayFood: daySet.has(todayKey),
  };
}
