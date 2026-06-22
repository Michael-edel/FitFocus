import { safeGetItem } from '../storage/utils';

export type FoodStreakMilestone = 'started' | '3_days' | '7_days';

export type FoodStreakAnalyticsRecord = {
  event: 'food_streak_started' | 'food_streak_3_days' | 'food_streak_7_days';
  ts: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
};

const FOOD_STREAK_ANALYTICS_KEY = 'fitfocus.analytics.food_streak.v1';
const FOOD_STREAK_MILESTONES_KEY = 'fitfocus.analytics.food_streak.milestones.v1';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function toLocalDayKey(timestamp?: string | number | Date | null): string {
  if (!timestamp) return '';
  const d = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

function readMilestones(ownerUserId: string): Record<string, FoodStreakMilestone[]> {
  if (!ownerUserId) return {};
  const all = safeGetItem<Record<string, FoodStreakMilestone[]>>(FOOD_STREAK_MILESTONES_KEY, {});
  return all && typeof all === 'object' ? all : {};
}

function writeMilestones(ownerUserId: string, milestones: FoodStreakMilestone[]) {
  if (!ownerUserId) return;
  try {
    const all = readMilestones(ownerUserId);
    all[ownerUserId] = Array.from(new Set(milestones));
    localStorage.setItem(FOOD_STREAK_MILESTONES_KEY, JSON.stringify(all));
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
    const all = readMilestones(ownerUserId);
    const sent = new Set(all[ownerUserId] || []);
    if (sent.has(milestone)) return false;

    const event =
      milestone === 'started'
        ? 'food_streak_started'
        : milestone === '3_days'
          ? 'food_streak_3_days'
          : 'food_streak_7_days';

    sent.add(milestone);
    all[ownerUserId] = Array.from(sent);
    localStorage.setItem(FOOD_STREAK_MILESTONES_KEY, JSON.stringify(all));
    appendAnalytics({ event, ts: new Date().toISOString(), meta: { streak } });
    return true;
  } catch {
    return false;
  }
}
