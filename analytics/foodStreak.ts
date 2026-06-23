import { safeGetItem } from '../storage/utils';
import { toLocalDayKey } from '../dateUtils';

export type FoodStreakMilestone = 'started' | '3_days' | '7_days';

export type FoodStreakAnalyticsRecord = {
  event: 'food_streak_started' | 'food_streak_3_days' | 'food_streak_7_days';
  ts: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
};

const FOOD_STREAK_ANALYTICS_KEY = 'fitfocus.analytics.food_streak.v1';
const FOOD_STREAK_SENT_PREFIX = 'fitfocus.analytics.sent.v1:';
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

function readMilestones(ownerUserId: string): FoodStreakMilestone[] {
  if (!ownerUserId) return [];
  return safeGetItem<FoodStreakMilestone[]>(`${FOOD_STREAK_SENT_PREFIX}${ownerUserId}`, []);
}

function writeMilestones(ownerUserId: string, milestones: FoodStreakMilestone[]) {
  if (!ownerUserId) return;
  try {
    localStorage.setItem(`${FOOD_STREAK_SENT_PREFIX}${ownerUserId}`, JSON.stringify(Array.from(new Set(milestones))));
  } catch {
    // best effort only
  }
}

function appendAnalytics(event: FoodStreakAnalyticsRecord) {
  try {
    const existing = safeGetItem<FoodStreakAnalyticsRecord[]>(FOOD_STREAK_ANALYTICS_KEY, []);
    const next = [...existing, event].slice(-100);
    localStorage.setItem(FOOD_STREAK_ANALYTICS_KEY, JSON.stringify(next));
  } catch {
    // best effort only
  }
}

export function trackFoodStreakMilestone(
  ownerUserId: string,
  milestone: FoodStreakMilestone,
  streak: number,
) {
  if (!ownerUserId) return false;
  try {
    const sent = new Set(readMilestones(ownerUserId) || []);
    if (sent.has(milestone)) return false;

    const event =
      milestone === 'started'
        ? 'food_streak_started'
        : milestone === '3_days'
          ? 'food_streak_3_days'
          : 'food_streak_7_days';

    sent.add(milestone);
    writeMilestones(ownerUserId, Array.from(sent));
    appendAnalytics({ event, ts: new Date().toISOString(), meta: { streak } });
    return true;
  } catch {
    return false;
  }
}
