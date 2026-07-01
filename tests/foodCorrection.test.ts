import { describe, expect, it } from 'vitest';
import {
  buildCorrectedFoodPatch,
  buildFoodCorrectionDraft,
  parseIngredientsForCorrection,
  parseNotesForCorrection,
} from '../foodCorrection';
import type { FoodItem } from '../types';

describe('food correction helpers', () => {
  it('parses corrected ingredients with notes', () => {
    expect(parseIngredientsForCorrection([
      'Тесто (мука пшеничная, вода, соль) | 40',
      'Мясной фарш свинина/говядина | 35 | смешанный фарш',
      'Манго-чили соус | 10 | соус с упаковки',
    ].join('\n'))).toEqual([
      { name: 'Тесто (мука пшеничная, вода, соль)', percent: 40 },
      { name: 'Мясной фарш свинина/говядина', percent: 35, note: 'смешанный фарш' },
      { name: 'Манго-чили соус', percent: 10, note: 'соус с упаковки' },
    ]);
  });

  it('builds a synced food item patch for diary and insight', () => {
    const patch = buildCorrectedFoodPatch({
      id: 'food-1',
      name: 'Манты свинина/говядина с манго-чили соусом',
      mealType: 'lunch',
      timestamp: '2026-06-26T08:15:00.000Z',
      calories: '610',
      protein: '45',
      fat: '40',
      carbs: '125',
      ingredientsText: 'Манты свинина/говядина | 90\nМанго-чили соус | 10',
      notesText: 'Фарш уточнён вручную\nСоус распознан по упаковке',
      nonFood: false,
    });

    expect(patch).toMatchObject({
      name: 'Манты свинина/говядина с манго-чили соусом',
      mealType: 'lunch',
      calories: 610,
      protein: 45,
      fat: 40,
      carbs: 125,
      insight: {
        calories: 610,
        macros: { protein: 45, fat: 40, carbs: 125 },
        ingredients: [
          { name: 'Манты свинина/говядина', percent: 90 },
          { name: 'Манго-чили соус', percent: 10 },
        ],
        notes: ['Фарш уточнён вручную', 'Соус распознан по упаковке'],
      },
    });
  });

  it('creates an editable draft from an existing food item', () => {
    const item: FoodItem = {
      id: 'food-1',
      name: 'Манты с соусом',
      calories: 610,
      protein: 45,
      fat: 40,
      carbs: 125,
      timestamp: '2026-06-26T08:15:00.000Z',
      mealType: 'snack',
      insight: {
        calories: 610,
        macros: { protein: 45, fat: 40, carbs: 125 },
        ingredients: [{ name: 'Абрикосовый соус', percent: 10 }],
        notes: ['Первичная AI-оценка'],
      },
    };

    const draft = buildFoodCorrectionDraft(item, 'breakfast');

    expect(draft.mealType).toBe('snack');
    expect(draft.ingredientsText).toBe('Абрикосовый соус | 10');
    expect(parseNotesForCorrection(draft.notesText)).toEqual(['Первичная AI-оценка']);
  });

  it('marks a correction as non-food and removes it from nutrition totals', () => {
    const patch = buildCorrectedFoodPatch({
      id: 'food-1',
      name: 'Фото упаковки соуса',
      mealType: 'snack',
      timestamp: '2026-06-26T08:15:00.000Z',
      calories: '610',
      protein: '45',
      fat: '40',
      carbs: '125',
      ingredientsText: 'Манго-чили соус | 100',
      notesText: '',
      nonFood: true,
    });

    expect(patch).toMatchObject({
      name: 'Фото упаковки соуса',
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      nonFood: true,
      insight: {
        calories: 0,
        macros: { protein: 0, fat: 0, carbs: 0 },
        ingredients: [],
      },
    });
  });

  it('opens an existing non-food entry with zero nutrition even if stale calories were stored', () => {
    const item: FoodItem = {
      id: 'food-2',
      name: 'Золотистый ретривер (не блюдо)',
      calories: 400,
      protein: 200,
      fat: 13,
      carbs: 15,
      timestamp: '2026-07-01T08:15:00.000Z',
      mealType: 'snack',
      nonFood: true,
      insight: {
        calories: 400,
        macros: { protein: 200, fat: 13, carbs: 15 },
        ingredients: [{ name: 'Объект на фото', percent: 100 }],
        notes: ['Это не блюдо и не пищевой продукт.'],
      },
    };

    const draft = buildFoodCorrectionDraft(item, 'snack');

    expect(draft).toMatchObject({
      calories: '0',
      protein: '0',
      fat: '0',
      carbs: '0',
      ingredientsText: '',
      nonFood: true,
      sourceNonFood: true,
    });
  });

  it('keeps a source non-food entry non-food when the checkbox is removed without food data', () => {
    const patch = buildCorrectedFoodPatch({
      id: 'food-2',
      name: 'Золотистый ретривер (не блюдо)',
      mealType: 'snack',
      timestamp: '2026-07-01T08:15:00.000Z',
      calories: '0',
      protein: '0',
      fat: '0',
      carbs: '0',
      ingredientsText: '',
      notesText: '',
      nonFood: false,
      sourceNonFood: true,
    });

    expect(patch).toMatchObject({
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      nonFood: true,
      insight: {
        calories: 0,
        macros: { protein: 0, fat: 0, carbs: 0 },
        ingredients: [],
      },
    });
  });
});
