import React, { useState } from 'react';
import { Check, X, Crown, Users, Zap } from 'lucide-react';
import { formatKzt, planLabel, setDevPlanOverride, getDevPlanOverride } from './money';
import { TariffPlan } from './types';
import { useModalDismissGestures } from './useModalDismissGestures';

export default function PlansScreen({ 
  currentPlan, 
  userId,
  isAdmin = false,
  onSelect, 
  onCheckoutPlan,
  onClose 
}: {
  currentPlan?: TariffPlan;
  userId?: string | null;
  isAdmin?: boolean;
  onSelect: (p: TariffPlan) => void | Promise<void>;
  onCheckoutPlan: (p: Exclude<TariffPlan, 'free'>) => Promise<string | null>;
  onClose: () => void;
}) {
  const PRICES = {
    proMonthly: 2990,
    familyMonthly: 4990,
  };

  const [checkoutPlan, setCheckoutPlan] = useState<null | 'pro' | 'family'>(null);
  const devEnabled = import.meta.env.DEV || import.meta.env.VITE_TEST_MODE === "1";
  const currentOverride = devEnabled ? getDevPlanOverride(userId) : null;
  const dismissGestures = useModalDismissGestures(() => {
    if (checkoutPlan) {
      setCheckoutPlan(null);
      return;
    }
    onClose();
  });
  const checkoutDismissGestures = useModalDismissGestures(() => setCheckoutPlan(null));

  const openPay = (url: string) => {
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      location.href = url;
    }
  };

  const plans = [
    {
      id: 'free' as const,
      name: 'Free',
      icon: Zap,
      color: 'text-slate-400',
      price: formatKzt(0),
      features: ['Дневник питания', 'Анализ фото (3/день)', 'Курс обучения'],
      unavailable: ['Рецепты по фото', 'AI-коучинг', 'Семейное меню'],
    },
    {
      id: 'pro' as const,
      name: 'Pro',
      icon: Crown,
      color: 'text-amber-500',
      price: formatKzt(PRICES.proMonthly),
      features: ['Все из Free', 'Безлимитный AI анализ', 'Рецепты по фото', 'AI-коучинг'],
      popular: true,
    },
    {
      id: 'family' as const,
      name: 'Family',
      icon: Users,
      color: 'text-indigo-500',
      price: formatKzt(PRICES.familyMonthly),
      features: ['Все из Pro', 'До 5 профилей', 'Семейное меню на неделю', 'Общий список покупок'],
    }
  ];

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl z-[400] overflow-hidden flex items-end justify-center p-3 md:items-start md:overflow-y-auto md:p-4 md:py-24 ff-plans">
      <div className="w-full max-w-5xl max-h-[calc(100dvh-1.5rem)] md:max-h-none overflow-y-auto overscroll-contain touch-pan-y" {...dismissGestures}>
        <div className="ff-plans__topbar mb-12">
          <div className="space-y-1 text-left">
            <h2 className="text-4xl font-black text-white ff-plans__title">Тарифы</h2>
            <p className="text-slate-400 font-medium text-lg">Разблокируйте все возможности FitFocus</p>
          </div>
          {!checkoutPlan && (
          <button 
            onClick={onClose}
            className="ff-plans__x w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center text-slate-500 hover:text-white border border-slate-800 transition-all"
            aria-label="Закрыть"
          >
            <X size={24} />
          </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((p) => (
            <div 
              key={p.id}
              className={`relative bg-slate-900 rounded-[3rem] p-8 border transition-all flex flex-col ff-plans__card ${
                p.id === 'pro' ? 'ff-plans__card--pro' : ''
              } ${
                p.popular ? 'border-indigo-500 shadow-[0_0_40px_rgba(79,70,229,0.1)] md:scale-105 z-10' : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              {p.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
                  Популярно
                </div>
              )}
              
              <div className="flex items-center gap-4 mb-8">
                <div className={`w-14 h-14 rounded-2xl bg-slate-950 flex items-center justify-center border border-slate-800 shadow-inner ${p.color}`}>
                  <p.icon size={28} />
                </div>
                <div className="text-left flex-1">
                  <div className="ff-plans__head">
                    <h3 className="text-2xl font-black text-white">{p.name}</h3>
                    <div className="ff-plans__price text-white">
                      {p.price} <span className="ff-plans__per">/мес</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-4 mb-10 text-left">
                {p.features.map((f, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Check size={18} className="text-emerald-500 mt-0.5 shrink-0" />
                    <span className="text-slate-300 font-medium">{f}</span>
                  </div>
                ))}
                {p.unavailable?.map((f, i) => (
                  <div key={i} className="flex items-start gap-3 opacity-30">
                    <X size={18} className="text-slate-500 mt-0.5 shrink-0" />
                    <span className="text-slate-500 font-medium">{f}</span>
                  </div>
                ))}
              </div>

              <button 
                onClick={async () => {
                  if (p.id === 'free') {
                    await onSelect('free');
                    onClose();
                  } else if (isAdmin) {
                    await onSelect(p.id);
                    onClose();
                  } else {
                    setCheckoutPlan(p.id);
                  }
                }}
                disabled={currentPlan === p.id}
                className={`w-full py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest transition-all ${
                  currentPlan === p.id 
                    ? 'bg-slate-950 text-slate-600 border border-slate-800 cursor-default' 
                    : p.id === 'pro' || p.id === 'family'
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 hover:bg-indigo-700 active:scale-95'
                      : 'bg-white text-slate-950 hover:bg-slate-200 active:scale-95'
                }`}
              >
                {currentPlan === p.id ? 'Текущий план' : p.id === 'free' ? 'Вернуться на Free' : `Оформить ${p.name}`}
              </button>
            </div>
          ))}
        </div>

        {/* =======================
            TEST MODE (NO PAYMENT)
            ======================= */}
        {devEnabled && (
          <div className="mt-10 rounded-[2.5rem] border border-slate-800/70 bg-slate-900/40 p-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="text-left">
                <div className="text-slate-100 font-black text-xl mb-1">Тестовый режим</div>
                <div className="text-slate-400 text-sm font-medium">
                  Переключение тарифа без оплаты (только для тестирования).<br/>
                  Текущий override: <span className="text-indigo-400 font-bold uppercase">{currentOverride ?? "нет"}</span>
                </div>
              </div>
              <button
                onClick={() => {
                  setDevPlanOverride("", userId);
                  window.location.reload();
                }}
                className="px-6 py-3 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold transition-all"
              >
                Сбросить override
              </button>
            </div>

            <div className="mt-6 flex flex-wrap gap-4">
              {(["free", "pro", "family"] as TariffPlan[]).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setDevPlanOverride(p, userId);
                    window.location.reload();
                  }}
                  className={`px-6 py-3 rounded-full border-2 transition-all font-bold ${
                    currentOverride === p
                      ? "border-indigo-500 bg-indigo-500/10 text-indigo-300"
                      : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  Включить {planLabel(p)}
                </button>
              ))}
            </div>

            <div className="mt-4 text-xs text-slate-600 font-medium text-left">
              Подсказка: можно принудительно включить максимум, добавив <span className="text-slate-500 font-bold">VITE_FORCE_MAX_PLAN=1</span> в <span className="text-slate-500 font-bold">.env.local</span>.
            </div>
          </div>
        )}
      </div>

      {/* Checkout sheet */}
      {checkoutPlan ? (
        <div className="fixed inset-0 z-[450] flex items-end justify-center p-3 md:items-center md:p-4" role="dialog" aria-modal="true">
          <button
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setCheckoutPlan(null)}
            aria-label="Закрыть оплату"
          />
          <div className="relative ff-plans__sheet z-[460] touch-pan-y max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain" {...checkoutDismissGestures}>
            <div className="ff-plans__sheetHead">
              <div className="ff-plans__sheetTitle">Оплата</div>
              <button className="ff-plans__sheetX" onClick={() => setCheckoutPlan(null)} aria-label="Закрыть">
                <X size={20} />
              </button>
            </div>

            <div className="ff-plans__sheetSubtitle">
              {checkoutPlan === 'pro' ? `PRO — ${formatKzt(PRICES.proMonthly)}/мес` : `FAMILY — ${formatKzt(PRICES.familyMonthly)}/мес`}
            </div>
            <div className="ff-plans__sheetHint">
              Оплата открывается через Stripe Checkout. После оплаты вернитесь в приложение, план обновится с сервера.
            </div>

            <button
              className="ff-plans__activate mt-4"
              onClick={async () => {
                const url = await onCheckoutPlan(checkoutPlan);
                if (url) openPay(url);
                setCheckoutPlan(null);
              }}
            >
              Открыть Stripe Checkout
            </button>

            <button className="ff-plans__back mt-2" onClick={() => setCheckoutPlan(null)}>
              Назад
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
