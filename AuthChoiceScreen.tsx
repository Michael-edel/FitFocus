import React from 'react';
import { Apple, ArrowRight, Cloud, Footprints, ShieldCheck, Sparkles, TrendingUp, Utensils, Watch } from 'lucide-react';
import OAuthSignInButton from './OAuthSignInButton';

type IntroCard = {
  title: string;
  text: string;
  badge: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

const introCards: IntroCard[] = [
  {
    title: 'Один профиль',
    text: 'Питание, прогресс, привычки, рецепты и тело собраны в одном cloud-профиле.',
    badge: 'Старт',
    icon: Cloud,
  },
  {
    title: 'Прогресс без хаоса',
    text: 'Вес, замеры, сахар, шаги, сон, фото и активность видны в одной динамике.',
    badge: 'Прогресс',
    icon: TrendingUp,
  },
  {
    title: 'Питание под цель',
    text: 'FitFocus считает КБЖУ, собирает персональный план и держит курс на ваш результат.',
    badge: 'Питание',
    icon: Footprints,
  },
  {
    title: 'Рецепты и меню',
    text: 'Фото блюда можно сохранить, открыть и отредактировать даже без фото, кода или граммовки.',
    badge: 'Рецепты',
    icon: Utensils,
  },
  {
    title: 'Google-вход',
    text: 'Один Google account = один cloud profile. Данные не смешиваются между устройствами.',
    badge: 'Синк',
    icon: Watch,
  },
];

type AuthChoiceScreenProps = {
  inviteCode: string;
  setInviteCode: (value: string) => void;
  inviteError: string | null;
  setInviteError: (value: string | null) => void;
  requireInvite: boolean;
  inviteChecking: boolean;
  bootstrapAuth: () => void;
  onOpenVersionInfo: () => void;
};

export default function AuthChoiceScreen({
  inviteCode,
  setInviteCode,
  inviteError,
  setInviteError,
  requireInvite,
  inviteChecking,
  bootstrapAuth,
  onOpenVersionInfo,
}: AuthChoiceScreenProps) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-left">
      <div className="max-w-5xl w-full space-y-8 text-center relative">
        <button
          type="button"
          onClick={onOpenVersionInfo}
          className="absolute right-0 top-0 inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/80 px-3 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400 transition-colors hover:bg-slate-800/90 hover:text-slate-200"
        >
          <Sparkles size={12} className="text-indigo-400" />
          Что нового
        </button>
        <div className="flex justify-center">
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-[2rem] flex items-center justify-center text-white font-bold text-3xl shadow-xl shadow-indigo-950/50">
            FF
          </div>
        </div>
        <h1 className="text-3xl font-black text-slate-100 tracking-tight">FitFocus</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 text-left">
          {introCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.title} className="rounded-[1.75rem] border border-slate-800 bg-slate-900/70 p-4 shadow-xl">
                <div className="flex items-center justify-between gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-300 shrink-0">
                    <Icon size={18} />
                  </div>
                  <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/60 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-slate-300">
                    {card.badge}
                  </span>
                </div>
                <h2 className="mt-4 text-lg font-black text-slate-100">{card.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">{card.text}</p>
              </div>
            );
          })}
        </div>
        <div className="grid gap-4">
          <div className="rounded-[2rem] border border-slate-800 bg-slate-900/80 p-5 text-left shadow-xl">
            <div className="flex items-center gap-3 text-slate-100 font-bold">
              <ShieldCheck size={20} className="text-emerald-400" />
              Только cloud-профиль
            </div>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Локальная регистрация отключена. Новый аккаунт создаётся только через Google, чтобы данные
              синхронизировались между устройствами и не обходили подписку.
            </p>
          </div>

          <div className="space-y-2 text-left">
            <label
              htmlFor="invite-code"
              className="text-[10px] font-black uppercase tracking-widest text-slate-500"
            >
              Код приглашения (beta)
            </label>
            <input
              id="invite-code"
              name="inviteCode"
              value={inviteCode}
              onChange={(e) => {
                const v = e.target.value;
                setInviteCode(v);
                setInviteError(null);
              }}
              placeholder={requireInvite ? 'Обязательно для входа' : 'Опционально'}
              className="w-full px-4 py-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/40"
            />
            {requireInvite ? (
              <p className="text-[10px] text-slate-500">Закрытая бета: без кода приглашения профиль создать нельзя.</p>
            ) : null}
            {inviteError ? <p className="text-[11px] text-rose-400 font-semibold">{inviteError}</p> : null}
          </div>

          <div className="flex items-center justify-center p-5 border-2 border-dashed border-slate-800 rounded-[2rem] bg-slate-900/40">
            <OAuthSignInButton
              provider="google"
              inviteCode={inviteCode}
            />
          </div>
          <div className="flex items-center justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
              <Apple size={12} className="text-slate-500" />
              Apple скоро
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenVersionInfo}
            className="inline-flex items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500 transition-colors hover:text-slate-200"
          >
            <ArrowRight size={12} className="text-indigo-400" />
            Версия и изменения
          </button>
          <a
            href="/privacy.html"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center text-xs font-black uppercase tracking-[0.2em] text-slate-500 transition-colors hover:text-slate-200"
          >
            Политика конфиденциальности
          </a>
        </div>
      </div>
    </div>
  );
}
