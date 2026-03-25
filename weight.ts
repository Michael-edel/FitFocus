import { UserProfile } from './types';

export type WeightEntry = { date: string; weight: number };

function dayDiff(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (!isFinite(da) || !isFinite(db)) return Number.POSITIVE_INFINITY;
  return Math.abs(da - db) / 86400000;
}

export function sanitizeWeightValue(weight: number): number | null {
  const n = Number(weight);
  if (!isFinite(n)) return null;
  if (n < 25 || n > 350) return null;
  return Math.round(n * 10) / 10;
}

function isSuspiciousJump(prev: WeightEntry, curr: WeightEntry): boolean {
  const days = Math.max(1, dayDiff(prev.date, curr.date));
  const diff = Math.abs(curr.weight - prev.weight);
  if (days <= 3 && diff > 4) return true;
  if (days <= 7 && diff > 6) return true;
  if (days <= 14 && diff > 8) return true;
  if (diff > Math.max(12, prev.weight * 0.12)) return true;
  return false;
}

export function sanitizeWeightHistory(history: WeightEntry[] | undefined, fallbackWeight?: number): {
  history: WeightEntry[];
  anomalies: WeightEntry[];
} {
  const src = Array.isArray(history) ? history : [];
  const byDate = new Map<string, WeightEntry>();

  for (const item of src) {
    const safeWeight = sanitizeWeightValue(item?.weight as number);
    const date = typeof item?.date === 'string' ? item.date.slice(0, 10) : '';
    if (!date || safeWeight == null) continue;
    byDate.set(date, { date, weight: safeWeight });
  }

  const sorted = [...byDate.values()].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const clean: WeightEntry[] = [];
  const anomalies: WeightEntry[] = [];

  for (const entry of sorted) {
    const prev = clean[clean.length - 1];
    if (prev && isSuspiciousJump(prev, entry)) {
      anomalies.push(entry);
      continue;
    }
    clean.push(entry);
  }

  if (!clean.length) {
    const safeFallback = sanitizeWeightValue(Number(fallbackWeight));
    if (safeFallback != null) {
      clean.push({ date: new Date().toISOString().slice(0, 10), weight: safeFallback });
    }
  }

  return { history: clean, anomalies };
}

export function getEffectiveWeight(history: WeightEntry[] | undefined, fallbackWeight?: number): number {
  const { history: clean } = sanitizeWeightHistory(history, fallbackWeight);
  return clean[clean.length - 1]?.weight ?? Number(fallbackWeight) ?? 0;
}

export function addWeight(profile: UserProfile, weight: number): UserProfile {
  const safeWeight = sanitizeWeightValue(weight);
  if (safeWeight == null) return profile;

  const date = new Date().toISOString().slice(0, 10);
  const appended = [...(profile.weightHistory || []), { date, weight: safeWeight }];
  const { history } = sanitizeWeightHistory(appended, profile.weight);
  const effectiveWeight = history[history.length - 1]?.weight ?? profile.weight;

  return {
    ...profile,
    weight: effectiveWeight,
    weightHistory: history
  };
}

export function weightDelta(log: WeightEntry[] | undefined, days: number): number {
  const { history } = sanitizeWeightHistory(log);
  if (history.length < 2) return 0;
  const now = history[history.length - 1];

  const past = history.slice().reverse().find(
    (e) => new Date(now.date).getTime() - new Date(e.date).getTime() >= days * 86400000
  );

  if (!past) return 0;
  return now.weight - past.weight;
}
