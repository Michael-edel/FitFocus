import React, { useMemo } from 'react';
import clsx from 'clsx';
import { ArrowLeft, Camera, CalendarDays, Scale, Sparkles, TrendingUp, Watch } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ProgressPhoto, UserProfile, WearableProvider } from './types';

type ProgressArchiveScreenProps = {
  currentUser: UserProfile | null;
  weightHistory: UserProfile['weightHistory'];
  measurementsHistory?: UserProfile['measurementsHistory'];
  progressPhotos?: UserProfile['progressPhotos'];
  currentWeight?: number | null;
  wearableProvider?: WearableProvider;
  wearableEnabled?: boolean;
  wearableLastSyncAt?: string;
  wearableMetricsUpdatedAt?: string;
  onOpenSettings?: () => void;
  onOpenProgress?: () => void;
};

const formatDate = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
};

const formatShortDate = (iso: string) => {
  const dayPart = iso.includes('T') ? iso.split('T')[0] : iso;
  const [year, month, day] = dayPart.split('-');
  if (!year || !month || !day) return iso;
  return `${day}.${month}`;
};

const toDateKey = (iso?: string | null) => {
  if (!iso) return '';
  return iso.includes('T') ? iso.slice(0, 10) : iso;
};

export default function ProgressArchiveScreen({
  currentUser,
  weightHistory,
  measurementsHistory,
  progressPhotos,
  currentWeight,
  wearableProvider,
  wearableEnabled,
  wearableLastSyncAt,
  wearableMetricsUpdatedAt,
  onOpenSettings,
  onOpenProgress,
}: ProgressArchiveScreenProps) {
  const measurementsSorted = useMemo(
    () =>
      [...(measurementsHistory || [])]
        .filter((item) => item?.date)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [measurementsHistory],
  );

  const progressPhotosSorted = useMemo(
    () => [...(progressPhotos || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [progressPhotos],
  );

  const latestMeasurement = measurementsSorted[0] || null;
  const previousMeasurement = measurementsSorted.length > 1 ? measurementsSorted[1] : null;
  const latestPhoto = progressPhotosSorted[0] || null;
  const firstPhoto = progressPhotosSorted.length > 1 ? progressPhotosSorted[progressPhotosSorted.length - 1] : null;

  const weightTrendData = useMemo(() => {
    return [...(weightHistory || [])]
      .filter((item) => item?.date && typeof item.weight === 'number')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-60)
      .map((item) => ({
        date: formatShortDate(item.date),
        weight: item.weight,
      }));
  }, [weightHistory]);

  const archiveTimeline = useMemo(() => {
    const items: Array<{ kind: 'measurement' | 'photo' | 'wearable'; date: string; title: string; detail: string }> = [];

    measurementsSorted.slice(0, 18).forEach((item) => {
      const parts = [
        typeof item.weight === 'number' ? `${item.weight.toFixed(1)} кг` : null,
        typeof item.waistCm === 'number' ? `талия ${item.waistCm} см` : null,
        typeof item.restingPulse === 'number' ? `пульс ${item.restingPulse}` : null,
      ].filter(Boolean) as string[];
      items.push({
        kind: 'measurement',
        date: item.date,
        title: 'Замер',
        detail: parts.length ? parts.join(' · ') : 'Обновление замера',
      });
    });

    progressPhotosSorted.slice(0, 18).forEach((photo) => {
      items.push({
        kind: 'photo',
        date: photo.date,
        title: 'Фото',
        detail: photo.note || 'Фото прогресса',
      });
    });

    if (wearableMetricsUpdatedAt || wearableLastSyncAt) {
      items.push({
        kind: 'wearable',
        date: wearableMetricsUpdatedAt || wearableLastSyncAt || new Date().toISOString(),
        title: 'Часы',
        detail: wearableProvider && wearableEnabled !== false ? `Источник: ${wearableProvider}` : 'Источник подключён',
      });
    }

    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 12);
  }, [measurementsSorted, progressPhotosSorted, wearableEnabled, wearableLastSyncAt, wearableMetricsUpdatedAt, wearableProvider]);

  const measurementSincePrevious =
    latestMeasurement && previousMeasurement
      ? {
          weight: typeof latestMeasurement.weight === 'number' && typeof previousMeasurement.weight === 'number'
            ? `${(latestMeasurement.weight - previousMeasurement.weight).toFixed(1)} кг`
            : '—',
          waist: typeof latestMeasurement.waistCm === 'number' && typeof previousMeasurement.waistCm === 'number'
            ? `${(latestMeasurement.waistCm - previousMeasurement.waistCm).toFixed(1)} см`
            : '—',
          pulse: typeof latestMeasurement.restingPulse === 'number' && typeof previousMeasurement.restingPulse === 'number'
            ? `${latestMeasurement.restingPulse - previousMeasurement.restingPulse} уд/мин`
            : '—',
        }
      : null;

  const wearableSummary = wearableProvider && wearableEnabled !== false ? wearableProvider : 'manual';

  return (
    <div className="w-full max-w-[1600px] 2xl:max-w-[1800px] mx-auto p-4 md:p-10 xl:p-12 space-y-8" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)' }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Архив прогресса</div>
          <h1 className="mt-2 text-3xl md:text-4xl font-black text-slate-100">Фото и замеры</h1>
          <p className="mt-2 text-sm md:text-base text-slate-400 max-w-2xl">Отдельный экран для визуальной истории тела: фото, мерки, вес и wearable-следы собраны в одном месте.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenProgress}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-[1rem] border border-slate-800 bg-slate-950/40 hover:bg-slate-900 text-slate-200 font-black transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            К сводке
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-[1rem] bg-indigo-600 hover:bg-indigo-500 text-white font-black transition-all"
          >
            <Camera className="w-4 h-4" />
            Добавить фото
          </button>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/40 p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Фото прогресса</div>
              <h2 className="mt-2 text-2xl font-black text-slate-100">Визуальная история тела</h2>
              <p className="mt-2 text-sm text-slate-400">Последнее и первое фото для быстрого сравнения.</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-300">
              <Sparkles size={18} />
            </div>
          </div>

          {latestPhoto && firstPhoto ? (
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[{ item: firstPhoto, label: 'Первое фото' }, { item: latestPhoto, label: 'Последнее фото' }].map(({ item, label }) => (
                <div key={`${label}-${item.date}`} className="rounded-[1.5rem] overflow-hidden border border-slate-800 bg-slate-950">
                  <div className="aspect-[3/4] relative">
                    <img src={(item as ProgressPhoto).thumb} alt={item.note || label} className="w-full h-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-300">{label}</div>
                      <div className="text-sm font-black text-white truncate">{item.note || 'Без подписи'}</div>
                      <div className="mt-1 text-[11px] text-slate-300">{formatDate(item.date)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-[1.5rem] border border-dashed border-slate-800 bg-slate-950/30 px-4 py-8 text-slate-500 text-sm">
              Пока нет фото прогресса. Добавьте первое фото в настройках.
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {progressPhotosSorted.slice(0, 8).map((photo, index) => (
              <div key={`${photo.date}-${index}`} className="relative rounded-[1.25rem] overflow-hidden border border-slate-800 bg-slate-950">
                <img src={photo.thumb} alt={photo.note || `Фото ${index + 1}`} className="aspect-square w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  <div className="text-[10px] font-black text-white truncate">{photo.note || 'Фото прогресса'}</div>
                  <div className="text-[10px] text-slate-300">{formatDate(photo.date)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/40 p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Сводка тела</div>
              <h2 className="mt-2 text-2xl font-black text-slate-100">Последний замер</h2>
              <p className="mt-2 text-sm text-slate-400">Сравнение с предыдущей записью и быстрые ключевые метрики.</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-300">
              <Scale size={18} />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Metric label="Вес" value={latestMeasurement?.weight ? `${latestMeasurement.weight.toFixed(1)} кг` : '—'} delta={measurementSincePrevious?.weight} />
            <Metric label="Талия" value={latestMeasurement?.waistCm ? `${latestMeasurement.waistCm} см` : '—'} delta={measurementSincePrevious?.waist} />
            <Metric label="Грудь" value={latestMeasurement?.chestCm ? `${latestMeasurement.chestCm} см` : '—'} delta={typeof latestMeasurement?.chestCm === 'number' && typeof previousMeasurement?.chestCm === 'number' ? `${(latestMeasurement.chestCm - previousMeasurement.chestCm).toFixed(1)} см` : '—'} />
            <Metric label="Пульс" value={latestMeasurement?.restingPulse ? `${latestMeasurement.restingPulse} уд/мин` : '—'} delta={measurementSincePrevious?.pulse} />
          </div>

          <div className="mt-5 rounded-[1.5rem] border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Wearable</div>
                <div className="mt-1 text-slate-100 font-black">{wearableSummary === 'manual' ? 'Ручной источник' : wearableSummary}</div>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-300">
                <Watch size={18} />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-300">
              <div className="rounded-[1rem] border border-slate-800 bg-slate-950/50 p-3">Последний sync: {formatDate(wearableLastSyncAt)}</div>
              <div className="rounded-[1rem] border border-slate-800 bg-slate-950/50 p-3">Обновлено: {formatDate(wearableMetricsUpdatedAt)}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-800 bg-slate-900/40 p-5 md:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Тренд веса</div>
            <h2 className="mt-2 text-2xl font-black text-slate-100">Динамика</h2>
            <p className="mt-2 text-sm text-slate-400">Линия по истории веса, чтобы отслеживать направление изменения, а не только разовый замер.</p>
          </div>
          <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <TrendingUp size={12} className="text-indigo-300" />
            {weightTrendData.length} точек
          </div>
        </div>

        <div className="mt-5 h-[280px]">
          {weightTrendData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weightTrendData}>
                <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="4 4" />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ background: '#020617', border: '1px solid rgba(148,163,184,0.15)', borderRadius: '16px', color: '#e2e8f0' }}
                  labelStyle={{ color: '#cbd5e1' }}
                />
                <Line type="monotone" dataKey="weight" stroke="#818CF8" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full rounded-[1.5rem] border border-dashed border-slate-800 bg-slate-950/30 px-4 py-8 text-slate-500 text-sm flex items-center justify-center">
              Пока нет данных по весу для графика.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-800 bg-slate-900/40 p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Лента событий</div>
            <h2 className="mt-2 text-2xl font-black text-slate-100">Фото, замеры и часы по датам</h2>
            <p className="mt-2 text-sm text-slate-400">Одна история вместо разрозненных записей.</p>
          </div>
          <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <CalendarDays size={12} className="text-indigo-300" />
            Архив
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {archiveTimeline.length ? (
            archiveTimeline.map((item, index) => (
              <div key={`${item.kind}-${item.date}-${index}`} className={clsx('rounded-[1.3rem] border px-4 py-4', item.kind === 'photo' ? 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-100' : item.kind === 'wearable' ? 'border-sky-500/20 bg-sky-500/10 text-sky-100' : 'border-indigo-500/20 bg-indigo-500/10 text-indigo-100')}>
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-[1rem] bg-slate-950/50 border border-white/10 flex items-center justify-center shrink-0">
                    {item.kind === 'measurement' ? <Scale size={18} /> : item.kind === 'wearable' ? <Watch size={18} /> : <Camera size={18} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-[10px] font-black uppercase tracking-widest">{item.title}</div>
                      <div className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full border border-white/10 bg-black/10 text-slate-200/90">
                        {item.kind === 'measurement' ? 'замер' : item.kind === 'wearable' ? 'часы' : 'фото'}
                      </div>
                    </div>
                    <div className="mt-1 text-sm font-semibold break-words text-slate-100">{item.detail}</div>
                    <div className="mt-2 text-[11px] text-slate-300">{formatDate(item.date)}</div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-slate-800 bg-slate-950/30 px-4 py-8 text-slate-500 text-sm">
              Пока нет истории прогресса.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black text-slate-100 tabular-nums">{value}</div>
      <div className="mt-1 text-sm text-slate-400">{delta}</div>
    </div>
  );
}
