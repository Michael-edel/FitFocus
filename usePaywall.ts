import { useMemo, useState } from "react";
import { TariffPlan } from "./types";
import { getEffectivePlan } from "./money";

export function usePaywall(currentPlan: TariffPlan, betaFullAccess = false) {
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);

  // Entitlement comes from the persisted plan or an explicit dev override.
  // We do not auto-upgrade to Family just because the app is running in test mode.
  const plan = useMemo(() => {
    if (betaFullAccess) return "family";
    return getEffectivePlan(currentPlan);
  }, [betaFullAccess, currentPlan]);

  const canUsePro = useMemo(() => plan === "pro" || plan === "family", [plan]);
  const canUseFamily = useMemo(() => plan === "family", [plan]);

  return {
    plan,
    canUsePro,
    canUseFamily,
    isPaywallOpen,
    openPaywall: () => setIsPaywallOpen(true),
    closePaywall: () => setIsPaywallOpen(false),
  };
}
