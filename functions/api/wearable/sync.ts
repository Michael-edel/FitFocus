// Cloudflare Pages Function: /api/wearable/sync
// Accepts wearable snapshots from an iOS bridge (Apple Health / HealthKit)
// or other providers and writes the normalized data into the user profile.

import { requireMobileUser, json } from "../_lib/auth";
import { requireBetaAccess } from "../_lib/access";
import { requireDB, nowMs } from "../_lib/db";
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";
import { loadActivePlan } from "../_lib/plans";
import { withProtectedFields } from "../_lib/legacy_sync";
import { writeProfileCas } from "../_lib/profile_cas";
import { isJsonObject, safeJsonParseObject, type JsonObject } from "../_lib/json";
import { toLocalDayKey } from "../../../dateUtils";
import { normalizeWearableSyncSnapshot, resolveWearableLocalDayKey, resolveWearableSyncTimestamp } from "../../../wearableSync";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };

async function loadProfileMeta(db: D1Database, userId: string): Promise<{ profile: JsonObject | null; version: number; exists: boolean }> {
  const row = await db
    .prepare("SELECT profile_json, version FROM user_profiles WHERE user_id = ?")
    .bind(userId)
    .first<{ profile_json?: string; version?: number }>();

  if (!row) return { profile: null, version: 0, exists: false };
  const parsed = safeJsonParseObject(String(row.profile_json));
  return {
    profile: parsed,
    version: Number(row.version || 1),
    exists: true,
  };
}

function conflictResponse(user: { sub: string; email?: string; name?: string; picture?: string }, profile: JsonObject, version: number) {
  const serverProfile = withProtectedFields(user, { ...profile, version });
  return json({ error: "PROFILE_CONFLICT", profile: serverProfile, version }, 409);
}

function parseBaseVersion(value: unknown): number | null {
  if (value === undefined || value === null) return 0;
  if (typeof value === "string" && value.trim() === "") return 0;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsedBaseVersion = Number(value);
  if (!Number.isFinite(parsedBaseVersion) || !Number.isInteger(parsedBaseVersion) || parsedBaseVersion < 0) return null;
  return parsedBaseVersion;
}

function pushWeightHistory(profile: JsonObject, weight: number, date: string) {
  const history = Array.isArray(profile.weightHistory) ? [...profile.weightHistory] : [];
  return [{ date, weight }, ...history].slice(0, 120);
}

