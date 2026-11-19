import React from 'react';
import clsx from 'clsx';
import { BookMarked, LogOut, MoreHorizontal, X } from 'lucide-react';
import { BUILD_SHORT_LABEL } from './versioning';
import { useModalDismissGestures } from './useModalDismissGestures';
import {
  AppTabId,
  mobilePrimaryTabIds,
  sidebarCoreTabIds,
  sidebarFeatureTabIds,
  sidebarTabs,
  sidebarUtilityTabIds,
} from './navigation';

type BadgeMeta = {
  cls: string;
  label: string;
  title: string;
};

type RetryMeta = {
  cooling: boolean;
  label: string;
  title: string;
};

type SidebarNavigationProps = {
  activeTab: AppTabId;
  isAdmin: boolean;
  lastAiAction: unknown;
  logout: () => void | Promise<void>;
  mobileMoreOpen: boolean;
  modeBadge: { cls: string; text: string };
  onAiRetry: (opts?: { force?: boolean }) => void;
  onMobileMoreOpenChange: (open: boolean) => void;
  onActiveTabChange: (tab: AppTabId) => void;
  onSyncNow: () => void | Promise<void>;
  aiBadge: BadgeMeta;
  retryMeta: RetryMeta;
  syncBadge: BadgeMeta;
};

