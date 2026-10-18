import { STORAGE_KEYS } from "./keys";
import { isRecord, parseJson } from '../safeJson';
import { clearIndexedUserStateForUser } from './indexedUserState';

type ProfileLike = {
  id: string;
  googleSub?: string;
  email?: string;
  name?: string;
  version?: number;
  aiPlan?: unknown;
  weightHistory?: unknown[];
  measurementsHistory?: unknown[];
  progressPhotos?: unknown[];
  tasks?: unknown[];
  dailyHabits?: unknown;
  usage?: unknown;
  plan?: unknown;
};

function isProfileLike(value: unknown): value is ProfileLike {
  return isRecord(value) && typeof value.id === 'string' && value.id.trim().length > 0;
}

export const REMOTE_KV_OUTBOX_STORAGE_KEY = 'fitfocus.remote-kv-outbox.v1';

const USER_SCOPED_KEY_PREFIXES = [
  'fitfocus.nutrition.selected-day.v1:',
  'fitfocus.nutrition.camera-facing.v1:',
  'fitfocus.dashboard.new-weight.v1:',
  'fitfocus.dashboard.pdf-include-meal-log.v1:',
  'fitfocus.dashboard.mobile-more-open.v1:',
  'fitfocus.course.ui.v1:',
  'fitfocus.plan.ui.v1:',
  'fitfocus.plan.active-day.v1:',
  'fitfocus.progress.ui.v1:',
  'fitfocus.progress-archive.sections.v1:',
  'fitfocus.settings.ui.v1:',
  'fitfocus.nutrition.search.v1:',
  'fitfocus.analytics.sent.v1:',
  'fitfocus.achievements.counters.v1:',
];

const RETIRED_LOCAL_TELEMETRY_KEYS = new Set([
  'fitfocus.analytics.onboarding.v1',
  'fitfocus.analytics.wis_share.v1',
  'fitfocus.analytics.food_streak.v1',
]);
const RETIRED_LOCAL_TELEMETRY_PREFIXES = ['fitfocus.analytics.sent.v1:'];

/** Removes unused, unscoped health-event logs written by older builds. */
export function clearRetiredLocalTelemetry(): number {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && (RETIRED_LOCAL_TELEMETRY_KEYS.has(key)
        || RETIRED_LOCAL_TELEMETRY_PREFIXES.some((prefix) => key.startsWith(prefix)))) {
        keys.push(key);
      }
    }
    for (const key of keys) localStorage.removeItem(key);
    return keys.length;
  } catch {
    return 0;
  }
}

function isLocalUserKey(key: string, userId: string): boolean {
  // These retired unowned logs can contain health data but have no safe account
  // mapping. Since the app no longer reads them, purge them during any account deletion.
  if (RETIRED_LOCAL_TELEMETRY_KEYS.has(key)) return true;
  const dataPrefix = `${STORAGE_KEYS.dataPrefix}${userId}_`;
  if (key.startsWith(dataPrefix)) return true;
  if (key === `ff_last_weekly_ai_attempt_${userId}`) return true;
  if (key === `ff_weekly_ai_inflight_${userId}`) return true;
  if (key === `ff_dev_plan_override_scope_${userId}`) return true;
  return USER_SCOPED_KEY_PREFIXES.some((prefix) => key === `${prefix}${userId}`);
}

/** Automatic mirroring is retired; all synchronized edits require an explicit account editor. */
export function shouldMirrorKey(_key: string): boolean { return false; }

function requireLocalOnlyKey(key: string): void {
  if (key.startsWith(STORAGE_KEYS.dataPrefix) && !key.endsWith('_all_users')) throw new Error('OWNED_STATE_REPOSITORY_REQUIRED');
  if (key === REMOTE_KV_OUTBOX_STORAGE_KEY) throw new Error('LEGACY_SOURCE_READ_ONLY');
}

function versionMetaKey(key: string) {
  return `${key}__ffv`;
}

function setStoredVersion(key: string, version?: number) {
  try {
    if (!version || !Number.isFinite(version) || version <= 0) {
      localStorage.removeItem(versionMetaKey(key));
      return;
    }
    localStorage.setItem(versionMetaKey(key), String(version));
  } catch {
    // ignore
  }
}

export function safeSetItem(key: string, value: string) {
  requireLocalOnlyKey(key);
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      console.warn('LocalStorage quota exceeded. Consider clearing old data.');
    } else {
      console.warn('LocalStorage write failed:', e);
    }
  }
}

export function safeRemoveItem(key: string) {
  requireLocalOnlyKey(key);
  try {
    localStorage.removeItem(key);
    localStorage.removeItem(versionMetaKey(key));
  } catch {
    // ignore
  }
}

export type LocalUserDataCleanupResult = {
  complete: boolean;
  localStorageKeysRemoved: number;
  localStorageCleared: boolean;
  indexedDbCleared: boolean;
  legacyEvidenceRetained: boolean;
};

const INDEXED_ACCOUNT_CLEANUP_TIMEOUT_MS = 5_000;

function legacyQueueMayContainAccount(raw: string | null, accountPrefix: string): boolean {
  if (raw === null) return false;
  const records = parseJson(raw);
  if (!Array.isArray(records)) return true;
  return records.some((record) => !isRecord(record)
    || typeof record.key !== 'string'
    || record.key.startsWith(accountPrefix));
}

/**
 * Clears local account-owned data after server deletion. Global legacy migration
 * evidence is preserved if it cannot be separated safely from other accounts.
 */
