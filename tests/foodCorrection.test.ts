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
});