export default function SidebarNavigation({
  activeTab,
  isAdmin,
  lastAiAction,
  logout,
  mobileMoreOpen,
  modeBadge,
  onAiRetry,
  onMobileMoreOpenChange,
  onActiveTabChange,
  onSyncNow,
  aiBadge,
  retryMeta,
  syncBadge,
}: SidebarNavigationProps) {
  const visibleTabs = React.useMemo(() => (isAdmin ? sidebarTabs : sidebarTabs.filter(tab => tab.id !== 'admin')), [isAdmin]);
  const sidebarCoreTabs = React.useMemo(() => visibleTabs.filter(tab => sidebarCoreTabIds.includes(tab.id)), [visibleTabs]);
  const sidebarFeatureTabs = React.useMemo(() => visibleTabs.filter(tab => sidebarFeatureTabIds.includes(tab.id)), [visibleTabs]);
  const sidebarUtilityTabs = React.useMemo(() => visibleTabs.filter(tab => sidebarUtilityTabIds.includes(tab.id)), [visibleTabs]);
  const mobilePrimaryTabs = React.useMemo(() => visibleTabs.filter(tab => mobilePrimaryTabIds.includes(tab.id)), [visibleTabs]);
  const mobileMoreTabs = React.useMemo(() => visibleTabs.filter(tab => !mobilePrimaryTabIds.includes(tab.id)), [visibleTabs]);
  const mobileQuickTabs = React.useMemo(() => {
    const preferredOrder: AppTabId[] = ['settings', 'pro'];
    return preferredOrder
      .map((id) => visibleTabs.find((tab) => tab.id === id))
      .filter((tab): tab is (typeof visibleTabs)[number] => Boolean(tab));
  }, [visibleTabs]);
  const mobileMoreListTabs = React.useMemo(
    () => mobileMoreTabs.filter((tab) => !mobileQuickTabs.some((quickTab) => quickTab.id === tab.id)),
    [mobileMoreTabs, mobileQuickTabs],
  );
  const dismissGestures = useModalDismissGestures(() => onMobileMoreOpenChange(false));

  return (
    <>
      {mobileMoreOpen && (
        <div className="fixed inset-0 z-[120] desktop-nav:hidden flex items-end justify-center p-2">
          <button type="button" aria-hidden="true" tabIndex={-1} onClick={() => onMobileMoreOpenChange(false)} className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />
          <div
            role="dialog" aria-modal="true" aria-label="Ещё разделы" className="ff-navigation-menu relative w-full max-w-md rounded-3xl border border-slate-800 bg-[var(--ff-bg)] shadow-2xl p-3 space-y-2 touch-pan-y max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain"
            onTouchStart={dismissGestures.onTouchStart}
            onTouchMove={dismissGestures.onTouchMove}
            onTouchEnd={dismissGestures.onTouchEnd}
          >
            <div className="flex items-center justify-between gap-2 pl-2">
              <h2 className="text-base font-bold text-slate-100">Ещё разделы</h2>
              <button type="button" aria-label="Закрыть меню" onClick={() => onMobileMoreOpenChange(false)} className="grid size-11 place-items-center rounded-xl text-slate-300 hover:bg-slate-800"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {mobileQuickTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    onActiveTabChange(tab.id);
                    onMobileMoreOpenChange(false);
                  }}
                  className={`min-h-12 min-w-0 px-2 rounded-xl flex flex-col items-start justify-center gap-1 text-left transition-all border ${
                    activeTab === tab.id
                      ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
                      : tab.id === 'pro'
                        ? 'bg-amber-500/10 text-amber-200 border-amber-500/20'
                        : 'bg-slate-900 text-slate-200 border-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2 font-black">
                    <tab.icon size={18} className={tab.id === 'pro' ? 'text-amber-500' : ''} />
                    {tab.label}
                  </span>
                </button>
              ))}
            </div>
            {mobileMoreListTabs.map((tab) => (
              <button key={tab.id} type="button" onClick={() => { onActiveTabChange(tab.id); onMobileMoreOpenChange(false); }} className={`w-full min-h-[52px] px-4 rounded-[1.3rem] flex items-center gap-3 text-left transition-all ${activeTab === tab.id ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20' : 'bg-slate-900 text-slate-200 border border-slate-800'}`}>
                <tab.icon size={20} className={tab.id === 'pro' && activeTab !== tab.id ? 'text-amber-500' : ''} />
                <span className="font-black">{tab.label}</span>
              </button>
            ))}
            <div className="pt-2 border-t border-slate-800/70 mt-2">
              <button
                type="button"
                onClick={() => {
                  onMobileMoreOpenChange(false);
                  void logout();
                }}
                className="w-full min-h-[52px] px-4 rounded-[1.3rem] flex items-center gap-3 text-left transition-all bg-rose-500/10 text-rose-200 border border-rose-500/20"
              >
                <LogOut size={20} />
                <span className="font-black">Выйти</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="ff-navigation fixed inset-x-0 bottom-0 bg-[var(--ff-bg)] border-t border-slate-800 px-2 pt-2 flex items-center justify-between gap-1 overflow-hidden desktop-nav:bg-[var(--ff-card)] desktop-nav:top-0 desktop-nav:left-0 desktop-nav:right-auto desktop-nav:w-64 desktop-nav:h-full desktop-nav:flex-col desktop-nav:justify-start desktop-nav:overflow-y-auto desktop-nav:overflow-x-hidden desktop-nav:border-r desktop-nav:border-t-0 desktop-nav:px-4 desktop-nav:pt-4 z-50" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}>
        <div className="hidden desktop-nav:flex shrink-0 flex-col mb-12 w-full px-4 pt-4 text-left">
          <div className="flex items-center gap-3">
            <div className="relative inline-flex w-12 h-12 items-center justify-center shrink-0">
              <div className="absolute inset-0 rounded-[1.1rem] overflow-hidden pointer-events-none"><div className="absolute inset-[-200%] bg-[conic-gradient(from_0deg,transparent_85%,#818cf8_98%,transparent_100%)] animate-spin" style={{ animationDuration: '3s' }} /></div>
              <div className="absolute inset-[1.5px] bg-slate-900 rounded-[1rem] z-0" />
              <div className="relative w-[40px] h-[40px] bg-indigo-600 rounded-[0.8rem] flex items-center justify-center text-white font-black text-lg shadow-xl animate-pulse z-10 border border-indigo-400/20">FF</div>
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black text-slate-100 tracking-tight leading-none">FitFocus</span>
              <button
                type="button"
                onClick={() => onActiveTabChange('updates')}
                className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1 text-left hover:text-indigo-300 transition-colors"
                title="Открыть изменения версии"
              >
                {BUILD_SHORT_LABEL}
              </button>
              <button
                type="button"
                onClick={() => onActiveTabChange('guide')}
                className="mt-2 inline-flex w-fit items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-[9px] font-black uppercase tracking-widest text-emerald-200 hover:bg-emerald-500/20 transition-colors"
                title="Открыть инструкцию"
              >
                <BookMarked size={12} />
                Инструкция
              </button>
              <span className={clsx("mt-2 inline-flex w-fit items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest", modeBadge.cls)}>
                {modeBadge.text}
              </span>
              <div className="mt-2 flex flex-col gap-2">
                <span title={syncBadge.title} className={clsx("inline-flex w-fit items-center gap-2 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest", syncBadge.cls)}>
                  {syncBadge.label}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span title={aiBadge.title} className={clsx("inline-flex w-fit items-center gap-2 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest", aiBadge.cls)}>
                    {aiBadge.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => void onAiRetry()}
                    disabled={!lastAiAction || retryMeta.cooling}
                    className={clsx(
                      "px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all active:scale-95",
                      (!lastAiAction || retryMeta.cooling) ? "border-slate-900 bg-slate-950 text-slate-600 opacity-50 cursor-not-allowed" : "border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300"
                    )}
                    title={retryMeta.title}
                  >
                    {retryMeta.label}
                  </button>
                  {lastAiAction && retryMeta.cooling && (
                    <button
                      type="button"
                      onClick={() => {
                        const ok = window.confirm("AI сейчас на паузе из-за квоты/лимита. Force Retry может снова вызвать ошибку quota exceeded и потратить лимиты. Продолжить?");
                        if (ok) void onAiRetry({ force: true });
                      }}
                      className="px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200"
                      title="Принудительно повторить последнее AI-действие, игнорируя паузу"
                    >
                      Force
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void onSyncNow()}
                    className="px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-200"
                    title="Синхронизировать данные с облаком прямо сейчас"
                  >
                    Sync now
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {mobilePrimaryTabs.map((tab) => (
          <button key={tab.id} type="button" aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => onActiveTabChange(tab.id)} className={`desktop-nav:hidden flex-1 min-w-0 shrink flex-col items-center justify-center gap-1 px-1 py-2 rounded-[1.2rem] transition-all ${activeTab === tab.id ? 'ff-navigation-active text-indigo-400 bg-indigo-500/10 shadow-sm font-black' : 'text-[var(--ff-muted)] hover:bg-[var(--ff-card-2)] hover:text-[var(--ff-text)]'}`}>
            <tab.icon size={20} className={tab.id === 'pro' && activeTab !== 'pro' ? 'text-amber-500' : ''} />
            <span className="text-[10px] max-[360px]:text-[9px] leading-tight text-center font-bold whitespace-nowrap">{tab.label}</span>
          </button>
        ))}

        <button type="button" aria-haspopup="dialog" aria-expanded={mobileMoreOpen} onClick={() => onMobileMoreOpenChange(true)} className={`desktop-nav:hidden flex-1 min-w-0 shrink flex-col items-center justify-center gap-1 px-1 py-2 rounded-[1.2rem] transition-all ${mobileMoreTabs.some(tab => tab.id === activeTab) || mobileMoreOpen ? 'ff-navigation-active text-indigo-400 bg-indigo-500/10 shadow-sm font-black' : 'text-[var(--ff-muted)] hover:bg-[var(--ff-card-2)] hover:text-[var(--ff-text)]'}`}>
          <MoreHorizontal size={20} />
          <span className="text-[10px] leading-tight text-center font-bold whitespace-nowrap">Ещё</span>
        </button>

        <div className="hidden desktop-nav:block shrink-0 w-full px-2 space-y-3">
          <div>
            <div className="px-3 mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Основное</div>
            {sidebarCoreTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onActiveTabChange(tab.id)}
                className={`hidden desktop-nav:flex shrink-0 desktop-nav:flex-row items-center justify-center gap-4 px-2.5 py-2 desktop-nav:p-4 rounded-[1.5rem] transition-all desktop-nav:min-w-0 desktop-nav:max-w-none desktop-nav:w-full desktop-nav:mb-2 ${activeTab === tab.id ? 'ff-navigation-active text-indigo-400 bg-indigo-500/10 shadow-sm font-black' : 'text-[var(--ff-muted)] hover:bg-[var(--ff-card-2)] hover:text-[var(--ff-text)]'}`}
              >
                <tab.icon size={22} className={tab.id === 'pro' && activeTab !== 'pro' ? 'text-amber-500' : ''} />
                <span className="text-base font-bold">{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-800/70">
            <div className="px-3 mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Разделы</div>
            {sidebarFeatureTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onActiveTabChange(tab.id)}
                className={`hidden desktop-nav:flex shrink-0 desktop-nav:flex-row items-center justify-center gap-4 px-2.5 py-2 desktop-nav:p-4 rounded-[1.5rem] transition-all desktop-nav:min-w-0 desktop-nav:max-w-none desktop-nav:w-full desktop-nav:mb-2 ${activeTab === tab.id ? 'ff-navigation-active text-indigo-400 bg-indigo-500/10 shadow-sm font-black' : 'text-[var(--ff-muted)] hover:bg-[var(--ff-card-2)] hover:text-[var(--ff-text)]'}`}
              >
                <tab.icon size={22} className={tab.id === 'pro' && activeTab !== 'pro' ? 'text-amber-500' : ''} />
                <span className="text-base font-bold">{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-800/70">
            <div className="px-3 mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Сервис</div>
            {sidebarUtilityTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onActiveTabChange(tab.id)}
                className={`hidden desktop-nav:flex shrink-0 desktop-nav:flex-row items-center justify-center gap-4 px-2.5 py-2 desktop-nav:p-4 rounded-[1.5rem] transition-all desktop-nav:min-w-0 desktop-nav:max-w-none desktop-nav:w-full desktop-nav:mb-2 ${activeTab === tab.id ? 'ff-navigation-active text-indigo-400 bg-indigo-500/10 shadow-sm font-black' : 'text-[var(--ff-muted)] hover:bg-[var(--ff-card-2)] hover:text-[var(--ff-text)]'}`}
              >
                <tab.icon size={22} className={tab.id === 'pro' && activeTab !== 'pro' ? 'text-amber-500' : ''} />
                <span className="text-base font-bold">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <button onClick={() => void logout()} className="hidden desktop-nav:flex shrink-0 items-center gap-4 p-4 text-slate-600 hover:text-rose-400 transition-all mt-auto w-full rounded-[1.5rem] hover:bg-rose-500/5">
          <X size={20} />
          <span className="font-bold">Выйти</span>
        </button>
      </nav>
    </>
  );
}
