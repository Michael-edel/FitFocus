import type { UserProfile } from '../../types';
import type { WeeklyIntelligenceResult } from '../../weeklyIntelligence';

export type MacroTargets = {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

export type WeeklyIntelligenceRequest = {
  name: string;
  goal: UserProfile['goal'];
  wis: number;
  status: WeeklyIntelligenceResult['status'];
  weightDelta7: number;
  weightDelta30: number;
  compliancePct: number;
  adaptationIndex: number;
  calorieTarget: number;
  macros: Omit<MacroTargets, 'calories'>;
};

/** Builds the same safe AI context for automatic and user-triggered weekly reports. */
export function buildWeeklyIntelligenceRequest(
  user: UserProfile,
  weekly: WeeklyIntelligenceResult,
  targets: MacroTargets,
): WeeklyIntelligenceRequest {
  return {
    name: user.name,
    goal: user.goal,
    wis: weekly.wis,
    status: weekly.status,
    weightDelta7: weekly.weightDelta7,
    weightDelta30: weekly.weightDelta30,
    compliancePct: weekly.compliance,
    adaptationIndex: weekly.adaptationIndex,
    calorieTarget: targets.calories,
    macros: {
      protein: targets.protein,
      fat: targets.fat,
      carbs: targets.carbs,
    },
  };
}
