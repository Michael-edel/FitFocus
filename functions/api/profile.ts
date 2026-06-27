// Cloudflare Pages Function: /api/profile
// Server-driven source-of-truth for UserProfile (stored as JSON in D1)

import { requireUser, json } from "./_lib/auth";
import { requireBetaAccess } from "./_lib/access";
import { requireDB, nowMs } from "./_lib/db";
import { readJsonRequest, RequestBodyTooLargeError } from "./_lib/request_body";
import { isJsonObject, safeJsonParseObject, type JsonObject } from "./_lib/json";
import { loadActivePlan as loadActivePlanShared, loadActivePlanByEmail as loadActivePlanByEmailShared } from "./_lib/plans";
import { isAllowedStateKey } from "./_lib/state_keyspace";
import {
  migrateLegacyAccountByEmail as migrateLegacyAccountByEmailShared,
  withProtectedFields as withProtectedFieldsShared,
} from "./_lib/legacy_sync";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };
const PROFILE_JSON_BODY_LIMIT_BYTES = 512 * 1024;

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
]);

function sanitizePatch(input: unknown): JsonObject {
  if (!isJsonObject(input)) return {};
  const patch: JsonObject = {};
  const source = input;
  for (const [key, value] of Object.entries(source)) {
    if (!EDITABLE_PROFILE_FIELDS.has(key)) continue;
    patch[key] = value;
  }
  return patch;
}

function sanitizeStateItems(input: unknown): { key: string; value: string }[] {
  if (!Array.isArray(input)) return [];
  const items: { key: string; value: string }[] = [];
  for (const entry of input) {
    if (!isJsonObject(entry)) continue;
    const key = typeof entry.key === 'string' ? entry.key : '';
    const value = typeof entry.value === 'string' ? entry.value : '';
    if (!key) continue;
    items.push({ key, value });
  }
  return items;
}

function validateStateItems(userId: string, stateItems: { key: string; value: string }[]) {
  for (const item of stateItems) {
    if (!isAllowedStateKey(userId, item.key)) {
      return item.key;
    }
  }
  return null;
}

function parseBaseVersion(value: unknown): number | null {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'string' && value.trim() === '') return 0;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsedBaseVersion = Number(value);
  if (!Number.isFinite(parsedBaseVersion) || !Number.isInteger(parsedBaseVersion) || parsedBaseVersion < 0) return null;
  return parsedBaseVersion;
}

async function loadProfile(db: D1Database, userId: string): Promise<JsonObject | null> {
  const row = await db
    .prepare("SELECT profile_json, version FROM user_profiles WHERE user_id = ?")
    .bind(userId)
    .first<{ profile_json?: string; version?: number }>();

  if (!row?.profile_json) return null;
  const parsed = safeJsonParseObject(String(row.profile_json));
  return parsed ? { ...parsed, version: Number(row.version || 1) } : null;
}

async function loadProfileMeta(db: D1Database, userId: string): Promise<{ profile: JsonObject | null; version: number }> {
  const row = await db
    .prepare("SELECT profile_json, version FROM user_profiles WHERE user_id = ?")
    .bind(userId)
    .first<{ profile_json?: string; version?: number }>();

  if (!row?.profile_json) return { profile: null, version: 0 };
  const parsed = safeJsonParseObject(String(row.profile_json));
  return {
    profile: parsed,
    version: Number(row.version || 1),
  };
}

