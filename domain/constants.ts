import { Goal } from "./types";

/**
 * Macro ratios by goal (sum = 1.0)
 */
export const MACRO_RATIOS: Record<Goal, { protein: number; fat: number; carbs: number }> = {
  [Goal.LOSS]: { protein: 0.30, fat: 0.30, carbs: 0.40 },
  [Goal.MAINTAIN]: { protein: 0.25, fat: 0.30, carbs: 0.45 },
  [Goal.GAIN]: { protein: 0.25, fat: 0.25, carbs: 0.50 },
};

// Calorie offsets (kcal/day)
export const DEFAULT_DEFICIT = 400;
export const MIN_DEFICIT = 200;
export const MAX_DEFICIT = 800;

export const DEFAULT_SURPLUS = 250;
export const MIN_SURPLUS = 100;
export const MAX_SURPLUS = 500;
