export type AiBudgetUsage = {
  callsToday: number;
  costUserToday: number;
  costTotalToday: number;
};

export type AiBudgetGuardResult = AiBudgetUsage & {
  exceedCalls: boolean;
  exceedUserCost: boolean;
  exceedTotalCost: boolean;
  exceeded: boolean;
};

function nonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/** Reads the counters used by the administrator-managed AI budget guard. */
export async function readAiBudgetUsage(db: D1Database, userId: string, dayStart: number): Promise<AiBudgetUsage> {
  const [callsRow, costUserRow, costTotalRow] = await Promise.all([
    db.prepare('SELECT COUNT(*) as cnt FROM ai_events WHERE user_id = ? AND ts >= ?').bind(userId, dayStart).first<{ cnt?: number }>(),
    db.prepare('SELECT SUM(COALESCE(estimated_cost_usd,0)) as cost FROM ai_events WHERE user_id = ? AND ts >= ?').bind(userId, dayStart).first<{ cost?: number }>(),
    db.prepare('SELECT SUM(COALESCE(estimated_cost_usd,0)) as cost FROM ai_events WHERE ts >= ?').bind(dayStart).first<{ cost?: number }>(),
  ]);
  return {
    callsToday: nonNegativeNumber(callsRow?.cnt),
    costUserToday: nonNegativeNumber(costUserRow?.cost),
    costTotalToday: nonNegativeNumber(costTotalRow?.cost),
  };
}

export function evaluateAiBudgetGuard(usage: AiBudgetUsage, limits: {
  maxCallsPerUserDay: number;
  maxCostPerUserDay: number;
  maxCostTotalDay: number;
}): AiBudgetGuardResult {
  const exceedCalls = limits.maxCallsPerUserDay > 0 && usage.callsToday >= limits.maxCallsPerUserDay;
  const exceedUserCost = limits.maxCostPerUserDay > 0 && usage.costUserToday >= limits.maxCostPerUserDay;
  const exceedTotalCost = limits.maxCostTotalDay > 0 && usage.costTotalToday >= limits.maxCostTotalDay;
  return { ...usage, exceedCalls, exceedUserCost, exceedTotalCost, exceeded: exceedCalls || exceedUserCost || exceedTotalCost };
}

/** Evaluates user-call and cost budgets before a paid provider request. */
export async function checkAiBudgetGuard(input: {
  db: D1Database;
  userId: string;
  dayStart: number;
  maxCallsPerUserDay: number;
  maxCostPerUserDay: number;
  maxCostTotalDay: number;
}): Promise<AiBudgetGuardResult> {
  const usage = await readAiBudgetUsage(input.db, input.userId, input.dayStart);
  return evaluateAiBudgetGuard(usage, input);
}
