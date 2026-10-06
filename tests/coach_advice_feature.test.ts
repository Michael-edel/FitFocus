import { describe, expect, it } from 'vitest';
import { buildCoachAdviceRequest } from '../features/ai/coachAdvice';
import { ActivityLevel, Gender, Goal, type UserProfile } from '../types';

const user: UserProfile = {
  id: 'user-1',
  name: 'Ирина',
  gender: Gender.FEMALE,
  weight: 68,
  height: 168,
  age: 33,
  activityLevel: ActivityLevel.MODERATELY_ACTIVE,
  goal: Goal.LOSS,
  weightHistory: [],
  targetWeight: 60,
  adaptationMultiplier: 1,
  familyMembers: [],
  exclusions: '',
  bloodPressureSystolic: 120,
  restingPulse: 62,
  medicalRestrictions: 'Следить за сном',
};

describe('coach advice feature', () => {
  it('builds the AI input from current nutrition, profile and completed habits', () => {
    expect(buildCoachAdviceRequest(
      user,
      { calories: 1800, protein: 110, fat: 60, carbs: 200 },
      { calories: 840, protein: 52, fat: 24, carbs: 93 },
      { water: true, steps: false, breakfast: true, sleep: true },
    )).toEqual({
      user: expect.objectContaining({
        name: 'Ирина',
        goal: Goal.LOSS,
        caloriesTarget: 1800,
        proteinTarget: 110,
        restingPulse: 62,
      }),
      today: {
        calories: 840,
        protein: 52,
        fat: 24,
        carbs: 93,
        habitsDone: 3,
        habitsTotal: 4,
      },
    });
  });
});
