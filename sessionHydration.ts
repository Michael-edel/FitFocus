import { createTask } from './coach';
import { type FoodItem, type FavoriteRecipe, type UserHabit, type UserProfile } from './types';
import type { WeeklyStoredReport } from './weeklyAutoEngine';
import { rememberRemoteStateVersion } from './storage/hybrid';
import { isIndexedUserStateStorageKey, readIndexedUserStateRaw, writeIndexedUserStateRaw } from './storage/indexedUserState';
import { isRecord, parseJson } from './safeJson';
import { isUserProfilePayload } from './profileValidation';
import { UserStateRepository, type UserStateKey } from './storage/userStateRepository';
import { LEGACY_QUEUE_SOURCE_KEY } from './storage/legacyQueue';

export type HydratedSession = {
  repository?: UserStateRepository;
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
  const repository = new UserStateRepository(user.id);
  const managedKeys: UserStateKey[] = ['diary', 'history', 'favorite_recipes', 'weekly_reports', 'last_coach_card', 'settings'];
  const observed = new Map(await Promise.all(managedKeys.map(async (stateKey) => [stateKey,
    await repository.observe(stateKey).then((snapshot) => snapshot.revision, () => 0),
  ] as const)));
  const managedByKey = new Map(managedKeys.map((stateKey) => [repository.key(stateKey), stateKey]));
  const hasLegacyIntent = (key: string): boolean => {
    try {
      const raw = localStorage.getItem(LEGACY_QUEUE_SOURCE_KEY);
      if (!raw) return false;
      const parsed = parseJson(raw);
      return !Array.isArray(parsed) || parsed.some((record) => !isRecord(record) || record.key === key);
    } catch { return true; }
  };
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
      const r = await fetchFn(`/api/state?prefix=${encodeURIComponent(prefix)}&includeDeleted=1`, { credentials: 'include' });
      if (!r.ok) continue;
      const rawData: unknown = await r.json().catch(() => null);
      const data = isRecord(rawData) ? rawData : {};
      const items = Array.isArray(data.items) ? data.items.filter(isRecord) : [];
      const protocolReady = r.headers.get('X-FitFocus-State-Protocol') === '2' && Array.isArray(data.items)
        && data.items.every((item) => isRecord(item) && typeof item.key === 'string' && item.key.startsWith(prefix)
          && typeof item.value === 'string' && typeof item.exists === 'boolean' && Number.isSafeInteger(item.version)
          && typeof item.version === 'number' && item.version >= (item.exists ? 1 : 0));
      const receivedManagedKeys = new Set<string>();
      for (const it of items) {
        if (typeof it.key === 'string' && it.key.startsWith(prefix) && typeof it.value === 'string') {
          const stateKey = managedByKey.get(it.key);
          if (stateKey) {
            receivedManagedKeys.add(it.key);
            // Old responses do not prove generation ownership; legacy/local pending stays untouched.
            if (!protocolReady || hasLegacyIntent(it.key)
              || localStorage.getItem(it.key) !== null || typeof it.exists !== 'boolean'
              || typeof it.version !== 'number') continue;
            await repository.hydrate(stateKey, { value: it.value, version: it.version, exists: it.exists }, observed.get(stateKey) ?? 0);
            continue;
          }
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
      if (prefix === `fitfocus_data_${user.id}_` && protocolReady) {
        for (const stateKey of managedKeys) {
          const key = repository.key(stateKey);
          if (!receivedManagedKeys.has(key) && !hasLegacyIntent(key) && localStorage.getItem(key) === null) {
            await repository.hydrate(stateKey, { value: '', version: 0, exists: false }, observed.get(stateKey) ?? 0);
          }
        }
      }
    }
  } catch {}

  const readKV = async <T,>(suffix: string, fallback: T, validate: (value: unknown) => value is T): Promise<T> => {
    const fullKey = `fitfocus_data_${user.id}_${suffix}`;
    const stateKey = managedByKey.get(fullKey);
    if (stateKey) {
      return repository.readJsonAsync(stateKey, fallback, validate).catch(() => {
        // Keep login/read-only access possible after an IDB failure. Writes still reject.
        try { const value = parseJson(localStorage.getItem(fullKey) ?? ''); return validate(value) ? value : fallback; }
        catch { return fallback; }
      });
    }
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
    repository,
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