function conflictResponse(user: { sub: string; email?: string; name?: string; picture?: string }, profile: JsonObject, version: number) {
  const serverProfile = withProtectedFieldsShared(user, { ...profile, version });
  return json({ error: 'PROFILE_CONFLICT', profile: serverProfile, version }, 409);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  try { await requireBetaAccess(env, user); } catch { return json({ error: "ACCESS_REQUIRED" }, 403); }

  const db = requireDB(env);
  const profile = await loadProfile(db, user.sub);
  if (!profile) {
    const migrated = await migrateLegacyAccountByEmailShared(db, user);
    if (!migrated) return json({ profile: null }, 200);
    return json({ profile: migrated }, 200);
  }
  const serverPlan = await loadActivePlanShared(db, user.sub);
  const effectivePlan = serverPlan === 'free' ? await loadActivePlanByEmailShared(db, user.email || '') : serverPlan;
  return json({ profile: withProtectedFieldsShared(user, { ...profile, plan: effectivePlan }) }, 200);
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  try { await requireBetaAccess(env, user); } catch { return json({ error: "ACCESS_REQUIRED" }, 403); }

  const db = requireDB(env);
  let body: unknown = null;
  try {
    body = await readJsonRequest(request, PROFILE_JSON_BODY_LIMIT_BYTES);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
    }
    throw err;
  }
  if (!isJsonObject(body)) return json({ error: "BAD_JSON" }, 400);

  const patch = sanitizePatch(body);
  const stateItems = sanitizeStateItems(body.stateItems);
  // Проверка keyspace для stateItems (закрытие P0 bypass)
  const forbiddenStateKey = validateStateItems(user.sub, stateItems);
  if (forbiddenStateKey) {
    return json({ error: "FORBIDDEN_KEYSPACE", key: forbiddenStateKey }, 403);
  }
  const baseVersion = parseBaseVersion(body.baseVersion);
  if (baseVersion === null) return json({ error: "BAD_BASE_VERSION" }, 400);
  const currentMeta = await loadProfileMeta(db, user.sub);
  if (!currentMeta.profile) {
    await migrateLegacyAccountByEmailShared(db, user);
  }
  const refreshedMeta = currentMeta.profile ? currentMeta : await loadProfileMeta(db, user.sub);
  if (refreshedMeta.profile && baseVersion > 0 && refreshedMeta.version !== baseVersion) {
    return conflictResponse(user, refreshedMeta.profile, refreshedMeta.version);
  }
  const directPlan = await loadActivePlanShared(db, user.sub);
  const effectivePlan = directPlan === 'free' ? await loadActivePlanByEmailShared(db, user.email || '') : directPlan;
  const nextVersion = (refreshedMeta.version || 0) + 1;
  // PUT is merge-hardened to avoid accidental profile data loss from partial clients.
  const profile = withProtectedFieldsShared(user, {
    ...(refreshedMeta.profile ?? {}),
    ...patch,
    plan: effectivePlan,
    version: nextVersion,
  });

  const t = nowMs();
  const statements = [
    db
      .prepare(
        "INSERT INTO user_profiles (user_id, profile_json, updated_at, version) VALUES (?, ?, ?, ?) " +
          "ON CONFLICT(user_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at, version = excluded.version"
      )
      .bind(user.sub, JSON.stringify(profile), t, nextVersion),
    ...stateItems.map((it) =>
      db
        .prepare(
          "INSERT INTO user_kv (user_id, k, v, updated_at, version) VALUES (?, ?, ?, ?, ?) " +
            "ON CONFLICT(user_id, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at, version = excluded.version"
        )
        .bind(user.sub, it.key, it.value, t, nextVersion)
    ),
  ];
  await db.batch(statements);

  return json({ profile, updatedFields: Object.keys(patch), stateItems: stateItems.length, mode: 'replace', version: nextVersion }, 200);
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  try { await requireBetaAccess(env, user); } catch { return json({ error: "ACCESS_REQUIRED" }, 403); }

  const db = requireDB(env);
  let body: unknown = null;
  try {
    body = await readJsonRequest(request, PROFILE_JSON_BODY_LIMIT_BYTES);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
    }
    throw err;
  }
  if (!isJsonObject(body)) return json({ error: "BAD_JSON" }, 400);

  const patch = sanitizePatch(body);
  const stateItems = sanitizeStateItems(body.stateItems);
  // Проверка keyspace для stateItems (закрытие P0 bypass)
  const forbiddenStateKey = validateStateItems(user.sub, stateItems);
  if (forbiddenStateKey) {
    return json({ error: "FORBIDDEN_KEYSPACE", key: forbiddenStateKey }, 403);
  }
  const updatedFields = Object.keys(patch);
  if (!updatedFields.length) return json({ error: 'EMPTY_PATCH' }, 400);

  const currentMeta = await loadProfileMeta(db, user.sub);
  if (!currentMeta.profile) {
    await migrateLegacyAccountByEmailShared(db, user);
  }
  const baseVersion = parseBaseVersion(body.baseVersion);
  if (baseVersion === null) return json({ error: "BAD_BASE_VERSION" }, 400);
  const refreshedMeta = currentMeta.profile ? currentMeta : await loadProfileMeta(db, user.sub);
  if (refreshedMeta.profile && baseVersion > 0 && refreshedMeta.version !== baseVersion) {
    return conflictResponse(user, refreshedMeta.profile, refreshedMeta.version);
  }
  const directPlan = await loadActivePlanShared(db, user.sub);
  const effectivePlan = directPlan === 'free' ? await loadActivePlanByEmailShared(db, user.email || '') : directPlan;
  const nextVersion = (refreshedMeta.version || 0) + 1;
  const profile = withProtectedFieldsShared(user, { ...(refreshedMeta.profile ?? {}), ...patch, plan: effectivePlan, version: nextVersion });

  const t = nowMs();
  const statements = [
    db
      .prepare(
        "INSERT INTO user_profiles (user_id, profile_json, updated_at, version) VALUES (?, ?, ?, ?) " +
          "ON CONFLICT(user_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at, version = excluded.version"
      )
      .bind(user.sub, JSON.stringify(profile), t, nextVersion),
    ...stateItems.map((it) =>
      db
        .prepare(
          "INSERT INTO user_kv (user_id, k, v, updated_at, version) VALUES (?, ?, ?, ?, ?) " +
            "ON CONFLICT(user_id, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at, version = excluded.version"
        )
        .bind(user.sub, it.key, it.value, t, nextVersion)
    ),
  ];
  await db.batch(statements);

  return json({ profile, updatedFields, stateItems: stateItems.length, mode: 'patch', version: nextVersion }, 200);
};
