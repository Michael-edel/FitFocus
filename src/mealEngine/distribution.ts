import { Macros, MealTarget } from "./types";

const round = (n: number) => Math.round(n);

export function distributeDayTargetsToMeals(day: Macros): MealTarget[] {
  const splits: Array<{ name: MealTarget["name"]; pct: number }> = [
    { name: "Завтрак", pct: 0.25 },
    { name: "Обед", pct: 0.35 },
    { name: "Ужин", pct: 0.30 },
    { name: "Перекус", pct: 0.10 },
  ];

  const meals = splits.map((s) => ({
    name: s.name,
    target: {
      kcal: round(day.kcal * s.pct),
      p: round(day.p * s.pct),
      f: round(day.f * s.pct),
      c: round(day.c * s.pct),
    },
  }));

  const delta = day.kcal - meals.reduce((a, m) => a + m.target.kcal, 0);
  meals[1].target.kcal += delta; // добавим в обед

  return meals;
}
