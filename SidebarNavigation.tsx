import React from 'react';
import { LogOut, MoreHorizontal, X } from 'lucide-react';
import { BUILD_SHORT_LABEL } from './versioning';
import { sidebarCoreTabIds, sidebarTabs, type AppTabId } from './navigation';

type BadgeMeta = { cls: string; label: string; title: string };
type RetryMeta = { cooling: boolean; label: string; title: string };
type SidebarNavigationProps = {
  activeTab: AppTabId; isAdmin: boolean; lastAiAction: unknown; logout: () => void | Promise<void>;
  mobileMoreOpen: boolean; modeBadge: { cls: string; text: string };
  onAiRetry: (opts?: { force?: boolean }) => void;
  onMobileMoreOpenChange: (open: boolean) => void; onActiveTabChange: (tab: AppTabId) => void;
  onSyncNow: () => void | Promise<void>; aiBadge: BadgeMeta; retryMeta: RetryMeta; syncBadge: BadgeMeta;
  storageNotice?: React.ReactNode;
};
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950';

export default function SidebarNavigation(props: SidebarNavigationProps) {
  const { activeTab, isAdmin, mobileMoreOpen, onMobileMoreOpenChange, onActiveTabChange } = props;
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const navigationRef = React.useRef<HTMLElement>(null);
  React.useLayoutEffect(() => {
    const navigation = navigationRef.current;
    if (!navigation) return;
    const measure = () => document.documentElement.style.setProperty('--ff-bottom-navigation-height',
      `${window.matchMedia('(min-width: 768px)').matches ? 0 : Math.ceil(navigation.getBoundingClientRect().height)}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(navigation);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const visible = sidebarTabs.filter(tab => isAdmin || tab.id !== 'admin');
  const primary = sidebarCoreTabIds.map(id => visible.find(tab => tab.id === id)!).filter(Boolean);
  const secondary = visible.filter(tab => !sidebarCoreTabIds.includes(tab.id));
  const isMore = secondary.some(tab => tab.id === activeTab);
  const select = (id: AppTabId) => { onActiveTabChange(id); onMobileMoreOpenChange(false); };
  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (mobileMoreOpen && !dialog.open) dialog.showModal();
    if (!mobileMoreOpen && dialog.open) dialog.close();
  }, [mobileMoreOpen]);
  React.useEffect(() => { onMobileMoreOpenChange(false); }, [activeTab, onMobileMoreOpenChange]);
  const tabClass = (selected: boolean) => `${focus} min-h-14 min-w-0 rounded-2xl px-2 py-2 text-sm font-bold transition-colors ${selected ? 'ff-navigation-active bg-indigo-500/15 text-indigo-200' : 'text-slate-300 hover:bg-slate-800'}`;
  return <>
    <nav ref={navigationRef} aria-label="Основная навигация" className="ff-navigation fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 gap-1 border-t border-slate-800 bg-slate-950/95 px-2 pt-2 backdrop-blur-xl md:inset-y-0 md:right-auto md:w-64 md:flex md:flex-col md:gap-2 md:overflow-y-auto md:overscroll-contain md:border-r md:border-t-0 md:p-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}>
      <div className="mb-4 hidden px-3 py-4 md:block"><div className="text-2xl font-black text-slate-100">FitFocus</div><p className="mt-1 text-sm text-slate-400">Еда для всей семьи</p></div>
      {primary.map(tab => <button key={tab.id} type="button" aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => select(tab.id)} className={`${tabClass(activeTab === tab.id)} flex flex-col items-center justify-center gap-1 md:flex-row md:justify-start md:gap-3 md:px-4`}>
        <tab.icon aria-hidden="true" size={22} /><span className="min-w-0 max-w-full text-center leading-tight [overflow-wrap:anywhere] md:text-left">{tab.label}</span>
      </button>)}
      <button type="button" aria-haspopup="dialog" aria-expanded={mobileMoreOpen} onClick={() => onMobileMoreOpenChange(true)} className={`${tabClass(isMore || mobileMoreOpen)} flex flex-col items-center justify-center gap-1 md:flex-row md:justify-start md:gap-3 md:px-4`}><MoreHorizontal aria-hidden="true" size={22} /><span>Ещё</span></button>
      <div className="mt-auto hidden space-y-2 px-2 pt-6 md:block">
        <button type="button" onClick={() => select('settings')} className={`${focus} min-h-11 w-full rounded-xl px-3 text-left text-sm text-slate-400`}>Профиль и настройки</button>
        <button type="button" onClick={() => select('updates')} className={`${focus} min-h-11 w-full rounded-xl px-3 text-left text-xs text-slate-500 break-words`}>{BUILD_SHORT_LABEL}</button>
      </div>
    </nav>
    <dialog ref={dialogRef} aria-labelledby="ff-more-title" onCancel={event => { event.preventDefault(); onMobileMoreOpenChange(false); }} onClose={() => onMobileMoreOpenChange(false)} onClick={event => { if (event.target === event.currentTarget) onMobileMoreOpenChange(false); }} className="ff-navigation-menu m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto overscroll-contain rounded-3xl border border-slate-700 bg-slate-950 p-0 text-slate-100 shadow-2xl backdrop:bg-slate-950/80">
      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
        <div className="mb-3 flex items-center justify-between gap-3"><h2 id="ff-more-title" className="text-xl font-bold">Личные разделы и настройки</h2><button type="button" autoFocus aria-label="Закрыть меню" onClick={() => onMobileMoreOpenChange(false)} className={`${focus} flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-slate-800`}><X aria-hidden="true" size={22} /></button></div>
        <div className="grid gap-2 sm:grid-cols-2">{secondary.map(tab => <button key={tab.id} type="button" onClick={() => select(tab.id)} aria-current={activeTab === tab.id ? 'page' : undefined} className={`${tabClass(activeTab === tab.id)} flex items-center gap-3 px-4 text-left`}><tab.icon aria-hidden="true" size={20} /><span className="min-w-0 break-words">{tab.label}</span></button>)}</div>
        <details className="mt-4 rounded-2xl border border-slate-800 p-3"><summary className={`${focus} min-h-11 cursor-pointer py-2 text-sm font-semibold`}>Состояние приложения
          {props.storageNotice && <span title={props.syncBadge.title} className="mt-1 block min-w-0 break-words text-xs font-normal text-slate-400">{props.syncBadge.label}</span>}
        </summary>
          <p className="mt-2 text-sm text-slate-400">{props.modeBadge.text}</p><p title={props.syncBadge.title} className="mt-2 text-sm">{props.syncBadge.label}</p><p className="mt-1 text-xs text-slate-400">Сохранение конкретного меню показано рядом с меню.</p>
          {props.storageNotice}
          <button type="button" onClick={() => void props.onSyncNow()} className={`${focus} mt-2 min-h-11 rounded-xl bg-slate-800 px-4 text-sm`}>Синхронизировать данные</button>
          <p title={props.aiBadge.title} className="mt-3 text-sm text-slate-400">{props.aiBadge.label}</p>
          {Boolean(props.lastAiAction) && <button type="button" disabled={props.retryMeta.cooling} title={props.retryMeta.title} onClick={() => props.onAiRetry()} className={`${focus} mt-2 min-h-11 rounded-xl bg-slate-800 px-4 text-sm disabled:opacity-50`}>{props.retryMeta.label}</button>}
          {Boolean(props.lastAiAction) && props.retryMeta.cooling && <button type="button" onClick={() => { if (window.confirm('Принудительный повтор AI может снова израсходовать лимит и завершиться ошибкой. Продолжить?')) props.onAiRetry({ force: true }); }} className={`${focus} mt-2 min-h-11 rounded-xl border border-amber-500/40 px-4 text-sm`}>Принудительно повторить AI</button>}
          <p className="mt-3 break-words text-xs text-slate-500">{BUILD_SHORT_LABEL}</p>
        </details>
        <button type="button" onClick={() => { onMobileMoreOpenChange(false); void props.logout(); }} className={`${focus} mt-4 flex min-h-11 w-full items-center gap-3 rounded-xl px-4 text-left text-rose-300`}><LogOut aria-hidden="true" size={20} />Выйти</button>
      </div>
    </dialog>
  </>;
}
