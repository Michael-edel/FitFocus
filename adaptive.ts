import type { UserProfile, FoodItem, UserHabit } from "./types";
import { calculateTDEE, calculateDailyTargets } from "./profileMath";

/**
 * Расчет индекса соблюдения режима (compliance).
 * На основе калорийности и выполнения привычек.
 */
export function calculateCompliance(foods: FoodItem[], habits: UserHabit[], profile: UserProfile): number {
  if (foods.length === 0 && habits.length === 0) return 0;

  const targets = calculateDailyTargets(profile);
  
  // Комплаенс по питанию (сумма калорий за день vs цель)
  const dailyCalories = foods.reduce((sum, f) => sum + f.calories, 0);
  // Допускаем отклонение в 10%
  const caloriesCompliance = dailyCalories > 0 && dailyCalories <= targets.calories * 1.1 ? 1 : 0;

  // Комплаенс по привычкам
  const completedHabits = habits.filter(h => h.current >= h.goal).length;
  const habitCompliance = habits.length > 0 ? completedHabits / habits.length : 1;

  // Веса: 60% питание, 40% дисциплина в привычках
  return (caloriesCompliance * 0.6 + habitCompliance * 0.4);
}

/**
 * Адаптивный TDEE. 
 * Снижает базовый расход, если вес стоит более 14 дней.
 */
export function adaptiveTDEE(user: UserProfile): number {
  const base = calculateTDEE(user);

  const history = user.weightHistory ?? [];
  if (history.length < 14) return base;

  const recent = history.slice(-14);
  const delta = recent[recent.length - 1].weight - recent[0].weight;

  // Если за 2 недели вес снизился менее чем на 200г (или вырос)
  if (delta > -0.2) {
    return base - 150;
  }

  return base;
}
