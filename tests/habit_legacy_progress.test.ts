import { describe, expect, it } from 'vitest';
import { syncLegacyHabitProgress } from '../features/habits/legacyProgress';

describe('legacy habit progress sync', () => {
  const habits = [
    { id: 'h_water', title: 'Water', current: 0, goal: 8 },
    { id: 'h_steps', title: 'Steps', current: 2, goal: 10 },
  ];

  it('updates only the matching legacy indicator and reports a completed water habit', () => {
    const profile = { dailyHabits: { '2026-10-08': { water: true, steps: false, breakfast: false, sleep: false } } };
    expect(syncLegacyHabitProgress(habits, profile as never, 'water', '2026-10-08')).toEqual({
      habits: [{ id: 'h_water', title: 'Water', current: 8, goal: 8 }, { id: 'h_steps', title: 'Steps', current: 2, goal: 10 }],
      waterGoalReached: true,
    });
  });
});