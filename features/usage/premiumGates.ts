import { type TariffPlan, type UsageStats } from '../../types';

export const PREMIUM_GATES = {
  aiFoodPhotoPerDay: { free: 3, pro: Infinity, family: Infinity },
  aiCoachAdvicePerDay: { free: 3, pro: Infinity, family: Infinity },
  familyMenuGenerationsPerWeek: { free: 1, pro: 10, family: 100 },
  weeklyReview: { free: false, pro: true, family: true },
  metabolicAdaptation: { free: false, pro: true, family: true },
} as const;

export type PremiumGate = keyof typeof PREMIUM_GATES;
export type UsageCounter = 'aiFoodPhotoCount' | 'aiCoachCount' | 'familyMenuCount';

function normalizedUsageCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

/** Resolves client-side product gates from the effective plan and persisted usage counters. */
export function canUsePremiumGate(
  gate: PremiumGate,
  plan: TariffPlan,
  usage: UsageStats | undefined,
): boolean {
  if (gate === 'aiFoodPhotoPerDay') {
    return normalizedUsageCount(usage?.aiFoodPhotoCount) < PREMIUM_GATES.aiFoodPhotoPerDay[plan];
  }
  if (gate === 'aiCoachAdvicePerDay') {
    return normalizedUsageCount(usage?.aiCoachCount) < PREMIUM_GATES.aiCoachAdvicePerDay[plan];
  }
  return Boolean(PREMIUM_GATES[gate][plan]);
}

/** Produces a new usage snapshot and never mutates profile state in place. */
export function incrementUsageCounter(usage: UsageStats | undefined, key: UsageCounter): UsageStats {
  return {
    ...usage,
    [key]: normalizedUsageCount(usage?.[key]) + 1,
  };
}
