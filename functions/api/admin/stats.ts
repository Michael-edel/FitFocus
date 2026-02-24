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
  const day = todayKey();

  const users = await db.prepare("SELECT COUNT(*) as c FROM users").first<{ c: number }>();
  const activeSessions = await db
    .prepare("SELECT COUNT(*) as c FROM sessions WHERE revoked = 0 AND expires_at > ?")
    .bind(now)
    .first<{ c: number }>();

  const proActive = await db
    .prepare("SELECT COUNT(*) as c FROM subscriptions WHERE plan = 'pro' AND status = 'active'")
    .first<{ c: number }>()
    .catch(() => ({ c: 0 } as any));

  const familyActive = await db
    .prepare("SELECT COUNT(*) as c FROM subscriptions WHERE plan = 'family' AND status = 'active'")
    .first<{ c: number }>()
    .catch(() => ({ c: 0 } as any));

  // usage_daily is optional; if not present, return 0
  let aiCalls = 0;
  let mealsLogged = 0;
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

  // AI events metrics (if table exists)
  let aiCallsEvents = 0;
  let aiErrorsEvents = 0;
  let aiAvgLatency = 0;
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
  } catch {}

  return json({
    stats: {
      totals: {
        users: Number(users?.c || 0),
        active_sessions: Number(activeSessions?.c || 0),
        pro_active: Number(proActive?.c || 0),
        family_active: Number(familyActive?.c || 0),
      },
      today: { day, ai_calls: aiCalls, meals_logged: mealsLogged },
    },
  });
};
