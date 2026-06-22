import React from 'react';
import clsx from 'clsx';
import { Sparkles, TrendingUp, ShieldCheck, Scale, Flame } from 'lucide-react';

type WeeklyShareSnapshot = {
  wis: number;
  status: string;
  weightDelta7: number;
  weightDelta30: number;
  compliance: number;
  adaptationIndex: number;
};

type ShareWisCardProps = {
  weekly: WeeklyShareSnapshot;
  goalLabel?: string;
};

const statusCopy: Record<string, { title: string; accent: string; subtitle: string }> = {
  excellent: { title: 'Супер-неделя', accent: 'from-emerald-400 to-cyan-400', subtitle: 'Режим держится уверенно' },
  stable: { title: 'Стабильная неделя', accent: 'from-indigo-400 to-sky-400', subtitle: 'Баланс сохраняется' },
  adjust: { title: 'Нужна настройка', accent: 'from-amber-400 to-orange-400', subtitle: 'Небольшая коррекция курса' },
  critical: { title: 'Нужен пересмотр', accent: 'from-rose-400 to-red-500', subtitle: 'Организму тяжело держать темп' },
};

function formatDelta(value: number) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)} кг`;
}

export default React.forwardRef<HTMLDivElement, ShareWisCardProps>(function ShareWisCard(
  { weekly, goalLabel = 'Фокус на цели' },
  ref,
) {
  const statusKey = weekly.status in statusCopy ? weekly.status : 'stable';
  const status = statusCopy[statusKey];
  const wis = Math.max(0, Math.min(100, Math.round(weekly.wis)));

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed left-[-9999px] top-0 h-[1920px] w-[1080px] overflow-hidden"
    >
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[56px] bg-[radial-gradient(circle_at_top_left,_rgba(79,70,229,0.32),_transparent_36%),radial-gradient(circle_at_85%_12%,_rgba(34,211,238,0.18),_transparent_28%),linear-gradient(180deg,_#071127_0%,_#0b1020_48%,_#050816_100%)] px-[72px] py-[72px] text-slate-50 shadow-[0_30px_120px_rgba(2,6,23,0.6)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.06),transparent_18%),radial-gradient(circle_at_82%_58%,rgba(99,102,241,0.14),transparent_22%),radial-gradient(circle_at_36%_82%,rgba(16,185,129,0.08),transparent_18%)]" />
        <div className="absolute left-[-120px] top-[220px] h-[360px] w-[360px] rounded-full bg-indigo-500/15 blur-[120px]" />
        <div className="absolute right-[-80px] bottom-[220px] h-[320px] w-[320px] rounded-full bg-cyan-500/10 blur-[110px]" />

        <div className="relative flex items-start justify-between gap-8">
          <div className="flex items-center gap-4">
            <div className="flex h-[84px] w-[84px] items-center justify-center rounded-[28px] border border-white/10 bg-white/10 text-3xl font-black tracking-tight text-white shadow-lg shadow-indigo-950/30">
              FF
            </div>
            <div className="space-y-2">
              <div className="text-[12px] font-black uppercase tracking-[0.35em] text-indigo-200/80">FitFocus</div>
              <div className="text-[54px] font-black leading-none tracking-tight text-white">WIS {wis}</div>
              <p className="max-w-[520px] text-[22px] font-medium leading-snug text-slate-300">
                Считаю КБЖУ по фото в FitFocus
              </p>
            </div>
          </div>
          <div className={clsx(
            'inline-flex items-center gap-2 rounded-full border px-5 py-3 text-[12px] font-black uppercase tracking-[0.25em] shadow-lg',
            wis >= 80
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
              : wis >= 60
                ? 'border-indigo-400/30 bg-indigo-400/10 text-indigo-100'
                : wis >= 40
                  ? 'border-amber-400/30 bg-amber-400/10 text-amber-100'
                  : 'border-rose-400/30 bg-rose-400/10 text-rose-100',
          )}>
            <Sparkles size={15} />
            {status.title}
          </div>
        </div>

        <div className="relative mt-14 grid grid-cols-[1.05fr_0.95fr] gap-8">
          <div className="rounded-[40px] border border-white/10 bg-white/6 p-8 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[12px] font-black uppercase tracking-[0.32em] text-slate-400">Неделя</div>
                <div className="mt-2 text-[30px] font-black leading-none text-white">{status.subtitle}</div>
              </div>
              <div className="flex h-[98px] w-[98px] items-center justify-center rounded-[30px] border border-white/10 bg-slate-950/50 text-slate-200">
                <Scale size={34} className="text-cyan-300" />
              </div>
            </div>

            <div className="mt-8 flex items-center gap-8">
              <div className="relative flex h-[292px] w-[292px] items-center justify-center">
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `conic-gradient(from 210deg, #7c3aed 0deg, #22d3ee ${Math.max(18, wis * 3)}deg, rgba(255,255,255,0.07) ${Math.max(18, wis * 3)}deg 360deg)`,
                  }}
                />
                <div className="absolute inset-[22px] rounded-full border border-white/10 bg-[#071127] shadow-inner shadow-black/30" />
                <div className="relative z-10 flex flex-col items-center gap-2 text-center">
                  <div className="text-[18px] font-black uppercase tracking-[0.35em] text-slate-400">Индекс</div>
                  <div className="text-[64px] font-black leading-none tabular-nums text-white">{wis}</div>
                  <div className="text-[16px] font-bold uppercase tracking-[0.3em] text-slate-400">из 100</div>
                </div>
              </div>
              <div className="flex-1 space-y-4">
                <div className="rounded-[28px] border border-white/10 bg-slate-950/40 p-6">
                  <div className="text-[12px] font-black uppercase tracking-[0.3em] text-slate-400">Соблюдение режима</div>
                  <div className="mt-3 text-[42px] font-black leading-none tabular-nums text-white">{weekly.compliance}%</div>
                  <div className="mt-2 text-[18px] font-medium text-slate-300">Питание и привычки держатся в рабочем коридоре.</div>
                </div>
                <div className="rounded-[28px] border border-white/10 bg-slate-950/40 p-6">
                  <div className="text-[12px] font-black uppercase tracking-[0.3em] text-slate-400">Адаптация</div>
                  <div className="mt-3 text-[42px] font-black leading-none tabular-nums text-white">{weekly.adaptationIndex}/100</div>
                  <div className="mt-2 text-[18px] font-medium text-slate-300">Чем ниже индекс, тем легче телу держать курс.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-[40px] border border-white/10 bg-white/6 p-8 backdrop-blur-sm">
              <div className="text-[12px] font-black uppercase tracking-[0.32em] text-slate-400">Статус недели</div>
              <div className="mt-3 text-[34px] font-black leading-tight text-white">{status.title}</div>
              <p className="mt-4 text-[20px] leading-relaxed text-slate-300">
                {goalLabel}. Текущий режим помогает видеть прогресс не только по цифрам, но и по устойчивости.
              </p>

              <div className="mt-8 grid grid-cols-2 gap-4">
                <div className="rounded-[26px] border border-white/10 bg-slate-950/45 p-5">
                  <div className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Δ 7 дней</div>
                  <div className="mt-3 flex items-center gap-2 text-[28px] font-black tabular-nums text-white">
                    <TrendingUp size={22} className={weekly.weightDelta7 < 0 ? 'text-emerald-300' : 'text-rose-300'} />
                    {formatDelta(weekly.weightDelta7)}
                  </div>
                </div>
                <div className="rounded-[26px] border border-white/10 bg-slate-950/45 p-5">
                  <div className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Δ 30 дней</div>
                  <div className="mt-3 flex items-center gap-2 text-[28px] font-black tabular-nums text-white">
                    <TrendingUp size={22} className={weekly.weightDelta30 < 0 ? 'text-emerald-300' : 'text-rose-300'} />
                    {formatDelta(weekly.weightDelta30)}
                  </div>
                </div>
                <div className="rounded-[26px] border border-white/10 bg-slate-950/45 p-5">
                  <div className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Стабильность</div>
                  <div className="mt-3 text-[28px] font-black tabular-nums text-white">{weekly.compliance}%</div>
                  <div className="mt-2 text-[16px] text-slate-300">Комплаенс по дню и привычкам</div>
                </div>
                <div className="rounded-[26px] border border-white/10 bg-slate-950/45 p-5">
                  <div className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Фокус</div>
                  <div className="mt-3 text-[28px] font-black tabular-nums text-white">WIS {wis}</div>
                  <div className="mt-2 text-[16px] text-slate-300">Показывает, как идет неделя</div>
                </div>
              </div>
            </div>

            <div className="rounded-[40px] border border-white/10 bg-white/6 p-8 backdrop-blur-sm">
              <div className="text-[12px] font-black uppercase tracking-[0.32em] text-slate-400">WIS scale</div>
              <div className="mt-5 grid grid-cols-5 gap-3">
                {[
                  { label: '0', color: 'bg-rose-500/30' },
                  { label: '25', color: 'bg-orange-400/30' },
                  { label: '50', color: 'bg-amber-300/30' },
                  { label: '75', color: 'bg-cyan-400/30' },
                  { label: '100', color: 'bg-emerald-400/30' },
                ].map((tick, idx) => {
                  const active = wis >= [10, 30, 55, 80, 100][idx];
                  return (
                    <div key={tick.label} className="space-y-2">
                      <div className={clsx('h-5 rounded-full border border-white/10', active ? tick.color : 'bg-white/5')} />
                      <div className="text-center text-[12px] font-black uppercase tracking-[0.3em] text-slate-400">{tick.label}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 flex items-center justify-between text-[16px] font-medium text-slate-300">
                <div className="inline-flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-300" />
                  Данные для карточки ограничены только WIS-показателями
                </div>
                <div className="inline-flex items-center gap-2">
                  <Flame size={16} className="text-orange-300" />
                  Без email, медицины и фото еды
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative mt-auto rounded-[34px] border border-white/10 bg-slate-950/60 px-8 py-6 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-6">
            <div>
              <div className="text-[12px] font-black uppercase tracking-[0.32em] text-slate-400">FitFocus</div>
              <div className="mt-2 text-[24px] font-black text-white">Считаю КБЖУ по фото в FitFocus</div>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-[12px] font-black uppercase tracking-[0.3em] text-slate-300">
              Версия WIS-карточки
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
