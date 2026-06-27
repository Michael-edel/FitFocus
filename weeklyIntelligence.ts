import { Goal, UserProfile, FoodItem, UserHabit } from "./types";
import { DEFAULT_DEFICIT, DEFAULT_SURPLUS, MIN_DEFICIT, MAX_DEFICIT, MIN_SURPLUS, MAX_SURPLUS } from "./constants";
import { toLocalDayKey } from "./dateUtils";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export interface WeeklyIntelligenceResult {
  wis: number; // Weekly Intelligence Score 0-100
  weightDelta7: number;
  weightDelta30: number;
  compliance: number; // 0-100
  adaptationIndex: number; // 0-100
  status: "excellent" | "stable" | "adjust" | "critical";
}

type WeightHistoryEntry = UserProfile["weightHistory"][number];

function calculateWeightDelta(history: WeightHistoryEntry[], days: number): number {
  if (!history || history.length < 2) return 0;
  const now = history[history.length - 1];
  const past = history
    .slice()
    .reverse()
    .find(e => new Date(now.date).getTime() - new Date(e.date).getTime() >= days * 86400000);
  return past ? now.weight - past.weight : 0;
}

function calculateCompliance(
  foods: FoodItem[],
  habits: UserHabit[],
  calorieTarget: number
): number {
  if (!foods.length && !habits.length) return 0;

  const sums: Record<string, number> = {};
  for (const f of foods) {
    const key = toLocalDayKey(f.timestamp);
    if (!key) continue;
    sums[key] = (sums[key] ?? 0) + (f.calories ?? 0);
  }

  const days = Object.keys(sums);
  const okDays = days.filter(d => sums[d] <= calorieTarget * 1.1).length;
  const dietScore = days.length > 0 ? okDays / days.length : 0;
  const habitScore = habits.length > 0 ? habits.filter(h => h.current >= h.goal).length / habits.length : 1;

  return Math.round((dietScore * 0.6 + habitScore * 0.4) * 100);
}

function calculateAdaptationIndex(
  goal: Goal,
  weightDelta14: number,
  expected14: number
): number {
  if (goal === Goal.MAINTAIN || expected14 === 0) return 0;

  const progress =
    goal === Goal.LOSS
      ? Math.abs(weightDelta14) / Math.abs(expected14)
      : weightDelta14 / expected14;

  const normalized = Math.min(1, Math.max(0, progress));
  return Math.round((1 - normalized) * 100);
}

export function generateWeeklyIntelligence(
  user: UserProfile,
  foods: FoodItem[],
  habits: UserHabit[],
  calorieTarget: number
): WeeklyIntelligenceResult {
  const weightDelta7 = calculateWeightDelta(user.weightHistory ?? [], 7);
  const weightDelta30 = calculateWeightDelta(user.weightHistory ?? [], 30);
  const weightDelta14 = calculateWeightDelta(user.weightHistory ?? [], 14);

  const expected14 =
    user.goal === Goal.LOSS
      ? (-clamp(Number(user.lossDeficit ?? DEFAULT_DEFICIT), MIN_DEFICIT, MAX_DEFICIT) * 14) / 7700
      : user.goal === Goal.GAIN
      ? (clamp(Number(user.gainSurplus ?? DEFAULT_SURPLUS), MIN_SURPLUS, MAX_SURPLUS) * 14) / 7700
      : 0;

  const compliance = calculateCompliance(foods, habits, calorieTarget);
  const adaptationIndex = calculateAdaptationIndex(user.goal, weightDelta14, expected14);

  // Качественная оценка динамики веса: для похудения отрицательная дельта — это хорошо
  const weightScore = user.goal === Goal.LOSS 
    ? (weightDelta7 < 0 ? 100 : Math.max(0, 100 - weightDelta7 * 200))
    : (weightDelta7 > 0 ? 100 : Math.max(0, 100 + weightDelta7 * 200));

  const complianceScore = compliance;
  const adaptationScore = 100 - adaptationIndex;

  const wis = Math.round(
    weightScore * 0.4 +
    complianceScore * 0.3 +
    adaptationScore * 0.3
  );

  let status: WeeklyIntelligenceResult["status"] = "stable";

  if (wis >= 80) status = "excellent";
  else if (wis >= 60) status = "stable";
  else if (wis >= 40) status = "adjust";
  else status = "critical";

  return {
    wis,
    weightDelta7,
    weightDelta30,
    compliance,
    adaptationIndex,
    status
  };
}
