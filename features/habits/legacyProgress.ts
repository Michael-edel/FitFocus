import type { UserHabit, UserProfile } from '../../types';
import { getTodayKey, toggleHabit } from '../../habits';

type HabitKey = 'water' | 'steps' | 'breakfast' | 'sleep';

const LEGACY_HABIT_IDS: Record<HabitKey, string> = {
  water: 'h_water',
  steps: 'h_steps',
  breakfast: 'h_veg',
  sleep: 'h_sleep',
};
const HABIT_KEYS_BY_LEGACY_ID: Record<string, HabitKey> = {
  h_water: 'water',
  h_steps: 'steps',
  h_veg: 'breakfast',
  h_sleep: 'sleep',
};

/** Rebuilds the legacy current counters from the profile's authoritative daily record. */
export function reconcileLegacyHabitProgress(
  habits: UserHabit[],
  profile: UserProfile,
  dayKey: string,
): UserHabit[] {
  return habits.map((habit) => {
    const key = HABIT_KEYS_BY_LEGACY_ID[habit.id];
    if (!key) return habit;
    const done = Boolean(profile.dailyHabits?.[dayKey]?.[key]);
    return { ...habit, current: done ? habit.goal : 0 };
  });
}

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

/** Applies a daily habit toggle and derives all dashboard-facing legacy progress in one operation. */
export function applyHabitToggle(profile: UserProfile, habits: UserHabit[], habitKey: HabitKey) {
  const updatedProfile = toggleHabit(profile, habitKey);
  const legacy = syncLegacyHabitProgress(habits, updatedProfile, habitKey, getTodayKey());
  return { updatedProfile, ...legacy };
}
