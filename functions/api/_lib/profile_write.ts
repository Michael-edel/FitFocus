import { nowMs } from './db';
import { isJsonObject, safeJsonParseObject, type JsonObject } from './json';
import {
  migrateLegacyAccountByEmail,
  withProtectedFields,
} from './legacy_sync';
import { loadActivePlan, loadActivePlanByEmail } from './plans';
import { writeProfileCas } from './profile_cas';
import { isAllowedStateKey } from './state_keyspace';

export type ProfileWriteUser = {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
};

export type ProfileWriteMode = 'replace' | 'patch';

type StateItem = { key: string; value: string; baseVersion: number };
type ProfileMeta = { profile: JsonObject | null; version: number };

export type ProfileWriteOutcome =
  | { kind: 'saved'; profile: JsonObject; updatedFields: string[]; stateItems: number; mode: ProfileWriteMode; version: number }
  | { kind: 'forbidden-keyspace' }
  | { kind: 'state-items-not-supported' }
  | { kind: 'empty-patch' }
  | { kind: 'bad-base-version' }
  | { kind: 'conflict'; profile: JsonObject; version: number };

const EDITABLE_PROFILE_FIELDS = new Set([
  'name',
  'gender',
  'weight',
  'height',
  'age',
  'activityLevel',
  'goal',
  'targetWeight',
  'adaptationMultiplier',
  'lastAdaptationDate',
  'lastCheckInDate',
  'familyMembers',
  'exclusions',
  'medicalRestrictions',
  'bloodPressureSystolic',
  'bloodPressureDiastolic',
  'bloodPressureMeasuredAt',
  'bloodGlucoseMmolL',
  'bloodGlucoseMeasuredAt',
  'waistCm',
  'chestCm',
  'hipsCm',
  'bodyMeasurementsMeasuredAt',
  'restingPulse',
  'restingPulseMeasuredAt',
  'familyExclusions',
  'lossDeficit',
  'gainSurplus',
  'riskAcknowledgedLoss',
  'riskAcknowledgedGain',
  'courseProgress',
  'lessonQuizAnswers',
  'usage',
  'dailyHabits',
  'tasks',
  'aiPlan',
  'weightHistory',
  'measurementsHistory',
  'progressPhotos',
  'dietary',
  'onboardingVersion',
  'profileDetailsCompleted',
  'wearableProvider',
  'wearableEnabled',
  'wearableConnectedAt',
  'wearableLastSyncAt',
  'wearableStepsToday',
  'wearableActiveMinutesToday',
  'wearableSleepHoursLastNight',
  'wearableMetricsDayKey',
  'wearableMetricsUpdatedAt',
]);

export function sanitizeProfilePatch(input: unknown): JsonObject {
  if (!isJsonObject(input)) return {};
  const patch: JsonObject = {};
  for (const [key, value] of Object.entries(input)) {
    if (!EDITABLE_PROFILE_FIELDS.has(key)) continue;
    patch[key] = value;
  }
  return patch;
}

function parseBaseVersion(value: unknown): number | null {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'string' && value.trim() === '') return 0;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsedBaseVersion = Number(value);
  return Number.isFinite(parsedBaseVersion) && Number.isInteger(parsedBaseVersion) && parsedBaseVersion >= 0
    ? parsedBaseVersion
    : null;
}

function sanitizeStateItems(input: unknown): StateItem[] {
  if (!Array.isArray(input)) return [];
  const items: StateItem[] = [];
  for (const entry of input) {
    if (!isJsonObject(entry)) continue;
    const key = typeof entry.key === 'string' ? entry.key : '';
    const value = typeof entry.value === 'string' ? entry.value : '';
    const baseVersion = parseBaseVersion(entry.baseVersion);
    if (!key || baseVersion === null) continue;
    items.push({ key, value, baseVersion });
  }
  return items;
}

async function loadProfileMeta(db: D1Database, userId: string): Promise<ProfileMeta> {
  const row = await db
    .prepare('SELECT profile_json, version FROM user_profiles WHERE user_id = ?')
    .bind(userId)
    .first<{ profile_json?: string; version?: number }>();

  if (!row?.profile_json) return { profile: null, version: 0 };
  return {
    profile: safeJsonParseObject(String(row.profile_json)),
    version: Number(row.version || 1),
  };
}

export async function loadStoredProfile(db: D1Database, userId: string): Promise<JsonObject | null> {
  const { profile, version } = await loadProfileMeta(db, userId);
  return profile ? { ...profile, version } : null;
}

function conflict(user: ProfileWriteUser, profile: JsonObject | null, version: number): ProfileWriteOutcome {
  return {
    kind: 'conflict',
    profile: withProtectedFields(user, { ...(profile ?? {}), version }),
    version,
  };
}

/**
 * Applies a validated profile command with version-aware persistence. HTTP
 * handlers map this outcome to responses, while all profile rules stay here.
 */
export async function writeProfile(
  db: D1Database,
  user: ProfileWriteUser,
  body: JsonObject,
  mode: ProfileWriteMode,
): Promise<ProfileWriteOutcome> {
  const patch = sanitizeProfilePatch(body);
  const stateItems = sanitizeStateItems(body.stateItems);
  if (stateItems.some((item) => !isAllowedStateKey(user.sub, item.key))) {
    return { kind: 'forbidden-keyspace' };
  }
  if (stateItems.length) return { kind: 'state-items-not-supported' };

  const updatedFields = Object.keys(patch);
  if (mode === 'patch' && !updatedFields.length) return { kind: 'empty-patch' };

  const baseVersion = parseBaseVersion(body.baseVersion);
  if (baseVersion === null) return { kind: 'bad-base-version' };

  const currentMeta = await loadProfileMeta(db, user.sub);
  if (!currentMeta.profile) await migrateLegacyAccountByEmail(db, user);
  const refreshedMeta = currentMeta.profile ? currentMeta : await loadProfileMeta(db, user.sub);
  if (refreshedMeta.profile && (baseVersion === 0 || refreshedMeta.version !== baseVersion)) {
    return conflict(user, refreshedMeta.profile, refreshedMeta.version);
  }

  const directPlan = await loadActivePlan(db, user.sub);
  const effectivePlan = directPlan === 'free'
    ? await loadActivePlanByEmail(db, user.email || '')
    : directPlan;
  const version = (refreshedMeta.version || 0) + 1;
  const profile = withProtectedFields(user, {
    ...(refreshedMeta.profile ?? {}),
    ...patch,
    plan: effectivePlan,
    version,
  });

  const written = await writeProfileCas(db, user.sub, profile, baseVersion, nowMs());
  if (!written) {
    const latest = await loadProfileMeta(db, user.sub);
    return conflict(user, latest.profile, latest.version);
  }

  return { kind: 'saved', profile, updatedFields, stateItems: stateItems.length, mode, version };
}
