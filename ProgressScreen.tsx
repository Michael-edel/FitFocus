import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Activity,
  ArrowRight,
  Camera,
  Cloud,
  RefreshCcw,
  Scale,
  Sparkles,
  TrendingUp,
  Watch,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { WeightTrendChart } from './charts';
import type { ProgressPhoto, UserProfile, WearableProvider } from './types';

type SyncState = 'idle' | 'saving' | 'saved' | 'error';

type ProgressScreenProps = {
  currentUser: UserProfile | null;
  weightHistory: UserProfile['weightHistory'];
  measurementsHistory?: UserProfile['measurementsHistory'];
  progressPhotos?: UserProfile['progressPhotos'];
  currentWeight?: number | null;
  targetWeight?: number | null;
  wearableProvider?: WearableProvider;
  wearableEnabled?: boolean;
  wearableConnectedAt?: string;
  wearableLastSyncAt?: string;
  wearableStepsToday?: number;
  wearableActiveMinutesToday?: number;
  wearableSleepHoursLastNight?: number;
  wearableMetricsUpdatedAt?: string;
  onPatchUser?: (patch: Partial<UserProfile>) => Promise<void> | void;
  syncState?: SyncState;
  lastProfileSyncAt?: number | null;
  onSyncNow?: () => Promise<void> | void;
  onOpenSettings?: () => void;
};

type MetricKey = 'weight' | 'waistCm' | 'chestCm' | 'hipsCm' | 'restingPulse';

const metricMeta: Record<MetricKey, { label: string; unit: string; color: string }> = {
  weight: { label: 'Вес', unit: 'кг', color: '#818CF8' },
  waistCm: { label: 'Талия', unit: 'см', color: '#34D399' },
  chestCm: { label: 'Грудь', unit: 'см', color: '#F59E0B' },
  hipsCm: { label: 'Бёдра', unit: 'см', color: '#F472B6' },
  restingPulse: { label: 'Пульс', unit: 'уд/мин', color: '#38BDF8' },
};

const wearableOptions: Array<{ value: WearableProvider; label: string; note: string }> = [
  { value: 'apple_health', label: 'Apple Health', note: 'iPhone / Apple Watch' },
  { value: 'google_fit', label: 'Google Fit', note: 'Android / Wear OS' },
  { value: 'fitbit', label: 'Fitbit', note: 'Часы и браслеты Fitbit' },
  { value: 'garmin', label: 'Garmin', note: 'Спортивные часы Garmin' },
  { value: 'manual', label: 'Ручной импорт', note: 'CSV / ручные замеры' },
];

