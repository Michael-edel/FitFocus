import { TariffPlan } from "./types";

export function formatKzt(value: number) {
  try {
    return new Intl.NumberFormat('ru-KZ', {
      style: 'currency',
      currency: 'KZT',
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    // fallback
    return `${Math.round(value).toLocaleString('ru-RU')} ₸`;
  }
}

// =========================
// TEST / DEV PLAN OVERRIDES
// =========================
const DEV_PLAN_SCOPE_PREFIX = "ff_dev_plan_override_scope_";

export function isTestModeEnabled() {
  // Enabled in local dev automatically OR explicitly via env
  return import.meta.env.DEV || import.meta.env.VITE_TEST_MODE === "1";
}

function keyForScope(userId?: string | null) {
  return userId ? `${DEV_PLAN_SCOPE_PREFIX}${userId}` : null;
}

export function setDevPlanOverride(plan: TariffPlan | "", userId?: string | null) {
  if (!isTestModeEnabled()) return;
  const key = keyForScope(userId);
  if (!key) return;
  if (!plan) localStorage.removeItem(key);
  else localStorage.setItem(key, plan);
}

export function getDevPlanOverride(userId?: string | null): TariffPlan | null {
  if (!isTestModeEnabled()) return null;
  const key = keyForScope(userId);
  if (!key) return null;
  const v = localStorage.getItem(key);
  if (v === "free" || v === "pro" || v === "family") return v as TariffPlan;
  return null;
}

export function getEffectivePlan(realPlan: TariffPlan, userId?: string | null): TariffPlan {
  const override = getDevPlanOverride(userId);
  if (import.meta.env.VITE_FORCE_MAX_PLAN === "1") return "family";
  return override ?? realPlan;
}

export function planLabel(plan: TariffPlan) {
  if (plan === "free") return "Free";
  if (plan === "pro") return "Pro";
  return "Family";
}
