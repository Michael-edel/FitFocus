import React from 'react';
import { Loader2 } from 'lucide-react';
import { isTestModeEnabled, setDevPlanOverride } from './money';
import type { TariffPlan, UserProfile } from './types';
import { isRecord } from './safeJson';

const PlansScreen = React.lazy(() => import('./PlansScreen'));

type PaywallDialogProps = {
  currentPlan?: TariffPlan;
  currentUser: UserProfile | null;
  isAdmin: boolean;
  onPersistUser: (user: UserProfile) => void;
  onClose: () => void;
};

export default function PaywallDialog({
  currentPlan,
  currentUser,
  isAdmin,
  onPersistUser,
  onClose,
}: PaywallDialogProps) {
  const handleSelect = async (plan: TariffPlan) => {
    if (!currentUser) return;

    if (isAdmin && !isTestModeEnabled()) {
      const response = await fetch('/api/admin/subscription', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, plan }),
      });
      const rawPayload: unknown = await response.json().catch(() => null);
      const payload = isRecord(rawPayload) ? rawPayload : {};
      if (!response.ok) {
        alert(typeof payload.error === 'string' ? `Не удалось поменять тариф: ${payload.error}` : 'Не удалось поменять тариф.');
        return;
      }
    }

    onPersistUser({
      ...currentUser,
      plan,
      planTier: plan === 'free' ? 'free' : 'pro',
      proUnlockedAt: plan === 'free' ? undefined : new Date().toISOString(),
    });

    if (isTestModeEnabled()) {
      setDevPlanOverride(plan, currentUser.id);
    }
  };

  const handleCheckout = async (plan: Exclude<TariffPlan, 'free'>) => {
    const response = await fetch('/api/billing/checkout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    const rawPayload: unknown = await response.json().catch(() => null);
    const payload = isRecord(rawPayload) ? rawPayload : {};
    if (!response.ok) {
      alert(typeof payload.error === 'string' ? `Не удалось открыть оплату: ${payload.error}` : 'Не удалось открыть оплату.');
      return null;
    }
    return typeof payload.url === 'string' ? payload.url : null;
  };

  return (
    <React.Suspense fallback={<div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60"><div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/95 px-5 py-4 text-sm font-semibold text-slate-200"><Loader2 className="h-4 w-4 animate-spin text-indigo-400" />Загрузка тарифа...</div></div>}>
      <PlansScreen
        currentPlan={currentPlan}
        userId={currentUser?.id}
        isAdmin={isAdmin}
        onSelect={handleSelect}
        onCheckoutPlan={handleCheckout}
        onClose={onClose}
      />
    </React.Suspense>
  );
}
