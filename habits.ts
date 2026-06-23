
import { UserProfile } from './types';
import { toLocalDayKey } from './dateUtils';

export const defaultHabits = {
  water: false,
  steps: false,
  breakfast: false,
  sleep: false,
};

export function getTodayKey() {
  return toLocalDayKey(new Date());
}

export function toggleHabit(profile: UserProfile, habit: keyof typeof defaultHabits): UserProfile {
  const today = getTodayKey();
  const dailyHabits = profile.dailyHabits || {};
  
  if (!dailyHabits[today]) {
    dailyHabits[today] = { ...defaultHabits };
  }
  
  dailyHabits[today][habit] = !dailyHabits[today][habit];
  
  return {
    ...profile,
    dailyHabits: { ...dailyHabits }
  };
}

export function calculateStreak(habits: Record<string, any> | undefined, habitKey: string): number {
  if (!habits) return 0;
  const dates = Object.keys(habits).sort().reverse();
  let streak = 0;
  for (const d of dates) {
    if (habits[d]?.[habitKey]) streak++;
    else break;
  }
  return streak;
}
