import React, { useMemo } from 'react';
import clsx from 'clsx';
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Crown,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { calculateBMR, calculateDailyTargets, calculateTDEE } from './profileMath';
import { DEFAULT_DEFICIT, DEFAULT_SURPLUS, AGGRESSIVE_DEFICIT, AGGRESSIVE_SURPLUS, MIN_DEFICIT, MIN_SURPLUS, MAX_DEFICIT, MAX_SURPLUS } from './constants';
import { Gender, Goal, TariffPlan, type ActivityLevel } from './types';

type ActivationStep = {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

export type RegistrationData = {
  name: string;
  gender: Gender;
  weight: number;
  height: number;
  age: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  targetWeight: number;
  dietary: {
    allergens: string[];
    intolerances: string[];
    excludedFoods: string[];
    severity: 'strict' | 'avoid';
    notes: string;
  };
  medicalRestrictions: string;
  bloodPressureSystolic: number;
  bloodPressureDiastolic: number;
  restingPulse: number;
  waistCm: number;
  chestCm: number;
  hipsCm: number;
  plan: TariffPlan;
  lossDeficit?: number;
  gainSurplus?: number;
  riskAckLoss?: boolean;
  riskAckGain?: boolean;
};

type RegistrationScreenProps = {
  regData: RegistrationData;
  setRegData: React.Dispatch<React.SetStateAction<RegistrationData>>;
  onboardingStep: 1 | 2;
  setOnboardingStep: React.Dispatch<React.SetStateAction<1 | 2>>;
  isActivatingPlan: boolean;
  activationStep: number;
  activationSteps: ActivationStep[];
  activationTotalMs: number;
  handleActivateWithTransition: () => void;
};

export default function RegistrationScreen({
  regData,
  setRegData,
  onboardingStep,
  setOnboardingStep,
  isActivatingPlan,
  activationStep,
  activationSteps,
  activationTotalMs,
  handleActivateWithTransition,
}: RegistrationScreenProps) {
  const regBMI = useMemo(() => {
    const h = Number(regData.height) || 0;
    const w = Number(regData.weight) || 0;
    if (!h || !w) return 0;
    const m = h / 100;
    return w / (m * m);
  }, [regData.height, regData.weight]);

  const regBMR = useMemo(() => {
    return Math.round(calculateBMR({ gender: regData.gender, weight: regData.weight, height: regData.height, age: regData.age }));
  }, [regData.gender, regData.weight, regData.height, regData.age]);

  const regTDEE = useMemo(() => {
    return Math.round(calculateTDEE({
      gender: regData.gender,
      weight: regData.weight,
      height: regData.height,
      age: regData.age,
      activityLevel: regData.activityLevel,
      adaptationMultiplier: 1,
      goal: regData.goal,
      lossDeficit: regData.lossDeficit,
      gainSurplus: regData.gainSurplus,
    }));
  }, [regData]);

  const regTargets = useMemo(() => {
    return calculateDailyTargets({
      gender: regData.gender,
      weight: regData.weight,
      height: regData.height,
      age: regData.age,
      activityLevel: regData.activityLevel,
      adaptationMultiplier: 1,
      goal: regData.goal,
      lossDeficit: regData.lossDeficit,
      gainSurplus: regData.gainSurplus,
    });
  }, [regData]);

  const aiRecommendedGoal: Goal = useMemo(() => {
    if (!regBMI) return regData.goal;
    if (regBMI >= 27) return Goal.LOSS;
    if (regBMI <= 20) return Goal.GAIN;
    return Goal.MAINTAIN;
  }, [regBMI, regData.goal]);

  const forecast = useMemo(() => {
    if (!regData.weight || !regTargets.calories) return null;
    const deficit = regData.goal === Goal.LOSS ? -Number(regData.lossDeficit || DEFAULT_DEFICIT) : regData.goal === Goal.GAIN ? Number(regData.gainSurplus || DEFAULT_SURPLUS) : 0;
    const weeklyDeltaKg = (deficit * 7) / 7700;
    return {
      week4Weight: (regData.weight + weeklyDeltaKg * 4).toFixed(1),
      weeklyDelta: (weeklyDeltaKg > 0 ? '+' : '') + weeklyDeltaKg.toFixed(2),
    };
  }, [regData.weight, regData.goal, regTargets.calories, regData.lossDeficit, regData.gainSurplus]);

  const regNameTrim = (regData.name ?? '').trim();
  const regNameValid = regNameTrim.length > 0;
  const regStep1Valid = (Number(regData.weight) > 0) && (Number(regData.height) > 0) && (Number(regData.age) > 0);

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden text-left">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full bg-indigo-600/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-28 w-[560px] h-[560px] rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.12),transparent_55%)]" />
      </div>

      <div className="fixed inset-0 bg-black/55 backdrop-blur-md" />

      {isActivatingPlan && (
        <div className="fixed inset-0 z-[2000] bg-slate-950/70 backdrop-blur-2xl flex items-center justify-center p-4">
          <div className="w-full max-w-[560px] rounded-[2.5rem] border border-indigo-500/20 bg-gradient-to-b from-slate-950/80 to-slate-950/55 shadow-2xl shadow-indigo-950/40 overflow-hidden">
            <div className="h-[6px] bg-gradient-r from-indigo-500/0 via-indigo-400/50 to-violet-400/0" />
            <div className="p-7 sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-600/15 border border-indigo-500/25 grid place-items-center">
                    {React.createElement(activationSteps[activationStep]?.icon ?? Sparkles, { size: 18, className: 'text-indigo-300' })}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">AI Инициализация</p>
                    <p className="text-base sm:text-lg font-black text-white truncate">{activationSteps[activationStep]?.title ?? 'AI анализирует…'}</p>
                    <p className="text-sm font-semibold text-slate-400 mt-0.5">{activationSteps[activationStep]?.subtitle ?? 'Подготавливаем персональную стратегию'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-200/90 bg-indigo-600/10 border border-indigo-500/20 px-2 py-1 rounded-full">
                    {Math.min(100, Math.round(((activationStep + 1) / activationSteps.length) * 100))}%
                  </span>
                </div>
              </div>
              <div className="mt-5">
                <div className="h-2 rounded-full bg-slate-900/60 border border-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-400 shadow-[0_0_30px_rgba(99,102,241,0.35)] transition-all duration-700"
                    style={{ width: `${Math.min(100, Math.round(((activationStep + 1) / activationSteps.length) * 100))}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-slate-500">
                  <span>Шаг {Math.min(activationSteps.length, activationStep + 1)} из {activationSteps.length}</span>
                  <span className="tabular-nums">{(activationTotalMs / 1000).toFixed(1)}s</span>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">BMR</p><p className="mt-1 text-sm font-black text-white tabular-nums">{regBMR || '—'}</p></div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">TDEE</p><p className="mt-1 text-sm font-black text-white tabular-nums">{regTDEE || '—'}</p></div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">KPI</p><p className="mt-1 text-sm font-black text-white tabular-nums">{regTargets?.calories ?? '—'}</p></div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Готово</p><p className="mt-1 text-sm font-black text-indigo-200 flex items-center gap-2"><CheckCircle2 size={16} className="text-indigo-300" /><span className="tabular-nums">{Math.min(100, Math.round(((activationStep + 1) / activationSteps.length) * 100))}%</span></p></div>
              </div>
              <div className="mt-6 text-xs text-slate-500 font-semibold">Нажимая «Создать AI‑план», вы запускаете персональную модель — можно изменить цель и тариф позже.</div>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center p-4">
        <div className="relative w-full md:max-w-4xl bg-slate-900/90 rounded-t-[2.75rem] md:rounded-[3rem] p-6 md:p-10 shadow-2xl space-y-6 border border-slate-800/70 backdrop-blur-xl max-h-[95vh] overflow-y-auto overflow-x-hidden scrollbar-hide">
          <div className="flex justify-center -mt-2 md:hidden mb-4"><div className="w-12 h-1.5 rounded-full bg-slate-700/70" /></div>
          <div className="text-center space-y-3">
            <div className="relative inline-flex w-14 h-14 mx-auto items-center justify-center">
              <div className="absolute inset-0 rounded-[1.25rem] overflow-hidden pointer-events-none"><div className="absolute inset-[-200%] bg-[conic-gradient(from_0deg,transparent_85%,#818cf8_98%,transparent_100%)] animate-spin" style={{ animationDuration: '3s' }} /></div>
              <div className="absolute inset-[2px] bg-slate-900 rounded-[1.1rem] z-0" />
              <div className="relative w-[48px] h-[48px] bg-indigo-600 rounded-[1rem] flex items-center justify-center text-white font-black text-xl shadow-2xl animate-pulse">FF</div>
            </div>
            <h1 className="text-xl md:text-2xl font-black text-slate-100 tracking-tight">Настроим ваш персональный AI‑план</h1>
            <p className="text-[10px] md:text-xs text-slate-400 font-semibold max-w-xs mx-auto">Мы рассчитаем метаболизм, цель и дневные KPI на основе ваших данных.</p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-[10px] font-black text-slate-50 uppercase tracking-widest">
              <span className={clsx('w-2 h-2 rounded-full', onboardingStep === 1 ? 'bg-indigo-400' : 'bg-slate-700')} />
              <span className={clsx('w-2 h-2 rounded-full', onboardingStep === 2 ? 'bg-indigo-400' : 'bg-slate-700')} />
              <span>Шаг {onboardingStep} из 2</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {onboardingStep === 1 ? (
              <div className="space-y-4 md:col-span-2 max-w-md mx-auto w-full">
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex items-center justify-between p-4 bg-slate-950 rounded-[1.25rem] border border-slate-800"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Вес (кг)</label><input type="number" inputMode="numeric" className="w-20 bg-transparent text-right font-black text-white tabular-nums outline-none text-base" value={regData.weight} onChange={e => setRegData({...regData, weight: Math.max(0, Number(e.target.value) || 0)})} /></div>
                  <div className="flex items-center justify-between p-4 bg-slate-950 rounded-[1.25rem] border border-slate-800"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Рост (см)</label><input type="number" inputMode="numeric" className="w-20 bg-transparent text-right font-black text-white tabular-nums outline-none text-base" value={regData.height} onChange={e => setRegData({...regData, height: Math.max(0, Number(e.target.value) || 0)})} /></div>
                  <div className="flex items-center justify-between p-4 bg-slate-950 rounded-[1.25rem] border border-slate-800"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Возраст</label><input type="number" inputMode="numeric" className="w-20 bg-transparent text-right font-black text-white tabular-nums outline-none text-base" value={regData.age} onChange={e => setRegData({...regData, age: Math.max(0, Math.floor(Number(e.target.value) || 0))})} /></div>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Пол</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[{ id: Gender.MALE, label: 'Мужской' }, { id: Gender.FEMALE, label: 'Женский' }].map(g => (
                      <button key={g.id} onClick={() => setRegData({...regData, gender: g.id})} className={clsx('w-full p-4 text-center rounded-[1.25rem] border text-xs font-black transition-all', regData.gender === g.id ? 'bg-indigo-600/10 border-indigo-500 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-500')}>{g.label}</button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Имя профиля</label><input type="text" className={clsx('w-full p-3.5 bg-slate-950 rounded-[1.25rem] border outline-none transition-all font-bold text-white placeholder:text-slate-500 text-sm', !regNameValid ? 'border-amber-500/40' : 'border-slate-800')} value={regData.name} onChange={e => setRegData(prev => ({...prev, name: e.target.value}))} placeholder="Наталья" /></div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Ваша цель</label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {[{ id: Goal.LOSS, label: 'Похудение' }, { id: Goal.MAINTAIN, label: 'Поддержание' }, { id: Goal.GAIN, label: 'Набор' }].map(g => (
                        <button key={g.id} onClick={() => setRegData({...regData, goal: g.id})} className={clsx('w-full p-2.5 text-left rounded-[1rem] border text-xs font-black transition-all', regData.goal === g.id ? 'bg-indigo-600/10 border-indigo-500 text-indigo-200' : 'bg-slate-950 border-slate-800 text-slate-500')}>
                          <div className="flex items-center justify-between"><span>{g.label}</span>{aiRecommendedGoal === g.id && <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-indigo-600/15 border border-indigo-500/30 text-indigo-300 font-black uppercase tracking-widest">AI Рекомендует</span>}</div>
                        </button>
                      ))}
                    </div>

                    {(regData.goal === Goal.LOSS || regData.goal === Goal.GAIN) && (
                      <div className="space-y-2 mt-4 p-4 rounded-[1.5rem] bg-slate-950 border border-slate-800 animate-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center justify-between ml-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Интенсивность цели</label>
                          <button
                            type="button"
                            onClick={() => {
                              const tdee = calculateTDEE({ ...regData, adaptationMultiplier: 1.0 });
                              if (!isFinite(tdee)) return;
                              if (regData.goal === Goal.LOSS) {
                                const rec = Math.max(MIN_DEFICIT, Math.min(Math.min(500, Math.round((tdee * 0.2) / 50) * 50), MAX_DEFICIT));
                                setRegData({ ...regData, lossDeficit: rec, riskAckLoss: false });
                              }
                              if (regData.goal === Goal.GAIN) {
                                const rec = Math.max(MIN_SURPLUS, Math.min(Math.min(300, Math.round((tdee * 0.1) / 50) * 50), MAX_SURPLUS));
                                setRegData({ ...regData, gainSurplus: rec, riskAckGain: false });
                              }
                            }}
                            className="text-[10px] font-black px-2 py-1 rounded-full border border-slate-800 bg-slate-950 text-slate-300 hover:border-indigo-500/30"
                          >
                            Рекомендовать
                          </button>
                        </div>
                        {regData.goal === Goal.LOSS ? (
                          <div className="grid grid-cols-3 gap-2">
                            {[250, 500, 750].map(v => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => setRegData(prev => ({ ...prev, lossDeficit: v }))}
                                className={clsx(
                                  'w-full p-3 text-center rounded-[1rem] border text-[10px] font-black transition-all',
                                  Number(regData.lossDeficit || DEFAULT_DEFICIT) === v
                                    ? 'bg-rose-600/10 border-rose-500 text-rose-200'
                                    : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-rose-500/30'
                                )}
                              >
                                -{v} ккал
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-2">
                            {[150, 300, 500].map(v => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => setRegData(prev => ({ ...prev, gainSurplus: v }))}
                                className={clsx(
                                  'w-full p-3 text-center rounded-[1rem] border text-[10px] font-black transition-all',
                                  Number(regData.gainSurplus || DEFAULT_SURPLUS) === v
                                    ? 'bg-emerald-600/10 border-emerald-500 text-emerald-200'
                                    : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-rose-500/30'
                                )}
                              >
                                +{v} ккал
                              </button>
                            ))}
                          </div>
                        )}
                        {(() => {
                          const ready = regData.weight && regData.height && regData.age && regData.activityLevel;
                          if (!ready) return null;
                          const tdee = calculateTDEE({
                            gender: regData.gender,
                            weight: Number(regData.weight),
                            height: Number(regData.height),
                            age: Number(regData.age),
                            activityLevel: regData.activityLevel,
                            goal: regData.goal,
                            adaptationMultiplier: 1.0,
                            lossDeficit: Number(regData.lossDeficit ?? DEFAULT_DEFICIT),
                            gainSurplus: Number(regData.gainSurplus ?? DEFAULT_SURPLUS),
                            riskAcknowledgedLoss: !!(regData as any).riskAckLoss,
                            riskAcknowledgedGain: !!(regData as any).riskAckGain,
                          } as any);
                          const off = regData.goal === Goal.LOSS
                            ? Number(regData.lossDeficit ?? DEFAULT_DEFICIT)
                            : regData.goal === Goal.GAIN
                              ? Number(regData.gainSurplus ?? DEFAULT_SURPLUS)
                              : 0;
                          const limit = regData.goal === Goal.LOSS ? Math.min(AGGRESSIVE_DEFICIT, Math.round(tdee * 0.3)) : AGGRESSIVE_SURPLUS;
                          const tooAggressive = (regData.goal === Goal.LOSS && off > limit) || (regData.goal === Goal.GAIN && off > limit);
                          if (!tooAggressive) return null;
                          return (
                            <div className="mt-2 p-3 rounded-[1rem] bg-amber-500/5 border border-amber-500/20 flex items-start gap-2">
                              <AlertTriangle size={16} className="text-amber-400 mt-0.5" />
                              <div className="text-left text-[11px] text-amber-200 font-semibold leading-snug">
                                Слишком агрессивная интенсивность для вашего TDEE (~{Math.round(tdee)} ккал/день). Рекомендуем не превышать {limit} ккал/день.
                              </div>
                            </div>
                          );
                        })()}
                        {(() => {
                          const ready = regData.weight && regData.height && regData.age && regData.activityLevel;
                          if (!ready) return null;
                          const tdee = calculateTDEE({ ...regData, adaptationMultiplier: 1.0 });
                          if (!isFinite(tdee)) return null;
                          const limit = regData.goal === Goal.LOSS ? Math.min(AGGRESSIVE_DEFICIT, Math.round(tdee * 0.3)) : AGGRESSIVE_SURPLUS;
                          const val = regData.goal === Goal.LOSS ? Number(regData.lossDeficit ?? DEFAULT_DEFICIT) : Number(regData.gainSurplus ?? DEFAULT_SURPLUS);
                          const isAggressive = (regData.goal === Goal.LOSS && val > limit) || (regData.goal === Goal.GAIN && val > limit);
                          if (!isAggressive) return null;
                          const ackKey = regData.goal === Goal.LOSS ? 'riskAckLoss' : 'riskAckGain';
                          const ack = (regData as any)[ackKey];
                          return (
                            <label className="mt-2 flex items-start gap-2 p-3 rounded-[1rem] bg-slate-950 border border-slate-800 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!ack}
                                onChange={(e) => setRegData({ ...regData, [ackKey]: e.target.checked } as any)}
                                className="mt-0.5"
                              />
                              <div className="text-[11px] text-slate-300 font-semibold leading-snug">
                                Я понимаю риски агрессивной интенсивности и хочу продолжить.
                              </div>
                            </label>
                          );
                        })()}
                        <div className="text-[10px] text-slate-600 font-semibold mt-1 px-1">
                          Выбор влияет на прогноз, WIS и «ожидаемое» изменение веса.
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 mt-6">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Аллергены и непереносимость</label>
                    <div className="p-4 rounded-[1.5rem] bg-slate-950 border border-slate-800 space-y-3">
                      <div className="text-xs text-slate-400 font-semibold">
                        Эти ограничения будут учитываться при генерации недельного меню (в том числе общего меню на семью).
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {[
                          'орехи',
                          'молоко/лактоза',
                          'яйца',
                          'рыба/морепродукты',
                          'глютен',
                          'соя',
                          'арахис',
                          'кунжут',
                        ].map(tag => {
                          const selected = (regData.dietary?.allergens || []).includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => {
                                const prev = regData.dietary || { allergens: [], intolerances: [], excludedFoods: [], severity: 'strict', notes: '' };
                                const next = selected
                                  ? prev.allergens.filter(x => x !== tag)
                                  : [...prev.allergens, tag];
                                setRegData(r => ({ ...r, dietary: { ...prev, allergens: next } }));
                              }}
                              className={clsx(
                                'px-3 py-2 rounded-[1rem] border text-xs font-black transition-all text-left',
                                selected ? 'bg-rose-500/10 border-rose-400/40 text-rose-200' : 'bg-slate-900/30 border-slate-800 text-slate-400 hover:border-slate-700'
                              )}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Что избегать (непереносимость / предпочтение)</label>
                          <input
                            type="text"
                            value={(regData.dietary?.intolerances || []).join(', ')}
                            onChange={(e) => {
                              const prev = regData.dietary || { allergens: [], intolerances: [], excludedFoods: [], severity: 'strict', notes: '' };
                              const next = e.target.value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 20);
                              setRegData(r => ({ ...r, dietary: { ...prev, intolerances: next } }));
                            }}
                            placeholder="например: лук, чеснок, острое"
                            className="w-full p-3.5 bg-slate-950 rounded-[1.25rem] border border-slate-800 outline-none transition-all font-bold text-white placeholder:text-slate-600 text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Не ем совсем</label>
                          <input
                            type="text"
                            value={(regData.dietary?.excludedFoods || []).join(', ')}
                            onChange={(e) => {
                              const prev = regData.dietary || { allergens: [], intolerances: [], excludedFoods: [], severity: 'strict', notes: '' };
                              const next = e.target.value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 20);
                              setRegData(r => ({ ...r, dietary: { ...prev, excludedFoods: next } }));
                            }}
                            placeholder="например: свинина, грибы"
                            className="w-full p-3.5 bg-slate-950 rounded-[1.25rem] border border-slate-800 outline-none transition-all font-bold text-white placeholder:text-slate-600 text-sm"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Строгость</label>
                        {[
                          { id: 'strict', label: 'Строго' },
                          { id: 'avoid', label: 'По возможности' },
                        ].map(opt => {
                          const selected = (regData.dietary?.severity || 'strict') === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                const prev = regData.dietary || { allergens: [], intolerances: [], excludedFoods: [], severity: 'strict', notes: '' };
                                setRegData(r => ({ ...r, dietary: { ...prev, severity: opt.id as any } }));
                              }}
                              className={clsx(
                                'px-3 py-1.5 rounded-full border text-[10px] font-black transition-all',
                                selected ? 'bg-indigo-600/10 border-indigo-500/40 text-indigo-200' : 'bg-slate-900/30 border-slate-800 text-slate-400 hover:border-slate-700'
                              )}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Медицинские ограничения</label>
                    <div className="p-4 rounded-[1.5rem] bg-slate-950 border border-slate-800 space-y-3">
                      <div className="text-xs text-slate-400 font-semibold">
                        Укажите диагнозы, травмы, лекарства, противопоказания к нагрузке или питанию. Это поможет AI не советовать лишнее.
                      </div>
                      <textarea
                        value={regData.medicalRestrictions || ''}
                        onChange={(e) => setRegData(prev => ({ ...prev, medicalRestrictions: e.target.value }))}
                        placeholder="например: гипертония 1 степени, травма колена, не назначать высокоинтенсивные тренировки"
                        className="w-full min-h-[96px] p-3.5 bg-slate-950 rounded-[1.25rem] border border-slate-800 outline-none transition-all font-bold text-white placeholder:text-slate-600 text-sm resize-y"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Давление и пульс</label>
                    <div className="p-4 rounded-[1.5rem] bg-slate-950 border border-slate-800 space-y-3">
                      <div className="text-xs text-slate-400 font-semibold">
                        Эти значения помогут AI аккуратнее подбирать нагрузку и рекомендации по восстановлению.
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <label className="space-y-1">
                          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Систолическое</div>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={regData.bloodPressureSystolic || ''}
                            onChange={(e) => setRegData(prev => ({ ...prev, bloodPressureSystolic: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                            placeholder="120"
                            className="w-full p-3.5 bg-slate-950 rounded-[1.25rem] border border-slate-800 outline-none transition-all font-bold text-white placeholder:text-slate-600 text-sm"
                          />
                        </label>
                        <label className="space-y-1">
                          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Диастолическое</div>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={regData.bloodPressureDiastolic || ''}
                            onChange={(e) => setRegData(prev => ({ ...prev, bloodPressureDiastolic: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                            placeholder="80"
                            className="w-full p-3.5 bg-slate-950 rounded-[1.25rem] border border-slate-800 outline-none transition-all font-bold text-white placeholder:text-slate-600 text-sm"
                          />
                        </label>
                        <label className="space-y-1">
                          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Пульс покоя</div>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={regData.restingPulse || ''}
                            onChange={(e) => setRegData(prev => ({ ...prev, restingPulse: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                            placeholder="60"
                            className="w-full p-3.5 bg-slate-950 rounded-[1.25rem] border border-slate-800 outline-none transition-all font-bold text-white placeholder:text-slate-600 text-sm"
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Обхваты тела</label>
                    <div className="p-4 rounded-[1.5rem] bg-slate-950 border border-slate-800 space-y-3">
                      <div className="text-xs text-slate-400 font-semibold">
                        Базовые замеры помогут отслеживать композицию тела, а не только вес.
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <label className="space-y-1">
                          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Талия</div>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={regData.waistCm || ''}
                            onChange={(e) => setRegData(prev => ({ ...prev, waistCm: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                            placeholder="80"
                            className="w-full p-3.5 bg-slate-950 rounded-[1.25rem] border border-slate-800 outline-none transition-all font-bold text-white placeholder:text-slate-600 text-sm"
                          />
                        </label>
                        <label className="space-y-1">
                          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Грудь</div>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={regData.chestCm || ''}
                            onChange={(e) => setRegData(prev => ({ ...prev, chestCm: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                            placeholder="95"
                            className="w-full p-3.5 bg-slate-950 rounded-[1.25rem] border border-slate-800 outline-none transition-all font-bold text-white placeholder:text-slate-600 text-sm"
                          />
                        </label>
                        <label className="space-y-1">
                          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Бедра</div>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={regData.hipsCm || ''}
                            onChange={(e) => setRegData(prev => ({ ...prev, hipsCm: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                            placeholder="100"
                            className="w-full p-3.5 bg-slate-950 rounded-[1.25rem] border border-slate-800 outline-none transition-all font-bold text-white placeholder:text-slate-600 text-sm"
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Тариф</label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {[
                        { id: 'free' as TariffPlan, label: 'Free', hint: 'AI лимиты' },
                        { id: 'pro' as TariffPlan, label: 'Pro', hint: 'Без лимит + PDF' },
                        { id: 'family' as TariffPlan, label: 'Family', hint: '5 профилей' },
                      ].map(p => (
                        <button key={p.id} onClick={() => setRegData({ ...regData, plan: p.id })} className={clsx('w-full p-2.5 text-left rounded-[1rem] border text-xs font-black transition-all', regData.plan === p.id ? 'bg-indigo-600/10 border-indigo-500 text-indigo-200' : 'bg-slate-950 border-slate-800 text-slate-500')}>
                          <div className="flex items-center justify-between"><div className="flex items-center gap-2">{p.id === 'pro' && <Crown size={12} className="text-indigo-300" />}{p.id === 'family' && <Users size={12} className="text-indigo-300" />}<span>{p.label}</span></div><span className="text-[7px] px-1.5 py-0.5 rounded-full bg-slate-900/40 border border-slate-800 text-slate-400 uppercase tracking-widest">{p.hint}</span></div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="p-4 rounded-[1.5rem] bg-slate-950 border border-slate-800 shadow-xl">
                    <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">AI Расчёт</p><span className="ff-ai-pill !py-0.5 !px-2"><BrainCircuit size={10} className="text-indigo-300" /><span className="ff-ai-pill__text !text-[7px]">анализ</span></span></div><p className="text-[9px] font-black text-slate-600 uppercase tabular-nums">BMI {regBMI ? regBMI.toFixed(1) : '—'}</p></div>
                    <div className="grid grid-cols-2 gap-2 mb-3"><div className="rounded-[1rem] bg-slate-900/40 p-3 border border-slate-800"><p className="text-[8px] font-black text-slate-500 uppercase">BMR</p><p className="text-lg font-black text-white">{regBMR}</p></div><div className="rounded-[1rem] bg-slate-900/40 p-3 border border-slate-800"><p className="text-[8px] font-black text-slate-500 uppercase">TDEE</p><p className="text-lg font-black text-white">{regTDEE}</p></div></div>
                    <div className="p-3 rounded-[1rem] bg-indigo-500/5 border border-indigo-500/20"><p className="text-[8px] font-black text-indigo-400 uppercase mb-1">Цель на день</p><div className="text-sm font-bold text-slate-300 mt-2">{regTargets.calories} ккал<div className="mt-1 text-slate-400 text-xs font-semibold tabular-nums">{regTargets.protein} г белка • {regTargets.fat} г жиров • {regTargets.carbs} г углеводов</div></div><div className="mt-4 text-[11px] text-slate-500 leading-relaxed font-medium">Расчёт выполнен по формуле <span className="text-slate-400 font-semibold">Миффлина–Сан Жеора</span>.<br />TDEE = BMR × коэффициент активности.<br />Стратегия: {regData.goal === Goal.LOSS ? `дефицит ${regData.lossDeficit} ккал` : regData.goal === Goal.GAIN ? `профицит ${regData.gainSurplus} ккал` : 'баланс энергии'}.</div></div>
                  </div>
                  {forecast && (<div className="p-4 rounded-[1.5rem] bg-gradient-to-br from-indigo-950/40 to-slate-950 border border-indigo-800/40 shadow-xl"><div className="flex items-center gap-2 mb-2 text-indigo-300"><TrendingUp size={14} /><span className="text-[9px] font-black uppercase tracking-widest">AI Прогноз · 4 недели</span></div><div className="space-y-1"><p className="text-xs font-bold text-slate-200">Вес через месяц: <span className="text-indigo-300 font-black tabular-nums">{forecast.week4Weight} кг</span></p><p className="text-[10px] text-slate-500 italic">Изменение: {forecast.weeklyDelta} кг/нед</p></div></div>)}
                </div>
              </>
            )}
          </div>
          <div className="pt-4 space-y-3">
            {onboardingStep === 1 ? (
              <button type="button" onClick={() => setOnboardingStep(2)} disabled={!regStep1Valid} className={clsx('w-full py-5 rounded-[1.5rem] font-black text-base shadow-xl transition-all active:scale-[0.98] disabled:opacity-50', regStep1Valid ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-900/40' : 'bg-slate-800 text-slate-600')}>Рассчитать мой план</button>
            ) : (
              <>
                <button onClick={handleActivateWithTransition} disabled={!regNameValid || isActivatingPlan} className={clsx('w-full py-5 rounded-[1.5rem] font-black text-base shadow-xl transition-all active:scale-[0.98] disabled:opacity-50', regNameValid ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-indigo-900/40' : 'bg-slate-800 text-slate-600')}>Создать AI-план</button>
                <button type="button" onClick={() => onboardingStep === 2 && setOnboardingStep(1)} disabled={isActivatingPlan} className="w-full py-3 rounded-[1.5rem] font-black text-xs text-slate-400 border border-slate-800 hover:bg-slate-800/50 transition-all disabled:opacity-50">Назад к параметрам</button>
              </>
            )}
            <p className="text-center text-[9px] text-slate-600 font-semibold uppercase tracking-wider">Сначала локально • затем в облако</p>
          </div>
        </div>
      </div>
    </div>
  );
}
