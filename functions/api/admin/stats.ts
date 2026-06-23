// Cloudflare Pages Function: /api/admin/stats
// Admin-only product health metrics (D1).
import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireRole } from "../_lib/rbac";
import { requireAdminRequest } from "../_lib/admin_guard";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

function todayKey() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: "UNAUTH" }, 401); }
  try { requireRole(user, "admin"); } catch { return json({ error: "FORBIDDEN" }, 403); }
  const db = requireDB(env);
  await requireAdminRequest(user, request, db);


  const now = Math.floor(Date.now() / 1000);
  const nowMs = Date.now();
  const day = todayKey();

  const users = await db.prepare("SELECT COUNT(*) as c FROM users").first<{ c: number }>();
  const activeSessions = await db
    .prepare("SELECT COUNT(*) as c FROM sessions WHERE revoked = 0 AND expires_at > ?")
    .bind(now)
    .first<{ c: number }>();

  const proActive = await db
    .prepare("SELECT COUNT(*) as c FROM subscriptions WHERE plan = 'pro' AND status IN ('active', 'trialing') AND (current_period_end IS NULL OR current_period_end > ?)")
    .bind(nowMs)
    .first<{ c: number }>()
    .catch(() => ({ c: 0 } as any));

  const familyActive = await db
    .prepare("SELECT COUNT(*) as c FROM subscriptions WHERE plan = 'family' AND status IN ('active', 'trialing') AND (current_period_end IS NULL OR current_period_end > ?)")
    .bind(nowMs)
    .first<{ c: number }>()
    .catch(() => ({ c: 0 } as any));

  const deletedUsers = await db
    .prepare("SELECT COUNT(*) as c FROM users WHERE deleted_at IS NOT NULL")
    .first<{ c: number }>()
    .catch(() => ({ c: 0 } as any));

  const inactiveUsers = await db
    .prepare("SELECT COUNT(*) as c FROM users WHERE deleted_at IS NULL AND is_active = 0")
    .first<{ c: number }>()
    .catch(() => ({ c: 0 } as any));

  const familyMembersActive = await db
    .prepare("SELECT COUNT(*) as c FROM family_members WHERE status = 'active'")
    .first<{ c: number }>()
    .catch(() => ({ c: 0 } as any));

  // usage_daily is optional; if not present, return 0
  let aiCalls = 0;
  let mealsLogged = 0;
  let aiCallsEvents = 0;
  let aiErrorsEvents = 0;
  let aiAvgLatency = 0;
  try {
    const ai = await db
      .prepare("SELECT SUM(count) as c FROM usage_daily WHERE day = ? AND feature LIKE 'ai_%'")
      .bind(day)
      .first<{ c: number }>();
    aiCalls = Number(ai?.c || 0);

    const meals = await db
      .prepare("SELECT SUM(count) as c FROM usage_daily WHERE day = ? AND feature IN ('meal_add','meal_log','meals')")
      .bind(day)
      .first<{ c: number }>();
    mealsLogged = Number(meals?.c || 0);
  } catch {}

  // ai_events is optional; expose richer AI telemetry when the table exists.
  try {
    const start = new Date();
    start.setUTCHours(0,0,0,0);
    const startMs = start.getTime();
    const endMs = startMs + 24 * 60 * 60 * 1000;

    const agg = await db.prepare(
      "SELECT COUNT(*) as calls, SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) as errors, AVG(latency_ms) as avg_latency FROM ai_events WHERE ts >= ? AND ts < ?"
    ).bind(startMs, endMs).first<{ calls: number; errors: number; avg_latency: number }>();

    aiCallsEvents = Number(agg?.calls || 0);
    aiErrorsEvents = Number(agg?.errors || 0);
    aiAvgLatency = Math.round(Number(agg?.avg_latency || 0));
  } catch {}

  let profilesWithMeasurements = 0;
  let profilesWithGlucose = 0;
  let profilesWithWearable = 0;
  let profilesWithProgressPhotos = 0;
  let profilesWithFamilyMembers = 0;
  try {
    const profileAgg = await db.prepare(
      `SELECT
         COUNT(*) as total_profiles,
         SUM(CASE
               WHEN COALESCE(CASE WHEN json_valid(profile_json) THEN json_array_length(json_extract(profile_json, '$.measurementsHistory')) END, 0) > 0
                 OR CASE WHEN json_valid(profile_json) THEN json_extract(profile_json, '$.weight') END IS NOT NULL
                 OR CASE WHEN json_valid(profile_json) THEN json_extract(profile_json, '$.restingPulse') END IS NOT NULL
                 OR CASE WHEN json_valid(profile_json) THEN json_extract(profile_json, '$.bloodGlucoseMmolL') END IS NOT NULL
                 OR CASE WHEN json_valid(profile_json) THEN json_extract(profile_json, '$.bloodPressureSystolic') END IS NOT NULL
                 OR CASE WHEN json_valid(profile_json) THEN json_extract(profile_json, '$.bloodPressureDiastolic') END IS NOT NULL
               THEN 1 ELSE 0 END) as with_measurements,
         SUM(CASE WHEN CASE WHEN json_valid(profile_json) THEN json_extract(profile_json, '$.bloodGlucoseMmolL') END IS NOT NULL THEN 1 ELSE 0 END) as with_glucose,
         SUM(CASE WHEN COALESCE(CAST(CASE WHEN json_valid(profile_json) THEN json_extract(profile_json, '$.wearableEnabled') END AS INTEGER), 0) = 1 THEN 1 ELSE 0 END) as with_wearable,
         SUM(CASE WHEN COALESCE(CASE WHEN json_valid(profile_json) THEN json_array_length(json_extract(profile_json, '$.progressPhotos')) END, 0) > 0 THEN 1 ELSE 0 END) as with_progress_photos,
         SUM(CASE WHEN COALESCE(CASE WHEN json_valid(profile_json) THEN json_array_length(json_extract(profile_json, '$.familyMembers')) END, 0) > 0 THEN 1 ELSE 0 END) as with_family_members
       FROM user_profiles`
    ).first<any>();

    profilesWithMeasurements = Number(profileAgg?.with_measurements || 0);
    profilesWithGlucose = Number(profileAgg?.with_glucose || 0);
    profilesWithWearable = Number(profileAgg?.with_wearable || 0);
    profilesWithProgressPhotos = Number(profileAgg?.with_progress_photos || 0);
    profilesWithFamilyMembers = Number(profileAgg?.with_family_members || 0);
  } catch {}

  return json({
    stats: {
      totals: {
        users: Number(users?.c || 0),
        active_sessions: Number(activeSessions?.c || 0),
        pro_active: Number(proActive?.c || 0),
        family_active: Number(familyActive?.c || 0),
        deleted_users: Number(deletedUsers?.c || 0),
        inactive_users: Number(inactiveUsers?.c || 0),
        family_members_active: Number(familyMembersActive?.c || 0),
        profiles_with_measurements: profilesWithMeasurements,
        profiles_with_glucose: profilesWithGlucose,
        profiles_with_wearable: profilesWithWearable,
        profiles_with_progress_photos: profilesWithProgressPhotos,
        profiles_with_family_members: profilesWithFamilyMembers,
      },
      today: {
        day,
        ai_calls: aiCalls,
        meals_logged: mealsLogged,
        ai_event_calls: aiCallsEvents,
        ai_event_errors: aiErrorsEvents,
        ai_event_avg_latency_ms: aiAvgLatency,
      },
    },
  });
};
