import { describe, expect, it } from 'vitest';
import { buildCoachAdviceRequest, type CoachAdviceRequest } from '../features/ai/coachAdvice';
import { requestCoachAdvice } from '../features/ai/useCoachAdvice';
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

  it('records a successful advice request, persists its card and checks achievements', async () => {
    const advice = { title: 'Сегодня', advice: 'Добавьте белок к ужину.', bullets: ['Творог'] };
    const calls: string[] = [];
    const result = await requestCoachAdvice({
      currentUser: { ...user, dailyHabits: { '2026-10-07': { water: true, steps: false, breakfast: false, sleep: false } } },
      targets: { calories: 1800, protein: 110, fat: 60, carbs: 200 },
      dailyStats: { calories: 840, protein: 52, fat: 24, carbs: 93 },
      canUseCoachAdvice: () => true,
      openPaywall: () => calls.push('paywall'),
      incrementUsage: () => calls.push('usage'),
      repository: { writeJson: (key, value) => calls.push(`${key}:${value === advice}`) },
      setCoachCard: (value) => calls.push(`card:${value === advice}`),
      setLoading: (value) => calls.push(`loading:${value}`),
      checkAchievements: () => calls.push('achievement'),
      requestAdvice: async (input) => {
        expect((input as CoachAdviceRequest).today.habitsDone).toBe(1);
        return advice;
      },
      recordLastAction: () => calls.push('last-action'),
      getTodayKeyImpl: () => '2026-10-07',
    });

    expect(result).toBe(advice);
    expect(calls).toEqual([
      'last-action',
      'loading:true',
      'card:true',
      'usage',
      'last_coach_card:true',
      'achievement',
      'loading:false',
    ]);
  });

  it('opens the paywall without starting an AI request when the quota is spent', async () => {
    const calls: string[] = [];
    await requestCoachAdvice({
      currentUser: user,
      targets: { calories: 1800, protein: 110, fat: 60, carbs: 200 },
      dailyStats: { calories: 840, protein: 52, fat: 24, carbs: 93 },
      canUseCoachAdvice: () => false,
      openPaywall: () => calls.push('paywall'),
      incrementUsage: () => calls.push('usage'),
      repository: null,
      setCoachCard: () => calls.push('card'),
      setLoading: () => calls.push('loading'),
      checkAchievements: () => calls.push('achievement'),
      requestAdvice: async () => {
        calls.push('request');
        return { title: '', advice: '', bullets: [] };
      },
      recordLastAction: () => calls.push('last-action'),
    });

    expect(calls).toEqual(['paywall']);
  });
});
