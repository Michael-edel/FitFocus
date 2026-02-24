import { DayPlan, FoodItem, Macros, MealLine, MealPlan, MealTarget } from "./types";

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const round5 = (x: number) => Math.round(x / 5) * 5;

function macrosForAmount(food: FoodItem, amount: number): Macros {
  if (food.unit === "piece") {
    const grams = (food.pieceWeightG ?? 50) * amount;
    const k = grams / 100;
    return {
      kcal: food.per100.kcal * k,
      p: food.per100.p * k,
      f: food.per100.f * k,
      c: food.per100.c * k,
    };
  }
  const k = amount / 100;
  return { kcal: food.per100.kcal * k, p: food.per100.p * k, f: food.per100.f * k, c: food.per100.c * k };
}

function sumMacros(lines: MealLine[]): Macros {
  return lines.reduce(
    (a, l) => ({ kcal: a.kcal + l.macros.kcal, p: a.p + l.macros.p, f: a.f + l.macros.f, c: a.c + l.macros.c }),
    { kcal: 0, p: 0, f: 0, c: 0 }
  );
}

function byId(foods: FoodItem[], id: string) {
  const f = foods.find((x) => x.id === id);
  if (!f) throw new Error(`FOOD_NOT_FOUND:${id}`);
  return f;
}

function makeLine(foods: FoodItem[], id: string, amount: number): MealLine {
  const food = byId(foods, id);
  return { foodId: food.id, nameRu: food.nameRu, amount, unit: food.unit, macros: macrosForAmount(food, amount) };
}

export function buildDayPlan(targets: MealTarget[], foods: FoodItem[]): DayPlan {
  const meals: MealPlan[] = targets.map((t) => buildMeal(t, foods));
  const totals = meals.reduce(
    (a, m) => ({ kcal: a.kcal + m.totals.kcal, p: a.p + m.totals.p, f: a.f + m.totals.f, c: a.c + m.totals.c }),
    { kcal: 0, p: 0, f: 0, c: 0 }
  );
  return { meals, totals: { kcal: Math.round(totals.kcal), p: Math.round(totals.p), f: Math.round(totals.f), c: Math.round(totals.c) } };
}

function buildMeal(meal: MealTarget, foods: FoodItem[]): MealPlan {
  let lines: MealLine[] = [];

  if (meal.name === "Завтрак") {
    lines = [
      makeLine(foods, "oatmeal", clamp(round5(meal.target.c * 1.1), 40, 100)),
      makeLine(foods, "greek_yogurt", clamp(round5(meal.target.p * 12), 100, 250)),
      makeLine(foods, "banana", 100),
      makeLine(foods, "egg", 1),
    ];
  } else if (meal.name === "Обед") {
    lines = [
      makeLine(foods, "chicken_breast", clamp(round5(meal.target.p * 6), 120, 260)),
      makeLine(foods, "rice", clamp(round5(meal.target.c * 1.0), 50, 110)),
      makeLine(foods, "salad_mix", 200),
      makeLine(foods, "olive_oil", clamp(round5(meal.target.f * 0.6), 5, 20)),
    ];
  } else if (meal.name === "Ужин") {
    lines = [
      makeLine(foods, "chicken_breast", clamp(round5(meal.target.p * 5.5), 120, 240)),
      makeLine(foods, "buckwheat", clamp(round5(meal.target.c * 0.9), 50, 100)),
      makeLine(foods, "salad_mix", 250),
      makeLine(foods, "olive_oil", clamp(round5(meal.target.f * 0.6), 5, 20)),
    ];
  } else {
    lines = [
      makeLine(foods, "cottage_cheese", clamp(round5(meal.target.p * 6), 120, 220)),
      makeLine(foods, "berries", 120),
      makeLine(foods, "nuts", 10),
    ];
  }

  lines = tuneMealToCalories(lines, meal.target.kcal, foods);

  const totals = sumMacros(lines);
  return {
    meal: meal.name,
    lines: lines.map((l) => ({ ...l, macros: macrosForAmount(byId(foods, l.foodId), l.amount) })),
    totals: { kcal: Math.round(totals.kcal), p: Math.round(totals.p), f: Math.round(totals.f), c: Math.round(totals.c) },
  };
}

function tuneMealToCalories(lines: MealLine[], targetKcal: number, foods: FoodItem[]): MealLine[] {
  const maxIter = 12;
  for (let i = 0; i < maxIter; i++) {
    const cur = sumMacros(lines).kcal;
    const diff = targetKcal - cur;
    if (Math.abs(diff) < 40) break;
    if (diff > 0) lines = bump(lines, +1);
    else lines = bump(lines, -1);
  }
  return lines;

  function bump(lines: MealLine[], dir: 1 | -1): MealLine[] {
    const ids = new Set(lines.map((l) => l.foodId));
    const bumpAmount = (id: string, delta: number, min: number) => {
      const idx = lines.findIndex((x) => x.foodId === id);
      if (idx === -1) return;
      lines[idx] = { ...lines[idx], amount: Math.max(min, lines[idx].amount + delta) };
    };

    if (ids.has("oatmeal")) {
      bumpAmount("oatmeal", dir * 10, 30);
      bumpAmount("greek_yogurt", dir * 30, 80);
    } else if (ids.has("rice")) {
      bumpAmount("rice", dir * 10, 40);
      bumpAmount("olive_oil", dir * 2, 3);
    } else if (ids.has("buckwheat")) {
      bumpAmount("buckwheat", dir * 10, 40);
      bumpAmount("olive_oil", dir * 2, 3);
    } else {
      bumpAmount("nuts", dir * 5, 0);
    }
    return lines;
  }
}
