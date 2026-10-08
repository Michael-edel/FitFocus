import type { UserHabit, UserProfile } from '../../types';

type HabitKey = 'water' | 'steps' | 'breakfast' | 'sleep';

const LEGACY_HABIT_IDS: Record<HabitKey, string> = {
  water: 'h_water',
  steps: 'h_steps',
  breakfast: 'h_veg',
  sleep: 'h_sleep',
};

/** Keeps the legacy dashboard habit indicators aligned with a persisted daily habit update. */
export function syncLegacyHabitProgress(
  habits: UserHabit[],
  profile: UserProfile,
  habitKey: HabitKey,
  dayKey: string,
): { habits: UserHabit[]; waterGoalReached: boolean } {
  const done = Boolean(profile.dailyHabits?.[dayKey]?.[habitKey]);
  const legacyId = LEGACY_HABIT_IDS[habitKey];
  return {
    habits: habits.map((habit) => habit.id === legacyId ? { ...habit, current: done ? habit.goal : 0 } : habit),
    waterGoalReached: habitKey === 'water' && done,
  };
}