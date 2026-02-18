import { FOODS_RU } from "./foods.ru";
import { distributeDayTargetsToMeals } from "./distribution";
import { buildDayPlan } from "./solver";
import { DayPlan, Macros } from "./types";

export function generateDayTemplateInGrams(dayTargets: Macros): DayPlan {
  const mealTargets = distributeDayTargetsToMeals(dayTargets);
  return buildDayPlan(mealTargets, FOODS_RU);
}
