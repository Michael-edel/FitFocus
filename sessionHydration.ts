import { createTask } from './coach';
import { type FoodItem, type FavoriteRecipe, type UserHabit, type UserProfile } from './types';
import type { WeeklyStoredReport } from './weeklyAutoEngine';
import { rememberRemoteStateVersion } from './storage/hybrid';

type HydratedSession = {
  currentUser: UserProfile;
  allUsers: UserProfile[];
  weeklyReports: WeeklyStoredReport[];
  foodDiary: FoodItem[];
  habits: UserHabit[];
  foodHistory: FoodItem[];
  foodFavorites: FavoriteRecipe[];
  coachCard: unknown;
};

type HydrationDeps = {
  resetUsageIfNewTime: (user: UserProfile) => UserProfile;
  initialHabits: UserHabit[];
  fetchImpl?: typeof fetch;
};

const stripLargePhotoPayloads = (items: FoodItem[]): FoodItem[] => {
  return (items || []).map((it: any) => {
    if (!it || typeof it !== 'object') return it;
    const copy: any = { ...it };
    if (typeof copy.photo === 'string') delete copy.photo;
    if (typeof copy.photoThumb === 'string' && copy.photoThumb.length > 120_000) delete copy.photoThumb;
    return copy;
  });
};

export async function hydrateSessionFromCloud(user: UserProfile, deps: HydrationDeps): Promise<HydratedSession> {
  const fetchFn = deps.fetchImpl ?? fetch;
  const userWithResetUsage = deps.resetUsageIfNewTime(user);
  const prefixes = [`fitfocus_data_${user.id}_`, `ff_`];
  let kv: Record<string, string> = {};

  try {
    for (const prefix of prefixes) {
      const r = await fetchFn(`/api/state?prefix=${encodeURIComponent(prefix)}`, { credentials: 'include' });
      if (!r.ok) continue;
      const data = await r.json();
      const items = Array.isArray(data?.items) ? data.items : [];
      for (const it of items) {
        if (it?.key && typeof it.value === 'string') {
          kv[it.key] = it.value;
          try {
            localStorage.setItem(it.key, it.value);
            if (typeof it.version === 'number') {
              rememberRemoteStateVersion(it.key, it.version);
            }
          } catch {}
        }
      }
    }
  } catch {}

  const readKV = <T,>(suffix: string, fallback: T): T => {
    const fullKey = `fitfocus_data_${user.id}_${suffix}`;
    const raw = kv[fullKey] ?? localStorage.getItem(fullKey);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  };

  const storedDiary = stripLargePhotoPayloads(readKV<FoodItem[]>('diary', []));
  const storedHabits = readKV<UserHabit[]>('habits', deps.initialHabits);
  const storedAllUsers = readKV<UserProfile[]>('all_users', []);
  const storedWeeklyReports = readKV<WeeklyStoredReport[]>('weekly_reports', []);
  const userWithTask = await createTask(userWithResetUsage, storedDiary, storedHabits);

  return {
    currentUser: {
      ...userWithTask,
      lossDeficit: userWithTask.lossDeficit ?? userWithResetUsage.lossDeficit,
      gainSurplus: userWithTask.gainSurplus ?? userWithResetUsage.gainSurplus,
    },
    allUsers: Array.isArray(storedAllUsers) ? storedAllUsers : [],
    weeklyReports: storedWeeklyReports,
    foodDiary: storedDiary,
    habits: storedHabits,
    foodHistory: readKV<FoodItem[]>('history', []),
    foodFavorites: readKV<FavoriteRecipe[]>('favorites', []),
    coachCard: readKV<unknown>('last_coach_card', null),
  };
}
