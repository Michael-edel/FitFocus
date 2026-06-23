import React, { useMemo } from 'react';
import clsx from 'clsx';
import {
  AreaChart,
  Area,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { calculateStreak, getTodayKey } from './habits';
import { toLocalDayKey } from './dateUtils';

function addLocalDays(date: Date, deltaDays: number): Date {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() + deltaDays);
  return next;
}

type WeightPoint = { date: string; weight: number };
type MeasurementPoint = { date: string };
type ProgressPhotoPoint = { date: string };
type DailyStats = {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

type Targets = DailyStats;

type DashboardChartsPanelProps = {
  dailyStats: DailyStats;
  targets: Targets;
  weightHistory: WeightPoint[];
  measurementsHistory?: MeasurementPoint[];
  progressPhotos?: ProgressPhotoPoint[];
  dailyHabits:
    | Record<
        string,
        {
          water: boolean;
          steps: boolean;
          breakfast: boolean;
          sleep: boolean;
        }
      >
    | undefined;
  weightTrend?: {
    current?: number;
    delta7?: number;
    delta30?: number;
  } | null;
  currentWeight?: number | null;
  targetWeight?: number | null;
  onToggleHabit: (habitKey: 'water' | 'steps' | 'breakfast' | 'sleep') => void;
};

function formatShortDate(iso: string) {
  if (!iso) return '';
  // Support both YYYY-MM-DD and full ISO strings like YYYY-MM-DDTHH:mm:ssZ
  const dayPart = iso.includes('T') ? iso.split('T')[0] : iso;
  const parts = dayPart.split('-');
  if (parts.length < 3) return iso;
  return `${parts[2]}.${parts[1]}`;
}

export function WeightTrendChart({ weightHistory, targetWeight }: { weightHistory: WeightPoint[]; targetWeight?: number | null }) {
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

  const yValues = [
    ...data.map((d) => d.weight),
    ...(typeof targetWeight === 'number' && Number.isFinite(targetWeight) ? [targetWeight] : []),
  ];
  const yMin = Math.min(...yValues) - 1;
  const yMax = Math.max(...yValues) + 1;

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
            domain={[yMin, yMax]}
            tick={{ fontSize: 10, fontWeight: '800', fill: '#475569' }}
            axisLine={false}
            tickLine={false}
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
          {typeof targetWeight === 'number' && Number.isFinite(targetWeight) ? (
            <ReferenceLine y={targetWeight} stroke="#818CF8" strokeDasharray="6 4" strokeOpacity={0.7} label={{ value: 'цель', position: 'insideTopRight', fill: '#a5b4fc', fontSize: 10, fontWeight: 800 }} />
          ) : null}
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

export function ProgressArchiveChart({
  measurementsHistory,
  progressPhotos,
}: {
  measurementsHistory?: MeasurementPoint[];
  progressPhotos?: ProgressPhotoPoint[];
}) {
  const data = useMemo(() => {
    const photoDates = [...(progressPhotos || [])]
      .filter((item) => item?.date)
      .map((item) => item.date)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const measurementDates = [...(measurementsHistory || [])]
      .filter((item) => item?.date)
      .map((item) => item.date)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const allDates = Array.from(new Set([...photoDates, ...measurementDates]))
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    let photoCount = 0;
    let measurementCount = 0;
    let photoIndex = 0;
    let measurementIndex = 0;

    return allDates.map((date) => {
      while (photoIndex < photoDates.length && photoDates[photoIndex] <= date) {
        photoCount += 1;
        photoIndex += 1;
      }
      while (measurementIndex < measurementDates.length && measurementDates[measurementIndex] <= date) {
        measurementCount += 1;
        measurementIndex += 1;
      }
      return {
        date,
        label: formatShortDate(date),
        photos: photoCount,
        measurements: measurementCount,
      };
    });
  }, [measurementsHistory, progressPhotos]);

  if (!data.length) {
    return (
      <div className="p-6 rounded-[2rem] border-2 border-dashed border-slate-800 text-slate-500 text-sm font-bold text-center">
        Добавьте фото и первый замер — здесь появится динамика прогресса.
      </div>
    );
  }

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorProgressPhotos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f472b6" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#f472b6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorProgressMeasurements" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.24} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
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
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fontWeight: '800', fill: '#475569' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0f172a',
              borderRadius: '1.5rem',
              border: '1px solid #1e293b',
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
              fontWeight: '800',
              fontSize: '12px',
              color: '#f8fafc',
            }}
            itemStyle={{ color: '#f8fafc' }}
            labelStyle={{ color: '#64748b', marginBottom: '4px' }}
          />
          <Area type="monotone" dataKey="measurements" stroke="#22c55e" strokeWidth={3} fill="url(#colorProgressMeasurements)" fillOpacity={1} name="Замеры" />
          <Area type="monotone" dataKey="photos" stroke="#f472b6" strokeWidth={3} fill="url(#colorProgressPhotos)" fillOpacity={1} name="Фото" />
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
  const last7Days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const day = addLocalDays(new Date(), i - 6);
      return toLocalDayKey(day);
    });
  }, []);

  const streaks = useMemo(() => {
    return {
      water: calculateStreak(dailyHabits || {}, 'water'),
      steps: calculateStreak(dailyHabits || {}, 'steps'),
      breakfast: calculateStreak(dailyHabits || {}, 'breakfast'),
      sleep: calculateStreak(dailyHabits || {}, 'sleep'),
    };
  }, [dailyHabits]);

  const weekProgress = useMemo(() => {
    const result: Record<'water' | 'steps' | 'breakfast' | 'sleep', { done: number; total: number }> = {
      water: { done: 0, total: 7 },
      steps: { done: 0, total: 7 },
      breakfast: { done: 0, total: 7 },
      sleep: { done: 0, total: 7 },
    };
    for (const day of last7Days) {
      const row = dailyHabits?.[day];
      if (!row) continue;
      (Object.keys(result) as Array<keyof typeof result>).forEach((key) => {
        if (row[key]) result[key].done += 1;
      });
    }
    return result;
  }, [dailyHabits, last7Days]);

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
          className="p-4 rounded-[1.5rem] bg-slate-800/50 border border-slate-800 flex flex-col gap-1 transition-all hover:border-indigo-500/30 hover:bg-slate-800 cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{it.label}</span>
            <span className="text-xs">{it.icon}</span>
          </div>
          <div className="text-lg font-black text-slate-100">
            {streaks[it.key as keyof typeof streaks]} <span className="text-[8px] text-indigo-400 uppercase">дн.</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-slate-900 overflow-hidden border border-slate-700">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-emerald-400 to-amber-400"
              style={{ width: `${Math.min(100, Math.round((weekProgress[it.key as keyof typeof weekProgress].done / weekProgress[it.key as keyof typeof weekProgress].total) * 100))}%` }}
            />
          </div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-600 tabular-nums">
            {weekProgress[it.key as keyof typeof weekProgress].done}/{weekProgress[it.key as keyof typeof weekProgress].total} за 7 дней
          </div>
        </div>
      ))}
    </div>
  );
}