const providerLabel: Record<WearableProvider, string> = {
  apple_health: 'Apple Health',
  google_fit: 'Google Fit',
  fitbit: 'Fitbit',
  garmin: 'Garmin',
  manual: 'Ручной импорт',
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

const formatDelta = (current?: number | null, prev?: number | null, unit = '') => {
  if (typeof current !== 'number' || typeof prev !== 'number') return '—';
  const diff = current - prev;
  if (Number.isNaN(diff)) return '—';
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toFixed(1)} ${unit}`.trim();
};

export default function ProgressScreen({
  currentUser,
  weightHistory,
  measurementsHistory,
  progressPhotos,
  currentWeight,
  targetWeight,
  wearableProvider,
  wearableEnabled,
  wearableConnectedAt,
  wearableLastSyncAt,
  wearableStepsToday,
  wearableActiveMinutesToday,
  wearableSleepHoursLastNight,
  wearableMetricsUpdatedAt,
  onPatchUser,
  syncState,
  lastProfileSyncAt,
  onSyncNow,
  onOpenSettings,
}: ProgressScreenProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('weight');
  const [wearableBusy, setWearableBusy] = useState<WearableProvider | 'disconnect' | null>(null);
  const [draftWeight, setDraftWeight] = useState('');
  const [draftWaist, setDraftWaist] = useState('');
  const [draftChest, setDraftChest] = useState('');
  const [draftHips, setDraftHips] = useState('');
  const [draftPulse, setDraftPulse] = useState('');
  const [draftSteps, setDraftSteps] = useState('');
  const [draftActiveMinutes, setDraftActiveMinutes] = useState('');
  const [draftSleepHours, setDraftSleepHours] = useState('');
  const [draftSaving, setDraftSaving] = useState(false);

  const recentMeasurements = useMemo(() => {
    return [...(measurementsHistory || [])]
      .filter((item) => item?.date)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [measurementsHistory]);

  React.useEffect(() => {
    const latest = recentMeasurements[recentMeasurements.length - 1] || null;
    setDraftWeight(typeof latest?.weight === 'number' ? String(latest.weight) : typeof currentWeight === 'number' ? String(currentWeight) : '');
    setDraftWaist(typeof latest?.waistCm === 'number' ? String(latest.waistCm) : '');
    setDraftChest(typeof latest?.chestCm === 'number' ? String(latest.chestCm) : '');
    setDraftHips(typeof latest?.hipsCm === 'number' ? String(latest.hipsCm) : '');
    setDraftPulse(typeof latest?.restingPulse === 'number' ? String(latest.restingPulse) : '');
    setDraftSteps(typeof wearableStepsToday === 'number' ? String(wearableStepsToday) : '');
    setDraftActiveMinutes(typeof wearableActiveMinutesToday === 'number' ? String(wearableActiveMinutesToday) : '');
    setDraftSleepHours(typeof wearableSleepHoursLastNight === 'number' ? String(wearableSleepHoursLastNight) : '');
  }, [currentWeight, recentMeasurements, wearableActiveMinutesToday, wearableSleepHoursLastNight, wearableStepsToday]);

  const latestMeasurement = recentMeasurements.length ? recentMeasurements[recentMeasurements.length - 1] : null;
  const previousMeasurement = recentMeasurements.length > 1 ? recentMeasurements[recentMeasurements.length - 2] : null;

  const chartData = useMemo(() => {
    return recentMeasurements
      .map((item) => {
        const value = item[selectedMetric];
        return typeof value === 'number' && Number.isFinite(value)
          ? {
              date: item.date,
              label: formatShortDate(item.date),
              value,
            }
          : null;
      })
      .filter((item): item is { date: string; label: string; value: number } => !!item);
  }, [recentMeasurements, selectedMetric]);

  const latestChartPoint = chartData.length ? chartData[chartData.length - 1] : null;
  const prevChartPoint = chartData.length > 1 ? chartData[chartData.length - 2] : null;
  const selectedMeta = metricMeta[selectedMetric];

  const progressPhotosSorted = useMemo(() => {
    return [...(progressPhotos || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [progressPhotos]);

  const latestPhoto = progressPhotosSorted[0] || null;
  const firstPhoto = progressPhotosSorted.length > 1 ? progressPhotosSorted[progressPhotosSorted.length - 1] : null;

  const wearableSummary = wearableProvider && wearableEnabled !== false ? providerLabel[wearableProvider] : 'Не подключено';
  const cloudStateLabel = syncState === 'saving' ? 'Сохраняем в облако…' : syncState === 'saved' ? 'Синхронизировано' : syncState === 'error' ? 'Ошибка синхронизации' : 'Готово к синку';

  const applyWearableProvider = async (provider: WearableProvider) => {
    if (!onPatchUser) return;
    const now = new Date().toISOString();
    setWearableBusy(provider);
    try {
      await onPatchUser({
        wearableProvider: provider,
        wearableEnabled: true,
        wearableConnectedAt: wearableConnectedAt || now,
        wearableLastSyncAt: now,
      });
    } finally {
      setWearableBusy(null);
    }
  };

  const disableWearable = async () => {
    if (!onPatchUser) return;
    setWearableBusy('disconnect');
    try {
      await onPatchUser({
        wearableEnabled: false,
      });
    } finally {
      setWearableBusy(null);
    }
  };

  const saveManualMeasurement = async () => {
    if (!onPatchUser || !currentUser) return;
    const parse = (value: string) => {
      const normalized = String(value || '').replace(',', '.').trim();
      const next = Number(normalized);
      return Number.isFinite(next) && next > 0 ? next : null;
    };
    const nextWeight = parse(draftWeight);
    const nextWaist = parse(draftWaist);
    const nextChest = parse(draftChest);
    const nextHips = parse(draftHips);
    const nextPulse = parse(draftPulse);
    const nextSteps = parse(draftSteps);
    const nextActiveMinutes = parse(draftActiveMinutes);
    const nextSleepHours = parse(draftSleepHours);
    if (!nextWeight && !nextWaist && !nextChest && !nextHips && !nextPulse && !nextSteps && !nextActiveMinutes && !nextSleepHours) return;
    setDraftSaving(true);
    try {
      const now = new Date().toISOString();
      const historyEntry = {
        date: now,
        weight: nextWeight ?? undefined,
        waistCm: nextWaist ?? undefined,
        chestCm: nextChest ?? undefined,
        hipsCm: nextHips ?? undefined,
        restingPulse: nextPulse ?? undefined,
      };
      await onPatchUser({
        weight: nextWeight ?? currentUser.weight,
        weightHistory: nextWeight ? [{ date: now, weight: nextWeight }, ...(currentUser.weightHistory || [])].slice(0, 120) : currentUser.weightHistory,
        waistCm: nextWaist ?? currentUser.waistCm,
        chestCm: nextChest ?? currentUser.chestCm,
        hipsCm: nextHips ?? currentUser.hipsCm,
        restingPulse: nextPulse ?? currentUser.restingPulse,
        wearableStepsToday: nextSteps ?? currentUser.wearableStepsToday,
        wearableActiveMinutesToday: nextActiveMinutes ?? currentUser.wearableActiveMinutesToday,
        wearableSleepHoursLastNight: nextSleepHours ?? currentUser.wearableSleepHoursLastNight,
        bloodPressureMeasuredAt: currentUser.bloodPressureMeasuredAt,
        bodyMeasurementsMeasuredAt: (nextWaist || nextChest || nextHips || nextPulse) ? now : currentUser.bodyMeasurementsMeasuredAt,
        wearableMetricsUpdatedAt: (nextSteps || nextActiveMinutes || nextSleepHours) ? now : currentUser.wearableMetricsUpdatedAt,
        restingPulseMeasuredAt: nextPulse ? now : currentUser.restingPulseMeasuredAt,
        measurementsHistory: [
          historyEntry,
          ...(currentUser.measurementsHistory || []),
        ].slice(0, 30),
      });
    } finally {
      setDraftSaving(false);
    }
  };

  const hasMeasurements = recentMeasurements.length > 0;
  const hasPhotos = progressPhotosSorted.length > 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">Прогресс</div>
          <h1 className="text-[2.25rem] leading-none md:text-4xl font-black text-slate-100">Фото, замеры и смарт-часы в одном месте</h1>
          <p className="max-w-3xl text-sm md:text-base font-medium text-slate-400">
            Этот экран собирает динамику веса, обхватов, визуальные прогресс-фото и источник синхронизации с носимыми устройствами.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={clsx('inline-flex items-center gap-2 px-3 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest', syncState === 'error' ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : syncState === 'saving' ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200')}>
            <Cloud size={12} />
            {cloudStateLabel}
          </span>
          <button
            type="button"
            onClick={() => void onSyncNow?.()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-200 text-[10px] font-black uppercase tracking-widest transition-all"
          >
            <RefreshCcw size={12} />
            Синк сейчас
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-200 text-[10px] font-black uppercase tracking-widest transition-all"
          >
            <ArrowRight size={12} />
            Профиль
          </button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Текущий вес</div>
              <div className="mt-2 text-2xl font-black text-slate-100 tabular-nums">{typeof currentWeight === 'number' ? `${currentWeight.toFixed(1)} кг` : '—'}</div>
              <div className="mt-1 text-sm font-semibold text-slate-400">
                {typeof targetWeight === 'number' ? `Цель: ${targetWeight.toFixed(1)} кг` : 'Цель ещё не задана'}
              </div>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-300">
              <Scale size={18} />
            </div>
          </div>
          <div className="mt-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Последний замер</div>
          <div className="mt-1 text-sm text-slate-300">
            {latestMeasurement ? `${formatDate(latestMeasurement.date)} · ${latestMeasurement.weight ? `${latestMeasurement.weight.toFixed(1)} кг` : 'без веса'}` : 'Пока нет записей'}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Фото прогресса</div>
              <div className="mt-2 text-2xl font-black text-slate-100 tabular-nums">{progressPhotosSorted.length}</div>
              <div className="mt-1 text-sm font-semibold text-slate-400">снимков в архиве</div>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-300">
              <Camera size={18} />
            </div>
          </div>
          <div className="mt-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Последнее фото</div>
          <div className="mt-1 text-sm text-slate-300">{latestPhoto ? `${latestPhoto.note || 'Без подписи'} · ${formatDate(latestPhoto.date)}` : 'Ещё нет фото'}</div>
        </div>

        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Обхваты</div>
              <div className="mt-2 text-2xl font-black text-slate-100 tabular-nums">
                {latestMeasurement ? [latestMeasurement.waistCm, latestMeasurement.chestCm, latestMeasurement.hipsCm].filter((value) => typeof value === 'number').length : 0}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-400">актуальных значений</div>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-300">
              <Activity size={18} />
            </div>
          </div>
          <div className="mt-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Пульс / давление</div>
          <div className="mt-1 text-sm text-slate-300">
            {latestMeasurement?.restingPulse ? `Пульс ${latestMeasurement.restingPulse} уд/мин` : 'Пульс не записан'}
            {latestMeasurement?.bloodPressureSystolic && latestMeasurement?.bloodPressureDiastolic
              ? ` · ${latestMeasurement.bloodPressureSystolic}/${latestMeasurement.bloodPressureDiastolic} мм рт. ст.`
              : ''}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Смарт-часы</div>
              <div className="mt-2 text-2xl font-black text-slate-100">{wearableSummary}</div>
              <div className="mt-1 text-sm font-semibold text-slate-400">{wearableProvider && wearableEnabled !== false ? 'Интеграция включена' : 'Источник можно выбрать и подключить'}</div>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-300">
              <Watch size={18} />
            </div>
          </div>
          <div className="mt-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Последний sync</div>
          <div className="mt-1 text-sm text-slate-300">{formatDate(wearableLastSyncAt || currentUser?.wearableLastSyncAt)}</div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-[1.1rem] border border-slate-800 bg-slate-950/40 p-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Шаги</div>
              <div className="mt-1 text-lg font-black text-slate-100 tabular-nums">{typeof wearableStepsToday === 'number' ? wearableStepsToday.toLocaleString('ru-RU') : '—'}</div>
            </div>
            <div className="rounded-[1.1rem] border border-slate-800 bg-slate-950/40 p-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Активность</div>
              <div className="mt-1 text-lg font-black text-slate-100 tabular-nums">{typeof wearableActiveMinutesToday === 'number' ? `${wearableActiveMinutesToday} мин` : '—'}</div>
            </div>
            <div className="rounded-[1.1rem] border border-slate-800 bg-slate-950/40 p-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Сон</div>
              <div className="mt-1 text-lg font-black text-slate-100 tabular-nums">{typeof wearableSleepHoursLastNight === 'number' ? `${wearableSleepHoursLastNight.toFixed(1)} ч` : '—'}</div>
            </div>
          </div>
          <div className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
            Обновлено: {formatDate(wearableMetricsUpdatedAt || currentUser?.wearableMetricsUpdatedAt)}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/40 p-5 md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">График динамики веса</div>
              <h2 className="mt-2 text-2xl font-black text-slate-100">Тренд веса за последние недели</h2>
              <p className="mt-2 text-sm font-medium text-slate-400">Цельная линия помогает видеть, куда движется вес, а пунктирная линия показывает целевое значение.</p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
              <TrendingUp size={12} className="text-indigo-300" />
              Фото и замеры ниже
            </div>
          </div>
          <div className="mt-5">
            <WeightTrendChart weightHistory={weightHistory || []} targetWeight={targetWeight} />
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Последние 7 дней</div>
              <div className="mt-2 text-xl font-black text-slate-100 tabular-nums">{formatDelta(latestChartPoint?.value, prevChartPoint?.value, metricMeta.weight.unit)}</div>
              <div className="mt-1 text-sm text-slate-400">изменение веса</div>
            </div>
            <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Обновлений</div>
              <div className="mt-2 text-xl font-black text-slate-100 tabular-nums">{recentMeasurements.length}</div>
              <div className="mt-1 text-sm text-slate-400">замеров в истории</div>
            </div>
            <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cloud sync</div>
              <div className="mt-2 text-xl font-black text-slate-100 tabular-nums">{formatDate(lastProfileSyncAt ? new Date(lastProfileSyncAt).toISOString() : null)}</div>
              <div className="mt-1 text-sm text-slate-400">последний перенос профиля</div>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/40 p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Смарт-часы</div>
              <h2 className="mt-2 text-2xl font-black text-slate-100">Выбор источника синхронизации</h2>
              <p className="mt-2 text-sm font-medium text-slate-400">Подключение сохраняет выбранный источник в профиле и готовит экран к будущему импорту шагов, сна и пульса.</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-300">
              <Sparkles size={18} />
            </div>
          </div>

          <div className="mt-5 space-y-2">
            {wearableOptions.map((option) => {
              const selected = wearableProvider === option.value && wearableEnabled !== false;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => void applyWearableProvider(option.value)}
                  disabled={!onPatchUser || wearableBusy !== null}
                  className={clsx(
                    'w-full rounded-[1.25rem] border px-4 py-4 text-left transition-all',
                    selected ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-900/70',
                    wearableBusy !== null && 'opacity-60 cursor-wait'
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-slate-100 font-black">{option.label}</div>
                      <div className="mt-1 text-sm text-slate-400">{option.note}</div>
                    </div>
                    <div className={clsx('text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border', selected ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200' : 'border-slate-800 bg-slate-900 text-slate-500')}>
                      {selected ? 'подключено' : 'выбрать'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onSyncNow?.()}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-[1rem] bg-indigo-600 hover:bg-indigo-500 text-white font-black transition-all"
            >
              <RefreshCcw className="w-4 h-4" />
              Обновить облако
            </button>
            <button
              type="button"
              onClick={() => void disableWearable()}
              disabled={!wearableProvider || wearableBusy !== null}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-[1rem] border border-slate-800 bg-slate-950/40 hover:bg-slate-900 text-slate-300 font-black transition-all disabled:opacity-50"
            >
              Отключить
            </button>
          </div>

          <div className="mt-4 rounded-[1.25rem] border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Что можно подтянуть позже</div>
            <div className="space-y-1">
              <div>• Шаги и активные минуты</div>
              <div>• Пульс покоя и тренировки</div>
              <div>• Сон и восстановление</div>
              <div>• Вес из умных весов</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/40 p-5 md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Динамика замеров</div>
              <h2 className="mt-2 text-2xl font-black text-slate-100">Тренд обхватов и пульса</h2>
              <p className="mt-2 text-sm font-medium text-slate-400">Переключайте показатель и смотрите, как меняются талия, грудь, бёдра и пульс от последнего замера к последнему.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(metricMeta) as MetricKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedMetric(key)}
                  className={clsx(
                    'px-3 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all',
                    selectedMetric === key
                      ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200'
                      : 'border-slate-800 bg-slate-950/40 text-slate-500 hover:text-slate-300 hover:border-slate-700'
                  )}
                >
                  {metricMeta[key].label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Текущий показатель</div>
              <div className="mt-2 text-2xl font-black text-slate-100 tabular-nums">
                {hasMeasurements && latestChartPoint ? `${latestChartPoint.value.toFixed(selectedMetric === 'restingPulse' ? 0 : 1)} ${selectedMeta.unit}` : '—'}
              </div>
              <div className="mt-1 text-sm text-slate-400">{selectedMeta.label.toLowerCase()}</div>
            </div>
            <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Изменение</div>
              <div className="mt-2 text-2xl font-black text-slate-100 tabular-nums">
                {hasMeasurements && latestChartPoint && prevChartPoint
                  ? formatDelta(latestChartPoint.value, prevChartPoint.value, selectedMeta.unit)
                  : '—'}
              </div>
              <div className="mt-1 text-sm text-slate-400">последние две точки</div>
            </div>
            <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Последний замер</div>
              <div className="mt-2 text-2xl font-black text-slate-100 tabular-nums">{formatDate(latestMeasurement?.date)}</div>
              <div className="mt-1 text-sm text-slate-400">история чек-инов</div>
            </div>
          </div>

          <div className="mt-5 h-[280px]">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id={`progress-${selectedMetric}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={selectedMeta.color} stopOpacity={0.32} />
                      <stop offset="95%" stopColor={selectedMeta.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: '#475569' }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: '#475569' }} />
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
                    itemStyle={{ color: selectedMeta.color }}
                    labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                  />
                  {selectedMetric === 'weight' && typeof targetWeight === 'number' ? (
                    <ReferenceLine y={targetWeight} stroke="#818CF8" strokeDasharray="6 4" strokeOpacity={0.7} label={{ value: 'цель', position: 'insideTopRight', fill: '#a5b4fc', fontSize: 10, fontWeight: 800 }} />
                  ) : null}
                  <Area type="monotone" dataKey="value" stroke={selectedMeta.color} strokeWidth={4} fill={`url(#progress-${selectedMetric})`} fillOpacity={1} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full rounded-[1.75rem] border border-dashed border-slate-800 bg-slate-950/30 flex items-center justify-center text-center px-6">
                <div>
                  <div className="text-slate-100 font-black">Пока нет динамики замеров</div>
                  <div className="mt-2 text-sm text-slate-500">Сохраните первый замер в профиле, и здесь появится линия прогресса.</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/40 p-5 md:p-6">
          <div className="flex flex-col gap-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Снимки прогресса</div>
            <h2 className="text-2xl font-black text-slate-100">Визуальная история тела</h2>
            <p className="text-sm font-medium text-slate-400">Фото помогают быстро увидеть изменения, которые ещё не всегда заметны в цифрах.</p>
          </div>

          {hasPhotos && firstPhoto && latestPhoto ? (
            <div className="mt-5 grid grid-cols-2 gap-3">
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
              Пока нет фото прогресса. Добавьте первое фото в разделе настроек, чтобы запустить визуальную историю.
            </div>
          )}

          <div className="mt-5 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Архив</div>
              <div className="text-slate-100 font-black">{progressPhotosSorted.length} фото</div>
            </div>
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-[1rem] border border-slate-800 bg-slate-950/40 hover:bg-slate-900 text-slate-200 font-black transition-all"
            >
              <Camera className="w-4 h-4" />
              Добавить фото
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
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
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/40 p-5 md:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Последний замер</div>
              <h2 className="mt-2 text-2xl font-black text-slate-100">Профиль тела сегодня</h2>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-300">
              <Sparkles size={18} />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Талия</div>
              <div className="mt-2 text-2xl font-black text-slate-100 tabular-nums">{latestMeasurement?.waistCm ? `${latestMeasurement.waistCm} см` : '—'}</div>
              <div className="mt-1 text-sm text-slate-400">{formatDelta(latestMeasurement?.waistCm, previousMeasurement?.waistCm, 'см')}</div>
            </div>
            <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Грудь</div>
              <div className="mt-2 text-2xl font-black text-slate-100 tabular-nums">{latestMeasurement?.chestCm ? `${latestMeasurement.chestCm} см` : '—'}</div>
              <div className="mt-1 text-sm text-slate-400">{formatDelta(latestMeasurement?.chestCm, previousMeasurement?.chestCm, 'см')}</div>
            </div>
            <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Бёдра</div>
              <div className="mt-2 text-2xl font-black text-slate-100 tabular-nums">{latestMeasurement?.hipsCm ? `${latestMeasurement.hipsCm} см` : '—'}</div>
              <div className="mt-1 text-sm text-slate-400">{formatDelta(latestMeasurement?.hipsCm, previousMeasurement?.hipsCm, 'см')}</div>
            </div>
            <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Пульс</div>
              <div className="mt-2 text-2xl font-black text-slate-100 tabular-nums">{latestMeasurement?.restingPulse ? `${latestMeasurement.restingPulse} уд/мин` : '—'}</div>
              <div className="mt-1 text-sm text-slate-400">{formatDelta(latestMeasurement?.restingPulse, previousMeasurement?.restingPulse, 'уд/мин')}</div>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/40 p-5 md:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Быстрый ввод</div>
              <h2 className="mt-2 text-2xl font-black text-slate-100">Новый замер</h2>
              <p className="mt-2 text-sm font-medium text-slate-400">Обновляет профиль и сразу добавляет запись в историю.</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-300">
              <Scale size={18} />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Вес</div>
              <input value={draftWeight} onChange={(e) => setDraftWeight(e.target.value)} inputMode="decimal" className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold" placeholder="90.0" />
            </label>
            <label className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Пульс покоя</div>
              <input value={draftPulse} onChange={(e) => setDraftPulse(e.target.value)} inputMode="numeric" className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold" placeholder="60" />
            </label>
            <label className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Талия</div>
              <input value={draftWaist} onChange={(e) => setDraftWaist(e.target.value)} inputMode="decimal" className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold" placeholder="см" />
            </label>
            <label className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Грудь</div>
              <input value={draftChest} onChange={(e) => setDraftChest(e.target.value)} inputMode="decimal" className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold" placeholder="см" />
            </label>
            <label className="space-y-2 sm:col-span-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Бёдра</div>
              <input value={draftHips} onChange={(e) => setDraftHips(e.target.value)} inputMode="decimal" className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold" placeholder="см" />
            </label>
            <label className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Шаги</div>
              <input value={draftSteps} onChange={(e) => setDraftSteps(e.target.value)} inputMode="numeric" className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold" placeholder="12000" />
            </label>
            <label className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Активные минуты</div>
              <input value={draftActiveMinutes} onChange={(e) => setDraftActiveMinutes(e.target.value)} inputMode="numeric" className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold" placeholder="45" />
            </label>
            <label className="space-y-2 sm:col-span-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Сон прошлой ночи</div>
              <input value={draftSleepHours} onChange={(e) => setDraftSleepHours(e.target.value)} inputMode="decimal" className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold" placeholder="7.5" />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void saveManualMeasurement()}
              disabled={!onPatchUser || draftSaving}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-[1rem] bg-indigo-600 hover:bg-indigo-500 text-white font-black transition-all disabled:opacity-50"
            >
              <TrendingUp className="w-4 h-4" />
              {draftSaving ? 'Сохраняем…' : 'Сохранить замер'}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftWeight('');
                setDraftWaist('');
                setDraftChest('');
                setDraftHips('');
                setDraftPulse('');
              }}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-[1rem] border border-slate-800 bg-slate-950/40 hover:bg-slate-900 text-slate-300 font-black transition-all"
            >
              Сбросить
            </button>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/40 p-5 md:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Что дальше</div>
              <h2 className="mt-2 text-2xl font-black text-slate-100">Как использовать этот экран</h2>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-300">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-slate-100 font-black">Регулярно добавляйте замеры</div>
              <div className="mt-1 text-sm text-slate-400">Тогда линия веса и обхватов начнёт показывать настоящий тренд.</div>
            </div>
            <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-slate-100 font-black">Сохраняйте фото раз в 1-2 недели</div>
              <div className="mt-1 text-sm text-slate-400">Так проще увидеть изменения, которые не заметны по весу.</div>
            </div>
            <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-slate-100 font-black">Подключите источник часов</div>
              <div className="mt-1 text-sm text-slate-400">Сохраним выбранный сервис и будем готовы к импорту данных.</div>
            </div>
            <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-slate-100 font-black">Проверьте профиль</div>
              <div className="mt-1 text-sm text-slate-400">Обхваты, давление и пульс удобнее держать актуальными в одном месте.</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
