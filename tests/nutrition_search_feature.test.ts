import { describe, expect, it } from 'vitest';
import { parseNutritionSearchState } from '../features/nutrition/useNutritionSearchState';

describe('nutrition search feature', () => {
  it('restores the current structured search state', () => {
    expect(parseNutritionSearchState('{"query":"омлет","open":true}')).toEqual({
      query: 'омлет',
      open: true,
    });
  });

  it('preserves legacy plain-text and JSON-string queries', () => {
    expect(parseNutritionSearchState('гречка')).toEqual({ query: 'гречка', open: false });
    expect(parseNutritionSearchState('"куриная грудка"')).toEqual({ query: 'куриная грудка', open: false });
  });

  it('falls back safely for absent or malformed values', () => {
    expect(parseNutritionSearchState(null)).toEqual({ query: '', open: false });
    expect(parseNutritionSearchState('{bad-json')).toEqual({ query: '{bad-json', open: false });
  });
});
