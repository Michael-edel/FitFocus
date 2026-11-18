import React from 'react';
import { CheckCircle2, ChevronDown, Sparkles } from 'lucide-react';
import { Gender, Goal, ActivityLevel, type TariffPlan } from './types';
import { registrationError, registrationErrors, registrationRisk, REGISTRATION_MIN_AGE, REGISTRATION_MAX_AGE, TARGET_WEIGHT_MIN, TARGET_WEIGHT_MAX } from './registrationValidation';
import { DEFAULT_DEFICIT, DEFAULT_SURPLUS, MIN_DEFICIT, MAX_DEFICIT, MIN_SURPLUS, MAX_SURPLUS } from './constants';

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
  planError: string | null;
  isActivatingPlan: boolean;
  activationStep: number;
  activationSteps: ActivationStep[];
  activationTotalMs: number;
  handleActivateWithTransition: () => void;
  onOpenVersionInfo: () => void;
  onClearPlanError?: () => void;
};

const activityOptions: Array<{ value: ActivityLevel; label: string; note: string }> = [
  { value: ActivityLevel.SEDENTARY, label: 'Минимум движения', note: 'офис, мало шагов' },
  { value: ActivityLevel.LIGHTLY_ACTIVE, label: 'Легкая активность', note: 'ходьба, бытовые дела' },
  { value: ActivityLevel.MODERATELY_ACTIVE, label: 'Умеренная', note: 'регулярные тренировки 3–5 раз' },
  { value: ActivityLevel.VERY_ACTIVE, label: 'Высокая', note: 'много движения и спорта' },
  { value: ActivityLevel.EXTRA_ACTIVE, label: 'Очень высокая', note: 'тяжёлая работа / интенсивные тренировки' },
];

const goalOptions = [
  { value: Goal.LOSS, label: 'Похудение' },
  { value: Goal.MAINTAIN, label: 'Поддержание' },
  { value: Goal.GAIN, label: 'Набор' },
] as const;

const numberInputClassName = 'min-h-11 w-full min-w-0 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-base text-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-500';
const choiceClass = (selected: boolean) => `min-h-11 rounded-xl border px-2.5 py-2 text-sm font-semibold ${selected ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200' : 'border-slate-800 bg-slate-900 text-slate-300'}`;

function deriveSuggestedTargetWeight(weight: number, goal: Goal): number {
  const baseWeight = Number.isFinite(weight) && weight > 0 ? weight : 0;
  if (!baseWeight) return 0;
  if (goal === Goal.LOSS) return Number(Math.max(40, baseWeight * 0.9).toFixed(1));
  if (goal === Goal.GAIN) return Number(Math.max(baseWeight + 1, baseWeight * 1.05).toFixed(1));
  return Number(baseWeight.toFixed(1));
}

