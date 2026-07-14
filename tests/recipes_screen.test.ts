import { describe, expect, it } from 'vitest';
import { normalizeEnhancedFoodPhotoAnalysis } from '../geminiService';
import { buildDraftRecipeFromAi } from '../RecipesScreen';

describe('recipe draft builder', () => {
  it('builds a typed draft from enhanced food photo analysis', () => {
    const ai = normalizeEnhancedFoodPhotoAnalysis({
      name: 'Сырники',
      calories: 315.4,
      protein: 20.2,
      fat: 12.1,
      carbs: 31.8,
      ingredients: [
        { name: 'Творог', amount: '200 г' },
        { name: '', amount: '100 г' },
      ],
      steps: ['Смешать ингредиенты', { text: 'Обжарить', time_minutes: 8 }, { broken: true }],
      tips: ['Подать с ягодами'],
      allergens: ['молоко'],
      servings: 2,
      timeMinutes: 20,
    });

    const draft = buildDraftRecipeFromAi(ai, 'data:image/jpeg;base64,test', 'recipe-1');

    expect(draft.id).toBe('recipe-1');
    expect(draft.title).toBe('Сырники');
    expect(draft.calories).toBe(315);
    expect(draft.protein).toBe(20);
    expect(draft.fat).toBe(12);
    expect(draft.carbs).toBe(32);
    expect(draft.ingredients).toEqual([{ name: 'Творог', amount: '200 г' }]);
    expect(draft.recipe.ingredients).toEqual([{ name: 'Творог', amount: '200 г' }]);
    expect(draft.recipe.steps).toEqual([
      { n: 1, text: 'Смешать ингредиенты' },
      { n: 2, text: 'Обжарить', timeMin: 8 },
    ]);
    expect(draft.recipe.tips).toEqual(['Подать с ягодами']);
    expect(draft.allergens).toEqual(['молоко']);
  });
});
