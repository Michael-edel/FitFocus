import { FoodItem } from "./types";

export const FOODS_RU: FoodItem[] = [
  { id: "oatmeal", nameRu: "Овсяные хлопья", unit: "g", per100: { kcal: 367, p: 13, f: 7, c: 62 }, tags: ["breakfast", "carb"] },
  { id: "banana", nameRu: "Банан", unit: "g", per100: { kcal: 89, p: 1.1, f: 0.3, c: 23 }, tags: ["breakfast", "fruit", "carb", "snack"] },
  { id: "berries", nameRu: "Ягоды (смесь)", unit: "g", per100: { kcal: 50, p: 1, f: 0.3, c: 12 }, tags: ["breakfast", "fruit", "snack"] },

  { id: "egg", nameRu: "Яйцо", unit: "piece", pieceWeightG: 50, per100: { kcal: 143, p: 13, f: 10, c: 1.1 }, tags: ["breakfast", "protein"] },
  { id: "greek_yogurt", nameRu: "Йогурт греческий 2%", unit: "g", per100: { kcal: 73, p: 10, f: 2, c: 3.6 }, tags: ["breakfast", "dairy", "protein", "snack"] },
  { id: "cottage_cheese", nameRu: "Творог 5%", unit: "g", per100: { kcal: 121, p: 17, f: 5, c: 3 }, tags: ["protein", "dairy", "snack"] },

  { id: "chicken_breast", nameRu: "Куриная грудка", unit: "g", per100: { kcal: 110, p: 23, f: 2, c: 0 }, tags: ["lunch", "dinner", "protein"] },

  { id: "rice", nameRu: "Рис (сухой)", unit: "g", per100: { kcal: 360, p: 7, f: 1, c: 78 }, tags: ["lunch", "dinner", "carb"] },
  { id: "buckwheat", nameRu: "Гречка (сухая)", unit: "g", per100: { kcal: 343, p: 13, f: 3, c: 71 }, tags: ["lunch", "dinner", "carb"] },

  { id: "olive_oil", nameRu: "Оливковое масло", unit: "g", per100: { kcal: 884, p: 0, f: 100, c: 0 }, tags: ["fat", "lunch", "dinner"] },
  { id: "nuts", nameRu: "Орехи", unit: "g", per100: { kcal: 600, p: 20, f: 52, c: 18 }, tags: ["fat", "snack"] },

  { id: "salad_mix", nameRu: "Овощи/салат", unit: "g", per100: { kcal: 25, p: 1.5, f: 0.2, c: 5 }, tags: ["veg", "lunch", "dinner"] },
];
