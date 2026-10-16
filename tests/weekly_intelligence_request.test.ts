import { describe, expect, it } from 'vitest';
import { Goal, type UserProfile } from '../types';
import { buildWeeklyIntelligenceRequest } from '../features/ai/weeklyIntelligenceRequest';

describe('weekly intelligence request', () => {
  it('uses the same explicit weekly and target values for AI interpretation', () => {
    const request = buildWeeklyIntelligenceRequest(
      { id: 'user-1', name: 'Анна', goal: Goal.LOSS } as UserProfile,
      {
        wis: 72,
        status: 'stable',
        weightDelta7: -0.4,
        weightDelta30: -1.6,
        compliance: 84,
        adaptationIndex: 24,
      },
      { calories: 1800, protein: 120, fat: 60, carbs: 190 },
    );

    expect(request).toEqual({
      name: 'Анна',
      goal: Goal.LOSS,
      wis: 72,
      status: 'stable',
      weightDelta7: -0.4,
      weightDelta30: -1.6,
      compliancePct: 84,
      adaptationIndex: 24,
      calorieTarget: 1800,
      macros: { protein: 120, fat: 60, carbs: 190 },
    });
  });
});
