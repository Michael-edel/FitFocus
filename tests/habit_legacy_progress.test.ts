import { describe, expect, it } from 'vitest';
import type { UserHabit, UserProfile } from '../types';
import { applyHabitToggle, reconcileLegacyHabitProgress, syncLegacyHabitProgress } from '../features/habits/legacyProgress';

describe('legacy habit progress sync', () => {
  const habits: UserHabit[] = [
    { id: 'h_water', title: 'Water', current: 0, goal: 8, unit: 'cups', streak: 0, lastCompletedDate: null },
    { id: 'h_steps', title: 'Steps', current: 2, goal: 10, unit: 'k', streak: 0, lastCompletedDate: null },
  ];

  it('updates only the matching legacy indicator and reports a completed water habit', () => {
    const profile = { dailyHabits: { '2026-10-08': { water: true, steps: false, breakfast: false, sleep: false } } };
    expect(syncLegacyHabitProgress(habits, profile as never, 'water', '2026-10-08')).toEqual({
      habits: [{ id: 'h_water', title: 'Water', current: 8, goal: 8, unit: 'cups', streak: 0, lastCompletedDate: null }, { id: 'h_steps', title: 'Steps', current: 2, goal: 10, unit: 'k', streak: 0, lastCompletedDate: null }],
      waterGoalReached: true,
    });
  });

  it('updates profile state and legacy dashboard state together', () => {
    const profile = { id: 'user-1', dailyHabits: {} } as UserProfile;
    const originalDailyHabits = profile.dailyHabits;
    const result = applyHabitToggle(profile, habits, 'steps');
    expect(Object.values(result.updatedProfile.dailyHabits || {}).some((day) => day.steps)).toBe(true);
    expect(result.habits.find((habit) => habit.id === 'h_steps')?.current).toBe(10);
    expect(profile.dailyHabits).toBe(originalDailyHabits);
    expect(profile.dailyHabits).toEqual({});
  });

  it('rebuilds legacy current counters from the authoritative profile on reload', () => {
    const profile = { id: 'user-1', dailyHabits: { '2026-10-08': { water: true, steps: false, breakfast: true, sleep: false } } } as unknown as UserProfile;
    const reconciled = reconcileLegacyHabitProgress(habits, profile, '2026-10-08');

    expect(reconciled.map((habit) => habit.current)).toEqual([8, 0]);
    expect(habits.map((habit) => habit.current)).toEqual([0, 2]);
  });
});
