import { describe, expect, it } from 'vitest';
import type { FavoriteRecipe } from '../types';
import {
  normalizeFavoriteRecipe,
  prependFavoriteRecipe,
} from '../features/recipes/useFavoriteRecipes';

describe('favorite recipes feature', () => {
  it('migrates legacy ingredients and steps into the current recipe shape', () => {
    const recipe = normalizeFavoriteRecipe({
      id: 'recipe-1',
      title: 'Омлет',
      createdAt: '2026-10-07T08:00:00.000Z',
      ingredients: ['Яйца'],
      recipe: {
        ingredients: [{ title: 'Яйца', grams: 120 }],
        steps: ['Взбить яйца', { step: 'Обжарить', time_minutes: 5 }],
        tips: ['Не пересушивать'],
      },
    });

    expect(recipe).toMatchObject({
      id: 'recipe-1',
      title: 'Омлет',
      recipe: {
        ingredients: [{ name: 'Яйца', amount: '120' }],
        steps: [
          { n: 1, text: 'Взбить яйца' },
          { n: 2, text: 'Обжарить', timeMin: 5 },
        ],
        tips: ['Не пересушивать'],
      },
    });
  });

  it('drops malformed saved values and gives missing dates a deterministic fallback', () => {
    expect(normalizeFavoriteRecipe(null)).toBeNull();
    expect(normalizeFavoriteRecipe(
      { id: 'recipe-2', title: 'Салат', recipe: {} },
      () => new Date('2026-10-07T12:00:00.000Z'),
    )?.createdAt).toBe('2026-10-07T12:00:00.000Z');
  });

  it('keeps the newest 100 recipes when adding a favorite', () => {
    const recipes = Array.from({ length: 100 }, (_, index) => ({ id: String(index) })) as FavoriteRecipe[];
    const newest = { id: 'newest' } as FavoriteRecipe;

    const result = prependFavoriteRecipe(recipes, newest);

    expect(result).toHaveLength(100);
    expect(result[0]).toBe(newest);
    expect(result.at(-1)?.id).toBe('98');
  });
});