export async function clearLocalUserData(userId: string | null | undefined): Promise<LocalUserDataCleanupResult> {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return {
    complete: false, localStorageKeysRemoved: 0, localStorageCleared: false,
    indexedDbCleared: false, legacyEvidenceRetained: false,
  };

  const keysToRemove: string[] = [];
  const removed = new Set<string>();
  let localStorageCleared = true;
  let legacyEvidenceRetained = false;
  const accountPrefix = `${STORAGE_KEYS.dataPrefix}${normalizedUserId}_`;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const baseKey = key.endsWith('__ffv') ? key.slice(0, -'__ffv'.length) : key;
      if (isLocalUserKey(baseKey, normalizedUserId)) keysToRemove.push(key);
    }

    const selectedKeys = new Set(keysToRemove);
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
      removed.add(key);
      if (!key.endsWith('__ffv')) {
        const versionKey = versionMetaKey(key);
        if (selectedKeys.has(versionKey)) {
          localStorage.removeItem(versionKey);
          removed.add(versionKey);
        }
      }
    }
  } catch {
    localStorageCleared = false;
  }

  try {
    legacyEvidenceRetained = legacyQueueMayContainAccount(localStorage.getItem(REMOTE_KV_OUTBOX_STORAGE_KEY), accountPrefix);
  } catch {
    legacyEvidenceRetained = true;
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const durable = await Promise.race([
    clearIndexedUserStateForUser(normalizedUserId),
    new Promise<{ cleared: false; legacyEvidenceRetained: true }>((resolve) => {
      timeoutId = setTimeout(() => resolve({ cleared: false, legacyEvidenceRetained: true }), INDEXED_ACCOUNT_CLEANUP_TIMEOUT_MS);
    }),
  ]);
  if (timeoutId !== undefined) clearTimeout(timeoutId);
  legacyEvidenceRetained ||= durable.legacyEvidenceRetained;
  const indexedDbCleared = durable.cleared;
  return {
    complete: localStorageCleared && indexedDbCleared && !legacyEvidenceRetained,
    localStorageKeysRemoved: removed.size,
    localStorageCleared,
    indexedDbCleared,
    legacyEvidenceRetained,
  };
}

export function allUsersStorageKey(userId?: string | null) {
  return `${STORAGE_KEYS.dataPrefix}${userId || 'unknown'}_all_users`;
}

export function persistAllUsersSnapshot(ownerUserId: string | null | undefined, next: unknown[]) {
  if (!ownerUserId) return;
  safeSetItem(allUsersStorageKey(ownerUserId), JSON.stringify(normalizeUserProfiles(next.filter(isProfileLike))));
}

export function readStoredAllUsersSnapshotForUser<T = unknown>(ownerUserId: string | null | undefined): T[] | null {
  if (!ownerUserId) return null;
  try {
    const raw = localStorage.getItem(allUsersStorageKey(ownerUserId));
    if (!raw) return null;
    const parsed = parseJson(raw);
    if (!Array.isArray(parsed) || !parsed.length) return null;
    const profiles = parsed.filter(isProfileLike);
    return profiles.length ? normalizeUserProfiles(profiles) as T[] : null;
  } catch {
    return null;
  }
}

export function readStoredAllUsersSnapshot<T = unknown>(): T[] | null {
  const candidates: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(STORAGE_KEYS.dataPrefix) || !k.endsWith('_all_users')) continue;
    if (!candidates.includes(k)) candidates.push(k);
  }

  const combined: ProfileLike[] = [];
  for (const key of candidates) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = parseJson(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const profiles = parsed.filter(isProfileLike);
        combined.push(...normalizeUserProfiles(profiles));
      }
    } catch {}
  }
  const normalized = normalizeUserProfiles(combined);
  return normalized.length > 0 ? (normalized as T[]) : null;
}

function scoreProfile(profile: ProfileLike): number {
  let score = 0;
  if (profile.version && Number.isFinite(Number(profile.version))) {
    score += Math.min(100, Number(profile.version) * 5);
  }
  if (profile.googleSub) score += 1000;
  if (profile.email) score += 500;
  if (profile.aiPlan) score += 20;
  score += Math.min(30, (profile.weightHistory?.length || 0) * 3);
  score += Math.min(30, (profile.measurementsHistory?.length || 0) * 3);
  score += Math.min(20, (profile.progressPhotos?.length || 0) * 2);
  score += Math.min(10, (profile.tasks?.length || 0));
  score += Math.min(10, (profile.dailyHabits && typeof profile.dailyHabits === 'object') ? 3 : 0);
  score += Math.min(10, (profile.usage && typeof profile.usage === 'object') ? 3 : 0);
  if (profile.plan) score += 10;
  if (profile.name) score += 5;
  return score;
}

function identityKey(profile: ProfileLike): string {
  const email = String(profile.email || '').trim().toLowerCase();
  if (email) return `e:${email}`;
  const googleSub = String(profile.googleSub || '').trim();
  if (googleSub) return `g:${googleSub.toLowerCase()}`;
  return `i:${String(profile.id || '').trim()}`;
}

export function normalizeUserProfiles<T extends ProfileLike>(profiles: T[]): T[] {
  if (!Array.isArray(profiles) || !profiles.length) return Array.isArray(profiles) ? profiles : [];
  const entries = new Map<string, { profile: T; score: number; index: number }>();
  profiles.forEach((profile, index) => {
    if (!profile || typeof profile !== 'object') return;
    const key = identityKey(profile);
    const score = scoreProfile(profile);
    const existing = entries.get(key);
    if (!existing) {
      entries.set(key, { profile, score, index });
      return;
    }
    if (score > existing.score) {
      entries.set(key, { profile, score, index: existing.index });
    }
  });
  return [...entries.values()]
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.profile);
}

export function rememberRemoteStateVersion(key: string, version?: number) {
  setStoredVersion(key, version);
}