function pushMeasurementHistory(
  profile: JsonObject,
  entry: {
    date: string;
    weight?: number;
    restingPulse?: number;
    bloodGlucoseMmolL?: number;
  },
) {
  const history = Array.isArray(profile.measurementsHistory) ? [...profile.measurementsHistory] : [];
  return [{
    date: entry.date,
    ...(typeof entry.weight === "number" ? { weight: entry.weight } : {}),
    ...(typeof entry.restingPulse === "number" ? { restingPulse: entry.restingPulse } : {}),
    ...(typeof entry.bloodGlucoseMmolL === "number" ? { bloodGlucoseMmolL: Number(entry.bloodGlucoseMmolL.toFixed(1)) } : {}),
  }, ...history].slice(0, 30);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireMobileUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  try {
    await requireBetaAccess(env, user);
  } catch {
    return json({ error: "ACCESS_REQUIRED" }, 403);
  }

  const db = requireDB(env);
  let body: unknown = null;
  try {
    body = await readJsonRequest(request, SMALL_JSON_BODY_LIMIT_BYTES);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
    }
    throw err;
  }
  if (!isJsonObject(body)) return json({ error: "BAD_JSON" }, 400);

  const payload = normalizeWearableSyncSnapshot(body);
  if (!payload) {
    return json({ error: "NO_WEARABLE_DATA" }, 400);
  }

  const currentMeta = await loadProfileMeta(db, user.sub);
  const baseVersion = parseBaseVersion(body.baseVersion);
  if (baseVersion === null) return json({ error: "BAD_BASE_VERSION" }, 400);
  const hasExplicitBaseVersion = Object.prototype.hasOwnProperty.call(body, "baseVersion");
  if (hasExplicitBaseVersion && ((currentMeta.exists && currentMeta.version !== baseVersion) || (!currentMeta.exists && baseVersion !== 0))) {
    return conflictResponse(user, currentMeta.profile, currentMeta.version);
  }

  const currentProfile = currentMeta.profile ?? {};
  // Legacy bridges may omit baseVersion. They still get a CAS write against
  // the version read above, so they cannot overwrite a concurrent edit.
  const expectedVersion = hasExplicitBaseVersion ? baseVersion : currentMeta.version;
  const serverPlan = await loadActivePlan(db, user.sub);
  const now = nowMs();
  const nextVersion = expectedVersion + 1;
  const timestamp = resolveWearableSyncTimestamp(payload, new Date().toISOString());
  const localDayKey = resolveWearableLocalDayKey(payload, timestamp);
  const wearableMetricsDayKey = localDayKey || toLocalDayKey(timestamp);
  const nextProfile: JsonObject = withProtectedFields(user, {
    ...currentProfile,
    plan: serverPlan,
    version: nextVersion,
    wearableProvider: payload.provider || "manual",
    wearableEnabled: true,
    wearableConnectedAt: typeof currentProfile.wearableConnectedAt === "string" ? currentProfile.wearableConnectedAt : timestamp,
    wearableLastSyncAt: timestamp,
    wearableMetricsDayKey,
    wearableMetricsUpdatedAt: timestamp,
    ...(typeof payload.stepsToday === "number" ? { wearableStepsToday: Math.round(payload.stepsToday) } : {}),
    ...(typeof payload.activeMinutesToday === "number" ? { wearableActiveMinutesToday: Math.round(payload.activeMinutesToday) } : {}),
    ...(typeof payload.sleepHoursLastNight === "number" ? { wearableSleepHoursLastNight: Number(payload.sleepHoursLastNight.toFixed(1)) } : {}),
    ...(typeof payload.pulse === "number" && payload.pulse > 0 ? { restingPulse: Math.round(payload.pulse), restingPulseMeasuredAt: timestamp } : {}),
    ...(typeof payload.bloodGlucoseMmolL === "number" && payload.bloodGlucoseMmolL > 0 ? { bloodGlucoseMmolL: Number(payload.bloodGlucoseMmolL.toFixed(1)), bloodGlucoseMeasuredAt: timestamp } : {}),
    ...(typeof payload.weight === "number" && payload.weight > 0 ? { weight: payload.weight, weightHistory: pushWeightHistory(currentProfile, payload.weight, wearableMetricsDayKey || timestamp) } : {}),
    ...((typeof payload.weight === "number" && payload.weight > 0) || (typeof payload.pulse === "number" && payload.pulse > 0) || (typeof payload.bloodGlucoseMmolL === "number" && payload.bloodGlucoseMmolL > 0)
      ? {
          measurementsHistory: pushMeasurementHistory(currentProfile, {
            date: wearableMetricsDayKey || timestamp,
            ...(typeof payload.weight === "number" && payload.weight > 0 ? { weight: payload.weight } : {}),
            ...(typeof payload.pulse === "number" && payload.pulse > 0 ? { restingPulse: Math.round(payload.pulse) } : {}),
            ...(typeof payload.bloodGlucoseMmolL === "number" && payload.bloodGlucoseMmolL > 0 ? { bloodGlucoseMmolL: payload.bloodGlucoseMmolL } : {}),
          }),
        }
      : {}),
  });

  const profileWritten = await writeProfileCas(db, user.sub, nextProfile, expectedVersion, now);
  if (!profileWritten) {
    const latest = await loadProfileMeta(db, user.sub);
    return conflictResponse(user, latest.profile || {}, latest.version);
  }

  return json(
    {
      profile: nextProfile,
      updatedFields: Object.keys({
        ...(typeof payload.stepsToday === "number" ? { wearableStepsToday: true } : {}),
        ...(typeof payload.activeMinutesToday === "number" ? { wearableActiveMinutesToday: true } : {}),
        ...(typeof payload.sleepHoursLastNight === "number" ? { wearableSleepHoursLastNight: true } : {}),
        ...(typeof payload.pulse === "number" && payload.pulse > 0 ? { restingPulse: true } : {}),
        ...(typeof payload.bloodGlucoseMmolL === "number" && payload.bloodGlucoseMmolL > 0 ? { bloodGlucoseMmolL: true } : {}),
        ...(typeof payload.weight === "number" && payload.weight > 0 ? { weight: true } : {}),
      }),
      source: payload.provider || "manual",
      version: nextVersion,
    },
    200
  );
};
