// Cloudflare Pages Function: /api/admin/stats
// Admin-only product health metrics (D1).
import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireRole } from "../_lib/rbac";

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
