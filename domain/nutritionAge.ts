export const MIN_NUTRITION_AGE = 19;
export const MAX_NUTRITION_AGE = 78;
export const NUTRITION_AGE_ERROR = `Укажите возраст целым числом от ${MIN_NUTRITION_AGE} до ${MAX_NUTRITION_AGE} лет.`;

export function supportsNutritionTargets(age: unknown): boolean {
  return typeof age === 'number' && Number.isInteger(age) && age >= MIN_NUTRITION_AGE && age <= MAX_NUTRITION_AGE;
}
