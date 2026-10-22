import { describe, expect, it } from 'vitest';
import { Goal } from '../types';
import {
  calculateAdaptationCompliance,
  calculateAdaptationIndex,
  calculateAdaptationWeightProgress,
  calculateExpectedWeightDelta,
  getAdaptationStatus,
  getRefeedSuggestion,
} from '../features/adaptation/adaptationMetrics';

describe('adaptation metrics use case', () => {
  it('sorts imported weight history and caps its comparison window at fourteen days', () => {
    expect(calculateAdaptationWeightProgress([
      { date: '2026-10-15', weight: 78 },
      { date: '2026-09-01', weight: 82 },
      { date: '2026-10-01', weight: 79 },
    ])).toEqual({ deltaDays: 14, weightDelta: -1 });
  });

  it('calculates expected progress, adaptation state, and a refeed recommendation', () => {
    const expected = calculateExpectedWeightDelta({ goal: Goal.LOSS, lossDeficit: 770 } as never, 7);
    expect(expected).toBe(-0.7);
    expect(calculateAdaptationIndex(Goal.LOSS, expected, -0.1)).toBe(86);
    expect(getAdaptationStatus(Goal.LOSS, 86)).toMatchObject({ level: 'high' });
    expect(getRefeedSuggestion(Goal.LOSS, 75, 86, 1800)).toEqual({ type: 'refeed', caloriesTomorrow: 2100 });
  });

  it('blends recent diet adherence and completed habits', () => {
    const now = new Date('2026-10-08T12:00:00').getTime();
    const diary = [
      { id: 'one', name: 'One', calories: 1900, protein: 0, fat: 0, carbs: 0, timestamp: '2026-10-08T08:00:00' },
      { id: 'two', name: 'Two', calories: 2500, protein: 0, fat: 0, carbs: 0, timestamp: '2026-10-07T08:00:00' },
    ];
    const habits = [
      { id: 'water', title: 'Water', current: 8, goal: 8, unit: 'cups', streak: 0, lastCompletedDate: null },
      { id: 'steps', title: 'Steps', current: 2, goal: 10, unit: 'k', streak: 0, lastCompletedDate: null },
    ];
    expect(calculateAdaptationCompliance(diary, habits, 2000, now)).toBe(50);
  });
});