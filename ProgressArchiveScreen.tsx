import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowLeft, Camera, CalendarDays, Cloud, Scale, Sparkles, TrendingUp, Watch } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toLocalDayKey } from './dateUtils';
import type { ProgressPhoto, UserProfile, WearableProvider } from './types';
import { isRecord, parseJson } from './safeJson';

type ProgressArchiveScreenProps = {
  currentUser: UserProfile | null;
  weightHistory: UserProfile['weightHistory'];
  measurementsHistory?: UserProfile['measurementsHistory'];
  progressPhotos?: UserProfile['progressPhotos'];
  currentWeight?: number | null;
  wearableProvider?: WearableProvider;
  wearableEnabled?: boolean;
  wearableLastSyncAt?: string;
  wearableMetricsDayKey?: string;
  wearableMetricsUpdatedAt?: string;
  onOpenSettings?: () => void;
  onOpenProgress?: () => void;
};

type ArchiveSectionKey = 'gallery' | 'compare' | 'trend' | 'timeline';

const ARCHIVE_SECTIONS_STORAGE_KEY = 'fitfocus.progress-archive.sections.v1';

const defaultOpenSections = (): Record<ArchiveSectionKey, boolean> => ({
  gallery: false,
  compare: false,
  trend: false,
  timeline: false,
});

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

const toDateKey = (iso?: string | null) => toLocalDayKey(iso);

