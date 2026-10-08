import { nowMs } from './db';
import { safeJsonParseObject, type JsonObject } from './json';
import { withProtectedFields } from './legacy_sync';
import { loadActivePlan } from './plans';
import { writeProfileCas } from './profile_cas';
import { normalizeProfileRecord } from './profile_contract';
import type { SessionUser } from './auth';
import { toLocalDayKey } from '../../../dateUtils';
import { resolveWearableLocalDayKey, resolveWearableSyncTimestamp, type WearableSyncSnapshot } from '../../../wearableSync';

type ProfileMeta = { profile: JsonObject | null; version: number; exists: boolean };

export type WearableProfileSyncResult =
  | { kind: 'bad-base-version' }
  | { kind: 'conflict'; profile: JsonObject; version: number }
  | { kind: 'synced'; profile: JsonObject; version: number; updatedFields: string[]; source: string };

async function loadProfileMeta(db: D1Database, userId: string): Promise<ProfileMeta> {
  const row = await db.prepare('SELECT profile_json, version FROM user_profiles WHERE user_id = ?').bind(userId).first<{ profile_json?: string; version?: number }>();
  if (!row) return { profile: null, version: 0, exists: false };
  const parsed = safeJsonParseObject(String(row.profile_json));
  return { profile: parsed ? normalizeProfileRecord(parsed) : null, version: Number(row.version || 1), exists: true };
}

function parseBaseVersion(value: unknown): number | null {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return 0;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function protectedConflict(user: SessionUser, profile: JsonObject | null, version: number) {
  return { kind: 'conflict' as const, profile: withProtectedFields(user, { ...(profile || {}), version }), version };
}

function pushWeightHistory(profile: JsonObject, weight: number, date: string) {
  const history = Array.isArray(profile.weightHistory) ? [...profile.weightHistory] : [];
  return [{ date, weight }, ...history].slice(0, 120);
}

function pushMeasurementHistory(profile: JsonObject, entry: { date: string; weight?: number; restingPulse?: number; bloodGlucoseMmolL?: number }) {
  const history = Array.isArray(profile.measurementsHistory) ? [...profile.measurementsHistory] : [];
  return [{
    date: entry.date,
    ...(typeof entry.weight === 'number' ? { weight: entry.weight } : {}),
    ...(typeof entry.restingPulse === 'number' ? { restingPulse: entry.restingPulse } : {}),
    ...(typeof entry.bloodGlucoseMmolL === 'number' ? { bloodGlucoseMmolL: Number(entry.bloodGlucoseMmolL.toFixed(1)) } : {}),
  }, ...history].slice(0, 30);
}

function changedFields(payload: WearableSyncSnapshot) {
  return Object.keys({
    ...(typeof payload.stepsToday === 'number' ? { wearableStepsToday: true } : {}),
    ...(typeof payload.activeMinutesToday === 'number' ? { wearableActiveMinutesToday: true } : {}),
    ...(typeof payload.sleepHoursLastNight === 'number' ? { wearableSleepHoursLastNight: true } : {}),
    ...(typeof payload.pulse === 'number' && payload.pulse > 0 ? { restingPulse: true } : {}),
    ...(typeof payload.bloodGlucoseMmolL === 'number' && payload.bloodGlucoseMmolL > 0 ? { bloodGlucoseMmolL: true } : {}),
    ...(typeof payload.weight === 'number' && payload.weight > 0 ? { weight: true } : {}),
  });
}

/** Applies a normalized mobile wearable snapshot with an optimistic profile lock. */
export async function syncWearableProfile(input: {
  db: D1Database;
  user: SessionUser;
  payload: WearableSyncSnapshot;
  baseVersion: unknown;
  hasExplicitBaseVersion: boolean;
  now?: number;
}): Promise<WearableProfileSyncResult> {
  const baseVersion = parseBaseVersion(input.baseVersion);
  if (baseVersion === null) return { kind: 'bad-base-version' };
  const current = await loadProfileMeta(input.db, input.user.sub);
  if (input.hasExplicitBaseVersion && ((current.exists && current.version !== baseVersion) || (!current.exists && baseVersion !== 0))) {
    return protectedConflict(input.user, current.profile, current.version);
  }
  const currentProfile = current.profile ?? {};
  const expectedVersion = input.hasExplicitBaseVersion ? baseVersion : current.version;
  const version = expectedVersion + 1;
  const timestamp = resolveWearableSyncTimestamp(input.payload, new Date().toISOString());
  const wearableMetricsDayKey = resolveWearableLocalDayKey(input.payload, timestamp) || toLocalDayKey(timestamp);
  const plan = await loadActivePlan(input.db, input.user.sub);
  const profile = withProtectedFields(input.user, normalizeProfileRecord({
    ...currentProfile, plan, version, wearableProvider: input.payload.provider || 'manual', wearableEnabled: true,
    wearableConnectedAt: typeof currentProfile.wearableConnectedAt === 'string' ? currentProfile.wearableConnectedAt : timestamp,
    wearableLastSyncAt: timestamp, wearableMetricsDayKey, wearableMetricsUpdatedAt: timestamp,
    ...(typeof input.payload.stepsToday === 'number' ? { wearableStepsToday: Math.round(input.payload.stepsToday) } : {}),
    ...(typeof input.payload.activeMinutesToday === 'number' ? { wearableActiveMinutesToday: Math.round(input.payload.activeMinutesToday) } : {}),
    ...(typeof input.payload.sleepHoursLastNight === 'number' ? { wearableSleepHoursLastNight: Number(input.payload.sleepHoursLastNight.toFixed(1)) } : {}),
    ...(typeof input.payload.pulse === 'number' && input.payload.pulse > 0 ? { restingPulse: Math.round(input.payload.pulse), restingPulseMeasuredAt: timestamp } : {}),
    ...(typeof input.payload.bloodGlucoseMmolL === 'number' && input.payload.bloodGlucoseMmolL > 0 ? { bloodGlucoseMmolL: Number(input.payload.bloodGlucoseMmolL.toFixed(1)), bloodGlucoseMeasuredAt: timestamp } : {}),
    ...(typeof input.payload.weight === 'number' && input.payload.weight > 0 ? { weight: input.payload.weight, weightHistory: pushWeightHistory(currentProfile, input.payload.weight, wearableMetricsDayKey || timestamp) } : {}),
    ...((typeof input.payload.weight === 'number' && input.payload.weight > 0) || (typeof input.payload.pulse === 'number' && input.payload.pulse > 0) || (typeof input.payload.bloodGlucoseMmolL === 'number' && input.payload.bloodGlucoseMmolL > 0)
      ? { measurementsHistory: pushMeasurementHistory(currentProfile, { date: wearableMetricsDayKey || timestamp, ...(typeof input.payload.weight === 'number' && input.payload.weight > 0 ? { weight: input.payload.weight } : {}), ...(typeof input.payload.pulse === 'number' && input.payload.pulse > 0 ? { restingPulse: Math.round(input.payload.pulse) } : {}), ...(typeof input.payload.bloodGlucoseMmolL === 'number' && input.payload.bloodGlucoseMmolL > 0 ? { bloodGlucoseMmolL: input.payload.bloodGlucoseMmolL } : {}) }) }
      : {}),
  }));
  const written = await writeProfileCas(input.db, input.user.sub, profile, expectedVersion, input.now ?? nowMs());
  if (!written) {
    const latest = await loadProfileMeta(input.db, input.user.sub);
    return protectedConflict(input.user, latest.profile, latest.version);
  }
  return { kind: 'synced', profile, version, updatedFields: changedFields(input.payload), source: input.payload.provider || 'manual' };
}
