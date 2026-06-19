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
    roles: (rolesRow?.results || []).map((row: any) => String(row.role)),
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
