import { createTask } from './coach';
import { type FoodItem, type FavoriteRecipe, type UserHabit, type UserProfile } from './types';
import type { WeeklyStoredReport } from './weeklyAutoEngine';
import { isIndexedUserStateStorageKey, readIndexedUserStateRaw, writeIndexedUserStateRaw } from './storage/indexedUserState';
import { isRecord, parseJson } from './safeJson';
import { isUserProfilePayload } from './profileValidation';
import { UserStateRepository, USER_STATE_KEYS, type UserStateKey } from './storage/userStateRepository';
import { LEGACY_QUEUE_SOURCE_KEY } from './storage/legacyQueue';
import { restoreProfile } from './storage/profileState';
import type { OutboxReadGuard } from './storage/durableOutbox';
import { verifyReadSession, readScopedJson, assertReadSession, SessionReadError } from './storage/sessionRead';

export type HydratedSession = {
  repository?: UserStateRepository;
  readGuard?: OutboxReadGuard;
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
  isCurrentSession?: () => boolean;
  readGuard?: OutboxReadGuard;
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
  const assertCurrent = () => { if (deps.isCurrentSession?.() === false) throw new Error('LOGIN_SESSION_CHANGED'); };
  assertCurrent();
  const fetchFn = deps.fetchImpl ?? fetch;
  const repository = new UserStateRepository(user.id);
  let readGuard = deps.readGuard;
  const readOptions = { fetchImpl: fetchFn, isCurrentSession: deps.isCurrentSession };
  if (readGuard) await assertReadSession(readGuard, readOptions);
  // An old bootstrap response must not overwrite a durable profile or its pending edits.
  user = await restoreProfile(repository, user, readGuard);
  assertCurrent();
  const managedKeys: readonly UserStateKey[] = USER_STATE_KEYS;
  const observed = new Map(await Promise.all(managedKeys.map(async (stateKey) => [stateKey,
    await repository.observe(stateKey).then((snapshot) => snapshot.revision, () => null),
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
  const prefixes = [`fitfocus_data_${user.id}_`];
  let kv: Record<string, string> = {};

  try {
    const verified = await verifyReadSession({ ...readOptions, accountId: user.id, previous: readGuard });
    if (!verified.guard) throw new SessionReadError('protocol');
    readGuard = verified.guard;
    for (const prefix of prefixes) {
      if (!readGuard) break;
      const { response: r, body: rawData } = await readScopedJson(`/api/state?prefix=${encodeURIComponent(prefix)}&includeDeleted=1`, readGuard, 'state', readOptions);
      if (!r.ok) continue;
      assertCurrent();
      const data = isRecord(rawData) ? rawData : {};
      const items = Array.isArray(data.items) ? data.items.filter(isRecord) : [];
      const protocolReady = r.headers.get('X-FitFocus-State-Protocol') === '2' && Array.isArray(data.items)
        && data.items.every((item) => isRecord(item) && typeof item.key === 'string' && item.key.startsWith(prefix)
          && typeof item.value === 'string' && typeof item.exists === 'boolean' && Number.isSafeInteger(item.version)
          && typeof item.version === 'number' && item.version >= (item.exists ? 1 : 0))
        && new Set(items.map(item => item.key)).size === items.length;
      if (!protocolReady) throw new SessionReadError('protocol');
      const receivedManagedKeys = new Set<string>();
      for (const it of items) {
        if (typeof it.key === 'string' && it.key.startsWith(prefix) && typeof it.value === 'string') {
          const stateKey = managedByKey.get(it.key);
          if (stateKey) {
            receivedManagedKeys.add(it.key);
            // Old responses do not prove generation ownership; legacy/local pending stays untouched.
            if (!protocolReady || hasLegacyIntent(it.key)
              || localStorage.getItem(it.key) !== null || typeof it.exists !== 'boolean'
              || typeof it.version !== 'number' || observed.get(stateKey) === null) continue;
            assertCurrent();
            await repository.hydrate(stateKey, { value: it.value, version: it.version, exists: it.exists }, observed.get(stateKey)!, readGuard.sessionEpoch, readGuard.authFence);
            continue;
          }
          // Unknown keys and device AI metadata are not applied outside managed hydration.
        }
      }
      if (prefix === `fitfocus_data_${user.id}_` && protocolReady) {
        for (const stateKey of managedKeys) {
          const key = repository.key(stateKey);
          if (!receivedManagedKeys.has(key) && !hasLegacyIntent(key) && localStorage.getItem(key) === null && observed.get(stateKey) !== null) {
            assertCurrent();
            await repository.hydrate(stateKey, { value: '', version: 0, exists: false }, observed.get(stateKey)!, readGuard.sessionEpoch, readGuard.authFence);
          }
        }
      }
    }
  } catch (error) { if (error instanceof SessionReadError) throw error; }

  assertCurrent();
  if (readGuard) await assertReadSession(readGuard, readOptions);

  const readKV = async <T,>(suffix: string, fallback: T, validate: (value: unknown) => value is T): Promise<T> => {
    const fullKey = `fitfocus_data_${user.id}_${suffix}`;
    const stateKey = managedByKey.get(fullKey);
    if (stateKey) {
      return repository.readJsonAsync(stateKey, fallback, validate).catch(() => {
        // This key may fall back locally; the final session assertion still gates login.
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
  const foodHistory = await readKV<FoodItem[]>('history', [], (value): value is FoodItem[] => Array.isArray(value) && value.every(isFoodItem));
  const foodFavorites = await readKV<FavoriteRecipe[]>('favorites', [], (value): value is FavoriteRecipe[] => Array.isArray(value) && value.every(isFavoriteRecipe));
  const coachCard = await readKV('last_coach_card', null, isCoachCard);
  const userWithTask = await createTask(userWithResetUsage, storedDiary, storedHabits);
  if (readGuard) await assertReadSession(readGuard, readOptions);
  assertCurrent();

  return {
    repository,
    readGuard,
    currentUser: {
      ...userWithTask,
      lossDeficit: userWithTask.lossDeficit ?? userWithResetUsage.lossDeficit,
      gainSurplus: userWithTask.gainSurplus ?? userWithResetUsage.gainSurplus,
    },
    allUsers: Array.isArray(storedAllUsers) ? storedAllUsers : [],
    weeklyReports: storedWeeklyReports,
    foodDiary: storedDiary,
    habits: storedHabits,
    foodHistory,
    foodFavorites,
    coachCard,
  };
}