function clampGram(v: unknown) {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  const r = Math.round(n);
  return Math.max(0, Math.min(9999, r));
}

export default function DashboardChartsPanel({
  dailyStats,
  targets,
  weightHistory,
  measurementsHistory,
  progressPhotos,
  dailyHabits,
  weightTrend,
  currentWeight,
  targetWeight,
  onToggleHabit,
}: DashboardChartsPanelProps) {
  const macroPieData = useMemo(
    () => [
      {
        name: 'Белки',
        value: Math.max(0, dailyStats.protein),
        color: '#818CF8',
      },
      {
        name: 'Жиры',
        value: Math.max(0, dailyStats.fat),
        color: '#34D399',
      },
      {
        name: 'Углеводы',
        value: Math.max(0, dailyStats.carbs),
        color: '#F59E0B',
      },
    ],
    [dailyStats.carbs, dailyStats.fat, dailyStats.protein]
  );

  const grams = useMemo(
    () => ({
      protein: clampGram(dailyStats.protein),
      fat: clampGram(dailyStats.fat),
      carbs: clampGram(dailyStats.carbs),
    }),
    [dailyStats.carbs, dailyStats.fat, dailyStats.protein]
  );

  const currentWeightValue = currentWeight ?? weightTrend?.current ?? 0;
  const caloriePercent = targets.calories > 0 ? Math.round((dailyStats.calories / targets.calories) * 100) : 0;
  const caloriePercentClass =
    caloriePercent > 110 ? 'text-rose-300' :
    caloriePercent > 100 ? 'text-amber-300' :
    caloriePercent >= 90 ? 'text-emerald-300' :
    'text-sky-300';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <div className="bg-slate-900 p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-xl border border-slate-800 space-y-6 md:space-y-8">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-black text-slate-100">Дневник нутриентов</h3>
          <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center font-black', caloriePercentClass, caloriePercent > 100 ? 'bg-rose-500/10' : 'bg-indigo-500/10')}>
            %
          </div>
        </div>
        <div className="relative h-48 md:h-64 flex items-center justify-center">
          <PieChart width={160} height={160} className="md:hidden">
            <Pie data={macroPieData} innerRadius={46} outerRadius={72} paddingAngle={8} dataKey="value" stroke="none">
              {macroPieData.map((entry, index) => (
                <Cell key={`mobile-cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: 'var(--ff-card)', borderRadius: '24px', border: '1px solid var(--ff-border)', fontWeight: 'bold', color: 'var(--ff-text)' }} />
          </PieChart>
          <PieChart width={200} height={200} className="hidden md:block">
            <Pie data={macroPieData} innerRadius={60} outerRadius={90} paddingAngle={8} dataKey="value" stroke="none">
              {macroPieData.map((entry, index) => (
                <Cell key={`desktop-cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: 'var(--ff-card)', borderRadius: '24px', border: '1px solid var(--ff-border)', fontWeight: 'bold', color: 'var(--ff-text)' }} />
          </PieChart>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className={clsx('text-2xl md:text-3xl font-black tabular-nums', caloriePercentClass)}>{caloriePercent}%</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">От нормы</span>
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 -mt-2">
          <span>100% = норма</span>
          <span className="text-slate-700">•</span>
          <span>{caloriePercent > 100 ? 'Выше плана' : caloriePercent >= 90 ? 'В пределах плана' : 'Ниже плана'}</span>
        </div>
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          {macroPieData.map((m, i) => (
            <div key={i} className="text-center space-y-1">
              <div className="w-2 h-2 rounded-full mx-auto" style={{ backgroundColor: m.color }} />
              <p className="text-[9px] md:text-[10px] font-black text-slate-50 uppercase tracking-widest">{m.name}</p>
              <p className="text-sm md:text-base font-black text-slate-200 tabular-nums">
                {i === 0 ? grams.protein : i === 1 ? grams.fat : grams.carbs} г
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-900 p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-xl border border-slate-800 space-y-6 md:space-y-8">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-black text-slate-100">Полезные привычки</h3>
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">✓</div>
        </div>
        <div className="space-y-4">
          {[
            { key: 'water', title: 'Пить воду', icon: '💧' },
            { key: 'steps', title: '10,000 шагов', icon: '👣' },
            { key: 'breakfast', title: 'Здоровый завтрак', icon: '🍳' },
            { key: 'sleep', title: 'Сон 8 часов', icon: '🌙' },
          ].map((h) => {
            const isDone = dailyHabits?.[getTodayKey()]?.[h.key as 'water' | 'steps' | 'breakfast' | 'sleep'];
            const streak = calculateStreak(dailyHabits || {}, h.key as 'water' | 'steps' | 'breakfast' | 'sleep');
            return (
              <div
                key={h.key}
                className="flex items-center justify-between p-4 bg-slate-950/50 rounded-[1.5rem] border border-slate-800 group hover:border-indigo-500/30 transition-all cursor-pointer"
                onClick={() => onToggleHabit(h.key as 'water' | 'steps' | 'breakfast' | 'sleep')}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${isDone ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-950' : 'bg-slate-900 border-2 border-slate-700 text-transparent group-hover:border-indigo-500'}`}>
                    <span className="text-[12px] leading-none">✓</span>
                  </div>
                  <div className="flex flex-col text-left">
                    <span className={`font-bold ${isDone ? 'text-slate-600 line-through' : 'text-slate-200'}`}>{h.title}</span>
                    {streak > 1 && <span className="text-[10px] font-black text-amber-500 flex items-center gap-1">{streak} дня серия</span>}
                  </div>
                </div>
                <span className={isDone ? 'text-emerald-400' : 'text-slate-600'}>{h.icon}</span>
              </div>
            );
          })}
        </div>
        <HabitStreaksCard dailyHabits={dailyHabits} />
      </div>

      <div className="bg-slate-900 p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-xl border border-slate-800 space-y-6 md:space-y-8 flex flex-col">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-black text-slate-100">Мой вес</h3>
          <div className="flex flex-col items-end">
            <span className="text-lg font-black text-slate-50 tabular-nums">{currentWeightValue || weightTrend?.current || 0} кг</span>
            <div className="flex gap-2 mt-1">
              {weightTrend && weightTrend.delta7 !== 0 && (
                <span className={`text-[10px] font-bold px-2 py-1 rounded-lg tabular-nums ${weightTrend.delta7 < 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                  7д: {weightTrend.delta7 > 0 ? '+' : ''}{weightTrend.delta7.toFixed(1)}
                </span>
              )}
              {weightTrend && weightTrend.delta30 !== 0 && (
                <span className={`text-[10px] font-bold px-2 py-1 rounded-lg tabular-nums ${weightTrend.delta30 < 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                  30д: {weightTrend.delta30 > 0 ? '+' : ''}{weightTrend.delta30.toFixed(1)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
          <span>Период: последние 30 дней</span>
          <span>{targetWeight ? `Цель: ${targetWeight} кг` : 'Цель не задана'}</span>
        </div>
        <div className="flex-1 min-h-[200px]">
          <WeightTrendChart weightHistory={weightHistory} />
        </div>
        {targetWeight ? (
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <span className="h-2 w-2 rounded-full bg-indigo-400" />
            <span>Линия цели: {targetWeight} кг</span>
          </div>
        ) : (
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Добавьте целевой вес в профиле, чтобы видеть линию цели.</div>
        )}
        <div className="flex justify-between items-center text-[10px] font-black text-slate-600 uppercase tracking-widest pt-4 border-t border-slate-800">
          <span>Неделя 1</span>
          <span>Неделя {Math.ceil((weightHistory.length || 1) / 7)}</span>
        </div>
      </div>

      <div className="bg-slate-900 p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-xl border border-slate-800 space-y-6 md:space-y-8 flex flex-col">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-black text-slate-100">Фото и замеры</h3>
          <div className="w-10 h-10 rounded-xl bg-fuchsia-500/10 flex items-center justify-center text-fuchsia-300">◎</div>
        </div>
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
          <span>Архив по дням</span>
          <span>{(progressPhotos?.length || 0) + (measurementsHistory?.length || 0)} записей</span>
        </div>
        <div className="flex-1 min-h-[200px]">
          <ProgressArchiveChart measurementsHistory={measurementsHistory} progressPhotos={progressPhotos} />
        </div>
        <div className="grid grid-cols-2 gap-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-3 py-2">
            <div className="text-slate-500">Фото</div>
            <div className="mt-1 text-sm text-slate-100 tabular-nums">{progressPhotos?.length || 0}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-3 py-2">
            <div className="text-slate-500">Замеры</div>
            <div className="mt-1 text-sm text-slate-100 tabular-nums">{measurementsHistory?.length || 0}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
