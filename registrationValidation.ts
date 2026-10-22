import { Goal, type UserProfile } from './types';
import { calculateTDEE } from './profileMath';
import { DEFAULT_DEFICIT, DEFAULT_SURPLUS, AGGRESSIVE_DEFICIT, AGGRESSIVE_SURPLUS, MIN_DEFICIT, MAX_DEFICIT, MIN_SURPLUS, MAX_SURPLUS } from './constants';

export const REGISTRATION_MIN_AGE = 1;
export const REGISTRATION_MAX_AGE = 130;
export const TARGET_WEIGHT_MIN = 25;
export const TARGET_WEIGHT_MAX = 350;

type TargetWeightInput = { weight: number; goal: Goal; targetWeight?: number };

/** Preserve the registration suggestion only for an omitted/empty (zero) target. */
export function resolveTargetWeight({ weight, goal, targetWeight }: TargetWeightInput): number {
  if (targetWeight !== undefined && targetWeight !== 0) return Number(targetWeight.toFixed(1));
  const baseWeight = Number.isFinite(weight) && weight > 0 ? weight : 0;
  if (!baseWeight) return 0;
  if (goal === Goal.LOSS) return Number(Math.max(40, baseWeight * 0.9).toFixed(1));
  if (goal === Goal.GAIN) return Number(Math.max(baseWeight + 1, baseWeight * 1.05).toFixed(1));
  return Number(baseWeight.toFixed(1));
}

export function targetWeightError(data: TargetWeightInput): string | null {
  if (data.targetWeight !== undefined && data.targetWeight !== 0
    && (!Number.isFinite(data.targetWeight) || data.targetWeight < TARGET_WEIGHT_MIN || data.targetWeight > TARGET_WEIGHT_MAX)) {
    return 'Укажите целевой вес от 25 до 350 кг.';
  }
  const target = resolveTargetWeight(data);
  if (!Number.isFinite(target) || target < TARGET_WEIGHT_MIN || target > TARGET_WEIGHT_MAX) return 'Укажите целевой вес от 25 до 350 кг.';
  if (data.goal === Goal.LOSS && target >= data.weight) return 'Для снижения укажите целевой вес меньше текущего.';
  if (data.goal === Goal.GAIN && target <= data.weight) return 'Для набора укажите целевой вес больше текущего.';
  return null;
}
type Basics = Pick<UserProfile, 'weight' | 'height' | 'age' | 'gender' | 'activityLevel' | 'goal' | 'lossDeficit' | 'gainSurplus' | 'riskAcknowledgedLoss' | 'riskAcknowledgedGain'>;
export type RegistrationInput = Omit<Basics, 'riskAcknowledgedLoss' | 'riskAcknowledgedGain'> & { targetWeight?: number; riskAckLoss?: boolean; riskAckGain?: boolean };

/** Registration checks run before activation, local profile creation or AI. */
export function registrationErrors(data: RegistrationInput) {
  const errors: Partial<Record<'weight' | 'height' | 'age' | 'activity' | 'offset' | 'anthro' | 'targetWeight', string>> = {};
  if (!Number.isFinite(data.weight) || data.weight < 25 || data.weight > 350) errors.weight = 'Укажите вес от 25 до 350 кг.';
  if (!Number.isFinite(data.height) || data.height < 120 || data.height > 230) errors.height = 'Укажите рост от 120 до 230 см.';
  if (!Number.isInteger(data.age) || data.age < REGISTRATION_MIN_AGE || data.age > REGISTRATION_MAX_AGE) errors.age = 'Укажите возраст целым числом от 1 до 130 лет.';
  if (!Number.isFinite(data.activityLevel) || data.activityLevel <= 0) errors.activity = 'Выберите уровень активности.';
  if (!errors.weight && !errors.height) {
    const bmi = data.weight / (data.height / 100) ** 2;
    if (bmi < 12 || bmi > 60) errors.anthro = 'Проверьте сочетание веса и роста: оно выглядит нереалистично.';
  }
  const offset = data.goal === Goal.LOSS ? data.lossDeficit : data.goal === Goal.GAIN ? data.gainSurplus : undefined;
  const min = data.goal === Goal.LOSS ? MIN_DEFICIT : MIN_SURPLUS;
  const max = data.goal === Goal.LOSS ? MAX_DEFICIT : MAX_SURPLUS;
  if (offset !== undefined && (!Number.isFinite(offset) || offset < min || offset > max)) errors.offset = `Укажите интенсивность от ${min} до ${max} ккал/день.`;
  if (!errors.weight) {
    const targetError = targetWeightError(data);
    if (targetError) errors.targetWeight = targetError;
  }
  return errors;
}

export function registrationError(data: RegistrationInput): string | null {
  return Object.values(registrationErrors(data))[0] ?? null;
}

export function registrationRisk(data: RegistrationInput) {
  if (registrationError(data) || data.goal === Goal.MAINTAIN) return null;
  const loss = data.goal === Goal.LOSS;
  const amount = loss ? data.lossDeficit ?? DEFAULT_DEFICIT : data.gainSurplus ?? DEFAULT_SURPLUS;
  const tdee = calculateTDEE({ ...data, adaptationMultiplier: 1 });
  const limit = loss ? Math.min(AGGRESSIVE_DEFICIT, Math.round(tdee * 0.3)) : AGGRESSIVE_SURPLUS;
  if (amount <= limit) return null;
  return { amount, goal: data.goal, acknowledged: loss ? data.riskAckLoss === true : data.riskAckGain === true };
}
