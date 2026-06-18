import React from 'react';
import clsx from 'clsx';
import {
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Goal } from './types';

type MealPartsComponent = React.ComponentType<{ value: string }>;

type PlanScreenProps = {
  currentUser: any;
  planTaskDone: Record<string, boolean>;
  setPlanTaskDone: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setActiveTab: (tab: string) => void;
  setPlanIntroOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPlanRulesExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  planRulesExpanded: boolean;
  planWeekExpanded: Record<string, boolean>;
  setPlanWeekExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  weeklyMenuLoading: boolean;
  handleGenerateWeeklyMenu: () => void;
  weeklyMenuError: string | null;
  currentUserAiPlan: any;
  currentUserTargetWeight?: number | null;
  formatGramsPretty: (value: number) => string;
  MealParts: MealPartsComponent;
  cloudFamily: any;
  planScope: 'personal' | 'family';
  setPlanScope: React.Dispatch<React.SetStateAction<'personal' | 'family'>>;
  familyShoppingLoading: boolean;
  familyShopping: any;
  toggleFamilyShoppingItem: (name: string, checked: boolean) => void;
  loadFamilyShopping: () => void;
  familyMenuError: string | null;
  familyMenu: any;
  familyMenuLoading: boolean;
  setFamilyMenuPrefsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleGenerateFamilyWeeklyMenu: () => void;
  paywallPlan: string;
  allUsers: any[];
  currentUserGoal: Goal | string;
  DEFAULT_DEFICIT: number;
  DEFAULT_SURPLUS: number;
};

