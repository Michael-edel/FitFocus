import React from 'react';
import clsx from 'clsx';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  Camera,
  Download,
  Info,
  Plus,
  RefreshCcw,
  Scale,
  ShieldCheck,
  Share2,
  TrendingUp,
} from 'lucide-react';
import { Goal, type FoodItem, type UserProfile } from './types';
import FoodStreakCard from './components/FoodStreakCard';
import AchievementsPanel from './components/AchievementsPanel';
import type { AchievementDefinition } from './achievements/catalog';
import type { UnlockedAchievement } from './useAchievements';

const DashboardCharts = React.lazy(() => import('./charts'));

type RefeedSuggestion =
  | { type: 'refeed'; caloriesTomorrow: number }
  | { type: 'adjust'; stepsExtra: number }
  | { type: 'none' };

type AdaptationStatus = {
  label: string;
  color: string;
};

type WeeklyAnalytics = {
  wis: number;
  status: string;
  weightDelta7: number;
  weightDelta30: number;
  compliance: number;
  adaptationIndex: number;
  createdAt?: string;
  weekKey?: string;
  data?: { wis: number };
  aiText?: string | null;
};

type DashboardScreenProps = {
  currentUser: UserProfile | null;
  paywallPlan: string;
  canUsePro: boolean;
  dailyStats: any;
  targets: any;
  weightHistory: UserProfile['weightHistory'];
  dailyHabits: UserProfile['dailyHabits'];
  foodDiary: FoodItem[];
  weightTrend: number;
  currentWeight?: number;
  handleToggleHabit: (habitKey: string) => void;
  exportShortPdf: () => void;
  exportDetailedPdf: () => void;
  pdfIncludeMealLog: boolean;
  setPdfIncludeMealLog: React.Dispatch<React.SetStateAction<boolean>>;
  newWeight: string;
  setNewWeight: React.Dispatch<React.SetStateAction<string>>;
  logWeight: () => void;
  plateau: boolean;
  adaptationIndex: number;
  adaptationStatus: AdaptationStatus;
  compliancePct: number;
  deltaDays: number;
  weightDeltaN: number;
  refeedSuggestion: RefeedSuggestion;
  refeedDate: string | null;
  scheduleRefeedTomorrow: () => void;
  expectedN: number;
  adaptLoading: boolean;
  setAdaptLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setLastAiAction: (value: { feature: string; type: 'plateau'; userId: string }) => void;
  generatePlateauExplanation: (input: {
    name: string;
    goal: Goal;
    compliancePct: number;
    weightDeltaN: number;
    expectedN: number;
    adaptationIndex: number;
    suggestion: RefeedSuggestion;
  }) => Promise<string>;
  adaptNote: string;
  setAdaptNote: React.Dispatch<React.SetStateAction<string>>;
  adaptExpanded: boolean;
  setAdaptExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  adaptRead: boolean;
  setAdaptRead: React.Dispatch<React.SetStateAction<boolean>>;
  weekly: WeeklyAnalytics | null;
  weeklyReports: WeeklyAnalytics[];
  exportWeeklyPDF: (report: WeeklyAnalytics) => void;
  onShareWisCard: () => void;
  shareWisState: 'idle' | 'busy' | 'success' | 'error';
  shareWisMessage: string | null;
  achievementsCatalog: AchievementDefinition[];
  achievementsUnlocked: UnlockedAchievement[];
  achievementsNewlyUnlocked: AchievementDefinition[];
  achievementsLoading: boolean;
  onDismissAchievementToast: () => void;
  measurementsHistory?: UserProfile['measurementsHistory'];
  progressPhotos?: UserProfile['progressPhotos'];
  onOpenProgress: () => void;
};

const formatShortDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
};