export default function RegistrationScreen({
  regData,
  setRegData,
  planError,
  isActivatingPlan,
  activationStep,
  activationSteps,
  activationTotalMs,
  handleActivateWithTransition,
  onOpenVersionInfo,
  onClearPlanError,
}: RegistrationScreenProps) {
  const errors = registrationErrors(regData);
  const risk = registrationRisk(regData);
  const regAnthroError = errors.anthro;
  const showGoalDetails = Boolean(risk || errors.offset || (regData.weight && errors.targetWeight));
  const regStep1Valid = !registrationError(regData) && (!risk || risk.acknowledged);
  const setInput = (update: (previous: RegistrationData) => RegistrationData) => {
    onClearPlanError?.();
    setRegData(previous => ({ ...update(previous), riskAckLoss: false, riskAckGain: false }));
  };

  const onCreatePlan = () => {
    if (!regStep1Valid || isActivatingPlan) return;
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
              <a
                href="/privacy.html"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-200"
              >
                Политика конфиденциальности
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="fixed inset-0 z-10 flex items-end justify-center sm:items-center sm:p-4">
        <form
          noValidate
          onSubmit={event => { event.preventDefault(); onCreatePlan(); }}
          className="ff-registration-form flex w-full max-w-lg max-h-[100dvh] flex-col overflow-hidden rounded-t-3xl border border-slate-800 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl"
        >
          <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
            <header>
              <h1 className="text-xl font-black text-slate-100 sm:text-2xl">Настроим ваш персональный AI‑план</h1>
              <p className="mt-1 text-sm text-slate-400">Укажите свои данные, чтобы рассчитать цели по питанию.</p>
            </header>

            <div className="grid grid-cols-2 gap-3 min-[400px]:grid-cols-3">
              <label className="block min-w-0 space-y-1">
                <span className="text-sm font-semibold text-slate-200">Вес (кг)</span>
                <input type="number" min={25} max={350} step="0.1" inputMode="decimal"
                  aria-label="Вес (кг)" aria-invalid={Boolean(regData.weight && errors.weight)}
                  aria-describedby="registration-weight-help" value={regData.weight || ''}
                  onChange={event => setInput(previous => {
                    const weight = Number(event.target.value);
                    const previousSuggestion = deriveSuggestedTargetWeight(previous.weight, previous.goal);
                    const targetWeight = !previous.targetWeight || previous.targetWeight === previousSuggestion
                      ? deriveSuggestedTargetWeight(weight, previous.goal) : previous.targetWeight;
                    return { ...previous, weight, targetWeight };
                  })} className={numberInputClassName} />
                <p id="registration-weight-help" className="text-xs text-slate-400">{regData.weight ? errors.weight ?? '25–350 кг' : '25–350 кг'}</p>
              </label>
              <label className="block min-w-0 space-y-1">
                <span className="text-sm font-semibold text-slate-200">Рост (см)</span>
                <input type="number" min={120} max={230} inputMode="numeric"
                  aria-label="Рост (см)" aria-invalid={Boolean(regData.height && errors.height)}
                  aria-describedby="registration-height-help" value={regData.height || ''}
                  onChange={event => setInput(previous => ({ ...previous, height: Number(event.target.value) }))}
                  className={numberInputClassName} />
                <p id="registration-height-help" className="text-xs text-slate-400">{regData.height ? errors.height ?? '120–230 см' : '120–230 см'}</p>
              </label>
              <label className="block min-w-0 space-y-1">
                <span className="text-sm font-semibold text-slate-200">Возраст</span>
                <input type="number" min={REGISTRATION_MIN_AGE} max={REGISTRATION_MAX_AGE} step={1} inputMode="numeric"
                  aria-label="Возраст" aria-invalid={Boolean(regData.age && errors.age)} aria-describedby="registration-age-help" value={regData.age || ''}
                  onChange={event => setInput(previous => ({ ...previous, age: Number(event.target.value) }))}
                  className={numberInputClassName} />
                <p id="registration-age-help" role={regData.age && errors.age ? 'alert' : undefined} className={regData.age && errors.age ? 'text-xs text-amber-200' : 'text-xs text-slate-400'}>
                  {regData.age && errors.age ? errors.age : `${REGISTRATION_MIN_AGE}–${REGISTRATION_MAX_AGE} лет`}
                </p>
              </label>
            </div>

            <fieldset className="min-w-0 space-y-2">
              <legend className="text-sm font-semibold text-slate-200">Пол</legend>
              <div className="grid grid-cols-2 gap-2">
                {[{ id: Gender.MALE, label: 'Мужской' }, { id: Gender.FEMALE, label: 'Женский' }].map(g => (
                  <button key={g.id} type="button" aria-pressed={regData.gender === g.id}
                    onClick={() => setInput(previous => ({ ...previous, gender: g.id }))}
                    className={choiceClass(regData.gender === g.id)}>{g.label}</button>
                ))}
              </div>
            </fieldset>

            <fieldset className="min-w-0 space-y-2">
              <legend className="text-sm font-semibold text-slate-200">Цель</legend>
              <div className="flex flex-wrap gap-2">
                {goalOptions.map(goal => (
                  <button key={goal.value} type="button" aria-pressed={regData.goal === goal.value}
                    onClick={() => setInput(previous => {
                      const previousSuggestion = deriveSuggestedTargetWeight(previous.weight, previous.goal);
                      const targetWeight = !previous.targetWeight || previous.targetWeight === previousSuggestion
                        ? deriveSuggestedTargetWeight(previous.weight, goal.value) : previous.targetWeight;
                      return { ...previous, goal: goal.value, targetWeight };
                    })}
                    className={`${choiceClass(regData.goal === goal.value)} flex-1`}>{goal.label}</button>
                ))}
              </div>
            </fieldset>

            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-200">Активность</span>
              <span className="relative block">
                <select aria-label="Активность" value={regData.activityLevel}
                  onChange={event => setInput(previous => ({ ...previous, activityLevel: Number(event.target.value) as ActivityLevel }))}
                  className={`${numberInputClassName} appearance-none pr-9`}>
                  {activityOptions.map(activity => <option key={activity.value} value={activity.value}>{activity.label}</option>)}
                </select>
                <ChevronDown aria-hidden="true" size={16} className="pointer-events-none absolute top-3.5 right-3 text-slate-300" />
              </span>
              <span className="text-xs text-slate-400">{activityOptions.find(activity => activity.value === regData.activityLevel)?.note}</span>
            </label>

            <details
              ref={(element: HTMLDetailsElement | null) => { if (element && showGoalDetails) element.open = true; }}
              className="rounded-xl border border-slate-800"
            >
              <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold text-slate-200">Настройки цели</summary>
              <div className="space-y-3 px-3 pb-3">
                <div className="space-y-1">
                  <label htmlFor="registration-target-weight" className="block text-sm text-slate-300">Целевой вес (кг)</label>
                  <input id="registration-target-weight" type="number" min={TARGET_WEIGHT_MIN} max={TARGET_WEIGHT_MAX} step="0.1" inputMode="decimal"
                    aria-describedby="registration-target-weight-help" aria-invalid={!!errors.targetWeight}
                    value={Number.isFinite(regData.targetWeight) ? regData.targetWeight || '' : ''}
                    onChange={event => setInput(previous => ({ ...previous, targetWeight: Number(event.target.value) }))}
                    className={numberInputClassName} />
                  <p id="registration-target-weight-help" role={errors.targetWeight ? 'alert' : undefined} className={errors.targetWeight ? 'text-xs text-amber-200' : 'text-xs text-slate-400'}>
                    {errors.targetWeight ?? 'Можно оставить предложенное значение.'}
                  </p>
                </div>
                {regData.goal !== Goal.MAINTAIN && (
                  <div className="space-y-2">
                    <label className="block space-y-1">
                      <span className="text-sm text-slate-300">{regData.goal === Goal.LOSS ? 'Дефицит' : 'Профицит'} (ккал/день)</span>
                      <input type="number" min={regData.goal === Goal.LOSS ? MIN_DEFICIT : MIN_SURPLUS} max={regData.goal === Goal.LOSS ? MAX_DEFICIT : MAX_SURPLUS} step={50}
                        aria-invalid={!!errors.offset} aria-describedby={errors.offset ? 'registration-intensity-help' : undefined}
                        value={regData.goal === Goal.LOSS ? regData.lossDeficit ?? DEFAULT_DEFICIT : regData.gainSurplus ?? DEFAULT_SURPLUS}
                        onChange={event => setInput(previous => ({ ...previous, [previous.goal === Goal.LOSS ? 'lossDeficit' : 'gainSurplus']: Number(event.target.value) }))}
                        className={numberInputClassName} />
                    </label>
                    {errors.offset && <p id="registration-intensity-help" className="text-xs text-amber-200">{errors.offset}</p>}
                    {risk && (
                      <label className="flex items-start gap-3 rounded-xl border border-amber-500/30 p-3 text-sm text-amber-100">
                        <input type="checkbox" checked={risk.acknowledged} className="mt-1 h-4 w-4"
                          onChange={event => { const checked = event.target.checked; onClearPlanError?.(); setRegData(previous => previous === regData ? ({ ...previous, riskAckLoss: previous.goal === Goal.LOSS && checked, riskAckGain: previous.goal === Goal.GAIN && checked }) : previous); }} />
                        <span>Я понимаю риски выбранной интенсивности: {risk.amount} ккал/день.</span>
                      </label>
                    )}
                  </div>
                )}
              </div>
            </details>

            {regAnthroError && Boolean(regData.weight && regData.height && regData.age) && (
              <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">{regAnthroError}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
              <a href="/privacy.html" target="_blank" rel="noreferrer" className="hover:text-slate-100">Политика конфиденциальности</a>
              <button type="button" onClick={onOpenVersionInfo} className="hover:text-slate-100">Что нового</button>
            </div>
          </div>

          <div className="shrink-0 border-t border-slate-800 px-4 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] sm:px-5">
            {planError && <p role="alert" className="mb-2 text-sm text-rose-400">{planError}</p>}
            {risk && !risk.acknowledged && <p className="mb-2 text-sm text-amber-200">Подтвердите риски или уменьшите интенсивность.</p>}
            <button type="submit" disabled={!regStep1Valid || isActivatingPlan}
              className="min-h-12 w-full rounded-2xl bg-indigo-600 px-4 py-2 font-bold text-white enabled:hover:bg-indigo-700 disabled:bg-slate-800 disabled:text-slate-300">
              Создать AI-план
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
