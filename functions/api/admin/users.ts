// Cloudflare Pages Function: /api/admin/users
// Admin-only user list/search with product filters.
import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireRole } from "../_lib/rbac";
import { requireAdminRequest } from "../_lib/admin_guard";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

function toInt(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
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
  const q = String(url.searchParams.get("query") || "").trim();
  const status = String(url.searchParams.get("status") || "all").toLowerCase();
  const plan = String(url.searchParams.get("plan") || "all").toLowerCase();
  const wearable = String(url.searchParams.get("wearable") || "all").toLowerCase();
  const glucose = String(url.searchParams.get("glucose") || "all").toLowerCase();
  const measurements = String(url.searchParams.get("measurements") || "all").toLowerCase();
  const limit = Math.max(1, Math.min(200, toInt(url.searchParams.get("limit"), 50)));
  const offset = Math.max(0, toInt(url.searchParams.get("offset"), 0));

  const where: string[] = [];
  const binds: Array<string | number> = [];

  if (q) {
    const like = `%${q.toLowerCase()}%`;
    where.push(`(
      lower(COALESCE(u.id, '')) LIKE ?
      OR lower(COALESCE(u.email, '')) LIKE ?
      OR lower(COALESCE(CASE WHEN json_valid(p.profile_json) THEN json_extract(p.profile_json, '$.name') END, '')) LIKE ?
    )`);
    binds.push(like, like, like);
  }

  if (status === "active") {
    where.push("u.is_active = 1 AND u.deleted_at IS NULL");
  } else if (status === "inactive") {
    where.push("u.is_active = 0 AND u.deleted_at IS NULL");
  } else if (status === "deleted") {
    where.push("u.deleted_at IS NOT NULL");
  }

  if (plan === "free" || plan === "pro" || plan === "family") {
    where.push("COALESCE(lower(s.plan), lower(CASE WHEN json_valid(p.profile_json) THEN json_extract(p.profile_json, '$.plan') END), 'free') = ?");
    binds.push(plan);
  }

  if (wearable === "connected") {
    where.push("COALESCE(CAST(CASE WHEN json_valid(p.profile_json) THEN json_extract(p.profile_json, '$.wearableEnabled') END AS INTEGER), 0) = 1");
  } else if (wearable === "disconnected") {
    where.push("COALESCE(CAST(CASE WHEN json_valid(p.profile_json) THEN json_extract(p.profile_json, '$.wearableEnabled') END AS INTEGER), 0) = 0");
  }

  if (glucose === "yes") {
    where.push("CASE WHEN json_valid(p.profile_json) THEN json_extract(p.profile_json, '$.bloodGlucoseMmolL') END IS NOT NULL");
  } else if (glucose === "no") {
    where.push("CASE WHEN json_valid(p.profile_json) THEN json_extract(p.profile_json, '$.bloodGlucoseMmolL') END IS NULL");
  }

  if (measurements === "yes") {
    where.push(`(
      COALESCE(CASE WHEN json_valid(p.profile_json) THEN json_array_length(json_extract(p.profile_json, '$.measurementsHistory')) END, 0) > 0
      OR CASE WHEN json_valid(p.profile_json) THEN json_extract(p.profile_json, '$.weight') END IS NOT NULL
      OR CASE WHEN json_valid(p.profile_json) THEN json_extract(p.profile_json, '$.restingPulse') END IS NOT NULL
      OR CASE WHEN json_valid(p.profile_json) THEN json_extract(p.profile_json, '$.bloodGlucoseMmolL') END IS NOT NULL
    )`);
  } else if (measurements === "no") {
    where.push(`(
      COALESCE(CASE WHEN json_valid(p.profile_json) THEN json_array_length(json_extract(p.profile_json, '$.measurementsHistory')) END, 0) = 0
      AND CASE WHEN json_valid(p.profile_json) THEN json_extract(p.profile_json, '$.weight') END IS NULL
      AND CASE WHEN json_valid(p.profile_json) THEN json_extract(p.profile_json, '$.restingPulse') END IS NULL
      AND CASE WHEN json_valid(p.profile_json) THEN json_extract(p.profile_json, '$.bloodGlucoseMmolL') END IS NULL
    )`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const query = `
    SELECT
      u.id,
      u.email,
      u.created_at,
      u.deleted_at,
      u.deletion_scheduled_at,
      u.is_active,
      s.plan AS subscription_plan,
      s.status AS subscription_status,
      s.current_period_end,
      s.updated_at AS subscription_updated_at,
      s.stripe_customer_id,
      s.stripe_subscription_id,
      p.profile_json,
      p.updated_at AS profile_updated_at,
      p.version AS profile_version
    FROM users u
    LEFT JOIN subscriptions s ON s.user_id = u.id
    LEFT JOIN user_profiles p ON p.user_id = u.id
    ${whereSql}
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const countQuery = `
    SELECT COUNT(*) as c
    FROM users u
    LEFT JOIN subscriptions s ON s.user_id = u.id
    LEFT JOIN user_profiles p ON p.user_id = u.id
    ${whereSql}
  `;

  const countRow = await db.prepare(countQuery).bind(...binds).first<{ c: number }>();
  const { results } = await db.prepare(query).bind(...binds, limit, offset).all<any>();

  const users = (results || []).map((row: any) => {
    const profile = parseProfile(row.profile_json);
    const measurementsHistory = Array.isArray(profile.measurementsHistory) ? profile.measurementsHistory : [];
    const progressPhotos = Array.isArray(profile.progressPhotos) ? profile.progressPhotos : [];
    const familyMembers = Array.isArray(profile.familyMembers) ? profile.familyMembers : [];
    const hasMeasurements =
      measurementsHistory.length > 0 ||
      asNumber(profile.weight) !== null ||
      asNumber(profile.restingPulse) !== null ||
      asNumber(profile.bloodGlucoseMmolL) !== null ||
      asNumber(profile.bloodPressureSystolic) !== null ||
      asNumber(profile.bloodPressureDiastolic) !== null;
    const hasGlucose = asNumber(profile.bloodGlucoseMmolL) !== null;
    const wearableEnabled = profile.wearableEnabled === true || profile.wearableEnabled === 1 || profile.wearableEnabled === "1";
    return {
      id: String(row.id),
      email: row.email ? String(row.email) : "",
      name: typeof profile.name === "string" ? profile.name : "",
      picture: typeof profile.picture === "string" ? profile.picture : "",
      created_at: row.created_at ? Number(row.created_at) : 0,
      deleted_at: row.deleted_at ? String(row.deleted_at) : null,
      deletion_scheduled_at: row.deletion_scheduled_at ? String(row.deletion_scheduled_at) : null,
      is_active: Number(row.is_active ?? 1),
      subscription_plan: String(row.subscription_plan || profile.plan || "free").toLowerCase(),
      subscription_status: String(row.subscription_status || "inactive"),
      subscription_updated_at: row.subscription_updated_at ? Number(row.subscription_updated_at) : null,
      current_period_end: row.current_period_end ? Number(row.current_period_end) : null,
      stripe_customer_id: row.stripe_customer_id ? String(row.stripe_customer_id) : null,
      stripe_subscription_id: row.stripe_subscription_id ? String(row.stripe_subscription_id) : null,
      profile_version: row.profile_version ? Number(row.profile_version) : null,
      profile_updated_at: row.profile_updated_at ? Number(row.profile_updated_at) : null,
      has_profile: Boolean(row.profile_json),
      has_measurements: hasMeasurements,
      measurements_count: measurementsHistory.length,
      progress_photos_count: progressPhotos.length,
      family_members_count: familyMembers.length,
      blood_glucose_mmol_l: asNumber(profile.bloodGlucoseMmolL),
      blood_glucose_measured_at: profile.bloodGlucoseMeasuredAt ? String(profile.bloodGlucoseMeasuredAt) : null,
      weight: asNumber(profile.weight),
      target_weight: asNumber(profile.targetWeight),
      height: asNumber(profile.height),
      age: asNumber(profile.age),
      goal: typeof profile.goal === "string" ? String(profile.goal) : "",
      medical_restrictions: typeof profile.medicalRestrictions === "string" ? profile.medicalRestrictions : "",
      family_exclusions: typeof profile.familyExclusions === "string" ? profile.familyExclusions : "",
      blood_pressure_systolic: asNumber(profile.bloodPressureSystolic),
      blood_pressure_diastolic: asNumber(profile.bloodPressureDiastolic),
      blood_pressure_measured_at: profile.bloodPressureMeasuredAt ? String(profile.bloodPressureMeasuredAt) : null,
      waist_cm: asNumber(profile.waistCm),
      chest_cm: asNumber(profile.chestCm),
      hips_cm: asNumber(profile.hipsCm),
      body_measurements_measured_at: profile.bodyMeasurementsMeasuredAt ? String(profile.bodyMeasurementsMeasuredAt) : null,
      resting_pulse: asNumber(profile.restingPulse),
      resting_pulse_measured_at: profile.restingPulseMeasuredAt ? String(profile.restingPulseMeasuredAt) : null,
      wearable_enabled: wearableEnabled,
      wearable_provider: typeof profile.wearableProvider === "string" ? String(profile.wearableProvider) : "",
      wearable_connected_at: profile.wearableConnectedAt ? String(profile.wearableConnectedAt) : null,
      wearable_last_sync_at: profile.wearableLastSyncAt ? String(profile.wearableLastSyncAt) : null,
      wearable_metrics_updated_at: profile.wearableMetricsUpdatedAt ? String(profile.wearableMetricsUpdatedAt) : null,
      wearable_steps_today: asNumber(profile.wearableStepsToday),
      wearable_active_minutes_today: asNumber(profile.wearableActiveMinutesToday),
      wearable_sleep_hours_last_night: asNumber(profile.wearableSleepHoursLastNight),
      wearable_has_data: wearableEnabled || Boolean(profile.wearableLastSyncAt) || Boolean(profile.wearableConnectedAt),
      glucose_has_data: hasGlucose,
    };
  });

  return json({
    users,
    total: Number(countRow?.c || 0),
    limit,
    offset,
  });
};
