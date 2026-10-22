import type { UserProfile } from '../../types';

export type NutritionSnapshot = {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

export type CoachAdviceRequest = {
  user: {
    name: string;
    goal: UserProfile['goal'];
    caloriesTarget: number;
    proteinTarget: number;
    fatTarget: number;
    carbsTarget: number;
    adaptationMultiplier: number;
    bloodPressureSystolic?: number;
    bloodPressureDiastolic?: number;
    restingPulse?: number;
    waistCm?: number;
    chestCm?: number;
    hipsCm?: number;
    medicalRestrictions?: string;
  };
  today: NutritionSnapshot & {
    habitsDone: number;
    habitsTotal: number;
  };
};

export function buildCoachAdviceRequest(
  user: UserProfile,
  targets: NutritionSnapshot,
  dailyStats: NutritionSnapshot,
  dayHabits: Record<string, boolean> | undefined,
): CoachAdviceRequest {
  return {
    user: {
      name: user.name,
      goal: user.goal,
      caloriesTarget: targets.calories,
      proteinTarget: targets.protein,
      fatTarget: targets.fat,
      carbsTarget: targets.carbs,
      adaptationMultiplier: user.adaptationMultiplier,
      bloodPressureSystolic: user.bloodPressureSystolic,
      bloodPressureDiastolic: user.bloodPressureDiastolic,
      restingPulse: user.restingPulse,
      waistCm: user.waistCm,
      chestCm: user.chestCm,
      hipsCm: user.hipsCm,
      medicalRestrictions: user.medicalRestrictions,
    },
    today: {
      ...dailyStats,
      habitsDone: Object.values(dayHabits || {}).filter(Boolean).length,
      habitsTotal: 4,
    },
  };
}
