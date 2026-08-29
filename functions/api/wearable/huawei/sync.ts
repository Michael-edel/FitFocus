import type { PagesFunction } from "@cloudflare/workers-types";
import { requireUser, json } from "../../_lib/auth";
import { requireBetaAccess } from "../../_lib/access";
import { requireDB } from "../../_lib/db";
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../../_lib/request_body";
import { isJsonObject, safeJsonParseObject, type JsonObject } from "../../_lib/json";
import { withProtectedFields } from "../../_lib/legacy_sync";
import { writeProfileCas } from "../../_lib/profile_cas";
import { loadActivePlan } from "../../_lib/plans";
import {
  decryptHuaweiAccessToken,
  decryptHuaweiRefreshToken,
  ensureHuaweiConnectionsSchema,
  encryptHuaweiTokenSet,
  fetchHuaweiDailySnapshot,
  huaweiProviderId,
  refreshHuaweiAccessToken,
  shouldRefreshHuaweiToken,
  type HuaweiConnectionRow,
  type HuaweiHealthEnv,
} from "../../_lib/huawei_health";

type Env = HuaweiHealthEnv & { DB: D1Database };

async function loadProfile(db: D1Database, userId: string): Promise<{ profile: JsonObject; version: number }> {
  const row = await db
    .prepare("SELECT profile_json, version FROM user_profiles WHERE user_id = ?")
    .bind(userId)
    .first<{ profile_json?: string; version?: number }>();
  return {
    profile: row?.profile_json ? (safeJsonParseObject(String(row.profile_json)) || {}) : {},
    version: Number(row?.version || 0),
  };
}

function readStringField(body: unknown, key: string): string | undefined {
  if (!isJsonObject(body)) return undefined;
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseBaseVersion(value: unknown): number | null {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return 0;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function changedFields(snapshot: {
  stepsToday?: number;
  activeMinutesToday?: number;
  sleepHoursLastNight?: number;
  pulse?: number;
}) {
  return Object.keys({
    ...(typeof snapshot.stepsToday === "number" ? { wearableStepsToday: true } : {}),
    ...(typeof snapshot.activeMinutesToday === "number" ? { wearableActiveMinutesToday: true } : {}),
    ...(typeof snapshot.sleepHoursLastNight === "number" ? { wearableSleepHoursLastNight: true } : {}),
    ...(typeof snapshot.pulse === "number" ? { restingPulse: true } : {}),
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
    await requireBetaAccess(env, user);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  let body: unknown = {};
  try {
    body = await readJsonRequest(request, SMALL_JSON_BODY_LIMIT_BYTES);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
    }
    throw err;
  }

  const db = requireDB(env);
  await ensureHuaweiConnectionsSchema(db);
  const provider = huaweiProviderId();
  const row = await db
    .prepare("SELECT user_id, provider, access_token_enc, refresh_token_enc, token_type, scope, expires_at, created_at, updated_at, last_sync_at, status, metadata_json FROM wearable_connections WHERE user_id = ? AND provider = ? AND status = 'connected' LIMIT 1")
    .bind(user.sub, provider)
    .first<HuaweiConnectionRow>();
  if (!row) return json({ error: "HUAWEI_NOT_CONNECTED" }, 409);

  let accessToken = await decryptHuaweiAccessToken(env, request, row);
  if (shouldRefreshHuaweiToken(row)) {
    const refreshToken = await decryptHuaweiRefreshToken(env, request, row);
    if (!refreshToken) return json({ error: "HUAWEI_REFRESH_TOKEN_MISSING" }, 409);
    const tokenSet = await refreshHuaweiAccessToken(env, request, refreshToken);
    const encrypted = await encryptHuaweiTokenSet(env, request, tokenSet);
    accessToken = tokenSet.accessToken;
    await db
      .prepare(
        "UPDATE wearable_connections SET access_token_enc = ?, refresh_token_enc = COALESCE(?, refresh_token_enc), " +
          "token_type = ?, scope = ?, expires_at = ?, updated_at = ? WHERE user_id = ? AND provider = ?"
      )
      .bind(
        encrypted.accessTokenEnc,
        encrypted.refreshTokenEnc,
        tokenSet.tokenType,
        tokenSet.scope,
        tokenSet.expiresAt,
        Math.floor(Date.now() / 1000),
        user.sub,
        provider,
      )
      .run();
  }

  const timezone = readStringField(body, "timezone");
  const date = readStringField(body, "date");
  const hasExplicitBaseVersion = isJsonObject(body) && Object.prototype.hasOwnProperty.call(body, "baseVersion");
  const requestedBaseVersion = parseBaseVersion(isJsonObject(body) ? body.baseVersion : undefined);
  if (requestedBaseVersion === null) return json({ error: "BAD_BASE_VERSION" }, 400);
  const snapshot = await fetchHuaweiDailySnapshot(env, request, accessToken, { timezone, date });
  const updatedFields = changedFields(snapshot);
  if (!updatedFields.length) {
    return json({ error: "NO_HUAWEI_DATA", provider, updatedFields: [] }, 422);
  }

  const now = Date.now();
  const timestamp = new Date(now).toISOString();
  const current = await loadProfile(db, user.sub);
  const currentProfile = current.profile;
  if (hasExplicitBaseVersion && requestedBaseVersion !== current.version) {
    return json({ error: "PROFILE_CONFLICT", profile: withProtectedFields(user, { ...currentProfile, version: current.version }), version: current.version }, 409);
  }
  const expectedVersion = hasExplicitBaseVersion ? requestedBaseVersion : current.version;
  const version = expectedVersion + 1;
  const plan = await loadActivePlan(db, user.sub);
  const nextProfile = withProtectedFields(user, {
    ...currentProfile,
    plan,
    version,
    wearableProvider: provider,
    wearableEnabled: true,
    wearableConnectedAt: typeof currentProfile.wearableConnectedAt === "string" ? currentProfile.wearableConnectedAt : timestamp,
    wearableLastSyncAt: timestamp,
    wearableMetricsUpdatedAt: timestamp,
    ...(date ? { wearableMetricsDayKey: date } : {}),
    ...(typeof snapshot.stepsToday === "number" ? { wearableStepsToday: snapshot.stepsToday } : {}),
    ...(typeof snapshot.activeMinutesToday === "number" ? { wearableActiveMinutesToday: snapshot.activeMinutesToday } : {}),
    ...(typeof snapshot.sleepHoursLastNight === "number" ? { wearableSleepHoursLastNight: snapshot.sleepHoursLastNight } : {}),
    ...(typeof snapshot.pulse === "number" && snapshot.pulse > 0 ? { restingPulse: snapshot.pulse, restingPulseMeasuredAt: timestamp } : {}),
  });

  const profileWritten = await writeProfileCas(db, user.sub, nextProfile, expectedVersion, now);
  if (!profileWritten) {
    const latest = await loadProfile(db, user.sub);
    return json({
      error: "PROFILE_CONFLICT",
      profile: withProtectedFields(user, { ...latest.profile, version: latest.version }),
      version: latest.version,
    }, 409);
  }

  await db
    .prepare("UPDATE wearable_connections SET last_sync_at = ?, updated_at = ? WHERE user_id = ? AND provider = ?")
    .bind(Math.floor(now / 1000), Math.floor(now / 1000), user.sub, provider)
    .run();

  return json({ provider, profile: nextProfile, updatedFields, version });
};
