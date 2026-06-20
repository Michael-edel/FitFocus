import type { FoodItem, UserHabit, UserProfile } from '../types';

export function calcBmi(weightKg: number, heightCm: number) {
  const h = heightCm / 100;
  if (!h) return 0;
  return weightKg / (h * h);
}

export function bmiCategory(bmi: number) {
  if (bmi < 18.5) return 'Дефицит массы';
  if (bmi < 25) return 'Норма';
  if (bmi < 30) return 'Избыточный вес';
  return 'Ожирение';
}

export function calcGoalProgressPct(user: UserProfile) {
  const start = (user.weightHistory?.[0]?.weight ?? user.weight);
  const cur = user.weight;
  const tgt = user.targetWeight;
  const denom = (start - tgt);
  if (!denom) return 0;
  const pct = ((start - cur) / denom) * 100;
  return Math.max(0, Math.min(100, pct));
}

export function weekRangeISO(today = new Date()) {
  const end = new Date(today);
  const start = new Date(today);
  start.setDate(today.getDate() - 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start, end, startISO: fmt(start), endISO: fmt(end), label: `${fmt(start)} — ${fmt(end)}` };
}

export function aggregateWeek(foodDiary: FoodItem[], startISO: string, endISO: string) {
  const byDay = new Map<string, { cal: number; p: number; f: number; c: number; items: FoodItem[] }>();
  for (const it of foodDiary) {
    const day = new Date(it.timestamp).toISOString().slice(0, 10);
    if (day < startISO || day > endISO) continue;
    const prev = byDay.get(day) ?? { cal: 0, p: 0, f: 0, c: 0, items: [] };
    prev.cal += it.calories;
    prev.p += it.protein;
    prev.f += it.fat;
    prev.c += it.carbs;
    prev.items.push(it);
    byDay.set(day, prev);
  }
  const days = [...byDay.keys()].sort();
  const totals = days.reduce((acc, d) => {
    const v = byDay.get(d)!;
    acc.cal += v.cal; acc.p += v.p; acc.f += v.f; acc.c += v.c;
    return acc;
  }, { cal: 0, p: 0, f: 0, c: 0 });

  // Среднее по залогированным дням (более информативно)
  const loggedDays = Math.max(0, days.length);
  const avgLogged = loggedDays > 0
    ? { cal: totals.cal / loggedDays, p: totals.p / loggedDays, f: totals.f / loggedDays, c: totals.c / loggedDays }
    : { cal: 0, p: 0, f: 0, c: 0 };

  // Среднее за календарную неделю (7 дней)
  const avgWeek = { cal: totals.cal / 7, p: totals.p / 7, f: totals.f / 7, c: totals.c / 7 };

  return { byDay, days, totals, avgLogged, avgWeek, loggedDays };
}

export function habitCompliance(habits: UserHabit[]) {
  const total = Math.max(1, habits.length);
  const done = habits.filter(h => (h.current ?? 0) > 0).length;
  return { done, total, pct: Math.round((done / total) * 100) };
}

export function resolveBloodGlucose(user: UserProfile) {
  const measurement = [...(user.measurementsHistory || [])]
    .filter((item) => typeof item?.bloodGlucoseMmolL === 'number' && Number.isFinite(item.bloodGlucoseMmolL) && item.bloodGlucoseMmolL > 0)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  if (measurement) {
    return {
      value: measurement.bloodGlucoseMmolL as number,
      measuredAt: measurement.date || null,
      sourceLabel: 'последний замер',
    };
  }

  if (typeof user.bloodGlucoseMmolL === 'number' && Number.isFinite(user.bloodGlucoseMmolL) && user.bloodGlucoseMmolL > 0) {
    return {
      value: user.bloodGlucoseMmolL,
      measuredAt: user.bloodGlucoseMeasuredAt || null,
      sourceLabel: 'профиль',
    };
  }

  return null;
}
