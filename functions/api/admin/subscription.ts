// Cloudflare Pages Function: /api/admin/subscription
// Admin-only manual subscription switch for SaaS operations and testing.

import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireRole } from "../_lib/rbac";
import { requireAdminRequest } from "../_lib/admin_guard";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

function normalizePlan(value: unknown): "free" | "pro" | "family" | null {
  const plan = String(value || "").trim().toLowerCase();
  if (plan === "free" || plan === "pro" || plan === "family") return plan;
  return null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: "UNAUTH" }, 401); }
  try { requireRole(user, "admin"); } catch { return json({ error: "FORBIDDEN" }, 403); }

  const db = requireDB(env);
  await requireAdminRequest(user, request, db);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const userId = String(body?.user_id || "").trim();
  const plan = normalizePlan(body?.plan);
  if (!userId || !plan) {
    return json({ error: "BAD_REQUEST", message: "user_id and plan are required" }, 400);
  }

  const target = await db.prepare("SELECT id FROM users WHERE id = ? LIMIT 1").bind(userId).first<any>();
  if (!target?.id) return json({ error: "NOT_FOUND", message: "user not found" }, 404);

  const now = Date.now();
  if (plan === "free") {
    await db.prepare(
      "UPDATE subscriptions SET plan = 'free', status = 'canceled', stripe_customer_id = NULL, stripe_subscription_id = NULL, current_period_end = NULL, updated_at = ? WHERE user_id = ?"
    ).bind(now, userId).run();
  } else {
    await db.prepare(
      `INSERT INTO subscriptions (user_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, updated_at)
       VALUES (?1, ?2, 'active', NULL, NULL, NULL, ?3)
       ON CONFLICT(user_id) DO UPDATE SET
         plan = excluded.plan,
         status = excluded.status,
         stripe_customer_id = NULL,
         stripe_subscription_id = NULL,
         current_period_end = NULL,
         updated_at = excluded.updated_at`
    ).bind(userId, plan, now).run();
  }

  return json({
    ok: true,
    user_id: userId,
    plan,
  });
};
