import { Goal, type FoodItem, type UserHabit, type UserProfile } from '../../types';
import {
  DEFAULT_DEFICIT,
  DEFAULT_SURPLUS,
} from '../../constants';

export type AdaptationStatus = {
  label: string;
  color: string;
  level: 'none' | 'low' | 'mid' | 'high';
};

export type RefeedSuggestion =
  | { type: 'stay' }
  | { type: 'refeed'; caloriesTomorrow: number }
  | { type: 'adjust'; stepsExtra: number };

export type AdaptationWeightProgress = {
  deltaDays: number;
  weightDelta: number;
};

type WeightRecord = { date: string; weight: number };

/** Builds the capped comparison window used by the adaptation calculation. */
export function calculateAdaptationWeightProgress(history: WeightRecord[] | undefined): AdaptationWeightProgress {
  if (!history || history.length < 2) return { deltaDays: 1, weightDelta: 0 };
  const sorted = [...history].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];
  const rawDays = Math.floor((new Date(latest.date).getTime() - new Date(first.date).getTime()) / 86_400_000);
  const deltaDays = Math.max(1, Math.min(14, Number.isFinite(rawDays) ? rawDays : 1));
  const cutoffMs = deltaDays * 86_400_000;
  const past = sorted.slice().reverse().find((entry) =>
    new Date(latest.date).getTime() - new Date(entry.date).getTime() >= cutoffMs,
  );
  return { deltaDays, weightDelta: past ? latest.weight - past.weight : latest.weight - first.weight };
}

/** Estimates expected weight change from the selected goal and calorie setting. */
export function calculateExpectedWeightDelta(profile: Pick<UserProfile, 'goal' | 'lossDeficit' | 'gainSurplus'>, days: number): number {
  if (profile.goal === Goal.LOSS) return (-(Number(profile.lossDeficit ?? DEFAULT_DEFICIT)) * days) / 7700;
  if (profile.goal === Goal.GAIN) return ((Number(profile.gainSurplus ?? DEFAULT_SURPLUS)) * days) / 7700;
  return 0;
}

/** Scores recent calorie adherence and completed habits as a 0..100 percentage. */
export function calculateAdaptationCompliance(
  foodDiary: FoodItem[],
  habits: UserHabit[],
  calorieTarget: number,
  nowMs = Date.now(),
): number {
  const lastSevenDays = foodDiary.filter((item) => nowMs - new Date(item.timestamp).getTime() <= 7 * 86_400_000);
  if (!lastSevenDays.length) return 0;
  const caloriesByDay: Record<string, number> = {};
  for (const item of lastSevenDays) {
    const date = new Date(item.timestamp);
    const dayKey = Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (!dayKey) continue;
    caloriesByDay[dayKey] = (caloriesByDay[dayKey] ?? 0) + (item.calories ?? 0);
  }
  const dayKeys = Object.keys(caloriesByDay);
  const dietScore = dayKeys.filter((day) => caloriesByDay[day] <= (calorieTarget || 1) * 1.1).length / Math.max(1, dayKeys.length);
  const habitScore = habits.filter((habit) => habit.current >= habit.goal).length / Math.max(1, habits.length);
  return Math.round((dietScore * 0.6 + habitScore * 0.4) * 100);
}

/** Converts observed versus expected progress into a bounded adaptation index. */
export function calculateAdaptationIndex(goal: Goal, expectedWeightDelta: number, actualWeightDelta: number): number {
  if (goal === Goal.MAINTAIN || expectedWeightDelta === 0) return 0;
  const progress = goal === Goal.LOSS
    ? Math.min(1, Math.max(0, Math.abs(actualWeightDelta) / Math.abs(expectedWeightDelta)))
    : Math.min(1, Math.max(0, actualWeightDelta / expectedWeightDelta));
  return Math.max(0, Math.min(100, Math.round((1 - progress) * 100)));
}

export function getAdaptationStatus(goal: Goal, adaptationIndex: number): AdaptationStatus {
  if (goal === Goal.MAINTAIN) return { label: 'Поддержание', color: 'text-slate-300', level: 'none' };
  if (adaptationIndex < 35) return { label: 'Низкая', color: 'text-emerald-300', level: 'low' };
  if (adaptationIndex < 70) return { label: 'Средняя', color: 'text-amber-300', level: 'mid' };
  return { label: 'Высокая', color: 'text-rose-300', level: 'high' };
}

export function getRefeedSuggestion(
  goal: Goal,
  compliancePct: number,
  adaptationIndex: number,
  calorieTarget: number,
): RefeedSuggestion {
  if (goal !== Goal.LOSS || compliancePct < 70) return { type: 'stay' };
  if (adaptationIndex >= 70) return { type: 'refeed', caloriesTomorrow: calorieTarget + 300 };
  if (adaptationIndex >= 45) return { type: 'adjust', stepsExtra: 2000 };
  return { type: 'stay' };
}