export default function DashboardScreen({
  currentUser,
  paywallPlan,
  canUsePro,
  dailyStats,
  targets,
  weightHistory,
  dailyHabits,
  foodDiary,
  weightTrend,
  currentWeight,
  handleToggleHabit,
  exportShortPdf,
  exportDetailedPdf,
  pdfIncludeMealLog,
  setPdfIncludeMealLog,
  newWeight,
  setNewWeight,
  logWeight,
  plateau,
  adaptationIndex,
  adaptationStatus,
  compliancePct,
  deltaDays,
  weightDeltaN,
  refeedSuggestion,
  refeedDate,
  scheduleRefeedTomorrow,
  expectedN,
  adaptLoading,
  setAdaptLoading,
  setLastAiAction,
  generatePlateauExplanation,
  adaptNote,
  setAdaptNote,
  adaptExpanded,
  setAdaptExpanded,
  adaptRead,
  setAdaptRead,
  weekly,
  weeklyReports,
  exportWeeklyPDF,
  onShareWisCard,
  shareWisState,
  shareWisMessage,
  achievementsCatalog,
  achievementsUnlocked,
  achievementsNewlyUnlocked,
  achievementsLoading,
  onDismissAchievementToast,
  measurementsHistory,
  progressPhotos,
  onOpenProgress,
}: DashboardScreenProps) {
  const aiRefeedLabel =
    refeedSuggestion.type === 'refeed'
      ? `Запланировать рефид на завтра`
      : refeedSuggestion.type === 'adjust'
        ? `Мягкая адаптация: +${refeedSuggestion.stepsExtra} шагов`
        : 'Динамика в норме';
  const currentWeightLabel = typeof currentUser?.weight === 'number' ? `${currentUser.weight.toFixed(1)} кг` : '—';
  const measurementsCount = currentUser?.measurementsHistory?.length ?? 0;
  const progressPhotosCount = currentUser?.progressPhotos?.length ?? 0;
  const wearableState = currentUser?.wearableEnabled ? 'Подключено' : 'Не подключено';
  const wearableDetail = currentUser?.wearableEnabled
    ? `Обновлено ${formatShortDateTime(currentUser?.wearableMetricsUpdatedAt)}`
    : 'Подключите Apple Health, Google Fit или другой источник.';
  const wearableStepsLabel = typeof currentUser?.wearableStepsToday === 'number'
    ? currentUser.wearableStepsToday.toLocaleString('ru-RU')
    : '—';
  const wearableMinutesLabel = typeof currentUser?.wearableActiveMinutesToday === 'number'
    ? `${currentUser.wearableActiveMinutesToday} мин`
    : '—';
  const wearableSleepLabel = typeof currentUser?.wearableSleepHoursLastNight === 'number'
    ? `${currentUser.wearableSleepHoursLastNight.toFixed(1)} ч`
    : '—';

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="text-left">
          <h1 className="text-[2.25rem] leading-none md:text-4xl font-black text-slate-200 mb-2">
            Привет, <span className="text-slate-50">{currentUser?.name}</span>! 👋
          </h1>
          <p className="text-slate-400 font-medium text-base md:text-lg">Ваш путь к цели под контролем ({paywallPlan})</p>
        </div>
        <div className="w-full md:w-auto flex flex-col gap-3 bg-slate-900 p-2 rounded-[1.5rem] md:rounded-[2rem] shadow-sm border border-slate-800 overflow-hidden">
          <div className="px-2 pt-1">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Отчёты</div>
            <p className="mt-1 text-[11px] text-slate-500 font-semibold">Экспорт дневного режима и детализации.</p>
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-2 items-stretch px-1">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={exportShortPdf} className="p-3 bg-slate-800 text-slate-200 rounded-[1.2rem] hover:bg-slate-700 transition-all flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest text-center min-w-0"><Download size={14} /> Краткий PDF</button>
              <button onClick={exportDetailedPdf} className="p-3 bg-indigo-600 text-white rounded-[1.2rem] hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-900/20 text-center min-w-0"><Download size={14} /> Детальный PDF</button>
            </div>
            <label className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest cursor-pointer px-2 py-1 rounded-xl bg-slate-950/40 border border-slate-800/60">
              <input type="checkbox" className="w-3 h-3 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500" checked={pdfIncludeMealLog} onChange={(e) => setPdfIncludeMealLog(e.target.checked)} />
              Детально: лог еды
            </label>
          </div>
          <div className="px-2 pt-2 border-t border-slate-800/70">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Вес сегодня</div>
                <p className="mt-1 text-[11px] text-slate-500 font-semibold">Быстро записать замер в дневник.</p>
              </div>
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-300">
                <Scale size={16} />
              </div>
            </div>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_52px] gap-2 w-full">
              <div className="min-w-0 flex items-center bg-indigo-500/10 rounded-[1.5rem] px-4 py-2 border border-indigo-500/20">
                <input type="number" aria-label="Вес сегодня" placeholder="90.0" className="bg-transparent w-full text-sm focus:outline-none font-black text-indigo-100 placeholder-indigo-700 tabular-nums min-w-0" value={newWeight} onChange={e => setNewWeight(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') logWeight(); }} />
                <span className="ml-2 text-[10px] font-black uppercase tracking-widest text-indigo-300">кг</span>
              </div>
              <button onClick={logWeight} aria-label="Сохранить вес" className="shrink-0 w-[52px] h-[52px] bg-indigo-600 text-white rounded-[1.3rem] hover:bg-indigo-700 shadow-lg shadow-indigo-900/30 transition-all flex items-center justify-center"><Plus size={18} /></button>
            </div>
          </div>
        </div>
      </header>

      <section className="rounded-[2rem] md:rounded-[2.5rem] border border-slate-800 bg-slate-900/80 p-5 md:p-6 shadow-xl shadow-black/20 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-2 text-left">
            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Прогресс</div>
            <h2 className="text-xl md:text-2xl font-black text-slate-100">Фото, замеры и смарт-часы в одном месте</h2>
            <p className="max-w-3xl text-sm md:text-base font-medium text-slate-400">
              Откройте отдельный экран прогресса, чтобы увидеть динамику тела, последние замеры и синхронизацию с носимыми устройствами.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenProgress}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-indigo-200 transition-all hover:bg-indigo-500/20 hover:border-indigo-400/40"
          >
            <TrendingUp size={16} />
            Открыть прогресс
            <ArrowRight size={16} />
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Вес сейчас</div>
              <Scale size={14} className="text-indigo-300" />
            </div>
            <div className="mt-3 text-2xl font-black text-slate-100 tabular-nums">{currentWeightLabel}</div>
            <div className="mt-1 text-xs text-slate-500">Быстрый вход в дневник и историю замеров.</div>
          </div>
          <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Замеры</div>
              <Scale size={14} className="text-emerald-300" />
            </div>
            <div className="mt-3 text-2xl font-black text-slate-100 tabular-nums">{measurementsCount}</div>
            <div className="mt-1 text-xs text-slate-500">Обхваты тела и другие показатели.</div>
          </div>
          <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Фото прогресса</div>
              <Camera size={14} className="text-fuchsia-300" />
            </div>
            <div className="mt-3 text-2xl font-black text-slate-100 tabular-nums">{progressPhotosCount}</div>
            <div className="mt-1 text-xs text-slate-500">Визуальная история формы и веса.</div>
          </div>
          <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Смарт-часы</div>
              <Activity size={14} className="text-sky-300" />
            </div>
            <div className="mt-3 text-lg font-black text-slate-100">{wearableState}</div>
            <div className="mt-1 text-xs text-slate-500">{wearableDetail}</div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Шаги</div>
                <div className="mt-1 text-sm font-black text-slate-100 tabular-nums">{wearableStepsLabel}</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Активность</div>
                <div className="mt-1 text-sm font-black text-slate-100 tabular-nums">{wearableMinutesLabel}</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Сон</div>
                <div className="mt-1 text-sm font-black text-slate-100 tabular-nums">{wearableSleepLabel}</div>
              </div>
            </div>
          </div>
          <FoodStreakCard userId={currentUser?.id} foodDiary={foodDiary || []} />
        </div>
      </section>

      {plateau && currentUser?.goal === Goal.LOSS && (
        <div className="p-6 rounded-[2.5rem] border border-amber-500/30 bg-amber-500/5 backdrop-blur-md flex items-start gap-4 animate-in slide-in-from-top-4 duration-500">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0 border border-amber-500/20"><AlertTriangle size={24} /></div>
          <div className="text-left">
            <p className="text-[11px] font-black uppercase tracking-widest text-amber-500 mb-1">Обнаружено плато (28 дней анализа)</p>
            <h3 className="text-lg font-black text-slate-100">Ваш вес стабилизировался</h3>
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-black uppercase tracking-widest text-amber-200"><ShieldCheck size={14} className="text-amber-300" />Интенсивность учтена</div>
            <p className="text-sm font-medium text-slate-400 mt-2">Это естественная адаптация организма. AI-коуч подготовил для вас обновленные рекомендации в разделе «План» и ежедневных задачах.</p>
          </div>
        </div>
      )}

      <React.Suspense
        fallback={
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="bg-slate-900 p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-xl border border-slate-800 animate-pulse">
              <div className="h-6 w-40 bg-slate-800 rounded mb-6" />
              <div className="h-56 bg-slate-950 rounded-[2rem]" />
            </div>
            <div className="bg-slate-900 p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-xl border border-slate-800 animate-pulse">
              <div className="h-6 w-40 bg-slate-800 rounded mb-6" />
              <div className="space-y-3">
                <div className="h-16 bg-slate-950 rounded-[1.5rem]" />
                <div className="h-16 bg-slate-950 rounded-[1.5rem]" />
                <div className="h-16 bg-slate-950 rounded-[1.5rem]" />
              </div>
            </div>
            <div className="bg-slate-900 p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-xl border border-slate-800 animate-pulse">
              <div className="h-6 w-32 bg-slate-800 rounded mb-6" />
              <div className="h-56 bg-slate-950 rounded-[2rem]" />
            </div>
          </div>
        }
      >
        <DashboardCharts
          dailyStats={dailyStats}
          targets={targets}
          weightHistory={weightHistory || []}
          measurementsHistory={measurementsHistory}
          progressPhotos={progressPhotos}
          dailyHabits={dailyHabits}
          weightTrend={weightTrend}
          currentWeight={currentWeight}
          targetWeight={currentUser?.targetWeight ?? null}
          onToggleHabit={(habitKey) => handleToggleHabit(habitKey)}
        />
      </React.Suspense>

      <AchievementsPanel
        catalog={achievementsCatalog || []}
        unlocked={achievementsUnlocked || []}
        newlyUnlocked={achievementsNewlyUnlocked || []}
        loading={achievementsLoading}
        onDismissToast={onDismissAchievementToast}
      />

      {currentUser && canUsePro && (
        <div className="bg-slate-900 p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] shadow-xl border border-slate-800 space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-start justify-between gap-4">
            <div className="text-left">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Метаболическая адаптация</span>
              <h3 className="text-3xl font-black text-slate-100 flex items-center gap-2">
                <span className="tabular-nums">{adaptationIndex}</span>
                <span className="text-sm font-black text-slate-600">/ 100</span>
                <span className={clsx('text-sm font-black ml-4 px-3 py-1 rounded-full bg-slate-950 border border-slate-800', adaptationStatus.color)}>{adaptationStatus.label}</span>
              </h3>
              <p className="text-sm font-semibold text-slate-400 mt-2 text-left">Комплаенс: <span className="tabular-nums font-black text-slate-200">{compliancePct}%</span> · Дельта {deltaDays} дн.: <span className="tabular-nums font-black text-slate-200">{weightDeltaN.toFixed(1)} кг</span></p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400"><Activity size={28} /></div>
          </div>
          <div className="space-y-2">
            <div className="h-3 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
              <div className={clsx('h-full rounded-full transition-all duration-1000 ease-out', adaptationIndex < 35 ? 'bg-emerald-500' : adaptationIndex < 70 ? 'bg-amber-500' : 'bg-rose-500')} style={{ width: `${Math.max(4, adaptationIndex)}%` }} />
            </div>
            <div className="flex items-center justify-between text-[10px] font-black text-slate-600 uppercase tracking-widest px-1">
              <span>Низкая</span>
              <span>Средняя</span>
              <span>Высокая</span>
            </div>
          </div>
          <div className="p-6 rounded-[2rem] bg-slate-950/50 border border-slate-800 text-left">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <RefreshCcw size={16} className={clsx(refeedSuggestion.type === 'refeed' ? 'text-indigo-400' : 'text-slate-500')} />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Рекомендация AI</span>
              </div>
              {refeedDate && (<span className="text-[10px] font-black uppercase tracking-widest text-indigo-300 bg-indigo-600/10 border border-indigo-500/20 px-3 py-1 rounded-full">Рефид: {refeedDate}</span>)}
            </div>
            {refeedSuggestion.type === 'refeed' ? (
              <div className="space-y-4">
                <p className="text-sm font-bold text-slate-200 leading-relaxed">Предлагаю провести «рефид-день» завтра: <span className="font-black tabular-nums text-indigo-400">{refeedSuggestion.caloriesTomorrow}</span> ккал. Это поможет снизить адаптацию и перезагрузить метаболизм.</p>
                <button type="button" onClick={scheduleRefeedTomorrow} className="w-full py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest bg-indigo-600/10 border border-indigo-500/30 text-indigo-200 hover:bg-indigo-600 hover:text-white transition-all shadow-lg">{aiRefeedLabel}</button>
              </div>
            ) : refeedSuggestion.type === 'adjust' ? (
              <p className="text-sm font-bold text-slate-300 leading-relaxed">Мягкая адаптация: попробуйте снизить норму на <span className="font-black text-amber-400">200 ккал</span> или добавить <span className="font-black text-amber-400">+{refeedSuggestion.stepsExtra} шагов</span> в день.</p>
            ) : (
              <p className="text-sm font-bold text-slate-400 leading-relaxed italic">Динамика в норме — продолжаем текущую стратегию без изменений.</p>
            )}
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><Info size={16} className="text-indigo-400" /><span className="text-[10px] font-black uppercase tracking-widest text-slate-500">AI Интерпретация</span></div>
              <button
                type="button"
                disabled={adaptLoading}
                onClick={async () => {
                  if (!currentUser) return;
                  setLastAiAction({ feature: 'plateau', type: 'plateau', userId: currentUser.id });
                  setAdaptLoading(true);
                  const txt = await generatePlateauExplanation({
                    name: currentUser.name,
                    goal: currentUser.goal,
                    compliancePct,
                    weightDeltaN,
                    expectedN,
                    adaptationIndex,
                    suggestion: refeedSuggestion,
                  });
                  setAdaptNote(txt);
                  setAdaptLoading(false);
                }}
                className={clsx('px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95', adaptLoading ? 'opacity-60 border-slate-800 bg-slate-900' : 'border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300')}
              >
                {adaptLoading ? 'AI думает...' : 'Объяснить'}
              </button>
            </div>
            <div className="p-6 rounded-[2rem] bg-indigo-500/5 border border-indigo-500/10 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-300 select-none">
                  <input type="checkbox" className="accent-indigo-500" checked={adaptRead} onChange={(e) => setAdaptRead(e.target.checked)} />
                  Прочитано
                </label>
                {adaptNote && (
                  <button type="button" onClick={() => setAdaptExpanded(v => !v)} className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-indigo-500/20 bg-indigo-600/10 text-indigo-200 hover:bg-indigo-600 hover:text-white transition-all">
                    {adaptExpanded ? 'Свернуть' : 'Развернуть'}
                  </button>
                )}
              </div>
              <div className={clsx('text-sm font-medium leading-relaxed text-left whitespace-pre-line', adaptNote ? 'text-slate-200' : 'text-slate-500 italic')}>
                <div style={!adaptExpanded && adaptNote ? { display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : undefined}>
                  {adaptNote || 'Нажмите «Объяснить», чтобы AI интерпретировал вашу динамику веса и комплаенс режима.'}
                </div>
              </div>
              {adaptNote && adaptExpanded && (
                <div className="pt-2 flex justify-end">
                  <button type="button" onClick={() => setAdaptExpanded(false)} className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-indigo-500/20 bg-indigo-600/10 text-indigo-200 hover:bg-indigo-600 hover:text-white transition-all">Свернуть</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {weekly && canUsePro && (
        <div className="bg-gradient-to-br from-indigo-600/20 via-purple-600/20 to-rose-500/20 backdrop-blur-md p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border border-white/20 shadow-2xl space-y-6 animate-in slide-in-from-bottom-4 duration-600">
          <div className="flex items-start justify-between">
            <div className="text-left">
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300 opacity-80 block mb-1">AI-Аналитика недели (PRO)</span>
              <div className="mt-4">
                <div className="flex items-center justify-between gap-6">
                  <h3 className="text-4xl font-black text-white flex items-center gap-3">
                    <span className="tabular-nums">{weekly.wis}</span>
                    <span className="text-lg font-black text-indigo-300 opacity-50">/ 100</span>
                  </h3>
                  <span className={clsx('px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest', weekly.wis >= 80 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : weekly.wis >= 60 ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : weekly.wis >= 40 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30')}>{weekly.status}</span>
                </div>
                <div className="mt-4 h-3 rounded-full bg-white/10 overflow-hidden border border-white/10"><div className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 transition-all duration-1000 ease-out" style={{ width: `${weekly.wis}%` }} /></div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-3 shrink-0">
              <button
                type="button"
                onClick={onShareWisCard}
                disabled={shareWisState === 'busy'}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Share2 size={14} />
                {shareWisState === 'busy' ? 'Подготовка...' : 'Поделиться'}
              </button>
              <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white shadow-lg shrink-0"><BrainCircuit size={28} /></div>
            </div>
          </div>
          {shareWisMessage && (
            <div className={clsx(
              'rounded-2xl border px-4 py-3 text-sm font-semibold',
              shareWisState === 'busy'
                ? 'border-indigo-500/20 bg-indigo-500/10 text-indigo-100'
                : shareWisState === 'success'
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
                  : 'border-rose-500/20 bg-rose-500/10 text-rose-100',
            )}>
              {shareWisMessage}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-left"><p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-1">Δ 7 дней</p><p className="text-sm font-black tabular-nums text-white">{weekly.weightDelta7 > 0 ? '+' : ''}{weekly.weightDelta7.toFixed(1)} кг</p></div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-left"><p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-1">Δ 30 дней</p><p className="text-sm font-black tabular-nums text-white">{weekly.weightDelta30 > 0 ? '+' : ''}{weekly.weightDelta30.toFixed(1)} кг</p></div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-left"><p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-1">Комплаенс</p><p className="text-sm font-black tabular-nums text-white">{weekly.compliance}%</p></div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-left"><p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-1">Адаптация</p><p className="text-sm font-black tabular-nums text-white">{weekly.adaptationIndex}/100</p></div>
          </div>
          <div className="mt-2 space-y-2 text-sm font-semibold opacity-90">
            <p className="font-black text-indigo-100 flex items-center gap-2"><TrendingUp size={16} />Прогноз следующей недели: {weekly.weightDelta7 > 0 ? '+' : ''}{(weekly.weightDelta7 / 4).toFixed(2)} кг</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Интенсивность: {currentUser ? (currentUser.goal === Goal.LOSS ? `дефицит ${Number(currentUser.lossDeficit ?? 0)} ккал/день` : currentUser.goal === Goal.GAIN ? `профицит ${Number(currentUser.gainSurplus ?? 0)} ккал/день` : 'поддержание') : '—'}</p>
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/80"><ShieldCheck size={14} className="text-white/80" />Интенсивность учтена</div>
          </div>
          {weeklyReports.length > 0 && (
            <div className="mt-8 border-t border-white/10 pt-6">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/60 block mb-4">История AI-отчётов</span>
              <div className="space-y-4">
                {weeklyReports.slice().reverse().map((r, idx) => (
                  <div key={idx} className="p-5 rounded-[2rem] bg-white/5 border border-white/10 space-y-4 group hover:border-white/20 transition-all">
                    <div className="flex justify-between items-center">
                      <div className="text-left">
                        <span className="text-sm font-black text-indigo-300">{r.weekKey}</span>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/40">{new Date(r.createdAt || Date.now()).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-white tabular-nums">{r.data?.wis ?? r.wis}/100</span>
                        <p className="text-[8px] font-black uppercase tracking-widest text-white/40">WIS Score</p>
                      </div>
                    </div>
                    {r.aiText && (<p className="text-sm font-medium text-white/80 leading-relaxed text-left border-l-2 border-indigo-400/30 pl-4">{r.aiText}</p>)}
                    <button onClick={() => exportWeeklyPDF(r)} className="w-full py-3 rounded-xl bg-white/10 border border-white/10 text-white font-bold hover:bg-white/20 transition flex items-center justify-center gap-2 text-xs uppercase tracking-widest"><Download size={14} /> Экспорт в PDF</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
