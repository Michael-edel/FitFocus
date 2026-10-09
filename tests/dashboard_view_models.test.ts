import { describe, expect, it } from 'vitest';
import { Goal, type FoodItem } from '../types';
import { calculateNextWeekWeightForecast, findFoodSearchResults } from '../features/dashboard/dashboardViewModels';

const food = (name: string): FoodItem => ({ id: name, name, calories: 100, protein: 1, fat: 1, carbs: 1, timestamp: '2026-01-01T00:00:00.000Z' });

describe('dashboard view models', () => {
  it('calculates weight forecast only after weekly report is available', () => {
    const user = { goal: Goal.LOSS, lossDeficit: 550, gainSurplus: 300 };
    expect(calculateNextWeekWeightForecast(user, false, { lossDeficit: 500, gainSurplus: 250 })).toBe(0);
    expect(calculateNextWeekWeightForecast(user, true, { lossDeficit: 500, gainSurplus: 250 })).toBe(-0.5);
    expect(calculateNextWeekWeightForecast({ ...user, goal: Goal.GAIN }, true, { lossDeficit: 500, gainSurplus: 250 })).toBeCloseTo(300 * 7 / 7700);
  });

  it('finds unique foods by a normalized search query and applies a limit', () => {
    expect(findFoodSearchResults('  ябл ', [food('Яблоко'), food('Банан')], [food('Яблоко'), food('Яблочный сок')])).toEqual([
      food('Яблоко'),
      food('Яблочный сок'),
    ]);
    expect(findFoodSearchResults('  ', [food('Яблоко')], [])).toEqual([]);
    expect(findFoodSearchResults('а', [food('Арбуз'), food('Ананас'), food('Банан')], [], 2)).toHaveLength(2);
  });
});

