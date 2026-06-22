import React, { useEffect, useMemo, useRef } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import OnboardingAhaCard from './components/OnboardingAhaCard';
import { trackOnboardingEvent } from './analytics/onboarding';
import { Gender, Goal, ActivityLevel, type TariffPlan } from './types';

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
  bloodGlucoseMmolL: number;
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
  onOpenVersionInfo: () => void;
};

const activityOptions: Array<{ value: ActivityLevel; label: string; note: string }> = [
  { value: ActivityLevel.SEDENTARY, label: 'Минимум движения', note: 'офис, мало шагов' },
  { value: ActivityLevel.LIGHTLY_ACTIVE, label: 'Легкая активность', note: 'ходьба, бытовые дела' },
  { value: ActivityLevel.MODERATELY_ACTIVE, label: 'Умеренная', note: 'регулярные тренировки 3–5 раз' },
  { value: ActivityLevel.VERY_ACTIVE, label: 'Высокая', note: 'много движения и спорта' },
  { value: ActivityLevel.EXTRA_ACTIVE, label: 'Очень высокая', note: 'тяжёлая работа / интенсивные тренировки' },
];

const goalOptions = [
  { value: Goal.LOSS, label: 'Похудение', note: 'умеренный дефицит' },
  { value: Goal.MAINTAIN, label: 'Поддержание', note: 'стабильный вес' },
  { value: Goal.GAIN, label: 'Набор', note: 'плавный профицит' },
] as const;

