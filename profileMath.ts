import { Gender, Goal, ActivityLevel, UserProfile, NutritionIntake } from "./types";
import { MACRO_RATIOS, DEFAULT_DEFICIT, DEFAULT_SURPLUS, MIN_DEFICIT, MAX_DEFICIT, MIN_SURPLUS, MAX_SURPLUS } from "./constants";

type PersonLike = Pick<UserProfile, "gender" | "weight" | "height" | "age" | "activityLevel" | "goal" | "adaptationMultiplier" | "lossDeficit" | "gainSurplus">;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function calculateBMR(person: Pick<PersonLike, "gender" | "weight" | "height" | "age">): number {
  // Mifflin–St Jeor
  const base = 10 * person.weight + 6.25 * person.height - 5 * person.age;
  return person.gender === Gender.MALE ? base + 5 : base - 161;
}

export function calculateTDEE(person: PersonLike): number {
  const bmr = calculateBMR(person);
  const activity = Number(person.activityLevel || ActivityLevel.SEDENTARY);
  const adaptation = person.adaptationMultiplier ?? 1.0;
  return bmr * activity * adaptation;
}

/**
 * Применяет смещение калорий в зависимости от цели.
 */
export function applyGoalOffsetCalories(tdee: number, goal: Goal, customOffset?: number): number {
  if (goal === Goal.LOSS) {
    const off = customOffset !== undefined ? customOffset : DEFAULT_DEFICIT;
    return tdee - clamp(off, MIN_DEFICIT, MAX_DEFICIT);
  }
  if (goal === Goal.GAIN) {
    const off = customOffset !== undefined ? customOffset : DEFAULT_SURPLUS;
    return tdee + clamp(off, MIN_SURPLUS, MAX_SURPLUS);
  }
  return tdee;
}

export function calculateDailyTargets(person: PersonLike): NutritionIntake {
  const tdee = calculateTDEE(person);
  const customOffset = person.goal === Goal.LOSS ? person.lossDeficit : person.goal === Goal.GAIN ? person.gainSurplus : undefined;
  const calories = Math.max(1200, Math.round(applyGoalOffsetCalories(tdee, person.goal, customOffset)));
  const ratios = MACRO_RATIOS[person.goal];
  return {
    calories,
    protein: Math.round((calories * ratios.protein) / 4),
    fat: Math.round((calories * ratios.fat) / 9),
    carbs: Math.round((calories * ratios.carbs) / 4),
  };
}

export type BloodGlucoseStatus = 'low' | 'normal' | 'high' | 'unknown';

export function getBloodGlucoseStatus(value?: number | null): BloodGlucoseStatus {
  const glucose = Number(value);
  if (!Number.isFinite(glucose) || glucose <= 0) return 'unknown';
  if (glucose < 4.0) return 'low';
  if (glucose <= 6.0) return 'normal';
  return 'high';
}

export function formatBloodGlucose(value?: number | null): string {
  const glucose = Number(value);
  if (!Number.isFinite(glucose) || glucose <= 0) return '—';
  return `${glucose.toFixed(1)} ммоль/л`;
}

export function getBloodGlucoseGuidance(value?: number | null): string {
  switch (getBloodGlucoseStatus(value)) {
    case 'low':
      return 'низкий';
    case 'normal':
      return 'норма';
    case 'high':
      return 'повышен';
    default:
      return 'не указан';
  }
}
