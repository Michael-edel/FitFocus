import React, { useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { Activity, BrainCircuit, Flame, Sparkles, Timer } from 'lucide-react';
import { calculateBMR, calculateDailyTargets, calculateTDEE } from '../domain/profileMath';
import { DEFAULT_DEFICIT, DEFAULT_SURPLUS } from '../domain/constants';
import { Goal, type ActivityLevel, type Gender } from '../domain/types';
import { trackOnboardingEvent } from '../analytics/onboarding';

type Props = {
  gender: Gender;
  weight: number;
  height: number;
  age: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  lossDeficit?: number;
  gainSurplus?: number;
};

const metricCard = (label: string, value: string | number, accent?: string) => (
  <div className={clsx('rounded-[1.25rem] border bg-slate-950/55 p-4', accent ?? 'border-slate-800')}>
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
    <p className="mt-1 text-xl font-black text-white tabular-nums">{value}</p>
  </div>
);

export default function OnboardingAhaCard({
  gender,
  weight,
  height,
  age,
  activityLevel,
  goal,
  lossDeficit,
  gainSurplus,
}: Props) {
  const bmr = useMemo(() => Math.round(calculateBMR({ gender, weight, height, age })), [gender, weight, height, age]);
  const tdee = useMemo(
    () => Math.round(calculateTDEE({ gender, weight, height, age, activityLevel, goal, adaptationMultiplier: 1, lossDeficit, gainSurplus })),
    [gender, weight, height, age, activityLevel, goal, lossDeficit, gainSurplus],
  );
  const targets = useMemo(
    () => calculateDailyTargets({ gender, weight, height, age, activityLevel, goal, adaptationMultiplier: 1, lossDeficit, gainSurplus }),
    [gender, weight, height, age, activityLevel, goal, lossDeficit, gainSurplus],
  );

  const forecast = useMemo(() => {
    if (!weight || !targets.calories || !tdee) return null;
    if (goal === Goal.MAINTAIN) {
      return {
        title: 'Цель: стабильный вес',
        note: 'Прогноз: удержание текущего веса при соблюдении нормы',
      };
    }
    const offset = goal === Goal.LOSS ? -Number(lossDeficit || DEFAULT_DEFICIT) : Number(gainSurplus || DEFAULT_SURPLUS);
    const weeklyDeltaKg = (offset * 7) / 7700;
    const monthWeight = weight + weeklyDeltaKg * 4;
    return {
      title: `Вес через 4 недели: ${monthWeight.toFixed(1)} кг`,
      note: `Изменение: ${(weeklyDeltaKg > 0 ? '+' : '') + weeklyDeltaKg.toFixed(2)} кг/нед`,
    };
  }, [goal, gainSurplus, lossDeficit, targets.calories, tdee, weight]);

  useEffect(() => {
    trackOnboardingEvent('aha_card_viewed', {
      goal,
      weight,
      activityLevel,
    });
  }, [activityLevel, goal, weight]);

  const goalLabel = goal === Goal.LOSS ? 'Снижение веса' : goal === Goal.GAIN ? 'Набор массы' : 'Поддержание';

  return (
    <div className="rounded-[2rem] border border-indigo-500/20 bg-gradient-to-b from-indigo-950/25 via-slate-950/90 to-slate-950/80 p-5 sm:p-6 shadow-2xl shadow-indigo-950/20">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-indigo-200">
            <Sparkles size={12} />
            Aha-card
          </div>
          <h3 className="mt-3 text-2xl font-black text-white">{goalLabel}</h3>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-400">
            Мы посчитали метаболизм локально, без ожидания облака. Ниже видна дневная цель и ориентир на 4 недели.
          </p>
        </div>
        <div className="hidden h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-200 sm:flex">
          <BrainCircuit size={20} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {metricCard('BMR', bmr)}
        {metricCard('TDEE', tdee)}
        <div className="rounded-[1.25rem] border border-indigo-500/20 bg-indigo-500/10 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200/80">Цель на день</p>
          <p className="mt-1 text-xl font-black text-white tabular-nums">{targets.calories} ккал</p>
          <p className="mt-1 text-[11px] font-semibold text-indigo-100/80">
            {targets.protein} г белка • {targets.fat} г жиров • {targets.carbs} г углеводов
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-[1.25rem] border border-slate-800 bg-slate-950/55 p-4 md:col-span-2">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <Activity size={12} className="text-indigo-300" />
            Прогноз на 4 недели
          </div>
          <p className="mt-2 text-base font-black text-slate-100">{forecast?.title ?? 'Прогноз недоступен'}</p>
          <p className="mt-1 text-sm font-semibold text-slate-400">{forecast?.note ?? 'Добавьте базовые данные, чтобы увидеть динамику.'}</p>
        </div>
        <div className="rounded-[1.25rem] border border-slate-800 bg-slate-950/55 p-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <Timer size={12} className="text-emerald-300" />
            Локальный расчёт
          </div>
          <p className="mt-2 text-base font-black text-slate-100">Без лишних полей</p>
          <p className="mt-1 text-sm font-semibold text-slate-400">
            В онбординге нужны только цель, пол, возраст, рост, вес и активность.
          </p>
          <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
            <Flame size={11} className="text-orange-300" />
            План готовится
          </div>
        </div>
      </div>
    </div>
  );
}
