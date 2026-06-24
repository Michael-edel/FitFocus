import React from 'react';
import { CheckCircle2, Lock, Trophy, X } from 'lucide-react';
import type { AchievementDefinition } from '../achievements/catalog';
import type { UnlockedAchievement } from '../useAchievements';

type AchievementsPanelProps = {
  catalog: AchievementDefinition[];
  unlocked: UnlockedAchievement[];
  newlyUnlocked: AchievementDefinition[];
  loading?: boolean;
  onDismissToast: () => void;
};

const tierStyle: Record<string, string> = {
  bronze: 'border-amber-700/30 bg-amber-500/10 text-amber-200',
  silver: 'border-slate-500/30 bg-slate-400/10 text-slate-200',
  gold: 'border-yellow-500/30 bg-yellow-400/10 text-yellow-100',
  platinum: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100',
};

function tierLabel(tier: string) {
  if (tier === 'bronze') return 'Бронза';
  if (tier === 'silver') return 'Серебро';
  if (tier === 'gold') return 'Золото';
  if (tier === 'platinum') return 'Платина';
  return tier || 'Tier';
}

export default function AchievementsPanel({
  catalog,
  unlocked,
  newlyUnlocked,
  loading,
  onDismissToast,
}: AchievementsPanelProps) {
  const unlockedMap = React.useMemo(() => new Map(unlocked.map((item) => [item.key, item])), [unlocked]);
  const visibleCatalog = React.useMemo(() => catalog.filter((item) => !item.hidden).slice(0, 8), [catalog]);
  const unlockedCount = unlockedMap.size;
  const totalCount = catalog.filter((item) => !item.hidden).length;
  const toast = newlyUnlocked[0] || null;

  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900/80 p-5 md:p-6 shadow-xl shadow-black/20 relative">
      {toast && (
        <div className="absolute right-5 top-5 z-10 max-w-xs rounded-2xl border border-emerald-400/25 bg-emerald-950/90 p-4 shadow-2xl shadow-black/30">
          <button
            type="button"
            onClick={onDismissToast}
            className="absolute right-3 top-3 rounded-full p-1 text-emerald-100/70 hover:bg-emerald-400/10 hover:text-emerald-50"
            aria-label="Закрыть уведомление"
          >
            <X size={14} />
          </button>
          <div className="pr-6 text-[10px] font-black uppercase tracking-widest text-emerald-300">Новое достижение</div>
          <div className="mt-2 text-base font-black text-white">{toast.title}</div>
          <div className="mt-1 text-xs font-medium leading-relaxed text-emerald-100/75">{toast.description}</div>
        </div>
      )}

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Достижения</div>
          <h2 className="mt-2 text-xl md:text-2xl font-black text-slate-100">Прогресс действий</h2>
          <p className="mt-1 text-sm font-medium text-slate-400">
            Открыто {unlockedCount} из {totalCount || 0}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/25 bg-indigo-500/10 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-indigo-200">
          <Trophy size={15} />
          {loading ? 'Обновляем' : `${unlockedCount} открыто`}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {visibleCatalog.map((item) => {
          const isUnlocked = unlockedMap.has(item.key);
          return (
            <div
              key={item.key}
              className="rounded-[1.25rem] border border-slate-800 bg-slate-950/50 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${tierStyle[item.tier] || tierStyle.bronze}`}>
                  {tierLabel(item.tier)}
                </div>
                {isUnlocked ? <CheckCircle2 size={18} className="text-emerald-300" /> : <Lock size={17} className="text-slate-600" />}
              </div>
              <div className={`mt-4 text-sm font-black ${isUnlocked ? 'text-slate-100' : 'text-slate-400'}`}>{item.title}</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-500">{item.description}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
