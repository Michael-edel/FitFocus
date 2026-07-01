import React, { useEffect, useMemo } from 'react';
import { Flame, Sparkles } from 'lucide-react';
import type { FoodItem } from '../types';
import { calculateFoodStreak, trackFoodStreakMilestone } from '../analytics/foodStreak';

type FoodStreakCardProps = {
  userId?: string;
  foodDiary: FoodItem[];
};

function pickFoodStreakCopy(streak: number) {
  if (streak >= 7) {
    return {
      badge: '🔥 Неделя контроля',
      title: 'Неделя контроля',
      note: `${streak} дней подряд в FitFocus.`,
    };
  }

  if (streak >= 3) {
    return {
      badge: '🔥 Огонь горит',
      title: 'Огонь горит',
      note: `${streak} дней подряд ведёте дневник.`,
    };
  }

  if (streak >= 1) {
    return {
      badge: '🔥 Серия началась',
      title: 'Серия началась',
      note: `${streak} дней подряд ведёте дневник.`,
    };
  }

  return {
    badge: '🔥 Начните серию сегодня',
    title: 'Начните серию сегодня',
    note: 'Добавьте первый приём пищи, чтобы зажечь огонь.',
  };
}

export default function FoodStreakCard({ userId, foodDiary }: FoodStreakCardProps) {
  const streakState = useMemo(() => calculateFoodStreak(foodDiary), [foodDiary]);
  const copy = useMemo(() => pickFoodStreakCopy(streakState.streak), [streakState.streak]);

  useEffect(() => {
    if (!userId) return;
    if (streakState.streak >= 1) trackFoodStreakMilestone(userId, 'started', streakState.streak);
    if (streakState.streak >= 3) trackFoodStreakMilestone(userId, '3_days', streakState.streak);
    if (streakState.streak >= 7) trackFoodStreakMilestone(userId, '7_days', streakState.streak);
  }, [streakState.streak, userId]);

  return (
    <div className="min-w-0 rounded-[1.5rem] border border-slate-800 bg-slate-950/50 p-4 relative overflow-hidden min-h-[172px]">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-400 via-amber-300 to-rose-400 opacity-80" />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-[10px] font-black uppercase tracking-widest text-slate-500 truncate">Food Streak</div>
        <Flame size={14} className="text-orange-300 shrink-0" />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0">
          <div className="text-2xl font-black text-slate-100 tabular-nums">{streakState.streak}</div>
          <div className="text-xs text-slate-500">дней подряд с записью еды</div>
        </div>
        <div className="inline-flex w-full max-w-full items-center justify-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1.5 text-center text-[10px] font-black uppercase tracking-wide leading-tight text-orange-200 sm:w-auto sm:max-w-[14rem] sm:tracking-widest">
          <Sparkles size={12} className="shrink-0" />
          <span className="min-w-0 break-words">{copy.badge}</span>
        </div>
      </div>
      <div className="mt-3 text-sm font-black text-slate-100 leading-snug">{copy.title}</div>
      <div className="mt-1 min-h-[2rem] text-xs text-slate-500 leading-relaxed">{copy.note}</div>
    </div>
  );
}