export default function ProgressArchiveScreen({
  currentUser,
  weightHistory,
  measurementsHistory,
  progressPhotos,
  currentWeight,
  wearableProvider,
  wearableEnabled,
  wearableLastSyncAt,
  wearableMetricsDayKey,
  wearableMetricsUpdatedAt,
  onOpenSettings,
  onOpenProgress,
}: ProgressArchiveScreenProps) {
  const storageKey = useMemo(
    () => `${ARCHIVE_SECTIONS_STORAGE_KEY}:${currentUser?.id ?? 'anon'}`,
    [currentUser?.id],
  );
  const archiveSkipSaveRef = React.useRef(false);
  const [openSections, setOpenSections] = useState<Record<ArchiveSectionKey, boolean>>(defaultOpenSections);

  useEffect(() => {
    try {
      archiveSkipSaveRef.current = true;
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setOpenSections(defaultOpenSections());
        return;
      }
      const parsedValue = parseJson(raw);
      const parsed = isRecord(parsedValue) ? parsedValue : {};
      setOpenSections({
        gallery: parsed.gallery === true,
        compare: parsed.compare === true,
        trend: parsed.trend === true,
        timeline: parsed.timeline === true,
      });
    } catch {
      archiveSkipSaveRef.current = true;
      setOpenSections(defaultOpenSections());
    }
  }, [storageKey]);

  const toggleSection = (section: ArchiveSectionKey) => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  };

  useEffect(() => {
    if (archiveSkipSaveRef.current) {
      archiveSkipSaveRef.current = false;
      return;
    }
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(openSections));
    } catch {
      // Ignore storage failures and keep the archive usable.
    }
  }, [openSections, storageKey]);

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
  const startMeasurement = measurementsSorted[measurementsSorted.length - 1] || latestMeasurement;
  const startPhoto = progressPhotosSorted[progressPhotosSorted.length - 1] || latestPhoto;
  const archiveBloodGlucose = typeof latestMeasurement?.bloodGlucoseMmolL === 'number' && Number.isFinite(latestMeasurement.bloodGlucoseMmolL) && latestMeasurement.bloodGlucoseMmolL > 0
    ? latestMeasurement.bloodGlucoseMmolL
    : typeof currentUser?.bloodGlucoseMmolL === 'number' && Number.isFinite(currentUser.bloodGlucoseMmolL) && currentUser.bloodGlucoseMmolL > 0
      ? currentUser.bloodGlucoseMmolL
      : null;
  const archiveBloodGlucoseMeasuredAt = typeof latestMeasurement?.bloodGlucoseMmolL === 'number' && Number.isFinite(latestMeasurement.bloodGlucoseMmolL) && latestMeasurement.bloodGlucoseMmolL > 0
    ? latestMeasurement.date
    : currentUser?.bloodGlucoseMeasuredAt || null;
  const archiveBloodGlucoseSourceLabel = typeof latestMeasurement?.bloodGlucoseMmolL === 'number' && Number.isFinite(latestMeasurement.bloodGlucoseMmolL) && latestMeasurement.bloodGlucoseMmolL > 0
    ? 'последний замер'
    : typeof currentUser?.bloodGlucoseMmolL === 'number' && Number.isFinite(currentUser.bloodGlucoseMmolL) && currentUser.bloodGlucoseMmolL > 0
      ? 'профиль'
      : null;
  const archiveStartDate = startMeasurement?.date || startPhoto?.date || null;
  const archiveEndDate = latestMeasurement?.date || latestPhoto?.date || null;
  const archiveSpanDays =
    archiveStartDate && archiveEndDate
      ? Math.max(0, Math.round((new Date(archiveEndDate).getTime() - new Date(archiveStartDate).getTime()) / 86400000))
      : null;
  const weightStart = startMeasurement;
  const photoStart = startPhoto;
  const weightDiff =
    latestMeasurement && weightStart && typeof latestMeasurement.weight === 'number' && typeof weightStart.weight === 'number'
      ? latestMeasurement.weight - weightStart.weight
      : null;
  const waistDiff =
    latestMeasurement && weightStart && typeof latestMeasurement.waistCm === 'number' && typeof weightStart.waistCm === 'number'
      ? latestMeasurement.waistCm - weightStart.waistCm
      : null;
  const firstWeightLabel = typeof weightStart?.weight === 'number' ? `${weightStart.weight.toFixed(1)} кг` : '—';
  const latestWeightLabel = typeof latestMeasurement?.weight === 'number'
    ? `${latestMeasurement.weight.toFixed(1)} кг`
    : typeof currentWeight === 'number'
      ? `${currentWeight.toFixed(1)} кг`
      : '—';
  const firstWaistLabel = typeof weightStart?.waistCm === 'number' ? `${weightStart.waistCm} см` : '—';
  const latestWaistLabel = typeof latestMeasurement?.waistCm === 'number' ? `${latestMeasurement.waistCm} см` : '—';
  const progressSummary = useMemo(() => {
    const parts: string[] = [];
    if (weightDiff !== null) {
      parts.push(`${weightDiff > 0 ? 'прибавка' : 'минус'} ${Math.abs(weightDiff).toFixed(1)} кг`);
    }
    if (waistDiff !== null) {
      parts.push(`${waistDiff > 0 ? 'талия выросла' : 'талия уменьшилась'} на ${Math.abs(waistDiff).toFixed(1)} см`);
    }
    if (!parts.length) {
      parts.push('добавьте хотя бы две точки, чтобы увидеть разницу');
    }
    return parts.join(' · ');
  }, [waistDiff, weightDiff]);

  const exportArchivePdf = async () => {
    if (!currentUser) return;
    const { downloadProgressArchivePdf } = await import('./pdf');
    await downloadProgressArchivePdf({
      userName: currentUser.name || 'Пользователь',
      generatedAt: new Date().toLocaleString('ru-RU'),
      startLabel: archiveStartDate ? formatDate(archiveStartDate) : '—',
      endLabel: archiveEndDate ? formatDate(archiveEndDate) : '—',
      startDate: archiveStartDate,
      endDate: archiveEndDate,
      spanDays: archiveSpanDays,
      startWeight: weightStart?.weight ?? null,
      endWeight: latestMeasurement?.weight ?? currentWeight ?? null,
      startWaist: weightStart?.waistCm ?? null,
      endWaist: latestMeasurement?.waistCm ?? null,
      startPhoto: photoStart?.thumb ?? null,
      endPhoto: latestPhoto?.thumb ?? null,
      startNote: photoStart?.note ?? null,
      endNote: latestPhoto?.note ?? null,
      bloodGlucoseMmolL: archiveBloodGlucose,
      bloodGlucoseMeasuredAt: archiveBloodGlucoseMeasuredAt,
      bloodGlucoseSourceLabel: archiveBloodGlucoseSourceLabel,
      totalPhotos: progressPhotosSorted.length,
      totalMeasurements: measurementsSorted.length,
      wearableLabel: wearableProvider && wearableEnabled !== false ? providerLabel(wearableProvider) : 'Ручной ввод',
      wearableLastSyncAt,
      wearableMetricsUpdatedAt,
      summary: progressSummary,
      timelineItems: archiveTimeline.slice(0, 8),
    });
  };

  const providerLabel = (provider: WearableProvider) => {
    switch (provider) {
      case 'apple_health':
        return 'Apple Health';
      case 'huawei_health':
        return 'Huawei Health';
      case 'google_fit':
        return 'Google Fit';
      case 'fitbit':
        return 'Fitbit';
      case 'garmin':
        return 'Garmin';
      default:
        return 'Ручной импорт';
    }
  };

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
      const wearableDayKey = wearableMetricsDayKey || toLocalDayKey(wearableMetricsUpdatedAt || wearableLastSyncAt);
      items.push({
        kind: 'wearable',
        date: wearableDayKey || wearableMetricsUpdatedAt || wearableLastSyncAt || new Date().toISOString(),
        title: 'Часы',
        detail: wearableProvider && wearableEnabled !== false ? `Источник: ${wearableProvider}` : 'Источник подключён',
      });
    }

    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 12);
  }, [measurementsSorted, progressPhotosSorted, wearableEnabled, wearableLastSyncAt, wearableMetricsDayKey, wearableMetricsUpdatedAt, wearableProvider]);

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
          <button
            type="button"
            onClick={() => void exportArchivePdf()}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-[1rem] border border-slate-800 bg-slate-950/40 hover:bg-slate-900 text-slate-200 font-black transition-all"
          >
            <Cloud className="w-4 h-4" />
            Экспорт PDF
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

          <div className="mt-4 md:hidden flex items-center justify-between gap-3 rounded-[1.2rem] border border-slate-800 bg-slate-950/30 px-4 py-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ещё фото</div>
              <div className="mt-1 text-sm font-black text-slate-100">{progressPhotosSorted.length ? `${progressPhotosSorted.length} снимков` : 'Нет дополнительных снимков'}</div>
            </div>
            <button
              type="button"
              onClick={() => toggleSection('gallery')}
              className="inline-flex items-center gap-2 rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-fuchsia-200"
            >
              {openSections.gallery ? 'Скрыть' : 'Показать'}
            </button>
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

          <div className={clsx('mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3', !openSections.gallery && 'hidden md:grid')}>
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

      <section className="rounded-[2.25rem] border border-slate-800 bg-gradient-to-br from-slate-900/70 via-slate-900/40 to-indigo-950/20 p-5 md:p-6 overflow-hidden">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Главный кадр</div>
            <h2 className="mt-2 text-2xl md:text-3xl font-black text-slate-100">Before / after</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">Большая пара фото показывает результат наглядно, а не только через цифры.</p>
          </div>
          <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-200">
            {progressSummary}
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_auto_1fr] items-stretch">
          <HeroPhotoCard
            title="Старт"
            caption={archiveStartDate ? formatDate(archiveStartDate) : 'Нет даты'}
            photo={photoStart?.thumb}
            note={photoStart?.note || 'Первый снимок'}
            weight={firstWeightLabel}
            waist={firstWaistLabel}
            badge="до"
          />

          <div className="hidden xl:flex flex-col items-center justify-center gap-3 px-2">
            <div className="rounded-full border border-slate-700 bg-slate-950/60 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300">
              Сравнение
            </div>
            <div className="h-full min-h-[220px] w-px bg-gradient-to-b from-transparent via-slate-700 to-transparent" />
          </div>

          <HeroPhotoCard
            title="Сейчас"
            caption={archiveEndDate ? formatDate(archiveEndDate) : 'Нет даты'}
            photo={latestPhoto?.thumb}
            note={latestPhoto?.note || 'Последний снимок'}
            weight={latestWeightLabel}
            waist={latestWaistLabel}
            badge="после"
            highlight
          />
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-800 bg-slate-900/40 p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">До / после</div>
            <h2 className="mt-2 text-2xl font-black text-slate-100">Сравнение прогресса</h2>
            <p className="mt-2 text-sm text-slate-400">Быстрый ответ на вопрос, что изменилось между первой и последней точкой.</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-300">
            <TrendingUp size={18} />
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Период"
            value={archiveSpanDays !== null ? `${archiveSpanDays} дн.` : '—'}
            delta={archiveStartDate && archiveEndDate ? `${formatDate(archiveStartDate)} → ${formatDate(archiveEndDate)}` : 'Нужны две точки'}
          />
          <Metric
            label="Вес"
            value={weightDiff !== null ? `${weightDiff > 0 ? '+' : ''}${weightDiff.toFixed(1)} кг` : '—'}
            delta={`${firstWeightLabel} → ${latestWeightLabel}`}
          />
          <Metric
            label="Талия"
            value={waistDiff !== null ? `${waistDiff > 0 ? '+' : ''}${waistDiff.toFixed(1)} см` : '—'}
            delta={`${firstWaistLabel} → ${latestWaistLabel}`}
          />
          <Metric
            label="Фото"
            value={progressPhotosSorted.length ? `${progressPhotosSorted.length} шт.` : '—'}
            delta={photoStart && latestPhoto ? `${formatDate(photoStart.date)} → ${formatDate(latestPhoto.date)}` : 'Пока нет пары фото'}
          />
        </div>

        <div className="mt-4 md:hidden flex items-center justify-between gap-3 rounded-[1.2rem] border border-slate-800 bg-slate-950/30 px-4 py-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Карточки сравнения</div>
            <div className="mt-1 text-sm font-black text-slate-100">Откройте старт и текущий кадр отдельно</div>
          </div>
          <button
            type="button"
            onClick={() => toggleSection('compare')}
            className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/60 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-200"
          >
            {openSections.compare ? 'Скрыть' : 'Показать'}
          </button>
        </div>

        <div className={clsx('mt-5 grid gap-3 lg:grid-cols-[1fr_auto_1fr] items-stretch', !openSections.compare && 'hidden md:grid')}>
          <CompareCard
            title="Старт"
            caption={archiveStartDate ? formatDate(archiveStartDate) : 'Нет даты'}
            weight={firstWeightLabel}
            waist={firstWaistLabel}
            photo={photoStart?.thumb}
            note={photoStart?.note || 'Первый снимок'}
          />
          <div className="hidden lg:flex items-center justify-center">
            <div className="rounded-full border border-slate-800 bg-slate-950/50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
              Сравнение
            </div>
          </div>
          <CompareCard
            title="Сейчас"
            caption={archiveEndDate ? formatDate(archiveEndDate) : 'Нет даты'}
            weight={latestWeightLabel}
            waist={latestWaistLabel}
            photo={latestPhoto?.thumb}
            note={latestPhoto?.note || 'Последний снимок'}
            highlight
          />
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

        <div className="mt-4 md:hidden flex items-center justify-between gap-3 rounded-[1.2rem] border border-slate-800 bg-slate-950/30 px-4 py-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">График</div>
            <div className="mt-1 text-sm font-black text-slate-100">Тренд веса раскрывается по нажатию</div>
          </div>
          <button
            type="button"
            onClick={() => toggleSection('trend')}
            className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-indigo-200"
          >
            {openSections.trend ? 'Скрыть' : 'Показать'}
          </button>
        </div>

        <div className={clsx('mt-5 h-[280px]', !openSections.trend && 'hidden md:block')}>
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

        <div className="mt-4 md:hidden flex items-center justify-between gap-3 rounded-[1.2rem] border border-slate-800 bg-slate-950/30 px-4 py-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Лента</div>
            <div className="mt-1 text-sm font-black text-slate-100">События можно открыть отдельным списком</div>
          </div>
          <button
            type="button"
            onClick={() => toggleSection('timeline')}
            className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/60 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-200"
          >
            {openSections.timeline ? 'Скрыть' : 'Показать'}
          </button>
        </div>

        <div className={clsx('mt-5 space-y-3', !openSections.timeline && 'hidden md:block')}>
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

