import { describe, expect, it } from 'vitest';
import type { UserHabit } from '../types';
import { applyHabitToggle, syncLegacyHabitProgress } from '../features/habits/legacyProgress';

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
    const result = applyHabitToggle({ id: 'user-1', dailyHabits: {} } as never, habits, 'steps');
    expect(Object.values(result.updatedProfile.dailyHabits || {}).some((day) => day.steps)).toBe(true);
    expect(result.habits.find((habit) => habit.id === 'h_steps')?.current).toBe(10);
  });
});