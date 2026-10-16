import { createTask } from './coach';
import { type FoodItem, type FavoriteRecipe, type UserHabit, type UserProfile } from './types';
import type { WeeklyStoredReport } from './weeklyAutoEngine';
import { rememberRemoteStateVersion } from './storage/hybrid';
import { isIndexedUserStateStorageKey, readIndexedUserStateRaw, writeIndexedUserStateRaw } from './storage/indexedUserState';
import { isRecord, parseJson } from './safeJson';
import { isUserProfilePayload } from './profileValidation';

export type HydratedSession = {
  currentUser: UserProfile;
  allUsers: UserProfile[];
  weeklyReports: WeeklyStoredReport[];
  foodDiary: FoodItem[];
  habits: UserHabit[];
  foodHistory: FoodItem[];
  foodFavorites: FavoriteRecipe[];
  coachCard: unknown;
};

export type HydrationDeps = {
  resetUsageIfNewTime: (user: UserProfile) => UserProfile;
  initialHabits: UserHabit[];
  fetchImpl?: typeof fetch;
};

const stripLargePhotoPayloads = (items: FoodItem[]): FoodItem[] => {
  return (items || []).map((it) => {
    if (!it || typeof it !== 'object') return it;
    const copy: FoodItem = { ...it };
    if (typeof copy.photo === 'string') delete copy.photo;
    if (typeof copy.photoThumb === 'string' && copy.photoThumb.length > 120_000) delete copy.photoThumb;
    return copy;
  });
};

function isFoodItem(value: unknown): value is FoodItem {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.calories === 'number'
    && typeof value.protein === 'number'
    && typeof value.fat === 'number'
    && typeof value.carbs === 'number'
    && typeof value.timestamp === 'string';
}

function isHabit(value: unknown): value is UserHabit {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.goal === 'number'
    && typeof value.current === 'number'
    && typeof value.unit === 'string'
    && typeof value.streak === 'number'
    && (typeof value.lastCompletedDate === 'string' || value.lastCompletedDate === null);
}

function isWeeklyReport(value: unknown): value is WeeklyStoredReport {
  if (!isRecord(value) || typeof value.weekKey !== 'string' || typeof value.createdAt !== 'string' || !isRecord(value.data)) return false;
  return [value.data.wis, value.data.weightDelta7, value.data.weightDelta30, value.data.compliance, value.data.adaptationIndex]
    .every((item) => typeof item === 'number' && Number.isFinite(item))
    && (value.data.status === 'excellent' || value.data.status === 'stable' || value.data.status === 'adjust' || value.data.status === 'critical')
    && (value.aiText === undefined || typeof value.aiText === 'string');
}

function isFavoriteRecipe(value: unknown): value is FavoriteRecipe {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.createdAt === 'string'
    && isRecord(value.recipe);
}

function isCoachCard(value: unknown): value is { title: string; advice: string; bullets: string[] } {
  return isRecord(value)
    && typeof value.title === 'string'
    && typeof value.advice === 'string'
    && Array.isArray(value.bullets)
    && value.bullets.every((item) => typeof item === 'string');
}

export async function hydrateSessionFromCloud(user: UserProfile, deps: HydrationDeps): Promise<HydratedSession> {
  const fetchFn = deps.fetchImpl ?? fetch;
  const userWithResetUsage = deps.resetUsageIfNewTime(user);
  const prefixes = [
    `fitfocus_data_${user.id}_`,
    'ff_gemini_cooldown_until',
    'ff_ai_last_status_v1',
    'ff_ai_last_action_v1',
    'ff_ai_feature_lastcall_v1:',
  ];
  let kv: Record<string, string> = {};

  try {
    for (const prefix of prefixes) {
      const r = await fetchFn(`/api/state?prefix=${encodeURIComponent(prefix)}`, { credentials: 'include' });
      if (!r.ok) continue;
      const rawData: unknown = await r.json().catch(() => null);
      const data = isRecord(rawData) ? rawData : {};
      const items = Array.isArray(data.items) ? data.items.filter(isRecord) : [];
      for (const it of items) {
        if (typeof it.key === 'string' && it.key.length > 0 && typeof it.value === 'string') {
          kv[it.key] = it.value;
          try {
            if (isIndexedUserStateStorageKey(it.key) && await writeIndexedUserStateRaw(it.key, it.value)) {
              localStorage.removeItem(it.key);
            } else {
              localStorage.setItem(it.key, it.value);
            }
            if (typeof it.version === 'number') {
              rememberRemoteStateVersion(it.key, it.version);
            }
          } catch {}
        }
      }
    }
  } catch {}

  const readKV = async <T,>(suffix: string, fallback: T, validate: (value: unknown) => value is T): Promise<T> => {
    const fullKey = `fitfocus_data_${user.id}_${suffix}`;
    const indexedRaw = await readIndexedUserStateRaw(fullKey);
    const raw = kv[fullKey] ?? indexedRaw ?? localStorage.getItem(fullKey);
    if (!raw) return fallback;
    const parsed = parseJson(raw);
    if (!validate(parsed)) return fallback;
    if (!indexedRaw && !kv[fullKey] && isIndexedUserStateStorageKey(fullKey)) {
      void writeIndexedUserStateRaw(fullKey, raw).then((stored) => {
        if (stored) {
          try { localStorage.removeItem(fullKey); } catch {}
        }
      });
    }
    return parsed;
  };

  const storedDiary = stripLargePhotoPayloads(await readKV<FoodItem[]>('diary', [], (value): value is FoodItem[] => Array.isArray(value) && value.every(isFoodItem)));
  const storedHabits = await readKV<UserHabit[]>('habits', deps.initialHabits, (value): value is UserHabit[] => Array.isArray(value) && value.every(isHabit));
  const storedAllUsers = await readKV<UserProfile[]>('all_users', [], (value): value is UserProfile[] => Array.isArray(value) && value.every(isUserProfilePayload));
  const storedWeeklyReports = await readKV<WeeklyStoredReport[]>('weekly_reports', [], (value): value is WeeklyStoredReport[] => Array.isArray(value) && value.every(isWeeklyReport));
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
    foodHistory: await readKV<FoodItem[]>('history', [], (value): value is FoodItem[] => Array.isArray(value) && value.every(isFoodItem)),
    foodFavorites: await readKV<FavoriteRecipe[]>('favorites', [], (value): value is FavoriteRecipe[] => Array.isArray(value) && value.every(isFavoriteRecipe)),
    coachCard: await readKV('last_coach_card', null, isCoachCard),
  };
}
