import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { calculateStreak } from './habits';

type WeightPoint = { date: string; weight: number };

function formatShortDate(iso: string) {
  if (!iso) return '';
  // Support both YYYY-MM-DD and full ISO strings like YYYY-MM-DDTHH:mm:ssZ
  const dayPart = iso.includes('T') ? iso.split('T')[0] : iso;
  const parts = dayPart.split('-');
  if (parts.length < 3) return iso;
  return `${parts[2]}.${parts[1]}`;
}

export function WeightTrendChart({ weightHistory }: { weightHistory: WeightPoint[] }) {
  const data = useMemo(() => {
    const clean = (weightHistory || [])
      .filter((p) => p?.date && typeof p.weight === 'number' && !Number.isNaN(p.weight))
      .slice(-30);
    return clean.map((p) => ({ ...p, label: formatShortDate(p.date) }));
  }, [weightHistory]);

  if (!data.length) {
    return (
      <div className="p-8 rounded-[2rem] border-2 border-dashed border-slate-800 text-slate-500 text-sm font-bold text-center">
        Нет данных для графика. Добавьте вес — и появится тренд.
      </div>
    );
  }

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorWeightChart" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#818CF8" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#818CF8" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
          <XAxis 
            dataKey="label" 
            interval="preserveStartEnd" 
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fontWeight: '800', fill: '#475569' }}
          />
          <YAxis 
            domain={['dataMin - 1', 'dataMax + 1']} 
            hide
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#0f172a', 
              borderRadius: '1.5rem', 
              border: '1px solid #1e293b', 
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)', 
              fontWeight: '800', 
              fontSize: '12px',
              color: '#f8fafc'
            }}
            itemStyle={{ color: '#818CF8' }}
            labelStyle={{ color: '#64748b', marginBottom: '4px' }}
          />
          <Area 
            type="monotone" 
            dataKey="weight" 
            stroke="#818CF8" 
            strokeWidth={4} 
            fillOpacity={1} 
            fill="url(#colorWeightChart)" 
            animationDuration={1500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HabitStreaksCard({
  dailyHabits,
}: {
  dailyHabits: Record<string, { water: boolean; steps: boolean; breakfast: boolean; sleep: boolean }> | undefined;
}) {
  const streaks = useMemo(() => {
    return {
      water: calculateStreak(dailyHabits || {}, 'water'),
      steps: calculateStreak(dailyHabits || {}, 'steps'),
      breakfast: calculateStreak(dailyHabits || {}, 'breakfast'),
      sleep: calculateStreak(dailyHabits || {}, 'sleep'),
    };
  }, [dailyHabits]);

  const items = [
    { key: 'water', label: 'Вода', icon: '💧' },
    { key: 'steps', label: 'Шаги', icon: '👣' },
    { key: 'breakfast', label: 'Завтрак', icon: '🍳' },
    { key: 'sleep', label: 'Сон', icon: '🌙' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 mt-4">
      {items.map((it) => (
        <div
          key={it.key}
          className="p-4 rounded-[1.5rem] bg-slate-800/50 border border-slate-800 flex flex-col gap-1 transition-all hover:border-indigo-500/30 hover:bg-slate-800"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{it.label}</span>
            <span className="text-xs">{it.icon}</span>
          </div>
          <div className="text-lg font-black text-slate-100">
            {streaks[it.key as keyof typeof streaks]} <span className="text-[8px] text-indigo-400 uppercase">дн.</span>
          </div>
        </div>
      ))}
    </div>
  );
}
