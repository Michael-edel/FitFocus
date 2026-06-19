import type { WearableProvider } from './types';

export type WearableSyncSnapshot = {
  provider?: WearableProvider;
  date?: string;
  metricsUpdatedAt?: string;
  stepsToday?: number;
  activeMinutesToday?: number;
  sleepHoursLastNight?: number;
  weight?: number;
  pulse?: number;
  bloodGlucoseMmolL?: number;
  sourceDevice?: string;
  sourceAppVersion?: string;
  timezone?: string;
  baseVersion?: number;
};

const ALLOWED_PROVIDERS = new Set<WearableProvider>(['apple_health', 'google_fit', 'fitbit', 'garmin', 'manual']);

export const wearableSyncExamplePayload: WearableSyncSnapshot = {
  provider: 'apple_health',
  date: '2026-06-18T08:15:00.000+05:00',
  metricsUpdatedAt: '2026-06-18T08:15:00.000+05:00',
  stepsToday: 8421,
  activeMinutesToday: 46,
  sleepHoursLastNight: 7.2,
  pulse: 61,
  weight: 82.4,
  bloodGlucoseMmolL: 5.4,
  sourceDevice: 'iPhone 17 Pro Max',
  sourceAppVersion: '1.0.0',
  timezone: 'Asia/Yekaterinburg',
  baseVersion: 12,
};

export function parseWearableNumber(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function normalizeWearableProvider(value: unknown): WearableProvider {
  const provider = String(value || 'manual').toLowerCase();
  return ALLOWED_PROVIDERS.has(provider as WearableProvider) ? (provider as WearableProvider) : 'manual';
}

export function normalizeWearableSyncSnapshot(input: unknown): WearableSyncSnapshot | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const obj = input as Record<string, unknown>;
  const snapshot: WearableSyncSnapshot = {
    provider: normalizeWearableProvider(obj.provider ?? obj.source),
    date: typeof obj.date === 'string' && obj.date.trim() ? obj.date.trim() : undefined,
    metricsUpdatedAt:
      typeof obj.metricsUpdatedAt === 'string' && obj.metricsUpdatedAt.trim()
        ? obj.metricsUpdatedAt.trim()
        : typeof obj.updatedAt === 'string' && obj.updatedAt.trim()
          ? obj.updatedAt.trim()
          : undefined,
    stepsToday: parseWearableNumber(obj.stepsToday ?? obj.steps ?? obj.dailySteps ?? obj.stepCount),
    activeMinutesToday: parseWearableNumber(obj.activeMinutesToday ?? obj.activeMinutes ?? obj.moveMinutes),
    sleepHoursLastNight: parseWearableNumber(obj.sleepHoursLastNight ?? obj.sleepHours ?? obj.sleep),
    weight: parseWearableNumber(obj.weight ?? obj.bodyWeight),
    pulse: parseWearableNumber(obj.pulse ?? obj.restingPulse),
    bloodGlucoseMmolL: parseWearableNumber(obj.bloodGlucoseMmolL ?? obj.glucose ?? obj.sugar ?? obj.bloodGlucose),
    sourceDevice: typeof obj.sourceDevice === 'string' && obj.sourceDevice.trim() ? obj.sourceDevice.trim() : undefined,
    sourceAppVersion: typeof obj.sourceAppVersion === 'string' && obj.sourceAppVersion.trim() ? obj.sourceAppVersion.trim() : undefined,
    timezone: typeof obj.timezone === 'string' && obj.timezone.trim() ? obj.timezone.trim() : undefined,
    baseVersion: parseWearableNumber(obj.baseVersion),
  };

  if (
    typeof snapshot.stepsToday !== 'number' &&
    typeof snapshot.activeMinutesToday !== 'number' &&
    typeof snapshot.sleepHoursLastNight !== 'number' &&
    typeof snapshot.weight !== 'number' &&
    typeof snapshot.pulse !== 'number' &&
    typeof snapshot.bloodGlucoseMmolL !== 'number'
  ) {
    return null;
  }

  return snapshot;
}
