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
const DEV_PLAN_KEY = "ff_dev_plan_override"; // "free" | "pro" | "family" | ""

function isTestModeEnabled() {
  // Enabled in local dev automatically OR explicitly via env
  return Boolean((import.meta as any).env?.DEV) || (import.meta as any).env?.VITE_TEST_MODE === "1";
}

export function setDevPlanOverride(plan: TariffPlan | "") {
  if (!isTestModeEnabled()) return;
  if (!plan) localStorage.removeItem(DEV_PLAN_KEY);
  else localStorage.setItem(DEV_PLAN_KEY, plan);
}

export function getDevPlanOverride(): TariffPlan | null {
  if (!isTestModeEnabled()) return null;
  const v = localStorage.getItem(DEV_PLAN_KEY);
  if (v === "free" || v === "pro" || v === "family") return v as TariffPlan;
  return null;
}

export function getEffectivePlan(realPlan: TariffPlan): TariffPlan {
  // Force maximum plan for testing (Family = max)
  if (isTestModeEnabled() && (import.meta as any).env?.VITE_FORCE_MAX_PLAN === "1") return "family";
  const override = getDevPlanOverride();
  return override ?? realPlan;
}

export function planLabel(plan: TariffPlan) {
  if (plan === "free") return "Free";
  if (plan === "pro") return "Pro";
  return "Family";
}
