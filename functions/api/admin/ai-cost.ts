// /api/admin/ai-cost
// Admin-only AI cost analytics (D1).
import { json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireAdminRequest } from "../_lib/admin_guard";

type Env = { DB?: D1Database; AUTH_JWT_SECRET?: string };

function startOfUtcDayMs(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return x.getTime();
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  // Validate session + ensure RBAC admin (reads from user_roles)
  await requireAdminRequest(request, env);

  const db = requireDB(env);
  const now = Date.now();
  const dayStart = startOfUtcDayMs(new Date(now));
  const sevenDaysAgo = dayStart - 7 * 86400000;

  const todayAgg = await db
    .prepare(
      `SELECT 
         COUNT(*) as calls,
         SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) as errors,
         SUM(COALESCE(total_tokens,0)) as tokens,
         SUM(COALESCE(estimated_cost_usd,0)) as cost_usd,
         SUM(CASE WHEN is_fallback = 1 THEN 1 ELSE 0 END) as fallback_calls,
         CAST(ROUND(AVG(COALESCE(latency_ms,0))) AS INT) as avg_latency_ms
       FROM ai_events
       WHERE ts >= ?`
    )
    .bind(dayStart)
    .first<any>();

  const weekAgg = await db
    .prepare(
      `SELECT 
         COUNT(*) as calls,
         SUM(COALESCE(total_tokens,0)) as tokens,
         SUM(COALESCE(estimated_cost_usd,0)) as cost_usd,
         SUM(CASE WHEN is_fallback = 1 THEN 1 ELSE 0 END) as fallback_calls
       FROM ai_events
       WHERE ts >= ?`
    )
    .bind(sevenDaysAgo)
    .first<any>();

  const topUsers7d = await db
    .prepare(
      `SELECT user_id,
              (SELECT email FROM users u WHERE u.id = ai_events.user_id LIMIT 1) as email,
              (SELECT created_at FROM users u WHERE u.id = ai_events.user_id LIMIT 1) as user_created_at,
              COALESCE((SELECT plan FROM subscriptions s WHERE s.user_id = ai_events.user_id AND s.status IN ('active', 'trialing') ORDER BY s.updated_at DESC LIMIT 1), 'free') as plan,
              COALESCE((SELECT status FROM subscriptions s WHERE s.user_id = ai_events.user_id AND s.status IN ('active', 'trialing') ORDER BY s.updated_at DESC LIMIT 1), 'inactive') as subscription_status,
              SUM(COALESCE(estimated_cost_usd,0)) as cost_usd,
              SUM(COALESCE(total_tokens,0)) as tokens,
              COUNT(*) as calls
       FROM ai_events
       WHERE ts >= ?
       GROUP BY user_id
       ORDER BY cost_usd DESC
       LIMIT 10`
    )
    .bind(sevenDaysAgo)
    .all<any>();

  const todayCalls = Number(todayAgg?.calls || 0);
  const todayFallback = Number(todayAgg?.fallback_calls || 0);
  const weekCalls = Number(weekAgg?.calls || 0);
  const weekFallback = Number(weekAgg?.fallback_calls || 0);

  return json({
    today: {
      day_start_ms: dayStart,
      calls: todayCalls,
      errors: Number(todayAgg?.errors || 0),
      tokens: Number(todayAgg?.tokens || 0),
      cost_usd: Number(todayAgg?.cost_usd || 0),
      fallback_calls: todayFallback,
      fallback_pct: todayCalls > 0 ? Math.round((todayFallback / todayCalls) * 100) : 0,
      avg_latency_ms: Number(todayAgg?.avg_latency_ms || 0),
    },
    last_7d: {
      from_ms: sevenDaysAgo,
      calls: weekCalls,
      tokens: Number(weekAgg?.tokens || 0),
      cost_usd: Number(weekAgg?.cost_usd || 0),
      fallback_calls: weekFallback,
      fallback_pct: weekCalls > 0 ? Math.round((weekFallback / weekCalls) * 100) : 0,
    },
    top_users_7d: (topUsers7d?.results || []).map((r: any) => ({
      user_id: String(r.user_id),
      email: r.email ? String(r.email) : undefined,
      user_created_at: r.user_created_at ? Number(r.user_created_at) : undefined,
      plan: String(r.plan || 'free'),
      subscription_status: String(r.subscription_status || 'inactive'),
      cost_usd: Number(r.cost_usd || 0),
      tokens: Number(r.tokens || 0),
      calls: Number(r.calls || 0),
    })),
    schema_version: 1,
  });
};
