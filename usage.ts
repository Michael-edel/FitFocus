import type { UsageCounters } from './types';

const KEY = 'fitfocus_usage_counters_v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function weekStartISO(d = new Date()) {
  // Monday as week start
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay(); // 0..6 (Sun..Sat)
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

export function loadUsage(): UsageCounters {
  const nowWeek = weekStartISO();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { weekStart: nowWeek, recipes: 0 };
    const parsed = safeJsonParse(raw);
    if (!isRecord(parsed)) return { weekStart: nowWeek, recipes: 0 };
    if (parsed?.weekStart !== nowWeek) return { weekStart: nowWeek, recipes: 0 };
    return {
      weekStart: String(parsed.weekStart),
      recipes: Number(parsed.recipes) || 0,
    };
  } catch {
    return { weekStart: nowWeek, recipes: 0 };
  }
}

export function saveUsage(u: UsageCounters) {
  localStorage.setItem(KEY, JSON.stringify(u));
}

export function canGenerateRecipe(plan: 'free' | 'pro' | 'family' | undefined) {
  // Настройки лимитов
  const LIMITS: Record<string, number> = {
    free: 0,
    pro: 10,
    family: 30,
  };
  const limit = LIMITS[plan || 'free'] ?? 0;
  const u = loadUsage();
  return { allowed: u.recipes < limit, used: u.recipes, limit };
}

export function bumpRecipeUsage() {
  const u = loadUsage();
  u.recipes += 1;
  saveUsage(u);
  return u;
}
