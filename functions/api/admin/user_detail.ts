// Cloudflare Pages Function: /api/admin/user_detail
// Admin-only deep user card for the console.
import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireRole } from "../_lib/rbac";
import { requireAdminRequest } from "../_lib/admin_guard";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseProfile(profileJson: unknown): Record<string, unknown> {
  if (!profileJson) return {};
  try {
    const parsed = JSON.parse(String(profileJson));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: "UNAUTH" }, 401); }
  try { requireRole(user, "admin"); } catch { return json({ error: "FORBIDDEN" }, 403); }
  const db = requireDB(env);
  await requireAdminRequest(user, request, db);

  const url = new URL(request.url);
  const userId = String(url.searchParams.get("user_id") || "").trim();
  if (!userId) return json({ error: "BAD_REQUEST", message: "user_id required" }, 400);

  const userRow = await db
    .prepare(
      `SELECT id, email, name, picture, created_at, updated_at, deleted_at, deletion_scheduled_at, is_active
       FROM users
       WHERE id = ?
       LIMIT 1`
    )
    .bind(userId)
    .first<any>();

  if (!userRow) return json({ error: "NOT_FOUND", message: "user not found" }, 404);

  const profileRow = await db
    .prepare("SELECT profile_json, updated_at, version FROM user_profiles WHERE user_id = ? LIMIT 1")
    .bind(userId)
    .first<any>();
  const profile = parseProfile(profileRow?.profile_json);
  const measurementsHistory = Array.isArray(profile.measurementsHistory) ? profile.measurementsHistory : [];
  const progressPhotos = Array.isArray(profile.progressPhotos) ? profile.progressPhotos : [];
  const familyMembers = Array.isArray(profile.familyMembers) ? profile.familyMembers : [];

  const familyRow = await db
    .prepare(
      `SELECT f.id as family_id, f.name as family_name, f.owner_user_id, f.created_at as family_created_at,
              m.role as member_role, m.status as member_status, m.created_at as member_created_at, m.updated_at as member_updated_at,
              (
                SELECT COUNT(*) FROM family_members fm
                WHERE fm.family_id = f.id AND fm.status = 'active'
              ) as active_members
       FROM family_members m
       JOIN families f ON f.id = m.family_id
       WHERE m.user_id = ? AND m.status = 'active'
       ORDER BY f.created_at DESC
       LIMIT 1`
    )
    .bind(userId)
    .first<any>();

  const rolesRow = await db
    .prepare("SELECT role FROM user_roles WHERE user_id = ? ORDER BY role")
    .bind(userId)
    .all<any>();

  const subscriptionRow = await db
    .prepare(
      `SELECT plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, updated_at
       FROM subscriptions
       WHERE user_id = ?
       ORDER BY updated_at DESC
       LIMIT 1`
    )
    .bind(userId)
    .first<any>();

  const sessionsResult = await db
    .prepare(
      `SELECT id, created_at, expires_at, revoked, user_agent, ip
       FROM sessions
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`
    )
    .bind(userId)
    .all<any>();

  const nowSec = Math.floor(Date.now() / 1000);
  const sessionStats = await db
    .prepare(
      `SELECT COUNT(*) as total_sessions,
              SUM(CASE WHEN revoked = 1 THEN 1 ELSE 0 END) as revoked_sessions,
              SUM(CASE WHEN revoked = 0 AND expires_at > ? THEN 1 ELSE 0 END) as active_sessions,
              SUM(CASE WHEN revoked = 0 AND expires_at <= ? THEN 1 ELSE 0 END) as expired_sessions,
              COALESCE(MAX(expires_at - created_at), 0) as ttl_seconds
       FROM sessions
       WHERE user_id = ?`
    )
    .bind(nowSec, nowSec, userId)
    .first<any>();

  const sevenDaysAgo = Date.now() - 7 * 86400000;
  const aiRow = await db
    .prepare(
      `SELECT COUNT(*) as calls,
              SUM(COALESCE(total_tokens,0)) as tokens,
              SUM(COALESCE(estimated_cost_usd,0)) as cost_usd,
              SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) as errors,
              SUM(CASE WHEN is_fallback = 1 THEN 1 ELSE 0 END) as fallback_calls,
              MAX(ts) as last_ts
       FROM ai_events
       WHERE user_id = ? AND ts >= ?`
    )
    .bind(userId, sevenDaysAgo)
    .first<any>();

  const sessions = (sessionsResult?.results || []).map((row: any) => {
    const createdAt = toNumber(row.created_at);
    const expiresAt = toNumber(row.expires_at);
    const ttlSeconds = Math.max(0, expiresAt - createdAt);
    const remainingSeconds = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
    return {
      id: String(row.id),
      created_at: createdAt,
      expires_at: expiresAt,
      revoked: Number(row.revoked || 0),
      user_agent: row.user_agent ? String(row.user_agent) : undefined,
      ip: row.ip ? String(row.ip) : undefined,
      ttl_seconds: ttlSeconds,
      remaining_seconds: remainingSeconds,
    };
  });

  const ttlSeconds = Number(sessionStats?.ttl_seconds || 0) || sessions.reduce((max, s) => Math.max(max, s.ttl_seconds), 0) || 60 * 60 * 24 * 30;
  const summary = {
    total_sessions: Number(sessionStats?.total_sessions || 0),
    active_sessions: Number(sessionStats?.active_sessions || 0),
    revoked_sessions: Number(sessionStats?.revoked_sessions || 0),
    expired_sessions: Number(sessionStats?.expired_sessions || 0),
    session_ttl_seconds: ttlSeconds,
    session_ttl_days: Math.max(1, Math.round(ttlSeconds / 86400)),
    ai_calls_7d: Number(aiRow?.calls || 0),
    ai_tokens_7d: Number(aiRow?.tokens || 0),
    ai_cost_7d: Number(aiRow?.cost_usd || 0),
    ai_errors_7d: Number(aiRow?.errors || 0),
    ai_fallback_7d: Number(aiRow?.fallback_calls || 0),
    last_ai_ts: aiRow?.last_ts ? Number(aiRow.last_ts) : null,
  };

  const wearableEnabled = profile.wearableEnabled === true || profile.wearableEnabled === 1 || profile.wearableEnabled === "1";
  const hasGlucose = asNumber(profile.bloodGlucoseMmolL) !== null;
  const hasMeasurements =
    measurementsHistory.length > 0 ||
    asNumber(profile.weight) !== null ||
    asNumber(profile.restingPulse) !== null ||
    hasGlucose ||
    asNumber(profile.bloodPressureSystolic) !== null ||
    asNumber(profile.bloodPressureDiastolic) !== null;
  const familyCount = familyMembers.length;

  return json({
    user: {
      id: String(userRow.id),
      email: userRow.email ? String(userRow.email) : "",
      name: userRow.name ? String(userRow.name) : "",
      picture: userRow.picture ? String(userRow.picture) : "",
      created_at: userRow.created_at ? Number(userRow.created_at) : 0,
      updated_at: userRow.updated_at ? Number(userRow.updated_at) : 0,
      deleted_at: userRow.deleted_at ? String(userRow.deleted_at) : null,
      deletion_scheduled_at: userRow.deletion_scheduled_at ? String(userRow.deletion_scheduled_at) : null,
      is_active: Number(userRow.is_active ?? 1),
    },
    profile: {
      version: profileRow?.version ? Number(profileRow.version) : null,
      updated_at: profileRow?.updated_at ? Number(profileRow.updated_at) : null,
      name: typeof profile.name === "string" ? String(profile.name) : "",
      weight: asNumber(profile.weight),
      height: asNumber(profile.height),
      age: asNumber(profile.age),
      target_weight: asNumber(profile.targetWeight),
      goal: typeof profile.goal === "string" ? String(profile.goal) : "",
      activity_level: asNumber(profile.activityLevel),
      medical_restrictions: typeof profile.medicalRestrictions === "string" ? String(profile.medicalRestrictions) : "",
      family_exclusions: typeof profile.familyExclusions === "string" ? String(profile.familyExclusions) : "",
      blood_pressure_systolic: asNumber(profile.bloodPressureSystolic),
      blood_pressure_diastolic: asNumber(profile.bloodPressureDiastolic),
      blood_pressure_measured_at: profile.bloodPressureMeasuredAt ? String(profile.bloodPressureMeasuredAt) : null,
      waist_cm: asNumber(profile.waistCm),
      chest_cm: asNumber(profile.chestCm),
      hips_cm: asNumber(profile.hipsCm),
      body_measurements_measured_at: profile.bodyMeasurementsMeasuredAt ? String(profile.bodyMeasurementsMeasuredAt) : null,
      blood_glucose_mmol_l: asNumber(profile.bloodGlucoseMmolL),
      blood_glucose_measured_at: profile.bloodGlucoseMeasuredAt ? String(profile.bloodGlucoseMeasuredAt) : null,
      resting_pulse: asNumber(profile.restingPulse),
      resting_pulse_measured_at: profile.restingPulseMeasuredAt ? String(profile.restingPulseMeasuredAt) : null,
      wearable_provider: typeof profile.wearableProvider === "string" ? String(profile.wearableProvider) : "",
      wearable_enabled: wearableEnabled,
      wearable_connected_at: profile.wearableConnectedAt ? String(profile.wearableConnectedAt) : null,
      wearable_last_sync_at: profile.wearableLastSyncAt ? String(profile.wearableLastSyncAt) : null,
      wearable_metrics_updated_at: profile.wearableMetricsUpdatedAt ? String(profile.wearableMetricsUpdatedAt) : null,
      wearable_steps_today: asNumber(profile.wearableStepsToday),
      wearable_active_minutes_today: asNumber(profile.wearableActiveMinutesToday),
      wearable_sleep_hours_last_night: asNumber(profile.wearableSleepHoursLastNight),
      measurements_count: measurementsHistory.length,
      progress_photos_count: progressPhotos.length,
      family_members_count: familyCount,
      has_measurements: hasMeasurements,
      has_glucose: hasGlucose,
      weight_history_count: Array.isArray(profile.weightHistory) ? profile.weightHistory.length : 0,
    },
    roles: (rolesRow?.results || []).map((row: any) => String(row.role)),
    family: familyRow ? {
      family_id: String(familyRow.family_id),
      family_name: String(familyRow.family_name || "Семья"),
      owner_user_id: String(familyRow.owner_user_id),
      member_role: String(familyRow.member_role || ""),
      member_status: String(familyRow.member_status || ""),
      family_created_at: familyRow.family_created_at ? Number(familyRow.family_created_at) : null,
      member_created_at: familyRow.member_created_at ? Number(familyRow.member_created_at) : null,
      member_updated_at: familyRow.member_updated_at ? Number(familyRow.member_updated_at) : null,
      active_members: Number(familyRow.active_members || 0),
    } : null,
    subscription: subscriptionRow
      ? {
          plan: String(subscriptionRow.plan || "free"),
          status: String(subscriptionRow.status || "inactive"),
          current_period_end: subscriptionRow.current_period_end ? Number(subscriptionRow.current_period_end) : null,
          updated_at: subscriptionRow.updated_at ? Number(subscriptionRow.updated_at) : null,
          stripe_customer_id: subscriptionRow.stripe_customer_id ? String(subscriptionRow.stripe_customer_id) : null,
          stripe_subscription_id: subscriptionRow.stripe_subscription_id ? String(subscriptionRow.stripe_subscription_id) : null,
        }
      : null,
    sessions,
    summary,
  });
};