function CompareCard({
  title,
  caption,
  weight,
  waist,
  photo,
  note,
  highlight,
}: {
  title: string;
  caption: string;
  weight: string;
  waist: string;
  photo?: string;
  note: string;
  highlight?: boolean;
}) {
  return (
    <div className={clsx('rounded-[1.6rem] border p-4 md:p-5', highlight ? 'border-indigo-500/30 bg-indigo-500/10' : 'border-slate-800 bg-slate-950/35')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{title}</div>
          <div className="mt-1 text-sm text-slate-400">{caption}</div>
        </div>
        <div className={clsx('text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full border', highlight ? 'border-indigo-500/20 bg-indigo-500/10 text-indigo-200' : 'border-slate-800 bg-slate-900 text-slate-500')}>
          {highlight ? 'последняя точка' : 'старт'}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-[1rem] border border-slate-800 bg-slate-950/45 p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Вес</div>
          <div className="mt-1 text-lg font-black text-slate-100 tabular-nums">{weight}</div>
        </div>
        <div className="rounded-[1rem] border border-slate-800 bg-slate-950/45 p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Талия</div>
          <div className="mt-1 text-lg font-black text-slate-100 tabular-nums">{waist}</div>
        </div>
      </div>

      <div className="mt-4 rounded-[1.2rem] overflow-hidden border border-slate-800 bg-slate-950">
        {photo ? (
          <img src={photo} alt={note} className="aspect-[4/3] w-full object-cover" />
        ) : (
          <div className="aspect-[4/3] flex items-center justify-center text-slate-500 text-sm">Нет фото</div>
        )}
      </div>

      <div className="mt-3 text-sm text-slate-300">{note}</div>
    </div>
  );
}

function HeroPhotoCard({
  title,
  caption,
  photo,
  note,
  weight,
  waist,
  badge,
  highlight,
}: {
  title: string;
  caption: string;
  photo?: string;
  note: string;
  weight: string;
  waist: string;
  badge: string;
  highlight?: boolean;
}) {
  return (
    <div className={clsx('rounded-[2rem] border overflow-hidden shadow-2xl shadow-black/20', highlight ? 'border-indigo-500/30 bg-indigo-500/10' : 'border-slate-800 bg-slate-950/35')}>
      <div className="relative min-h-[320px] sm:min-h-[420px]">
        {photo ? (
          <img src={photo} alt={note} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-slate-950 flex items-center justify-center text-slate-500">Нет фото</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-between p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/80">
              {title}
            </div>
            <div className={clsx('rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest', highlight ? 'border-indigo-300/30 bg-indigo-400/15 text-indigo-100' : 'border-white/10 bg-black/25 text-white/80')}>
              {badge}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-300/80">{caption}</div>
              <div className="mt-2 text-sm font-medium text-slate-100/90 max-w-[28rem]">{note}</div>
            </div>

            <div className="grid grid-cols-2 gap-3 max-w-[24rem]">
              <div className="rounded-[1rem] border border-white/10 bg-black/35 backdrop-blur-md p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-300/80">Вес</div>
                <div className="mt-1 text-xl font-black text-white tabular-nums">{weight}</div>
              </div>
              <div className="rounded-[1rem] border border-white/10 bg-black/35 backdrop-blur-md p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-300/80">Талия</div>
                <div className="mt-1 text-xl font-black text-white tabular-nums">{waist}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
