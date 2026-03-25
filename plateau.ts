import type { UserProfile } from "./types";
import { sanitizeWeightHistory } from "./weight";

/**
 * Определение плато веса.
 * 
 * Условия:
 * 1. Есть минимум 28 дней данных.
 * 2. Берём последние 28 записей.
 * 3. Делим на два блока по 14 дней.
 * 4. Если средний вес второго блока
 *    не ниже первого более чем на 0.1 кг → плато.
 */
export function detectPlateau(user: UserProfile): boolean {
  const history = sanitizeWeightHistory(user.weightHistory, user.weight).history;
  if (history.length < 28) return false;

  const sorted = [...history]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-28);

  const first14 = sorted.slice(0, 14);
  const last14 = sorted.slice(14);

  const avg = (arr: { weight: number }[]) =>
    arr.reduce((s, x) => s + x.weight, 0) / arr.length;

  const avgA = avg(first14);
  const avgB = avg(last14);

  // Если вес не падает (разница меньше 100г) — это плато
  return avgB >= avgA - 0.1;
}

export function plateauAdjustmentCalories(currentTarget: number): number {
  // Предлагаем снижение на 200 ккал от текущей цели
  return Math.max(1200, currentTarget - 200);
}
