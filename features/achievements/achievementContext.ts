import { calculateFoodStreak } from "../../analytics/foodStreak";
import type { AchievementEvaluationContext } from "../../achievements/engine";
import type { UserProfile } from "../../types";

type ShoppingItem = { checked?: boolean };

/** Builds the complete local snapshot used to evaluate achievements. */
export function buildAchievementContext(input: {
  currentUser: UserProfile | null | undefined;
  foodDiary: Array<{ timestamp?: string | number | Date | null }>;
  weeklyReportsCount: number;
  shoppingItems?: ShoppingItem[] | null;
  familyActive: boolean;
  todayKey: string;
}): AchievementEvaluationContext {
  const { currentUser, foodDiary } = input;
  const weightHistory = currentUser?.weightHistory || [];
  const firstWeight = typeof weightHistory[0]?.weight === "number" ? weightHistory[0].weight : null;
  const latestWeight = typeof weightHistory[weightHistory.length - 1]?.weight === "number"
    ? weightHistory[weightHistory.length - 1].weight
    : typeof currentUser?.weight === "number" ? currentUser.weight : null;
  const todayHabits = currentUser?.dailyHabits?.[input.todayKey] as { water?: unknown } | undefined;
  return {
    profileExists: !!currentUser,
    profileDetailsCompleted: !!currentUser?.profileDetailsCompleted,
    hasAiPlan: !!currentUser?.aiPlan,
    hasWeeklyMenu: !!currentUser?.aiPlan?.weeklyMenu || !!currentUser?.aiPlan?.familyWeeklyMenu,
    foodDiaryCount: foodDiary.length,
    foodStreak: calculateFoodStreak(foodDiary).streak,
    weightHistoryCount: weightHistory.length,
    initialWeight: firstWeight,
    latestWeight,
    measurementsCount: currentUser?.measurementsHistory?.length || 0,
    wisCount: input.weeklyReportsCount,
    shoppingCheckedCount: input.shoppingItems?.filter((item) => item.checked).length || 0,
    familyActive: input.familyActive,
    waterToday: !!todayHabits?.water,
    sleepHours: typeof currentUser?.wearableSleepHoursLastNight === "number" ? currentUser.wearableSleepHoursLastNight : null,
  };
}
