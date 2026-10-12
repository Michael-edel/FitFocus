import { useSyncExternalStore } from 'react';
import { applyPwaUpdate, dismissPwaUpdate, getInitialPwaUpdateState, getPwaUpdateState, subscribePwaUpdate } from '../services/pwaUpdate';

export function PwaUpdateNotice() {
  const update = useSyncExternalStore(subscribePwaUpdate, getPwaUpdateState, getInitialPwaUpdateState);
  if (!update.visible) return null;
  return <aside role="status" aria-label="Обновление FitFocus"
    className="fixed inset-x-3 top-3 z-[100] mx-auto max-w-xl rounded-2xl border border-indigo-400/50 bg-[var(--ff-bg)] p-4 text-slate-100 shadow-xl">
    <p className="font-semibold">Доступна новая версия FitFocus</p>
    <p className="mt-1 text-sm text-slate-300">Сохраните изменения во всех открытых вкладках перед обновлением.</p>
    {update.error && <p role="alert" className="mt-2 text-sm text-amber-200">Не удалось завершить обновление. Повторите попытку.</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={update.applying} onClick={() => { void applyPwaUpdate(); }}
        className="min-h-11 rounded-xl bg-indigo-600 px-4 font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300">
        {update.applying ? 'Обновляем…' : 'Обновить приложение'}
      </button>
      <button type="button" disabled={update.applying} onClick={dismissPwaUpdate}
        className="min-h-11 rounded-xl border border-slate-500 px-4 text-slate-100 hover:bg-slate-800 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300">Позже</button>
    </div>
  </aside>;
}