export default function PlanScreen({
  currentUser,
  planTaskDone,
  setPlanTaskDone,
  setActiveTab,
  setPlanIntroOpen,
  setPlanRulesExpanded,
  planRulesExpanded,
  planWeekExpanded,
  setPlanWeekExpanded,
  weeklyMenuLoading,
  handleGenerateWeeklyMenu,
  weeklyMenuError,
  currentUserAiPlan,
  currentUserTargetWeight,
  formatGramsPretty,
  MealParts,
  cloudFamily,
  planScope,
  setPlanScope,
  familyShoppingLoading,
  familyShopping,
  toggleFamilyShoppingItem,
  loadFamilyShopping,
  familyMenuError,
  familyMenu,
  familyMenuLoading,
  setFamilyMenuPrefsOpen,
  handleGenerateFamilyWeeklyMenu,
  paywallPlan,
  allUsers,
  currentUserGoal,
  DEFAULT_DEFICIT,
  DEFAULT_SURPLUS,
}: PlanScreenProps) {
  const tasks = currentUserAiPlan?.firstTasks ?? [];
  const firstThree = tasks.slice(0, 3);
  const weeklyMenu = currentUserAiPlan?.weeklyMenu;
  const rules = currentUserAiPlan?.rules ?? [];
  const [activeWeekDay, setActiveWeekDay] = React.useState<string>('');
  React.useEffect(() => {
    const nextDay = weeklyMenu?.days?.[0]?.day || '';
    if (!nextDay) return;
    setActiveWeekDay((prev) => (prev && weeklyMenu.days.some((d: any) => d.day === prev) ? prev : nextDay));
  }, [weeklyMenu?.weekStart, weeklyMenu?.days?.length]);

  const weeklyMenuDay = React.useMemo(() => {
    const days = weeklyMenu?.days ?? [];
    if (!days.length) return null;
    return days.find((d: any) => d.day === activeWeekDay) || days[0];
  }, [weeklyMenu?.days, activeWeekDay]);

  const mealTemplateFields = [
    { key: 'breakfast', label: 'Завтрак', value: currentUserAiPlan?.mealTemplate?.breakfast || '' },
    { key: 'lunch', label: 'Обед', value: currentUserAiPlan?.mealTemplate?.lunch || '' },
    { key: 'dinner', label: 'Ужин', value: currentUserAiPlan?.mealTemplate?.dinner || '' },
    { key: 'snack', label: 'Перекус', value: currentUserAiPlan?.mealTemplate?.snack || '' },
  ] as const;

  const mealShareByKey = {
    breakfast: 0.25,
    lunch: 0.35,
    dinner: 0.3,
    snack: 0.1,
  } as const;

  const mealLabels = {
    breakfast: 'Завтрак',
    lunch: 'Обед',
    dinner: 'Ужин',
    snack: 'Перекус',
  } as const;

  const cleanMealTemplateText = (label: string, value: string) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const rx = new RegExp(`^${label}\\s*[:\\-–—]?\\s*`, 'i');
    return raw.replace(rx, '').trim();
  };

  const splitMealLines = (value: string) => {
    const raw = String(value || '').trim();
    if (!raw) return [] as { text: string; qty?: string }[];

    const parts = raw
      .split(/\n+|\s*\+\s*|\s*;\s*/g)
      .map((s) => s.trim())
      .filter(Boolean);

    const rx = /^(.+?)(?:\s*[—–-]\s*|\s*\()?(\d+(?:[\.,]\d+)?)\s*(кг|г|гр|мл|л|шт|порц|порции|порция)?\s*\)?\s*$/i;

    return parts.map((part) => {
      const mm = part.match(rx);
      if (!mm) return { text: part };
      const name = (mm[1] || '').trim();
      const num = (mm[2] || '').replace(',', '.').trim();
      const unitRaw = (mm[3] || '').trim().toLowerCase();
      const unit = unitRaw === 'гр' ? 'г' : unitRaw;
      return {
        text: name || part,
        qty: unit ? `${num} ${unit}` : num,
      };
    });
  };

  const macroForMeal = (mealKey: keyof typeof mealShareByKey) => {
    const daily = currentUserAiPlan?.dailyKpi;
    if (!daily) return null;
    const share = mealShareByKey[mealKey];
    return {
      calories: Math.max(1, Math.round(Number(daily.calories || 0) * share)),
      protein: Math.max(1, Math.round(Number(daily.protein || 0) * share)),
      fat: Math.max(1, Math.round(Number(daily.fat || 0) * share)),
      carbs: Math.max(1, Math.round(Number(daily.carbs || 0) * share)),
    };
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div className="text-left">
          <h2 className="text-3xl font-black text-slate-100">Ваш AI‑план</h2>
          <p className="text-sm text-slate-400 font-semibold">Стратегия, KPI и первые шаги на неделю.</p>
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-black uppercase tracking-widest text-indigo-200">
            <ShieldCheck size={14} className="text-indigo-300" />Интенсивность учтена
          </div>
        </div>
        <button onClick={() => setPlanIntroOpen(true)} className="inline-flex items-center gap-2 px-4 py-3 rounded-[1.5rem] bg-slate-950 border border-slate-800 text-slate-200 font-black hover:border-indigo-500/30 transition-all min-h-[44px]">
          <Sparkles size={16} /> Показать кратко
        </button>
      </header>

      {!currentUserAiPlan && (
        <div className="p-6 rounded-[2rem] border border-amber-500/20 bg-amber-500/5 text-left">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-300 shrink-0"><Sparkles size={18} /></div>
            <div>
              <p className="text-sm font-black text-amber-100">План ещё подготавливается</p>
              <p className="mt-1 text-sm text-amber-200/80 font-semibold">Сначала заполните профиль и дождитесь генерации AI-плана. Пока план не готов, разделы показывают безопасные заглушки вместо пустого экрана.</p>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 md:p-6 rounded-[1.6rem] md:rounded-[2rem] bg-gradient-to-br from-indigo-600/15 via-slate-950 to-slate-950 border border-indigo-500/20 text-left">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black text-indigo-300 uppercase tracking-widest">Сегодня</p>
            <h3 className="mt-2 text-xl font-black text-white">Что важно сделать сегодня</h3>
            <p className="mt-1 text-sm text-slate-400 font-semibold">Минимум действий, которые двигают к цели и не перегружают.</p>
          </div>
          <div className="shrink-0 px-3 py-2 rounded-full bg-slate-950/70 border border-slate-800 text-[11px] font-black uppercase tracking-widest text-slate-300">
            {Object.values(planTaskDone).filter(Boolean).length}/{Math.min(3, tasks.length)} выполнено
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {firstThree.map((t: string, i: number) => {
            const key = `${i}:${t}`;
            const done = !!planTaskDone[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPlanTaskDone(prev => ({ ...prev, [key]: !prev[key] }))}
                className={clsx(
                  'min-h-[72px] w-full text-left flex items-start gap-3 p-4 rounded-[1.5rem] border transition-all active:scale-[0.99]',
                  done ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-100' : 'bg-slate-900/40 border-slate-800 text-slate-200 hover:border-indigo-500/30'
                )}
              >
                <span className={clsx('mt-0.5 w-6 h-6 rounded-full border flex items-center justify-center shrink-0', done ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300' : 'border-slate-700 text-slate-500')}>
                  {done ? <CheckCircle2 size={16} /> : <span className="w-2.5 h-2.5 rounded-full bg-current opacity-70" />}
                </span>
                <span className="font-bold leading-relaxed">{t}</span>
              </button>
            );
          })}
          {(!tasks || tasks.length === 0) && (
            <div className="p-4 rounded-[1.5rem] bg-slate-900/40 border border-slate-800 text-sm text-slate-500 font-semibold">Первые задачи появятся после генерации плана.</div>
          )}
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button type="button" onClick={() => setActiveTab('nutrition')} className="min-h-[48px] px-4 py-3 rounded-[1.3rem] bg-slate-950/70 border border-slate-800 text-slate-200 font-black text-sm hover:border-indigo-500/30 transition-all">📸 Добавить еду</button>
          <button type="button" onClick={() => setPlanRulesExpanded(v => !v)} className="min-h-[48px] px-4 py-3 rounded-[1.3rem] bg-slate-950/70 border border-slate-800 text-slate-200 font-black text-sm hover:border-indigo-500/30 transition-all">{planRulesExpanded ? 'Скрыть правила' : 'Показать правила'}</button>
          <button type="button" onClick={() => { if (window.confirm('Обновить недельное меню и список покупок?')) void handleGenerateWeeklyMenu(); }} disabled={weeklyMenuLoading || !currentUserAiPlan} className="min-h-[48px] px-4 py-3 rounded-[1.3rem] bg-indigo-600/20 border border-indigo-500/30 text-indigo-200 font-black text-sm hover:bg-indigo-600/30 disabled:opacity-50 transition-all">{weeklyMenuLoading ? 'Генерирую…' : 'Обновить план'}</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-6 rounded-[2rem] bg-slate-950 border border-slate-800 text-left">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">KPI на день</p>
          <p className="mt-2 text-2xl font-black text-white tabular-nums">{currentUserAiPlan?.dailyKpi?.calories ?? '—'} ккал</p>
          <p className="mt-1 text-sm font-black text-slate-200 tabular-nums">{currentUserAiPlan?.dailyKpi?.protein ?? '—'}Б · {currentUserAiPlan?.dailyKpi?.fat ?? '—'}Ж · {currentUserAiPlan?.dailyKpi?.carbs ?? '—'}У</p>
          <p className="mt-3 text-sm text-slate-400 font-semibold">{currentUserAiPlan?.strategySummary ?? '—'}</p>
          <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Интенсивность: {currentUser ? (currentUserGoal === Goal.LOSS ? `дефицит ${Number(currentUser.lossDeficit ?? DEFAULT_DEFICIT)} ккал/день` : currentUserGoal === Goal.GAIN ? `профицит ${Number(currentUser.gainSurplus ?? DEFAULT_SURPLUS)} ккал/день` : 'поддержание') : '—'}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-black uppercase tracking-widest">
            <span className="text-indigo-300">Фокус недели: {currentUserAiPlan?.weeklyFocus ?? '—'}</span>
            {currentUserTargetWeight ? <span className="px-3 py-1 rounded-full bg-slate-900/50 border border-slate-800 text-slate-300">Цель: {currentUserTargetWeight} кг</span> : null}
          </div>
        </div>
        <div className="p-6 rounded-[2rem] bg-slate-950 border border-slate-800 text-left">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Шаблон дня</p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm font-bold text-slate-200">
            {mealTemplateFields.map((item) => {
              const cleaned = cleanMealTemplateText(item.label, item.value);
              const lines = cleaned
                .split(/\n+/g)
                .map((line) => line.trim())
                .filter(Boolean);

              return (
                <div key={item.key} className="p-4 rounded-[1.5rem] bg-slate-900/30 border border-slate-800">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">{item.label}</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300/80">1 приём</span>
                  </div>
                  <div className="mt-3 space-y-2 text-slate-100 leading-relaxed">
                    {lines.length > 0 ? lines.map((line, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-400/80 shrink-0" />
                        <span>{line}</span>
                      </div>
                    )) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {planRulesExpanded && (
        <div className="p-5 md:p-6 rounded-[2rem] bg-slate-950 border border-slate-800 text-left">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Правила недели</p>
            <button type="button" onClick={() => setPlanRulesExpanded(false)} className="text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300">Скрыть</button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3">
            {rules.map((rule: string, idx: number) => (
              <div key={idx} className="p-4 rounded-[1.4rem] bg-slate-900/30 border border-slate-800 text-slate-200 font-bold leading-relaxed">• {rule}</div>
            ))}
            {rules.length === 0 && <div className="text-sm text-slate-500 font-semibold">Правила появятся после генерации плана.</div>}
          </div>
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => setPlanRulesExpanded(false)} className="text-[11px] font-black uppercase tracking-widest px-3 py-2 rounded-full border border-slate-700 bg-slate-900 text-slate-300 hover:border-indigo-500/30 hover:text-indigo-200 transition-all">Свернуть</button>
          </div>
        </div>
      )}

      <div className="p-6 rounded-[2rem] bg-slate-950 border border-slate-800 text-left">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Меню на неделю</p>
          <button onClick={() => { if (window.confirm('Обновить недельное меню и список покупок?')) void handleGenerateWeeklyMenu(); }} disabled={weeklyMenuLoading || !currentUserAiPlan} className="min-h-[44px] px-4 py-2 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-200 font-black text-[11px] uppercase tracking-widest hover:bg-indigo-600/30 disabled:opacity-50">{weeklyMenuLoading ? 'Генерирую…' : (weeklyMenu ? 'Обновить' : 'Сгенерировать')}</button>
        </div>
        {weeklyMenuError && (<p className="mt-3 text-xs text-amber-300 font-bold">{weeklyMenuError}</p>)}
        {weeklyMenuLoading && !weeklyMenu ? (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (<div key={i} className="p-4 rounded-[1.5rem] bg-slate-900/30 border border-slate-800 animate-pulse"><div className="h-4 w-28 rounded bg-slate-800" /><div className="mt-3 space-y-2"><div className="h-3 rounded bg-slate-800" /><div className="h-3 rounded bg-slate-800 w-5/6" /><div className="h-3 rounded bg-slate-800 w-4/6" /></div></div>))}
          </div>
        ) : weeklyMenu ? (
          <div className="mt-4 space-y-4">
            <div className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-slate-950/95 backdrop-blur border-y border-slate-800/70">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {weeklyMenu.days.map((d: any, i: number) => {
                  const active = (weeklyMenuDay?.day || weeklyMenu.days[0]?.day) === d.day;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActiveWeekDay(d.day)}
                      className={clsx(
                        'shrink-0 min-h-[42px] px-4 py-2 rounded-full border font-black text-[11px] uppercase tracking-widest transition-all whitespace-nowrap',
                        active
                          ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-100 shadow-[0_0_0_1px_rgba(129,140,248,0.18)]'
                          : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                      )}
                    >
                      {d.day}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="px-1 text-[11px] font-black uppercase tracking-widest text-slate-500">
              Выберите день выше, чтобы переключить карточку. В каждом приёме показана доля от дневного рациона и краткое резюме по БЖУ.
            </div>

            {weeklyMenuDay && (() => {
              const d = weeklyMenuDay;
              const summary = currentUserAiPlan?.dailyKpi;
              return (
                <div className="rounded-[1.7rem] border border-slate-800 bg-gradient-to-br from-slate-900/70 via-slate-950 to-slate-950 overflow-hidden">
                  <div className="p-4 md:p-5 border-b border-slate-800/70">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-widest text-indigo-300">День недели</div>
                        <h3 className="mt-1 text-2xl font-black text-white">{d.day}</h3>
                        <p className="mt-2 text-sm text-slate-400 font-semibold">Быстрый обзор: один активный день, приёмы пищи разнесены по карточкам, граммовки внутри карточки, БЖУ в шапке.</p>
                      </div>
                      {summary && (
                        <div className="grid grid-cols-2 gap-2 min-w-[240px]">
                          <div className="p-3 rounded-[1.1rem] bg-slate-900/60 border border-slate-800">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Итого</div>
                            <div className="mt-1 text-xl font-black text-white tabular-nums">{summary.calories} ккал</div>
                          </div>
                          <div className="p-3 rounded-[1.1rem] bg-slate-900/60 border border-slate-800">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Б/Ж/У</div>
                            <div className="mt-1 text-sm font-black text-white tabular-nums">{summary.protein}Б · {summary.fat}Ж · {summary.carbs}У</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-4 md:p-5 space-y-3">
                    {([
                      ['breakfast', d.breakfast],
                      ['lunch', d.lunch],
                      ['dinner', d.dinner],
                      ['snack', d.snack],
                    ] as const).map(([mealKey, mealText]) => {
                      const macros = macroForMeal(mealKey);
                      const lines = splitMealLines(cleanMealTemplateText(mealLabels[mealKey], mealText));
                      const share = mealShareByKey[mealKey];

                      return (
                        <div key={mealKey} className="rounded-[1.35rem] border border-slate-800 bg-slate-950/60 overflow-hidden">
                          <div className="px-4 py-3 border-b border-slate-800/60 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-base font-black text-white">{mealLabels[mealKey]}</span>
                                <span className="px-2 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-black uppercase tracking-widest text-indigo-200">
                                  Доля дня {Math.round(share * 100)}%
                                </span>
                              </div>
                            </div>
                            {macros && (
                              <div className="flex flex-wrap justify-start md:justify-end gap-2">
                                <span className="px-2.5 py-1 rounded-full bg-slate-900/70 border border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-300 tabular-nums">Ккал {macros.calories}</span>
                                <span className="px-2.5 py-1 rounded-full bg-slate-900/70 border border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-300 tabular-nums">Б {macros.protein}</span>
                                <span className="px-2.5 py-1 rounded-full bg-slate-900/70 border border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-300 tabular-nums">Ж {macros.fat}</span>
                                <span className="px-2.5 py-1 rounded-full bg-slate-900/70 border border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-300 tabular-nums">У {macros.carbs}</span>
                              </div>
                            )}
                          </div>

                          <div className="p-4">
                            <div className="grid grid-cols-1 gap-2">
                              {lines.length > 0 ? lines.map((line, idx) => (
                                <div
                                  key={idx}
                                  className={clsx(
                                    'flex items-start justify-between gap-3 rounded-[1rem] border px-3 py-2',
                                    idx === 0
                                      ? 'bg-emerald-500/6 border-emerald-500/20'
                                      : 'bg-amber-500/6 border-amber-500/20'
                                  )}
                                >
                                  <div className="min-w-0">
                                    <div className={clsx('text-[11px] font-black uppercase tracking-widest', idx === 0 ? 'text-emerald-300' : 'text-amber-300')}>{idx === 0 ? 'Блюдо' : 'Дополнение'}</div>
                                    <div className="mt-1 text-sm font-semibold text-slate-100 leading-relaxed break-words">{line.text}</div>
                                  </div>
                                  {line.qty ? <div className="shrink-0 text-[11px] font-black uppercase tracking-widest text-slate-300 tabular-nums whitespace-nowrap">{line.qty}</div> : null}
                                </div>
                              )) : (
                                <div className="rounded-[1rem] bg-slate-900/35 border border-slate-800 px-3 py-3 text-sm text-slate-500 font-semibold">Описание меню отсутствует.</div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500 font-semibold">Нажмите «Сгенерировать», чтобы получить меню на 7 дней и список покупок.</p>
        )}
      </div>

      {(cloudFamily?.id || (paywallPlan === 'family' && allUsers.length > 1)) && (
        <div className="mt-6 p-6 rounded-[2rem] bg-slate-950 border border-slate-800 text-left">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Семейное меню на неделю</p>
              <p className="mt-1 text-xs text-slate-500 font-semibold">Одна готовка для всех + порции под разные калории. Исключения учитываются.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setFamilyMenuPrefsOpen(true)} disabled={!currentUserAiPlan || familyMenuLoading} className="px-4 py-2 rounded-full bg-slate-900 border border-slate-800 text-slate-200 font-black text-[11px] uppercase tracking-widest hover:border-indigo-500/30 disabled:opacity-50">Параметры</button>
              <button onClick={handleGenerateFamilyWeeklyMenu} disabled={familyMenuLoading || !currentUserAiPlan} className="px-4 py-2 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-200 font-black text-[11px] uppercase tracking-widest hover:bg-indigo-600/30 disabled:opacity-50">{familyMenuLoading ? 'Генерирую…' : (familyMenu ? 'Обновить' : 'Сгенерировать')}</button>
            </div>
          </div>
          {familyMenuError && (<p className="mt-3 text-xs text-amber-300 font-bold">{familyMenuError}</p>)}
          {familyMenu ? (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {familyMenu.days.map((d: any, i: number) => (
                <div key={i} className="p-4 rounded-[1.5rem] bg-slate-900/30 border border-slate-800">
                  <div className="text-slate-200 font-black mb-2">{d.day}</div>
                  {([['Завтрак', d.breakfast], ['Обед', d.lunch], ['Ужин', d.dinner], ['Перекус', d.snack]] as const).map(([label, meal], j) => (
                    <div key={j} className="mt-2 text-xs text-slate-300 font-semibold">
                      <div><span className="text-slate-500 font-black">{label}:</span> <MealParts value={meal.base} /></div>
                      <div className="mt-1 pl-3 space-y-0.5">
                        {Object.entries(meal.portions || {}).map(([pid, ptxt]) => {
                          const person = allUsers.find((u) => u.id === pid);
                          const nm = person?.name || (pid === currentUser?.id ? 'Вы' : pid);
                          if (!ptxt) return null;
                          return <div key={pid} className="text-[11px] text-slate-400"><span className="text-slate-500 font-black">{nm}:</span> <MealParts value={String(ptxt)} /></div>;
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500 font-semibold">Нажмите «Сгенерировать», чтобы получить семейное меню на 7 дней и список покупок.</p>
          )}
          {(familyMenu?.shoppingListItems?.length || familyMenu?.shoppingList?.length) && (
            <div className="mt-4 p-4 rounded-[1.5rem] bg-slate-900/30 border border-slate-800">
              <div className="text-slate-200 font-black mb-2">Список покупок (семья)</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm font-bold text-slate-200">
                {(familyMenu?.shoppingListItems || []).length
                  ? familyMenu.shoppingListItems.slice(0, 40).map((it: any, i: number) => (
                      <div key={i} className="p-3 rounded-[1.2rem] bg-slate-950/40 border border-slate-800 flex items-center justify-between gap-3">
                        <span className="truncate">• {it.name}</span>
                        <span className="text-slate-400 tabular-nums">{formatGramsPretty(it.grams)}</span>
                      </div>
                    ))
                  : familyMenu.shoppingList.slice(0, 40).map((s: string, i: number) => (
                      <div key={i} className="p-3 rounded-[1.2rem] bg-slate-950/40 border border-slate-800">• {s}</div>
                    ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-6" />
      <div className="p-6 rounded-[2rem] bg-slate-950 border border-slate-800 text-left">
        <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Правила</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
          {rules.slice(0, 6).map((r: string, i: number) => (<div key={i} className="p-4 rounded-[1.5rem] bg-slate-900/30 border border-slate-800 text-slate-200 font-bold">• {r}</div>))}
        </div>
      </div>
    </div>
  );
}
