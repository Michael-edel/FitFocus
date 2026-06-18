import React from 'react';
import clsx from 'clsx';
import { MoreHorizontal, X } from 'lucide-react';
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
  logout: () => void;
  mobileMoreOpen: boolean;
  modeBadge: { cls: string; text: string };
  onAiRetry: (opts?: { force?: boolean }) => void;
  onMobileMoreOpenChange: (open: boolean) => void;
  onActiveTabChange: (tab: AppTabId) => void;
  aiBadge: BadgeMeta;
  retryMeta: RetryMeta;
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
  aiBadge,
  retryMeta,
}: SidebarNavigationProps) {
  const visibleTabs = React.useMemo(() => (isAdmin ? sidebarTabs : sidebarTabs.filter(tab => tab.id !== 'admin')), [isAdmin]);
  const sidebarCoreTabs = React.useMemo(() => visibleTabs.filter(tab => sidebarCoreTabIds.includes(tab.id)), [visibleTabs]);
  const sidebarFeatureTabs = React.useMemo(() => visibleTabs.filter(tab => sidebarFeatureTabIds.includes(tab.id)), [visibleTabs]);
  const sidebarUtilityTabs = React.useMemo(() => visibleTabs.filter(tab => sidebarUtilityTabIds.includes(tab.id)), [visibleTabs]);
  const mobilePrimaryTabs = React.useMemo(() => visibleTabs.filter(tab => mobilePrimaryTabIds.includes(tab.id)), [visibleTabs]);
  const mobileMoreTabs = React.useMemo(() => visibleTabs.filter(tab => !mobilePrimaryTabIds.includes(tab.id)), [visibleTabs]);

  return (
    <>
      {mobileMoreOpen && (
        <div className="fixed inset-0 z-[120] md:hidden">
          <button type="button" aria-label="Закрыть меню" onClick={() => onMobileMoreOpenChange(false)} className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />
          <div className="absolute inset-x-3 bottom-24 rounded-[2rem] border border-slate-800 bg-slate-950/95 shadow-2xl p-3 space-y-2">
            <div className="px-2 pt-1 pb-2 text-[11px] font-black uppercase tracking-widest text-slate-500">Ещё разделы</div>
            {mobileMoreTabs.map((tab) => (
              <button key={tab.id} type="button" onClick={() => { onActiveTabChange(tab.id); onMobileMoreOpenChange(false); }} className={`w-full min-h-[52px] px-4 rounded-[1.3rem] flex items-center gap-3 text-left transition-all ${activeTab === tab.id ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20' : 'bg-slate-900 text-slate-200 border border-slate-800'}`}>
                <tab.icon size={20} className={tab.id === 'pro' && activeTab !== tab.id ? 'text-amber-500' : ''} />
                <span className="font-black">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 bg-slate-900/92 backdrop-blur-xl border-t border-slate-800 px-2 pt-2 flex items-center justify-between gap-1 overflow-hidden md:top-0 md:left-0 md:right-auto md:w-64 md:h-full md:flex-col md:justify-start md:overflow-visible md:border-r md:border-t-0 md:px-4 md:pt-4 z-50" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}>
        <div className="hidden md:flex flex-col mb-12 w-full px-4 pt-4 text-left">
          <div className="flex items-center gap-3">
            <div className="relative inline-flex w-12 h-12 items-center justify-center shrink-0">
              <div className="absolute inset-0 rounded-[1.1rem] overflow-hidden pointer-events-none"><div className="absolute inset-[-200%] bg-[conic-gradient(from_0deg,transparent_85%,#818cf8_98%,transparent_100%)] animate-spin" style={{ animationDuration: '3s' }} /></div>
              <div className="absolute inset-[1.5px] bg-slate-900 rounded-[1rem] z-0" />
              <div className="relative w-[40px] h-[40px] bg-indigo-600 rounded-[0.8rem] flex items-center justify-center text-white font-black text-lg shadow-xl animate-pulse z-10 border border-indigo-400/20">FF</div>
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black text-slate-100 tracking-tight leading-none">FitFocus</span>
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">v2.4.0 Beta</span>
              <span className={clsx("mt-2 inline-flex w-fit items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest", modeBadge.cls)}>
                {modeBadge.text}
              </span>
              <div className="mt-2 flex items-center gap-2">
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
              </div>
            </div>
          </div>
        </div>

        {mobilePrimaryTabs.map((tab) => (
          <button key={tab.id} type="button" onClick={() => onActiveTabChange(tab.id)} className={`md:hidden flex shrink-0 flex-col items-center justify-center gap-1 px-2 py-2 rounded-[1.2rem] transition-all min-w-[68px] max-w-[68px] ${activeTab === tab.id ? 'text-indigo-400 bg-indigo-500/10 shadow-sm font-black' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}>
            <tab.icon size={20} className={tab.id === 'pro' && activeTab !== 'pro' ? 'text-amber-500' : ''} />
            <span className="text-[10px] leading-tight text-center font-bold">{tab.label}</span>
          </button>
        ))}

        <button type="button" onClick={() => onMobileMoreOpenChange(true)} className={`md:hidden flex shrink-0 flex-col items-center justify-center gap-1 px-2 py-2 rounded-[1.2rem] transition-all min-w-[68px] max-w-[68px] ${mobileMoreTabs.some(tab => tab.id === activeTab) || mobileMoreOpen ? 'text-indigo-400 bg-indigo-500/10 shadow-sm font-black' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}>
          <MoreHorizontal size={20} />
          <span className="text-[10px] leading-tight text-center font-bold">Ещё</span>
        </button>

        <div className="hidden md:block w-full px-2 space-y-3">
          <div>
            <div className="px-3 mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Основное</div>
            {sidebarCoreTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onActiveTabChange(tab.id)}
                className={`hidden md:flex shrink-0 md:flex-row items-center justify-center gap-4 px-2.5 py-2 md:p-4 rounded-[1.5rem] transition-all md:min-w-0 md:max-w-none md:w-full md:mb-2 ${activeTab === tab.id ? 'text-indigo-400 bg-indigo-500/10 shadow-sm font-black' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}
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
                className={`hidden md:flex shrink-0 md:flex-row items-center justify-center gap-4 px-2.5 py-2 md:p-4 rounded-[1.5rem] transition-all md:min-w-0 md:max-w-none md:w-full md:mb-2 ${activeTab === tab.id ? 'text-indigo-400 bg-indigo-500/10 shadow-sm font-black' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}
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
                className={`hidden md:flex shrink-0 md:flex-row items-center justify-center gap-4 px-2.5 py-2 md:p-4 rounded-[1.5rem] transition-all md:min-w-0 md:max-w-none md:w-full md:mb-2 ${activeTab === tab.id ? 'text-indigo-400 bg-indigo-500/10 shadow-sm font-black' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}
              >
                <tab.icon size={22} className={tab.id === 'pro' && activeTab !== 'pro' ? 'text-amber-500' : ''} />
                <span className="text-base font-bold">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <button onClick={logout} className="hidden md:flex items-center gap-4 p-4 text-slate-600 hover:text-rose-400 transition-all mt-auto w-full rounded-[1.5rem] hover:bg-rose-500/5">
          <X size={20} />
          <span className="font-bold">Выйти</span>
        </button>
      </nav>
    </>
  );
}
