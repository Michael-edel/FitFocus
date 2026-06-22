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
      title: 'Огонь держится уже неделю',
      note: 'Отличная серия. Один день не меняет курс, а локальная система считает только реальные дни с едой.',
    };
  }

  if (streak >= 3) {
    return {
      badge: '🔥 Огонь горит',
      title: 'Серия уже выглядит уверенно',
      note: 'Продолжайте вести дневник по локальным дням, чтобы streak считался корректно на любом устройстве.',
    };
  }

  if (streak >= 1) {
    return {
      badge: '🔥 Серия началась',
      title: 'Вы уже в ритме',
      note: 'Серия учитывает локальные дни: если сегодня ещё не было записи, утром берётся вчерашний день.',
    };
  }

  return {
    badge: '🔥 Начните серию сегодня',
    title: 'Добавьте первый приём пищи',
    note: 'Как только вы сохраните хотя бы одну запись еды за день, серия стартует автоматически.',
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
    <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/50 p-4 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-400 via-amber-300 to-rose-400 opacity-80" />
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Food Streak</div>
        <Flame size={14} className="text-orange-300" />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-black text-slate-100 tabular-nums">{streakState.streak}</div>
          <div className="text-xs text-slate-500">дней подряд с записью еды</div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-orange-200">
          <Sparkles size={12} />
          {copy.badge}
        </div>
      </div>
      <div className="mt-3 text-sm font-black text-slate-100">{copy.title}</div>
      <div className="mt-1 text-xs text-slate-500 leading-relaxed">{copy.note}</div>
    </div>
  );
}
