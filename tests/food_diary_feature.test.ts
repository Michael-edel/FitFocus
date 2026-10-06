import { describe, expect, it } from 'vitest';
import { appendFoodHistory, createFoodDiaryEntry } from '../features/diary/useFoodDiary';
import type { FastLogItem } from '../storage/foodDiary';

const food: FastLogItem = {
  name: 'Овсянка',
  calories: 350,
  protein: 12,
  fat: 8,
  carbs: 54,
  photo: 'data:image/jpeg;base64,photo',
  insight: {
    calories: 350,
    macros: { protein: 12, fat: 8, carbs: 54 },
    ingredients: [],
    recipe: { title: 'Каша', ingredients: [], steps: [] },
  },
};

describe('food diary feature', () => {
  it('creates a diary entry with the supplied identity and inferred meal type', () => {
    const entry = createFoodDiaryEntry(
      { ...food, timestamp: '2026-10-06T08:00:00.000Z' },
      'entry-1',
      () => 'breakfast',
    );

    expect(entry).toMatchObject({
      id: 'entry-1',
      timestamp: '2026-10-06T08:00:00.000Z',
      mealType: 'breakfast',
    });
  });

  it('keeps history compact and replaces entries with the same food name', () => {
    const history = appendFoodHistory([{ ...food, name: 'Омлет', photo: undefined }], food);
    const replaced = appendFoodHistory(history, { ...food, calories: 370 });

    expect(replaced).toHaveLength(2);
    expect(replaced[0]).toMatchObject({ name: 'Овсянка', calories: 370 });
    expect(replaced[0].photo).toBeUndefined();
    expect(replaced[0].insight?.recipe).toBeUndefined();
  });
});
