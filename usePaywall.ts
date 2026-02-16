import { useMemo, useState } from "react";
import { TariffPlan } from "./types";
import { getEffectivePlan } from "./money";

export function usePaywall(currentPlan: TariffPlan) {
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);

  // TEST/DEV override: allows switching plan without payment
  const plan = useMemo(() => getEffectivePlan(currentPlan), [currentPlan]);

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
