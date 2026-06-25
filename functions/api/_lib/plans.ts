import { nowMs } from "./db";

export type ActivePlan = "free" | "pro" | "family";

export function normalizePlan(value: unknown): ActivePlan {
  const plan = String(value || "").trim().toLowerCase();
  return plan === "pro" || plan === "family" ? plan : "free";
}

export async function loadActivePlan(db: D1Database, userId: string): Promise<ActivePlan> {
  if (!db || !userId) return "free";
  try {
    const now = nowMs();
    const row = await db
      .prepare(
        `SELECT plan
         FROM subscriptions
         WHERE user_id = ?
           AND status IN ('active', 'trialing')
           AND (current_period_end IS NULL OR current_period_end > ?)
         ORDER BY updated_at DESC
         LIMIT 1`
      )
      .bind(userId, now)
      .first<{ plan?: string }>();
    return normalizePlan(row?.plan);
  } catch {
    return "free";
  }
}

export async function loadActivePlanByEmail(db: D1Database, email: string): Promise<ActivePlan> {
  const normalized = String(email || "").trim().toLowerCase();
  if (!db || !normalized) return "free";
  try {
    const now = nowMs();
    const row = await db
      .prepare(
        `SELECT s.plan
         FROM subscriptions s
         JOIN users u ON u.id = s.user_id
         WHERE lower(u.email) = ?
           AND s.status IN ('active', 'trialing')
           AND (s.current_period_end IS NULL OR s.current_period_end > ?)
         ORDER BY s.updated_at DESC
         LIMIT 1`
      )
      .bind(normalized, now)
      .first<{ plan?: string }>();
    return normalizePlan(row?.plan);
  } catch {
    return "free";
  }
}

export async function requireFamilyPlan(db: D1Database, userId: string): Promise<ActivePlan> {
  const plan = await loadActivePlan(db, userId);
  if (plan !== "family") throw new Error("PLAN_REQUIRED_FAMILY");
  return plan;
}

function parseNonNegativeFiniteLimit(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function dailyAiLimitForPlan(
  plan: ActivePlan,
  env: {
    FREE_AI_DAILY_LIMIT?: string;
    PRO_AI_DAILY_LIMIT?: string;
    FAMILY_AI_DAILY_LIMIT?: string;
  },
): number | null {
  if (plan === "free") return parseNonNegativeFiniteLimit(env.FREE_AI_DAILY_LIMIT || "3", 3);

  const raw = plan === "family" ? env.FAMILY_AI_DAILY_LIMIT : env.PRO_AI_DAILY_LIMIT;
  if (!raw || String(raw).trim().toLowerCase() === "infinity") return null;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
