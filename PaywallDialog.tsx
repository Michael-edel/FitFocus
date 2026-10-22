import React, { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { isTestModeEnabled, setDevPlanOverride } from './money';
import type { TariffPlan, UserProfile } from './types';
import { SessionReadError } from './storage/sessionRead';
import type { OutboxReadGuard } from './storage/durableOutbox';
import { prepareBillingSession, requestBillingJson } from './services/billingSession';

const PlansScreen = React.lazy(() => import('./PlansScreen'));

type PaywallDialogProps = {
  currentPlan?: TariffPlan;
  currentUser: UserProfile | null;
  isAdmin: boolean;
  loginGuard: OutboxReadGuard | null;
  isCurrentSession: () => boolean;
  onPersistUser: (user: UserProfile) => void;
  onClose: () => void;
};

export default function PaywallDialog({
  currentPlan,
  currentUser,
  isAdmin,
  loginGuard,
  isCurrentSession,
  onPersistUser,
  onClose,
}: PaywallDialogProps) {
  const activeControllersRef = useRef(new Set<AbortController>());
  useEffect(() => () => {
    for (const controller of activeControllersRef.current) controller.abort();
    activeControllersRef.current.clear();
  }, [currentUser?.id, loginGuard?.sessionEpoch, loginGuard?.serverSessionId, isCurrentSession]);

  const createBillingRequest = async () => {
    if (!currentUser || !loginGuard || loginGuard.accountId !== currentUser.id || !isCurrentSession()) {
      throw new SessionReadError('session');
    }
    const controller = new AbortController();
    activeControllersRef.current.add(controller);
    try {
      return {
        controller,
        session: await prepareBillingSession(loginGuard, controller, isCurrentSession),
      };
    } catch (error) {
      activeControllersRef.current.delete(controller);
      controller.abort();
      throw error;
    }
  };

  const closePaywall = () => {
    for (const controller of activeControllersRef.current) controller.abort();
    activeControllersRef.current.clear();
    onClose();
  };

  const handleSelect = async (plan: TariffPlan) => {
    if (!currentUser) return;

    if (isAdmin && !isTestModeEnabled()) {
      let controller: AbortController | undefined;
      try {
        const request = await createBillingRequest();
        controller = request.controller;
        const { response, body: payload } = await requestBillingJson(request.session, '/api/admin/subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: currentUser.id, plan }),
        });
        if (!response.ok) {
          if (isCurrentSession()) alert(typeof payload?.error === 'string' ? `Не удалось поменять тариф: ${payload.error}` : 'Не удалось поменять тариф.');
          return;
        }
        if (!isCurrentSession() || controller.signal.aborted) return;
      } catch {
        if (isCurrentSession() && !controller?.signal.aborted) {
          alert('Не удалось поменять тариф. Проверьте сессию и повторите попытку.');
        }
        return;
      } finally {
        if (controller) {
          activeControllersRef.current.delete(controller);
          controller.abort();
        }
      }
    }

    if (!isCurrentSession()) return;
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
    let controller: AbortController | undefined;
    try {
      const request = await createBillingRequest();
      controller = request.controller;
      const { response, body: payload } = await requestBillingJson(request.session, '/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      if (!response.ok) {
        if (isCurrentSession()) alert(typeof payload?.error === 'string' ? `Не удалось открыть оплату: ${payload.error}` : 'Не удалось открыть оплату.');
        return null;
      }
      if (!isCurrentSession() || controller.signal.aborted || typeof payload?.url !== 'string') return null;
      let checkoutUrl: URL;
      try { checkoutUrl = new URL(payload.url); } catch { return null; }
      if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.stripe.com'
        || checkoutUrl.username || checkoutUrl.password) return null;
      return checkoutUrl.toString();
    } catch {
      if (isCurrentSession() && !controller?.signal.aborted) {
        alert('Не удалось открыть оплату. Проверьте сессию и повторите попытку.');
      }
      return null;
    } finally {
      if (controller) {
        activeControllersRef.current.delete(controller);
        controller.abort();
      }
    }
  };

  return (
    <React.Suspense fallback={<div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60"><div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/95 px-5 py-4 text-sm font-semibold text-slate-200"><Loader2 className="h-4 w-4 animate-spin text-indigo-400" />Загрузка тарифа...</div></div>}>
      <PlansScreen
        currentPlan={currentPlan}
        userId={currentUser?.id}
        isAdmin={isAdmin}
        onSelect={handleSelect}
        onCheckoutPlan={handleCheckout}
        onClose={closePaywall}
      />
    </React.Suspense>
  );
}
