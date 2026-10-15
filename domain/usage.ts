import type { UsageCounters } from './types';
import { isRecord, parseJson } from '../safeJson';

const KEY_PREFIX = 'fitfocus_usage_counters_v1:';

function storageKey(accountId: string): string {
  return `${KEY_PREFIX}${encodeURIComponent(accountId)}`;
}

function weekStartISO(d = new Date()) {
  // Monday as week start
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay(); // 0..6 (Sun..Sat)
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

export function loadUsage(accountId: string | null | undefined): UsageCounters {
  const nowWeek = weekStartISO();
  if (!accountId) return { weekStart: nowWeek, recipes: 0 };
  try {
    const raw = localStorage.getItem(storageKey(accountId));
    if (!raw) return { weekStart: nowWeek, recipes: 0 };
    const parsed = parseJson(raw);
    if (!isRecord(parsed) || parsed.weekStart !== nowWeek) return { weekStart: nowWeek, recipes: 0 };
    const recipes = typeof parsed.recipes === 'number' || typeof parsed.recipes === 'string'
      ? Number(parsed.recipes)
      : 0;
    return {
      weekStart: parsed.weekStart,
      recipes: Number.isFinite(recipes) && recipes >= 0 ? recipes : 0,
    };
  } catch {
    return { weekStart: nowWeek, recipes: 0 };
  }
}

export function saveUsage(accountId: string | null | undefined, usage: UsageCounters): boolean {
  if (!accountId) return false;
  try {
    localStorage.setItem(storageKey(accountId), JSON.stringify(usage));
    return true;
  } catch {
    return false;
  }
}

export function canGenerateRecipe(plan: 'free' | 'pro' | 'family' | undefined, accountId: string | null | undefined) {
  // Настройки лимитов
  const LIMITS: Record<string, number> = {
    free: 0,
    pro: 10,
    family: 30,
  };
  const limit = LIMITS[plan || 'free'] ?? 0;
  const u = loadUsage(accountId);
  return { allowed: u.recipes < limit, used: u.recipes, limit };
}

export function bumpRecipeUsage(accountId: string | null | undefined) {
  const usage = loadUsage(accountId);
  if (!accountId) return usage;
  const next = { ...usage, recipes: usage.recipes + 1 };
  saveUsage(accountId, next);
  return next;
}