const numberInputClassName = 'w-full px-4 py-3 rounded-[1rem] bg-slate-950/70 border border-slate-800 text-slate-100 font-black tabular-nums outline-none transition-all placeholder:text-slate-600';

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
  onOpenVersionInfo,
}: RegistrationScreenProps) {
  const onboardingStartedRef = useRef(false);

  const regAnthroError = useMemo(() => {
    const weight = Number(regData.weight) || 0;
    const height = Number(regData.height) || 0;
    if (weight > 0 && (weight < 25 || weight > 350)) return 'Вес должен быть в диапазоне 25–350 кг.';
    if (height > 0 && (height < 120 || height > 230)) return 'Рост должен быть в диапазоне 120–230 см.';
    if (weight > 0 && height > 0) {
      const bmi = weight / Math.pow(height / 100, 2);
      if (bmi < 12 || bmi > 60) return 'Проверьте сочетание веса и роста: оно выглядит нереалистично.';
    }
    return null;
  }, [regData.height, regData.weight]);

  const regStep1Valid = Boolean(Number(regData.weight) > 0 && Number(regData.height) > 0 && Number(regData.age) > 0 && regData.activityLevel && !regAnthroError);

  useEffect(() => {
    if (onboardingStartedRef.current) return;
    onboardingStartedRef.current = true;
    trackOnboardingEvent('onboarding_started', {
      step: onboardingStep,
      goal: regData.goal,
      activityLevel: regData.activityLevel,
    });
  }, [onboardingStep, regData.activityLevel, regData.goal]);

  const goNext = () => {
    trackOnboardingEvent('onboarding_basic_completed', {
      goal: regData.goal,
      activityLevel: regData.activityLevel,
      weight: regData.weight,
      height: regData.height,
      age: regData.age,
    });
    setOnboardingStep(2);
  };

  const onCreatePlan = () => {
    trackOnboardingEvent('aha_card_cta_clicked', {
      goal: regData.goal,
      weight: regData.weight,
      height: regData.height,
      age: regData.age,
      activityLevel: regData.activityLevel,
    });
    handleActivateWithTransition();
  };

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
            <div className="h-[6px] bg-gradient-to-r from-indigo-500/0 via-indigo-400/50 to-violet-400/0" />
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
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-200/90 bg-indigo-600/10 border border-indigo-500/20 px-2 py-1 rounded-full">
                  {Math.min(100, Math.round(((activationStep + 1) / activationSteps.length) * 100))}%
                </span>
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
                <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Готово</p>
                  <p className="mt-1 text-sm font-black text-indigo-200 flex items-center gap-2"><CheckCircle2 size={16} className="text-indigo-300" /><span className="tabular-nums">{Math.min(100, Math.round(((activationStep + 1) / activationSteps.length) * 100))}%</span></p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ввод</p>
                  <p className="mt-1 text-sm font-black text-white tabular-nums">{regData.weight || '—'} кг</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Рост</p>
                  <p className="mt-1 text-sm font-black text-white tabular-nums">{regData.height || '—'} см</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Возраст</p>
                  <p className="mt-1 text-sm font-black text-white tabular-nums">{regData.age || '—'}</p>
                </div>
              </div>
              <div className="mt-6 text-xs text-slate-500 font-semibold">Нажимая «Создать AI-план», вы запускаете персональную модель — можно изменить цель и тариф позже.</div>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center p-4">
        <div className="relative w-full md:max-w-5xl bg-slate-900/90 rounded-t-[2.75rem] md:rounded-[3rem] p-6 md:p-10 shadow-2xl space-y-6 border border-slate-800/70 backdrop-blur-xl max-h-[95vh] overflow-y-auto overflow-x-hidden scrollbar-hide">
          <div className="flex justify-center -mt-2 md:hidden mb-4"><div className="w-12 h-1.5 rounded-full bg-slate-700/70" /></div>

          <div className="text-center space-y-3">
            <button
              type="button"
              onClick={onOpenVersionInfo}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400 transition-colors hover:bg-slate-800/90 hover:text-slate-200"
            >
              <Sparkles size={12} className="text-indigo-400" />
              Что нового
            </button>
            <div className="relative inline-flex w-14 h-14 mx-auto items-center justify-center">
              <div className="absolute inset-0 rounded-[1.25rem] overflow-hidden pointer-events-none">
                <div className="absolute inset-[-200%] bg-[conic-gradient(from_0deg,transparent_85%,#818cf8_98%,transparent_100%)] animate-spin" style={{ animationDuration: '3s' }} />
              </div>
              <div className="absolute inset-[2px] bg-slate-900 rounded-[1.1rem] z-0" />
              <div className="relative w-[48px] h-[48px] bg-indigo-600 rounded-[1rem] flex items-center justify-center text-white font-black text-xl shadow-2xl animate-pulse">FF</div>
            </div>
            <h1 className="text-xl md:text-2xl font-black text-slate-100 tracking-tight">Настроим ваш персональный AI‑план</h1>
            <p className="text-[10px] md:text-xs text-slate-400 font-semibold max-w-xs mx-auto">
              Мы рассчитаем метаболизм и дневные KPI на основе базовых данных.
            </p>
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-[10px] font-black text-slate-50 uppercase tracking-widest">
              <span className={clsx('w-2 h-2 rounded-full', onboardingStep === 1 ? 'bg-indigo-400' : 'bg-slate-700')} />
              <span className={clsx('w-2 h-2 rounded-full', onboardingStep === 2 ? 'bg-indigo-400' : 'bg-slate-700')} />
              <span>Шаг {onboardingStep} из 2</span>
            </div>
          </div>

          {onboardingStep === 1 ? (
            <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6">
              <div className="space-y-4">
                <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/50 p-5 space-y-4">
                  <div className="text-[11px] font-black uppercase tracking-widest text-slate-500">Базовые данные</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="space-y-1">
                      <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Вес (кг)</div>
                      <input
                        type="number"
                        min={25}
                        max={350}
                        inputMode="numeric"
                        value={regData.weight}
                        onChange={(e) => setRegData((prev) => ({ ...prev, weight: Math.max(0, Number(e.target.value) || 0) }))}
                        className={numberInputClassName}
                      />
                    </label>
                    <label className="space-y-1">
                      <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Рост (см)</div>
                      <input
                        type="number"
                        min={120}
                        max={230}
                        inputMode="numeric"
                        value={regData.height}
                        onChange={(e) => setRegData((prev) => ({ ...prev, height: Math.max(0, Number(e.target.value) || 0) }))}
                        className={numberInputClassName}
                      />
                    </label>
                    <label className="space-y-1">
                      <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Возраст</div>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={regData.age}
                        onChange={(e) => setRegData((prev) => ({ ...prev, age: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                        className={numberInputClassName}
                      />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Пол</div>
                    <div className="grid grid-cols-2 gap-2">
                      {[{ id: Gender.MALE, label: 'Мужской' }, { id: Gender.FEMALE, label: 'Женский' }].map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setRegData((prev) => ({ ...prev, gender: g.id }))}
                          className={clsx(
                            'w-full p-4 text-center rounded-[1.25rem] border text-xs font-black transition-all',
                            regData.gender === g.id
                              ? 'bg-indigo-600/10 border-indigo-500 text-indigo-300'
                              : 'bg-slate-950 border-slate-800 text-slate-500'
                          )}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Цель</div>
                    <div className="grid grid-cols-1 gap-2">
                      {goalOptions.map((goal) => (
                        <button
                          key={goal.value}
                          type="button"
                          onClick={() => setRegData((prev) => ({ ...prev, goal: goal.value }))}
                          className={clsx(
                            'w-full p-3.5 rounded-[1.25rem] border text-left transition-all',
                            regData.goal === goal.value
                              ? 'bg-indigo-600/10 border-indigo-500 text-indigo-200'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-black">{goal.label}</div>
                              <div className="text-[11px] font-semibold opacity-70 mt-0.5">{goal.note}</div>
                            </div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Выбрать</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Активность</div>
                    <div className="grid grid-cols-1 gap-2">
                      {activityOptions.map((activity) => (
                        <button
                          key={activity.label}
                          type="button"
                          onClick={() => setRegData((prev) => ({ ...prev, activityLevel: activity.value }))}
                          className={clsx(
                            'w-full p-3.5 rounded-[1.25rem] border text-left transition-all',
                            regData.activityLevel === activity.value
                              ? 'bg-violet-600/10 border-violet-500 text-violet-200'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-black">{activity.label}</div>
                              <div className="text-[11px] font-semibold opacity-70 mt-0.5">{activity.note}</div>
                            </div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                              {String(Number(activity.value).toFixed(1)).replace('.0', '')}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {regAnthroError && (
                  <div className="rounded-[1.25rem] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 font-semibold flex items-start gap-2">
                    <AlertTriangle size={16} className="mt-0.5 text-amber-300" />
                    <span>{regAnthroError}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={goNext}
                  disabled={!regStep1Valid}
                  className={clsx(
                    'w-full py-5 rounded-[1.5rem] font-black text-base shadow-xl transition-all active:scale-[0.98] disabled:opacity-50',
                    regStep1Valid
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-900/40'
                      : 'bg-slate-800 text-slate-600'
                  )}
                >
                  Рассчитать мой план
                </button>
              </div>

              <div className="space-y-4">
                <OnboardingAhaCard
                  gender={regData.gender}
                  weight={regData.weight}
                  height={regData.height}
                  age={regData.age}
                  activityLevel={regData.activityLevel}
                  goal={regData.goal}
                  lossDeficit={regData.lossDeficit}
                  gainSurplus={regData.gainSurplus}
                />
                <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/50 p-5">
                  <div className="text-[11px] font-black uppercase tracking-widest text-slate-500">Дальше</div>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-400">
                    Когда базовые параметры готовы, FitFocus подхватит имя из Google-аккаунта и создаст личный cloud-профиль.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <OnboardingAhaCard
                gender={regData.gender}
                weight={regData.weight}
                height={regData.height}
                age={regData.age}
                activityLevel={regData.activityLevel}
                goal={regData.goal}
                lossDeficit={regData.lossDeficit}
                gainSurplus={regData.gainSurplus}
              />
              <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/50 p-5 flex items-start gap-3">
                <div className="mt-0.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 p-2 text-indigo-300">
                  <Sparkles size={14} />
                </div>
                <div>
                  <div className="text-sm font-black text-slate-100">Имя и cloud-профиль</div>
                  <div className="mt-1 text-sm font-semibold text-slate-400">
                    Имя профиля подставим из Google-аккаунта. После создания плана данные будут синхронизироваться между устройствами.
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="pt-2 space-y-3">
            {onboardingStep === 2 ? (
              <>
                <button
                  type="button"
                  onClick={onCreatePlan}
                  disabled={isActivatingPlan || !regData.name?.trim()}
                  className={clsx(
                    'w-full py-5 rounded-[1.5rem] font-black text-base shadow-xl transition-all active:scale-[0.98] disabled:opacity-50',
                    regData.name?.trim()
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-indigo-900/40'
                      : 'bg-slate-800 text-slate-600'
                  )}
                >
                  Создать AI-план
                </button>
                <button
                  type="button"
                  onClick={() => setOnboardingStep(1)}
                  disabled={isActivatingPlan}
                  className="w-full py-3 rounded-[1.5rem] font-black text-xs text-slate-400 border border-slate-800 hover:bg-slate-800/50 transition-all disabled:opacity-50"
                >
                  Назад к параметрам
                </button>
              </>
            ) : null}
            <p className="text-center text-[9px] text-slate-600 font-semibold uppercase tracking-wider">Сначала локально • затем в облако</p>
          </div>
        </div>
      </div>
    </div>
  );
}
