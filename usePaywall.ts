import { useMemo, useState } from "react";
import { TariffPlan } from "./types";
import { isTestModeEnabled } from "./money";
import { getEffectivePlan } from "./money";

export function usePaywall(currentPlan: TariffPlan, betaFullAccess = false) {
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);

  // In beta/full-access mode, always expose Family entitlement.
  // Otherwise respect dev overrides and the persisted plan.
  const plan = useMemo(() => {
    if (betaFullAccess || isTestModeEnabled()) return "family";
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
