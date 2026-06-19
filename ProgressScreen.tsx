import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Activity,
  ArrowRight,
  Camera,
  CalendarDays,
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
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { WeightTrendChart } from './charts';
import { downloadProgressComparisonPdf } from './pdf';
import { normalizeWearableSyncSnapshot } from './wearableSync';
import { formatBloodGlucose, getBloodGlucoseGuidance } from './profileMath';
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
  onOpenArchive?: () => void;
};

type MetricKey = 'weight' | 'waistCm' | 'chestCm' | 'hipsCm' | 'restingPulse' | 'bloodGlucoseMmolL';
type ProgressSectionId = 'summary' | 'compare' | 'dynamics' | 'measurements' | 'photos' | 'timeline';

type ProgressUiState = {
  selectedMetric: MetricKey;
  activeSection: ProgressSectionId;
  mobileDetailsOpen: boolean;
  timelineFilter: 'all' | 'measurement' | 'photo' | 'wearable';
  compareFromKey: string;
  compareToKey: string;
  compareMode: 'all' | 'matched';
};

const PROGRESS_UI_STORAGE_KEY = 'fitfocus.progress.ui.v1';

const metricMeta: Record<MetricKey, { label: string; unit: string; color: string }> = {
  weight: { label: 'Вес', unit: 'кг', color: '#818CF8' },
  waistCm: { label: 'Талия', unit: 'см', color: '#34D399' },
  chestCm: { label: 'Грудь', unit: 'см', color: '#F59E0B' },
  hipsCm: { label: 'Бёдра', unit: 'см', color: '#F472B6' },
  restingPulse: { label: 'Пульс', unit: 'уд/мин', color: '#38BDF8' },
  bloodGlucoseMmolL: { label: 'Сахар', unit: 'ммоль/л', color: '#FB7185' },
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

type WearableImportPayload = {
  provider?: WearableProvider;
  stepsToday?: number;
  activeMinutesToday?: number;
  sleepHoursLastNight?: number;
  weight?: number;
  pulse?: number;
  bloodGlucoseMmolL?: number;
  date?: string;
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

const toUtcDate = (dateKey: string) => new Date(`${dateKey}T00:00:00Z`);

const incrementUtcDate = (date: Date) => new Date(date.getTime() + 86400000);

const formatDelta = (current?: number | null, prev?: number | null, unit = '') => {
  if (typeof current !== 'number' || typeof prev !== 'number') return '—';
  const diff = current - prev;
  if (Number.isNaN(diff)) return '—';
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toFixed(1)} ${unit}`.trim();
};

const parseNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(',', '.').trim();
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};

const parseWearableJson = (text: string): WearableImportPayload | null => {
  try {
    const raw = JSON.parse(text);
    const obj = normalizeWearableSyncSnapshot(raw);
    if (!obj) return null;
    return {
      provider: obj.provider,
      stepsToday: obj.stepsToday,
      activeMinutesToday: obj.activeMinutesToday,
      sleepHoursLastNight: obj.sleepHoursLastNight,
      weight: obj.weight,
      pulse: obj.pulse,
      bloodGlucoseMmolL: obj.bloodGlucoseMmolL,
      date: obj.date || obj.metricsUpdatedAt,
    };
  } catch {
    return null;
  }
};

const parseWearableCsv = (text: string): WearableImportPayload | null => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return null;
  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delimiter).map((h) => h.trim().toLowerCase());
  const row = lines[1]?.split(delimiter).map((c) => c.trim());
  if (!row || !headers.length) return null;
  const data = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']));
  return {
    provider: typeof data.provider === 'string' ? data.provider as WearableProvider : typeof data.source === 'string' ? data.source as WearableProvider : undefined,
    stepsToday: parseNumber(data.steps ?? data.stepcount ?? data.dailysteps),
    activeMinutesToday: parseNumber(data.active_minutes ?? data.activeminutes ?? data.move_minutes),
    sleepHoursLastNight: parseNumber(data.sleep_hours ?? data.sleephours ?? data.sleep),
    weight: parseNumber(data.weight ?? data.bodyweight),
    pulse: parseNumber(data.pulse ?? data.restingpulse),
    bloodGlucoseMmolL: parseNumber(data.blood_glucose ?? data.glucose ?? data.sugar ?? data.bloodglucose ?? data.blood_glucose_mmol_l ?? data.glucose_mmol_l),
    date: typeof data.date === 'string' ? data.date : typeof data.recordedat === 'string' ? data.recordedat : undefined,
  };
};

const parseWearableImport = (text: string): WearableImportPayload | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return parseWearableJson(trimmed) || parseWearableCsv(trimmed);
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
  onOpenArchive,
}: ProgressScreenProps) {
  const storageKey = useMemo(() => `${PROGRESS_UI_STORAGE_KEY}:${currentUser?.id ?? 'anon'}`, [currentUser?.id]);
  const uiSkipSaveRef = React.useRef(false);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('weight');
  const [activeSection, setActiveSection] = useState<ProgressSectionId>('summary');
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'measurement' | 'photo' | 'wearable'>('all');
  const [wearableBusy, setWearableBusy] = useState<WearableProvider | 'disconnect' | null>(null);
  const [draftWeight, setDraftWeight] = useState('');
  const [draftWaist, setDraftWaist] = useState('');
  const [draftChest, setDraftChest] = useState('');
  const [draftHips, setDraftHips] = useState('');
  const [draftPulse, setDraftPulse] = useState('');
  const [draftBloodGlucose, setDraftBloodGlucose] = useState('');
  const [draftSteps, setDraftSteps] = useState('');
  const [draftActiveMinutes, setDraftActiveMinutes] = useState('');
  const [draftSleepHours, setDraftSleepHours] = useState('');
  const [draftSaving, setDraftSaving] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [wearablePasteDraft, setWearablePasteDraft] = useState('');
  const wearableImportInputRef = React.useRef<HTMLInputElement | null>(null);

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
    setDraftBloodGlucose(
      typeof latest?.bloodGlucoseMmolL === 'number'
        ? String(latest.bloodGlucoseMmolL)
        : typeof currentUser?.bloodGlucoseMmolL === 'number'
          ? String(currentUser.bloodGlucoseMmolL)
          : '',
    );
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

  const progressDateKeys = useMemo(() => {
    const keys = new Set<string>();
    recentMeasurements.forEach((item) => keys.add(toDateKey(item.date)));
    progressPhotosSorted.forEach((photo) => keys.add(toDateKey(photo.date)));
    return [...keys].filter(Boolean).sort();
  }, [progressPhotosSorted, recentMeasurements]);

  const [compareFromKey, setCompareFromKey] = useState('');
  const [compareToKey, setCompareToKey] = useState('');
  const [compareMode, setCompareMode] = useState<'all' | 'matched'>('matched');

  const measurementByDate = useMemo(() => {
    const map = new Map<string, (typeof recentMeasurements)[number]>();
    recentMeasurements.forEach((item) => {
      const key = toDateKey(item.date);
      if (key) map.set(key, item);
    });
    return map;
  }, [recentMeasurements]);

  const photoByDate = useMemo(() => {
    const map = new Map<string, ProgressPhoto>();
    progressPhotosSorted.forEach((photo) => {
      const key = toDateKey(photo.date);
      if (key && !map.has(key)) map.set(key, photo);
    });
    return map;
  }, [progressPhotosSorted]);

  const matchedCompareKeys = useMemo(
    () => progressDateKeys.filter((key) => measurementByDate.has(key) && photoByDate.has(key)),
    [measurementByDate, photoByDate, progressDateKeys],
  );
  const compareKeys = compareMode === 'matched' && matchedCompareKeys.length >= 2 ? matchedCompareKeys : progressDateKeys;

  React.useEffect(() => {
    if (!compareKeys.length) return;
    setCompareFromKey((current) => (current && compareKeys.includes(current) ? current : compareKeys[0]));
    setCompareToKey((current) => (current && compareKeys.includes(current) ? current : compareKeys[compareKeys.length - 1]));
  }, [compareKeys]);

  useEffect(() => {
    try {
      uiSkipSaveRef.current = true;
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ProgressUiState>;
      setSelectedMetric(
        parsed.selectedMetric === 'weight' ||
        parsed.selectedMetric === 'waistCm' ||
        parsed.selectedMetric === 'chestCm' ||
        parsed.selectedMetric === 'hipsCm' ||
        parsed.selectedMetric === 'restingPulse' ||
        parsed.selectedMetric === 'bloodGlucoseMmolL'
          ? parsed.selectedMetric
          : 'weight',
      );
      setActiveSection(
        parsed.activeSection === 'summary' ||
        parsed.activeSection === 'compare' ||
        parsed.activeSection === 'dynamics' ||
        parsed.activeSection === 'measurements' ||
        parsed.activeSection === 'photos' ||
        parsed.activeSection === 'timeline'
          ? parsed.activeSection
          : 'summary',
      );
      setMobileDetailsOpen(typeof parsed.mobileDetailsOpen === 'boolean' ? parsed.mobileDetailsOpen : false);
      setTimelineFilter(
        parsed.timelineFilter === 'measurement' || parsed.timelineFilter === 'photo' || parsed.timelineFilter === 'wearable'
          ? parsed.timelineFilter
          : 'all',
      );
      setCompareFromKey(typeof parsed.compareFromKey === 'string' ? parsed.compareFromKey : '');
      setCompareToKey(typeof parsed.compareToKey === 'string' ? parsed.compareToKey : '');
      setCompareMode(parsed.compareMode === 'all' ? 'all' : 'matched');
    } catch {
      uiSkipSaveRef.current = true;
      setSelectedMetric('weight');
      setActiveSection('summary');
      setMobileDetailsOpen(false);
      setTimelineFilter('all');
      setCompareFromKey('');
      setCompareToKey('');
      setCompareMode('matched');
    }
  }, [storageKey]);

  useEffect(() => {
    if (uiSkipSaveRef.current) {
      uiSkipSaveRef.current = false;
      return;
    }
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({
        selectedMetric,
        activeSection,
        mobileDetailsOpen,
        timelineFilter,
        compareFromKey,
        compareToKey,
        compareMode,
      }));
    } catch {
      // Ignore storage failures and keep the screen usable.
    }
  }, [activeSection, compareFromKey, compareMode, compareToKey, mobileDetailsOpen, selectedMetric, storageKey, timelineFilter]);

  const timelineGroups = useMemo(() => {
    type TimelineItem =
      | { kind: 'measurement'; date: string; title: string; detail: string; tone: string }
      | { kind: 'photo'; date: string; title: string; detail: string; tone: string; thumb?: string }
      | { kind: 'wearable'; date: string; title: string; detail: string; tone: string };

    const items: TimelineItem[] = [];

    recentMeasurements.forEach((item) => {
      const parts = [
        typeof item.weight === 'number' ? `${item.weight.toFixed(1)} кг` : null,
        typeof item.waistCm === 'number' ? `талия ${item.waistCm} см` : null,
        typeof item.restingPulse === 'number' ? `пульс ${item.restingPulse}` : null,
        typeof item.bloodGlucoseMmolL === 'number' ? `сахар ${item.bloodGlucoseMmolL.toFixed(1)} ммоль/л` : null,
      ].filter(Boolean) as string[];
      items.push({
        kind: 'measurement',
        date: item.date,
        title: 'Замер',
        detail: parts.length ? parts.join(' · ') : 'Обновлён профиль тела',
        tone: 'bg-indigo-500/10 text-indigo-200 border-indigo-500/20',
      });
    });

    progressPhotosSorted.forEach((photo) => {
      items.push({
        kind: 'photo',
        date: photo.date,
        title: 'Фото',
        detail: photo.note || 'Фото прогресса',
        tone: 'bg-fuchsia-500/10 text-fuchsia-200 border-fuchsia-500/20',
        thumb: photo.thumb,
      });
    });

    if (wearableMetricsUpdatedAt || wearableLastSyncAt || wearableConnectedAt) {
      const wearableDate = wearableMetricsUpdatedAt || wearableLastSyncAt || wearableConnectedAt || new Date().toISOString();
      const details = [
        typeof wearableStepsToday === 'number' ? `${wearableStepsToday.toLocaleString('ru-RU')} шагов` : null,
        typeof wearableActiveMinutesToday === 'number' ? `${wearableActiveMinutesToday} мин` : null,
        typeof wearableSleepHoursLastNight === 'number' ? `${wearableSleepHoursLastNight.toFixed(1)} ч сна` : null,
      ].filter(Boolean) as string[];
      items.push({
        kind: 'wearable',
        date: wearableDate,
        title: 'Часы',
        detail: details.length ? details.join(' · ') : 'Источник подключён, данные ждут обновления',
        tone: 'bg-sky-500/10 text-sky-200 border-sky-500/20',
      });
    }

    const groups = new Map<string, { key: string; label: string; date: number; items: TimelineItem[] }>();
    const filteredItems = timelineFilter === 'all' ? items : items.filter((item) => item.kind === timelineFilter);

    filteredItems
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .forEach((item) => {
        const dateObj = new Date(item.date);
        const key = Number.isNaN(dateObj.getTime()) ? item.date.slice(0, 10) : dateObj.toISOString().slice(0, 10);
        if (!groups.has(key)) {
          groups.set(key, {
            key,
            label: Number.isNaN(dateObj.getTime())
              ? item.date
              : dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }),
            date: Number.isNaN(dateObj.getTime()) ? 0 : dateObj.getTime(),
            items: [],
          });
        }
        groups.get(key)!.items.push(item);
      });

    return [...groups.values()].sort((a, b) => b.date - a.date).slice(0, 8);
  }, [progressPhotosSorted, recentMeasurements, timelineFilter, wearableActiveMinutesToday, wearableConnectedAt, wearableLastSyncAt, wearableMetricsUpdatedAt, wearableSleepHoursLastNight, wearableStepsToday]);

  const latestPhoto = progressPhotosSorted[0] || null;
  const firstPhoto = progressPhotosSorted.length > 1 ? progressPhotosSorted[progressPhotosSorted.length - 1] : null;
  const firstMeasurement = recentMeasurements[0] || null;
  const measurementSpanDays =
    latestMeasurement && firstMeasurement
      ? Math.max(0, Math.round((new Date(latestMeasurement.date).getTime() - new Date(firstMeasurement.date).getTime()) / 86400000))
      : null;
  const photoSpanDays =
    latestPhoto && firstPhoto
      ? Math.max(0, Math.round((new Date(latestPhoto.date).getTime() - new Date(firstPhoto.date).getTime()) / 86400000))
      : null;
  const weightSinceStart = formatDelta(latestMeasurement?.weight, firstMeasurement?.weight, 'кг');
  const waistSinceStart = formatDelta(latestMeasurement?.waistCm, firstMeasurement?.waistCm, 'см');
  const pulseSinceStart = formatDelta(latestMeasurement?.restingPulse, firstMeasurement?.restingPulse, 'уд/мин');
  const compareFromMeasurement = compareFromKey ? measurementByDate.get(compareFromKey) || null : null;
  const compareToMeasurement = compareToKey ? measurementByDate.get(compareToKey) || null : null;
  const compareFromPhoto = compareFromKey ? photoByDate.get(compareFromKey) || null : null;
  const compareToPhoto = compareToKey ? photoByDate.get(compareToKey) || null : null;
  const compareWeightDelta = formatDelta(compareToMeasurement?.weight, compareFromMeasurement?.weight, 'кг');
  const compareWaistDelta = formatDelta(compareToMeasurement?.waistCm, compareFromMeasurement?.waistCm, 'см');
  const comparePulseDelta = formatDelta(compareToMeasurement?.restingPulse, compareFromMeasurement?.restingPulse, 'уд/мин');
  const compareModeLabel = compareMode === 'matched' ? 'Только дни с фото и замерами' : 'Все доступные даты';
  const canExportComparison = Boolean(compareFromKey && compareToKey);

  const progressDynamicsSeries = useMemo(() => {
    const dayBuckets = new Map<string, { measurements: number; photos: number }>();
    recentMeasurements.forEach((item) => {
      const key = toDateKey(item.date);
      if (!key) return;
      const bucket = dayBuckets.get(key) || { measurements: 0, photos: 0 };
      bucket.measurements += 1;
      dayBuckets.set(key, bucket);
    });
    progressPhotosSorted.forEach((item) => {
      const key = toDateKey(item.date);
      if (!key) return;
      const bucket = dayBuckets.get(key) || { measurements: 0, photos: 0 };
      bucket.photos += 1;
      dayBuckets.set(key, bucket);
    });

    const keys = [...dayBuckets.keys()].sort();
    if (!keys.length) return [];

    const firstKey = keys[0];
    const lastKey = keys[keys.length - 1];
    const series: Array<{
      date: string;
      label: string;
      measurements: number;
      photos: number;
      total: number;
    }> = [];

    let cursor = toUtcDate(firstKey);
    const lastDate = toUtcDate(lastKey);
    let cumulativeMeasurements = 0;
    let cumulativePhotos = 0;

    while (cursor <= lastDate) {
      const key = cursor.toISOString().slice(0, 10);
      const bucket = dayBuckets.get(key);
      if (bucket) {
        cumulativeMeasurements += bucket.measurements;
        cumulativePhotos += bucket.photos;
      }
      series.push({
        date: key,
        label: formatShortDate(key),
        measurements: cumulativeMeasurements,
        photos: cumulativePhotos,
        total: cumulativeMeasurements + cumulativePhotos,
      });
      cursor = incrementUtcDate(cursor);
    }

    return series.slice(-60);
  }, [progressPhotosSorted, recentMeasurements]);

  const progressDynamicsLastPoint = progressDynamicsSeries.length ? progressDynamicsSeries[progressDynamicsSeries.length - 1] : null;
  const progressDynamicsFirstPoint = progressDynamicsSeries.length ? progressDynamicsSeries[0] : null;
  const progressDynamicsDeltaPhotos =
    progressDynamicsLastPoint && progressDynamicsFirstPoint ? progressDynamicsLastPoint.photos - progressDynamicsFirstPoint.photos : null;
  const progressDynamicsDeltaMeasurements =
    progressDynamicsLastPoint && progressDynamicsFirstPoint ? progressDynamicsLastPoint.measurements - progressDynamicsFirstPoint.measurements : null;

  const exportComparisonPdf = async () => {
    if (!currentUser || !canExportComparison) return;
    await downloadProgressComparisonPdf({
      userName: currentUser.name,
      fromKey: compareFromKey,
      toKey: compareToKey,
      fromLabel: compareFromKey ? formatShortDate(compareFromKey) : '—',
      toLabel: compareToKey ? formatShortDate(compareToKey) : '—',
      fromWeight: compareFromMeasurement?.weight,
      toWeight: compareToMeasurement?.weight,
      fromWaist: compareFromMeasurement?.waistCm,
      toWaist: compareToMeasurement?.waistCm,
      fromPulse: compareFromMeasurement?.restingPulse,
      toPulse: compareToMeasurement?.restingPulse,
      fromPhoto: Boolean(compareFromPhoto),
      toPhoto: Boolean(compareToPhoto),
      totalPhotos: progressPhotosSorted.length,
      totalMeasurements: recentMeasurements.length,
    });
  };

  const wearableSummary = wearableProvider && wearableEnabled !== false ? providerLabel[wearableProvider] : 'Не подключено';
  const wearableIsConnected = !!wearableProvider && wearableEnabled !== false;
  const wearableSourceHint = wearableProvider === 'apple_health'
    ? 'Apple Health получает данные через iPhone bridge и отправляет их в FitFocus.'
    : wearableProvider
      ? 'Источник подключён и может обновлять шаги, сон и пульс.'
      : 'Выберите источник синхронизации в настройках.';
  const wearableConnectedLabel = formatDate(wearableConnectedAt || currentUser?.wearableConnectedAt);
  const wearableSyncLabel = formatDate(wearableLastSyncAt || currentUser?.wearableLastSyncAt);
  const wearableMetricsLabel = formatDate(wearableMetricsUpdatedAt || currentUser?.wearableMetricsUpdatedAt);
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
    const nextBloodGlucose = parse(draftBloodGlucose);
    const nextSteps = parse(draftSteps);
    const nextActiveMinutes = parse(draftActiveMinutes);
    const nextSleepHours = parse(draftSleepHours);
    if (!nextWeight && !nextWaist && !nextChest && !nextHips && !nextPulse && !nextBloodGlucose && !nextSteps && !nextActiveMinutes && !nextSleepHours) return;
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
      bloodGlucoseMmolL: nextBloodGlucose ?? undefined,
    };
      await onPatchUser({
      weight: nextWeight ?? currentUser.weight,
      weightHistory: nextWeight ? [{ date: now, weight: nextWeight }, ...(currentUser.weightHistory || [])].slice(0, 120) : currentUser.weightHistory,
      waistCm: nextWaist ?? currentUser.waistCm,
      chestCm: nextChest ?? currentUser.chestCm,
      hipsCm: nextHips ?? currentUser.hipsCm,
      restingPulse: nextPulse ?? currentUser.restingPulse,
      bloodGlucoseMmolL: nextBloodGlucose ?? currentUser.bloodGlucoseMmolL,
      wearableStepsToday: nextSteps ?? currentUser.wearableStepsToday,
      wearableActiveMinutesToday: nextActiveMinutes ?? currentUser.wearableActiveMinutesToday,
      wearableSleepHoursLastNight: nextSleepHours ?? currentUser.wearableSleepHoursLastNight,
        bloodPressureMeasuredAt: currentUser.bloodPressureMeasuredAt,
        bodyMeasurementsMeasuredAt: (nextWaist || nextChest || nextHips || nextPulse) ? now : currentUser.bodyMeasurementsMeasuredAt,
        bloodGlucoseMeasuredAt: nextBloodGlucose ? now : currentUser.bloodGlucoseMeasuredAt,
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

  const importWearableText = async (text: string) => {
    if (!onPatchUser || !currentUser) return;
    setImportError(null);
    setImportBusy(true);
    try {
      const payload = parseWearableImport(text);
      if (!payload) throw new Error('Не удалось распознать JSON/CSV формат');

      const now = new Date().toISOString();
      const importDate = payload.date || now;
      const nextPatch: Partial<UserProfile> = {
        wearableProvider: payload.provider || currentUser.wearableProvider || 'manual',
        wearableEnabled: true,
        wearableConnectedAt: currentUser.wearableConnectedAt || now,
        wearableLastSyncAt: now,
        wearableMetricsUpdatedAt: now,
      };

      if (typeof payload.stepsToday === 'number') nextPatch.wearableStepsToday = Math.round(payload.stepsToday);
      if (typeof payload.activeMinutesToday === 'number') nextPatch.wearableActiveMinutesToday = Math.round(payload.activeMinutesToday);
      if (typeof payload.sleepHoursLastNight === 'number') nextPatch.wearableSleepHoursLastNight = Number(payload.sleepHoursLastNight.toFixed(1));
      if (typeof payload.weight === 'number' && Number.isFinite(payload.weight) && payload.weight > 0) {
        nextPatch.weight = payload.weight;
        nextPatch.weightHistory = [{ date: importDate, weight: payload.weight }, ...(currentUser.weightHistory || [])].slice(0, 120);
      }
      if (typeof payload.pulse === 'number' && Number.isFinite(payload.pulse) && payload.pulse > 0) {
        nextPatch.restingPulse = Math.round(payload.pulse);
        nextPatch.restingPulseMeasuredAt = importDate;
      }
      if (typeof payload.bloodGlucoseMmolL === 'number' && Number.isFinite(payload.bloodGlucoseMmolL) && payload.bloodGlucoseMmolL > 0) {
        nextPatch.bloodGlucoseMmolL = Number(payload.bloodGlucoseMmolL.toFixed(1));
        nextPatch.bloodGlucoseMeasuredAt = importDate;
      }

      await onPatchUser(nextPatch);
    } catch (err) {
      setImportError(String((err as Error)?.message || err || 'Ошибка импорта'));
      throw err;
    } finally {
      setImportBusy(false);
    }
  };

  const importWearableFile = async (file: File) => {
    const text = await file.text();
    await importWearableText(text);
  };

  const hasMeasurements = recentMeasurements.length > 0;
  const hasPhotos = progressPhotosSorted.length > 0;
  const scrollToSection = (sectionId: ProgressSectionId) => {
    if (sectionId !== 'summary' && !mobileDetailsOpen) {
      setMobileDetailsOpen(true);
    }
    setActiveSection(sectionId);
    window.setTimeout(() => {
      document.getElementById(`progress-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  useEffect(() => {
    const sectionIds: ProgressSectionId[] = ['summary', 'compare', 'dynamics', 'measurements', 'photos', 'timeline'];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible?.target?.id) return;
        const found = sectionIds.find((id) => `progress-${id}` === visible.target.id);
        if (found) setActiveSection(found);
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: [0.15, 0.3, 0.6] }
    );

    sectionIds.forEach((id) => {
      const el = document.getElementById(`progress-${id}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

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
          <button
            type="button"
            onClick={onOpenArchive}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 text-fuchsia-200 text-[10px] font-black uppercase tracking-widest transition-all"
          >
            <Camera size={12} />
            Архив
          </button>
        </div>
      </header>

      <section className="sticky top-3 z-20 rounded-[1.5rem] border border-slate-800 bg-slate-950/80 p-2 shadow-xl shadow-black/20 backdrop-blur-md">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'summary', label: 'Сводка' },
            { id: 'compare', label: 'Сравнение' },
            { id: 'dynamics', label: 'График' },
            { id: 'measurements', label: 'Замеры' },
            { id: 'photos', label: 'Фото' },
            { id: 'timeline', label: 'Лента' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollToSection(item.id as ProgressSectionId)}
              className={clsx(
                'rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all border',
                activeSection === item.id
                  ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200'
                  : 'border-transparent bg-transparent text-slate-500 hover:text-slate-200 hover:border-slate-800 hover:bg-slate-900/40'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="md:hidden rounded-[2rem] border border-slate-800 bg-slate-900/50 p-4 shadow-xl shadow-black/20">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Мобильный обзор</div>
            <h2 className="mt-2 text-xl font-black text-slate-100">Короткая сводка прогресса</h2>
            <p className="mt-2 text-sm font-medium text-slate-400">На телефоне показываем только главное, остальное открывается по запросу.</p>
          </div>
          <button
            type="button"
            onClick={() => setMobileDetailsOpen((current) => !current)}
            className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-indigo-200"
          >
            {mobileDetailsOpen ? 'Скрыть' : 'Детали'}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => scrollToSection('summary')}
            className="rounded-[1.25rem] border border-slate-800 bg-slate-950/40 p-3 text-left"
          >
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Вес</div>
            <div className="mt-2 text-lg font-black text-slate-100 tabular-nums">{typeof currentWeight === 'number' ? `${currentWeight.toFixed(1)} кг` : '—'}</div>
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('summary')}
            className="rounded-[1.25rem] border border-slate-800 bg-slate-950/40 p-3 text-left"
          >
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Фото</div>
            <div className="mt-2 text-lg font-black text-slate-100 tabular-nums">{progressPhotosSorted.length}</div>
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('summary')}
            className="rounded-[1.25rem] border border-slate-800 bg-slate-950/40 p-3 text-left"
          >
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Замеры</div>
            <div className="mt-2 text-lg font-black text-slate-100 tabular-nums">{recentMeasurements.length}</div>
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('compare')}
            className="rounded-[1.25rem] border border-slate-800 bg-slate-950/40 p-3 text-left"
          >
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Сравнить</div>
            <div className="mt-2 text-lg font-black text-slate-100 tabular-nums">{compareFromKey && compareToKey ? '1↔2' : '—'}</div>
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { id: 'dynamics', label: 'График' },
            { id: 'photos', label: 'Фото' },
            { id: 'timeline', label: 'Лента' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollToSection(item.id as ProgressSectionId)}
              className="rounded-full border border-slate-800 bg-slate-950/40 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300"
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="hidden md:block">
        <div className="sr-only">Desktop progress summary and navigation already shown above.</div>
      </section>

      <section id="progress-summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 scroll-mt-28">
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
              <div className="mt-1 text-sm font-semibold text-slate-400">
                {wearableIsConnected ? 'Интеграция включена' : 'Источник можно выбрать и подключить'}
              </div>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-300">
              <Watch size={18} />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="rounded-[1.1rem] border border-slate-800 bg-slate-950/40 p-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Источник</div>
              <div className="mt-1 text-sm font-black text-slate-100">{wearableSummary}</div>
              <div className="mt-1 text-xs text-slate-400">{wearableSourceHint}</div>
            </div>
            <div className="rounded-[1.1rem] border border-slate-800 bg-slate-950/40 p-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Подключено</div>
              <div className="mt-1 text-sm font-black text-slate-100">{wearableConnectedLabel}</div>
              <div className="mt-1 text-xs text-slate-400">Когда источник стал активен в профиле</div>
            </div>
            <div className="rounded-[1.1rem] border border-slate-800 bg-slate-950/40 p-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Последний sync</div>
              <div className="mt-1 text-sm font-black text-slate-100">{wearableSyncLabel}</div>
              <div className="mt-1 text-xs text-slate-400">Последняя отправка шагов, сна и пульса</div>
            </div>
            <div className="rounded-[1.1rem] border border-slate-800 bg-slate-950/40 p-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Обновлено</div>
              <div className="mt-1 text-sm font-black text-slate-100">{wearableMetricsLabel}</div>
              <div className="mt-1 text-xs text-slate-400">Когда wearable-метрики попали в профиль</div>
            </div>
          </div>

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
            Данные берутся из выбранного wearable-источника и обновляются через sync в профиле.
          </div>
        </div>
      </section>

      <section id="progress-compare" className={clsx('rounded-[2rem] border border-slate-800 bg-slate-900/40 p-5 md:p-6 scroll-mt-28', !mobileDetailsOpen && 'hidden md:block')}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Динамика прогресса</div>
            <h2 className="mt-2 text-2xl font-black text-slate-100">Старт, текущие цифры и изменение</h2>
            <p className="mt-2 text-sm font-medium text-slate-400">Этот блок собирает фото, замеры и вес в одну короткую сводку, чтобы прогресс читался с первого взгляда.</p>
          </div>
          <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <TrendingUp size={12} className="text-indigo-300" />
            История тела
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Вес с начала</div>
            <div className="mt-2 text-2xl font-black text-slate-100 tabular-nums">{firstMeasurement?.weight ? `${firstMeasurement.weight.toFixed(1)} кг` : '—'}</div>
            <div className="mt-1 text-sm text-slate-400">{weightSinceStart}</div>
          </div>
          <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Талия с начала</div>
            <div className="mt-2 text-2xl font-black text-slate-100 tabular-nums">{firstMeasurement?.waistCm ? `${firstMeasurement.waistCm} см` : '—'}</div>
            <div className="mt-1 text-sm text-slate-400">{waistSinceStart}</div>
          </div>
          <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Пульс с начала</div>
            <div className="mt-2 text-2xl font-black text-slate-100 tabular-nums">{firstMeasurement?.restingPulse ? `${firstMeasurement.restingPulse} уд/мин` : '—'}</div>
            <div className="mt-1 text-sm text-slate-400">{pulseSinceStart}</div>
          </div>
          <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Фото и замеры</div>
            <div className="mt-2 text-2xl font-black text-slate-100 tabular-nums">{`${progressPhotosSorted.length} / ${recentMeasurements.length}`}</div>
            <div className="mt-1 text-sm text-slate-400">
              {photoSpanDays !== null && measurementSpanDays !== null
                ? `${photoSpanDays} дн. по фото · ${measurementSpanDays} дн. по замерам`
                : 'Добавьте фото и первый замер'}
            </div>
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

          <input
            ref={wearableImportInputRef}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = '';
              if (!file) return;
              try {
                await importWearableFile(file);
              } catch {
                // error is already shown in state
              }
            }}
          />

          <div className="mt-4 rounded-[1.25rem] border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Импорт данных</div>
            <div className="mt-2 text-sm text-slate-400">Загрузите JSON или CSV из часов, чтобы заполнить шаги, сон и активность без ручного ввода.</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => wearableImportInputRef.current?.click()}
                disabled={!onPatchUser || importBusy}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-[1rem] bg-sky-600 hover:bg-sky-500 text-white font-black transition-all disabled:opacity-50"
              >
                <Cloud className="w-4 h-4" />
                {importBusy ? 'Импортируем…' : 'Импорт JSON/CSV'}
              </button>
              <button
                type="button"
                onClick={() => setImportError(null)}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-[1rem] border border-slate-800 bg-slate-950/40 hover:bg-slate-900 text-slate-300 font-black transition-all"
              >
                Очистить
              </button>
            </div>
            <div className="mt-4">
              <textarea
                value={wearablePasteDraft}
                onChange={(e) => setWearablePasteDraft(e.target.value)}
                rows={5}
                placeholder={`Вставьте JSON/CSV сюда, например:\n{"provider":"google_fit","stepsToday":8400,"activeMinutesToday":42,"sleepHoursLastNight":7.4,"bloodGlucoseMmolL":5.4}\nили\nprovider,stepsToday,activeMinutesToday,sleepHoursLastNight,bloodGlucoseMmolL\nfitbit,8400,42,7.4,5.4`}
                className="w-full rounded-[1rem] border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/40"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void importWearableText(wearablePasteDraft)}
                  disabled={!onPatchUser || importBusy || !wearablePasteDraft.trim()}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-[1rem] bg-emerald-600 hover:bg-emerald-500 text-white font-black transition-all disabled:opacity-50"
                >
                  <Cloud className="w-4 h-4" />
                  {importBusy ? 'Импортируем…' : 'Импорт из текста'}
                </button>
                <button
                  type="button"
                  onClick={() => setWearablePasteDraft('')}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-[1rem] border border-slate-800 bg-slate-950/40 hover:bg-slate-900 text-slate-300 font-black transition-all"
                >
                  Очистить поле
                </button>
              </div>
            </div>
            {importError ? (
              <div className="mt-3 rounded-[1rem] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 font-semibold">
                {importError}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-800 bg-slate-900/40 p-5 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Сравнение дат</div>
            <h2 className="mt-2 text-2xl font-black text-slate-100">До и после на выбранных точках</h2>
            <p className="mt-2 text-sm font-medium text-slate-400">Выберите две даты и сравните, что изменилось в весе, талии, пульсе и фото.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCompareMode((current) => (current === 'matched' ? 'all' : 'matched'))}
              className={clsx(
                'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all',
                compareMode === 'matched'
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
                  : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              )}
            >
              <CalendarDays size={12} className={compareMode === 'matched' ? 'text-emerald-300' : 'text-fuchsia-300'} />
              {compareModeLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!compareKeys.length) return;
                setCompareFromKey(compareKeys[0]);
                setCompareToKey(compareKeys[compareKeys.length - 1]);
              }}
              disabled={!compareKeys.length}
              className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/40 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-all hover:text-slate-200 hover:border-slate-700 disabled:opacity-40"
            >
              <TrendingUp size={12} className="text-indigo-300" />
              Первое / последнее
            </button>
            <button
              type="button"
              onClick={() => void exportComparisonPdf()}
              disabled={!canExportComparison}
              className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-indigo-200 transition-all hover:bg-indigo-500/20 hover:border-indigo-400/40 disabled:opacity-40"
            >
              <Cloud size={12} className="text-indigo-300" />
              Экспорт PDF
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Первая дата</div>
                <div className="mt-1 text-slate-100 font-black">{compareFromKey ? formatShortDate(compareFromKey) : '—'}</div>
              </div>
              <select
                value={compareFromKey}
                onChange={(e) => setCompareFromKey(e.target.value)}
                className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-200"
              >
                {compareKeys.map((key) => (
                  <option key={key} value={key}>{formatShortDate(key)}</option>
                ))}
              </select>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-[1rem] border border-slate-800 bg-slate-950/60 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Вес</div>
                <div className="mt-1 text-lg font-black text-slate-100 tabular-nums">{compareFromMeasurement?.weight ? `${compareFromMeasurement.weight.toFixed(1)} кг` : '—'}</div>
              </div>
              <div className="rounded-[1rem] border border-slate-800 bg-slate-950/60 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Талия</div>
                <div className="mt-1 text-lg font-black text-slate-100 tabular-nums">{compareFromMeasurement?.waistCm ? `${compareFromMeasurement.waistCm} см` : '—'}</div>
              </div>
              <div className="rounded-[1rem] border border-slate-800 bg-slate-950/60 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Фото</div>
                <div className="mt-1 text-lg font-black text-slate-100 tabular-nums">{compareFromPhoto ? 'есть' : '—'}</div>
              </div>
            </div>
          </div>

          <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Вторая дата</div>
                <div className="mt-1 text-slate-100 font-black">{compareToKey ? formatShortDate(compareToKey) : '—'}</div>
              </div>
              <select
                value={compareToKey}
                onChange={(e) => setCompareToKey(e.target.value)}
                className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-200"
              >
                {compareKeys.map((key) => (
                  <option key={key} value={key}>{formatShortDate(key)}</option>
                ))}
              </select>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-[1rem] border border-slate-800 bg-slate-950/60 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Вес</div>
                <div className="mt-1 text-lg font-black text-slate-100 tabular-nums">{compareToMeasurement?.weight ? `${compareToMeasurement.weight.toFixed(1)} кг` : '—'}</div>
              </div>
              <div className="rounded-[1rem] border border-slate-800 bg-slate-950/60 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Талия</div>
                <div className="mt-1 text-lg font-black text-slate-100 tabular-nums">{compareToMeasurement?.waistCm ? `${compareToMeasurement.waistCm} см` : '—'}</div>
              </div>
              <div className="rounded-[1rem] border border-slate-800 bg-slate-950/60 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Фото</div>
                <div className="mt-1 text-lg font-black text-slate-100 tabular-nums">{compareToPhoto ? 'есть' : '—'}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {[
            {
              label: 'До',
              key: compareFromKey,
              photo: compareFromPhoto,
              tone: 'from-indigo-500/20 to-slate-950/60',
              border: 'border-indigo-500/20',
              badge: 'text-indigo-200 bg-indigo-500/10',
            },
            {
              label: 'После',
              key: compareToKey,
              photo: compareToPhoto,
              tone: 'from-emerald-500/20 to-slate-950/60',
              border: 'border-emerald-500/20',
              badge: 'text-emerald-200 bg-emerald-500/10',
            },
          ].map((item) => (
            <div key={`${item.label}-${item.key || 'empty'}`} className={clsx('overflow-hidden rounded-[1.5rem] border bg-slate-950/40', item.border)}>
              <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
                <div>
                  <div className={clsx('inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest', item.badge)}>
                    {item.label}
                  </div>
                  <div className="mt-2 text-sm font-black text-slate-100">{item.key ? formatShortDate(item.key) : '—'}</div>
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {item.photo ? 'Фото найдено' : 'Фото нет'}
                </div>
              </div>
              <div className="grid gap-0 md:grid-cols-[170px_1fr]">
                <div className={clsx('relative min-h-[170px] bg-gradient-to-br', item.tone)}>
                  {item.photo?.thumb ? (
                    <img
                      src={item.photo.thumb}
                      alt={item.photo.note || `${item.label} фото`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full min-h-[170px] items-center justify-center px-4 text-center text-sm font-medium text-slate-500">
                      Нет фото для этой даты
                    </div>
                  )}
                </div>
                <div className="flex flex-col justify-between gap-4 px-4 py-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Подпись</div>
                    <div className="mt-2 text-sm font-semibold text-slate-300">
                      {item.photo?.note ? item.photo.note : 'Фото прогресса без комментария'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <Camera size={12} className="text-fuchsia-300" />
                    {item.photo ? formatDate(item.photo.date) : 'Ожидает фото'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[1.4rem] border border-indigo-500/20 bg-indigo-500/10 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Вес</div>
            <div className="mt-2 text-xl font-black text-slate-100">{compareWeightDelta}</div>
          </div>
          <div className="rounded-[1.4rem] border border-emerald-500/20 bg-emerald-500/10 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Талия</div>
            <div className="mt-2 text-xl font-black text-slate-100">{compareWaistDelta}</div>
          </div>
          <div className="rounded-[1.4rem] border border-sky-500/20 bg-sky-500/10 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-sky-200">Пульс</div>
            <div className="mt-2 text-xl font-black text-slate-100">{comparePulseDelta}</div>
          </div>
        </div>
      </section>

      <section id="progress-dynamics" className={clsx('grid gap-6 xl:grid-cols-[1.25fr_0.75fr] scroll-mt-28', !mobileDetailsOpen && 'hidden md:grid')}>
        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/40 p-5 md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Динамика прогресса</div>
              <h2 className="mt-2 text-2xl font-black text-slate-100">Фото и замеры по дням</h2>
              <p className="mt-2 text-sm font-medium text-slate-400">Кумулятивный график показывает, как растёт архив фото и замеров от первого чек-ина до сегодняшнего дня.</p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
              <Camera size={12} className="text-fuchsia-300" />
              <span>{progressDynamicsSeries.length ? `${progressDynamicsSeries.length} точек` : 'Нет данных'}</span>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Фото всего</div>
              <div className="mt-2 text-2xl font-black text-slate-100 tabular-nums">{progressDynamicsLastPoint?.photos ?? progressPhotosSorted.length ?? 0}</div>
              <div className="mt-1 text-sm text-slate-400">
                {progressDynamicsDeltaPhotos !== null ? `+${progressDynamicsDeltaPhotos} от старта` : 'Ожидает фото'}
              </div>
            </div>
            <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Замеры всего</div>
              <div className="mt-2 text-2xl font-black text-slate-100 tabular-nums">{progressDynamicsLastPoint?.measurements ?? recentMeasurements.length ?? 0}</div>
              <div className="mt-1 text-sm text-slate-400">
                {progressDynamicsDeltaMeasurements !== null ? `+${progressDynamicsDeltaMeasurements} от старта` : 'Ожидает замер'}
              </div>
            </div>
            <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Совпадения</div>
              <div className="mt-2 text-2xl font-black text-slate-100 tabular-nums">{matchedCompareKeys.length}</div>
              <div className="mt-1 text-sm text-slate-400">дней с фото и замерами</div>
            </div>
          </div>

          <div className="mt-5 h-[300px]">
            {progressDynamicsSeries.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={progressDynamicsSeries}>
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
                    labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                  />
                  <Line type="monotone" dataKey="photos" name="Фото" stroke="#E879F9" strokeWidth={4} dot={false} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="measurements" name="Замеры" stroke="#60A5FA" strokeWidth={4} dot={false} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full rounded-[1.75rem] border border-dashed border-slate-800 bg-slate-950/30 flex items-center justify-center text-center px-6">
                <div>
                  <div className="text-slate-100 font-black">Пока нет фото или замеров</div>
                  <div className="mt-2 text-sm text-slate-500">Сохраните первый замер и добавьте фото, чтобы увидеть динамику прогресса по дням.</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/40 p-5 md:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Фото и замеры</div>
              <h2 className="mt-2 text-2xl font-black text-slate-100">Что уже записано</h2>
              <p className="mt-2 text-sm font-medium text-slate-400">Короткая сводка помогает быстро понять, насколько заполнена история прогресса.</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-300">
              <TrendingUp size={18} />
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Первое событие</div>
              <div className="mt-2 text-lg font-black text-slate-100">{progressDynamicsFirstPoint ? formatShortDate(progressDynamicsFirstPoint.date) : '—'}</div>
              <div className="mt-1 text-sm text-slate-400">начало истории прогресса</div>
            </div>
            <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Последнее событие</div>
              <div className="mt-2 text-lg font-black text-slate-100">{progressDynamicsLastPoint ? formatShortDate(progressDynamicsLastPoint.date) : '—'}</div>
              <div className="mt-1 text-sm text-slate-400">свежий чек-ин в истории</div>
            </div>
            <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Фото / замеры</div>
              <div className="mt-2 text-lg font-black text-slate-100 tabular-nums">{`${progressPhotosSorted.length} / ${recentMeasurements.length}`}</div>
              <div className="mt-1 text-sm text-slate-400">архив и история чек-инов</div>
            </div>
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center justify-center gap-2 rounded-[1rem] border border-slate-800 bg-slate-950/40 px-4 py-3 text-slate-200 font-black transition-all hover:bg-slate-900"
            >
              <Camera className="w-4 h-4" />
              Добавить фото / замер
            </button>
          </div>
        </div>
      </section>

      <section id="progress-measurements" className={clsx('grid gap-6 xl:grid-cols-[1.1fr_0.9fr] scroll-mt-28', !mobileDetailsOpen && 'hidden md:grid')}>
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

        <div id="progress-photos" className={clsx('rounded-[2rem] border border-slate-800 bg-slate-900/40 p-5 md:p-6 scroll-mt-28', !mobileDetailsOpen && 'hidden md:block')}>
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

      <section id="progress-timeline" className={clsx('rounded-[2rem] border border-slate-800 bg-slate-900/40 p-5 md:p-6 scroll-mt-28', !mobileDetailsOpen && 'hidden md:block')}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Лента прогресса</div>
            <h2 className="mt-2 text-2xl font-black text-slate-100">Фото, замеры и часы по датам</h2>
            <p className="mt-2 text-sm font-medium text-slate-400">Одна хронология вместо разрозненных блоков: так проще увидеть, что именно менялось в конкретный день.</p>
          </div>
          <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <CalendarDays size={12} className="text-indigo-300" />
            Последние события
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { id: 'all', label: 'Все' },
            { id: 'measurement', label: 'Замеры' },
            { id: 'photo', label: 'Фото' },
            { id: 'wearable', label: 'Часы' },
          ].map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setTimelineFilter(filter.id as typeof timelineFilter)}
              className={clsx(
                'px-3 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all',
                timelineFilter === filter.id
                  ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200'
                  : 'border-slate-800 bg-slate-950/40 text-slate-500 hover:text-slate-300 hover:border-slate-700'
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-3">
          {timelineGroups.length ? (
            timelineGroups.map((group) => (
              <div key={group.key} className="rounded-[1.5rem] border border-slate-800 bg-slate-950/35 p-4 md:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Дата</div>
                    <div className="text-slate-100 font-black text-lg">{group.label}</div>
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 tabular-nums">{group.items.length} событий</div>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {group.items.map((item, index) => (
                    <div key={`${group.key}-${item.kind}-${index}`} className={clsx('rounded-[1.25rem] border px-4 py-4', item.tone)}>
                      <div className="flex items-start gap-3">
                        {item.kind === 'photo' && item.thumb ? (
                          <img src={item.thumb} alt={item.detail} className="w-14 h-14 rounded-[1rem] object-cover border border-white/10 shrink-0" />
                        ) : (
                          <div className="w-14 h-14 rounded-[1rem] bg-slate-950/50 border border-white/10 flex items-center justify-center shrink-0">
                            {item.kind === 'measurement' ? <Scale size={18} /> : item.kind === 'wearable' ? <Watch size={18} /> : <Camera size={18} />}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="text-[10px] font-black uppercase tracking-widest">{item.title}</div>
                            <div className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full border border-white/10 bg-black/10 text-slate-200/90">
                              {item.kind === 'measurement' ? 'замер' : item.kind === 'wearable' ? 'часы' : 'фото'}
                            </div>
                          </div>
                          <div className="mt-1 text-sm font-semibold text-slate-100 break-words">{item.detail}</div>
                          <div className="mt-2 text-[11px] text-slate-300">{formatDate(item.date)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-slate-800 bg-slate-950/30 px-4 py-8 text-slate-500 text-sm">
              Пока нет истории прогресса. Добавьте первый замер, фото или wearable-событие, чтобы тут появилась лента.
            </div>
          )}
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
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
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
            <div className="rounded-[1.4rem] border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Сахар</div>
              <div className="mt-2 text-2xl font-black text-slate-100 tabular-nums">{typeof latestMeasurement?.bloodGlucoseMmolL === 'number' ? formatBloodGlucose(latestMeasurement.bloodGlucoseMmolL) : '—'}</div>
              <div className="mt-1 text-sm text-slate-400">{formatDelta(latestMeasurement?.bloodGlucoseMmolL, previousMeasurement?.bloodGlucoseMmolL, 'ммоль/л')}</div>
              <div className="mt-1 text-[11px] font-black uppercase tracking-widest text-slate-500">
                {typeof latestMeasurement?.bloodGlucoseMmolL === 'number' ? `Состояние: ${getBloodGlucoseGuidance(latestMeasurement.bloodGlucoseMmolL)}` : 'Сахар не указан'}
              </div>
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
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Сахар крови</div>
              <input value={draftBloodGlucose} onChange={(e) => setDraftBloodGlucose(e.target.value)} inputMode="decimal" step="0.1" className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold" placeholder="5.4" />
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
                setDraftBloodGlucose('');
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
