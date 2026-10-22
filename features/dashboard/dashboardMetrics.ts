import type { FoodItem } from '../../types';
import { toLocalDayKey } from '../../dateUtils';
import { weightDelta } from '../../weight';

export type NutritionSnapshot = {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

export type DashboardWeightTrend = {
  current: number;
  diff: number;
  diffPct: number;
  delta7: number;
  delta30: number;
};

const emptyNutrition: NutritionSnapshot = { calories: 0, protein: 0, fat: 0, carbs: 0 };

/** Aggregates the food diary for one local calendar day. */
export function calculateDailyNutrition(foodDiary: FoodItem[], day = new Date()): NutritionSnapshot {
  const dayKey = toLocalDayKey(day);
  return foodDiary.reduce<NutritionSnapshot>((totals, item) => {
    if (toLocalDayKey(item.timestamp) !== dayKey) return totals;
    return {
      calories: totals.calories + item.calories,
      protein: totals.protein + item.protein,
      fat: totals.fat + item.fat,
      carbs: totals.carbs + item.carbs,
    };
  }, emptyNutrition);
}

/** Derives dashboard trend values from a date-ordered copy of weight history. */
export function calculateDashboardWeightTrend(
  history: Array<{ date: string; weight: number }> | undefined,
): DashboardWeightTrend | undefined {
  if (!history || history.length < 2) return undefined;
  const sorted = [...history].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
  const current = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  const diff = current.weight - previous.weight;
  return {
    current: current.weight,
    diff,
    diffPct: previous.weight === 0 ? 0 : (diff / previous.weight) * 100,
    delta7: weightDelta(sorted, 7),
    delta30: weightDelta(sorted, 30),
  };
}