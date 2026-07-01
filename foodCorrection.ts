import type { FoodIngredient, FoodInsight, FoodItem, MealType } from './types';

export type FoodCorrectionDraft = {
  id: string;
  name: string;
  mealType: MealType;
  timestamp: string;
  calories: string;
  protein: string;
  fat: string;
  carbs: string;
  ingredientsText: string;
  notesText: string;
  nonFood: boolean;
  sourceNonFood?: boolean;
};

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function numberToDraft(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.round(n * 10) / 10) : '0';
}

function parseNonNegativeNumber(value: unknown): number {
  const normalized = String(value ?? '').replace(',', '.').trim();
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 10) / 10;
}

function normalizeMealType(value: unknown, fallback: MealType): MealType {
  return MEAL_TYPES.includes(value as MealType) ? value as MealType : fallback;
}

export function formatIngredientsForCorrection(ingredients: FoodIngredient[] | undefined): string {
  return (ingredients || [])
    .filter((it) => it?.name)
    .map((it) => {
      const percent = Number.isFinite(Number(it.percent)) ? Math.round(Number(it.percent)) : 0;
      const note = String(it.note || '').trim();
      return `${it.name} | ${percent}${note ? ` | ${note}` : ''}`;
    })
    .join('\n');
}

export function parseIngredientsForCorrection(value: string): FoodIngredient[] {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((part) => part.trim());
      const name = String(parts[0] || '').slice(0, 80);
      const percent = Math.max(0, Math.min(100, Math.round(parseNonNegativeNumber(parts[1] ?? 0))));
      const note = String(parts.slice(2).join(' | ') || '').trim().slice(0, 180);
      return {
        name,
        percent,
        ...(note ? { note } : {}),
      };
    })
    .filter((it) => it.name);
}

export function parseNotesForCorrection(value: string): string[] {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^[•*-]\s*/, '').trim())
    .filter(Boolean)
    .map((line) => line.slice(0, 220))
    .slice(0, 8);
}

export function buildFoodCorrectionDraft(item: FoodItem, fallbackMealType: MealType): FoodCorrectionDraft {
  const insight = item.insight;
  const mealType = normalizeMealType(item.mealType, fallbackMealType);
  const nonFood = item.nonFood === true;
  return {
    id: item.id,
    name: item.name || '',
    mealType,
    timestamp: item.timestamp || new Date().toISOString(),
    calories: nonFood ? '0' : numberToDraft(item.calories),
    protein: nonFood ? '0' : numberToDraft(item.protein),
    fat: nonFood ? '0' : numberToDraft(item.fat),
    carbs: nonFood ? '0' : numberToDraft(item.carbs),
    ingredientsText: nonFood ? '' : formatIngredientsForCorrection(insight?.ingredients),
    notesText: (insight?.notes || []).join('\n'),
    nonFood,
    sourceNonFood: nonFood,
  };
}

export function buildCorrectedFoodPatch(draft: FoodCorrectionDraft, previousInsight?: FoodInsight): Partial<FoodItem> {
  const calories = parseNonNegativeNumber(draft.calories);
  const protein = parseNonNegativeNumber(draft.protein);
  const fat = parseNonNegativeNumber(draft.fat);
  const carbs = parseNonNegativeNumber(draft.carbs);
  const ingredients = parseIngredientsForCorrection(draft.ingredientsText);
  const notes = parseNotesForCorrection(draft.notesText);
  const hasFoodData = calories > 0 || protein > 0 || fat > 0 || carbs > 0 || ingredients.length > 0;

  if (draft.nonFood || (draft.sourceNonFood === true && !hasFoodData)) {
    return {
      name: draft.name.trim() || 'Не еда',
      mealType: normalizeMealType(draft.mealType, 'snack'),
      timestamp: draft.timestamp,
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      nonFood: true,
      insight: {
        calories: 0,
        macros: { protein: 0, fat: 0, carbs: 0 },
        ingredients: [],
        notes: notes.length ? notes : ['Помечено вручную как не еда. Запись не учитывается в КБЖУ.'],
      },
    };
  }

  const insight: FoodInsight = {
    ...(previousInsight || { calories, macros: { protein, fat, carbs }, ingredients: [] }),
    calories,
    macros: { protein, fat, carbs },
    ingredients,
    notes,
  };

  return {
    name: draft.name.trim() || 'Блюдо',
    mealType: normalizeMealType(draft.mealType, 'snack'),
    timestamp: draft.timestamp,
    calories,
    protein,
    fat,
    carbs,
    nonFood: false,
    insight,
  };
}
