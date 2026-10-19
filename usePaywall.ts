import { useCallback, useMemo } from "react";
import { TariffPlan } from "./types";
import { getEffectivePlan } from "./money";
import { useAccountScopedUiState } from "./features/state/accountScopedUi";

export function usePaywall(currentPlan: TariffPlan, betaFullAccess = false, accountSessionScope: string | null = null) {
  const { value: isPaywallOpen, setValue: setIsPaywallOpen } = useAccountScopedUiState(accountSessionScope, false);

  // Entitlement comes from the persisted plan or an explicit dev override.
  // We do not auto-upgrade to Family just because the app is running in test mode.
  const plan = useMemo(() => {
    if (betaFullAccess) return "family";
    return getEffectivePlan(currentPlan);
  }, [betaFullAccess, currentPlan]);

  const canUsePro = useMemo(() => plan === "pro" || plan === "family", [plan]);
  const canUseFamily = useMemo(() => plan === "family", [plan]);
  const openPaywall = useCallback(() => setIsPaywallOpen(true), [setIsPaywallOpen]);
  const closePaywall = useCallback(() => setIsPaywallOpen(false), [setIsPaywallOpen]);

  return {
    plan,
    canUsePro,
    canUseFamily,
    isPaywallOpen,
    openPaywall,
    closePaywall,
  };
}
