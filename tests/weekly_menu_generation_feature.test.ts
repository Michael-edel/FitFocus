import { describe, expect, it } from 'vitest';
import {
  generatePersonalWeeklyMenu,
  WEEKLY_MENU_GENERATION_ERROR,
} from '../features/ai/useWeeklyMenuGeneration';
import type { UserProfile } from '../types';

const user = {
  id: 'user-1',
  name: 'Ира',
  aiPlan: { title: 'План' },
} as UserProfile;

describe('weekly menu generation feature', () => {
  it('persists a generated menu and records the achievement signal', async () => {
    const calls: string[] = [];
    const menu = { days: [] } as Awaited<ReturnType<typeof import('../geminiService').generateWeeklyMenu>>;
    const result = await generatePersonalWeeklyMenu({
      currentUser: user,
      persistUser: (updated) => {
        calls.push(`persist:${updated.aiPlan?.weeklyMenu === menu}`);
      },
      checkAchievements: (trigger, context) => {
        calls.push(`achievement:${trigger}:${context.hasWeeklyMenu}`);
      },
      setLoading: (value) => calls.push(`loading:${value}`),
      setError: (value) => calls.push(`error:${value}`),
      requestMenu: async () => menu,
    });

    expect(result).toBe(menu);
    expect(calls).toEqual([
      'error:null',
      'loading:true',
      'persist:true',
      'achievement:weekly_menu_generated:true',
      'loading:false',
    ]);
  });

  it('keeps the existing profile and exposes a useful error when generation fails', async () => {
    const calls: string[] = [];
    await expect(generatePersonalWeeklyMenu({
      currentUser: user,
      persistUser: () => calls.push('persist'),
      checkAchievements: () => calls.push('achievement'),
      setLoading: (value) => calls.push(`loading:${value}`),
      setError: (value) => calls.push(`error:${value}`),
      requestMenu: async () => { throw new Error('offline'); },
    })).resolves.toBeNull();

    expect(calls).toEqual([
      'error:null',
      'loading:true',
      `error:${WEEKLY_MENU_GENERATION_ERROR}`,
      'loading:false',
    ]);
  });

  it('does nothing until the user has an AI plan', async () => {
    const calls: string[] = [];
    await expect(generatePersonalWeeklyMenu({
      currentUser: { ...user, aiPlan: undefined },
      persistUser: () => calls.push('persist'),
      checkAchievements: () => calls.push('achievement'),
      setLoading: () => calls.push('loading'),
      setError: () => calls.push('error'),
    })).resolves.toBeNull();

    expect(calls).toEqual([]);
  });
});
