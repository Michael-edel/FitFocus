export type Macros = {
  kcal: number;
  p: number; // белки, г
  f: number; // жиры, г
  c: number; // углеводы, г
};

export type FoodUnit = "g" | "ml" | "piece";

export type FoodItem = {
  id: string;
  nameRu: string;
  unit: FoodUnit;
  per100: Macros; // значения на 100г/100мл (для piece используется pieceWeightG)
  pieceWeightG?: number;
  tags: Array<
    | "breakfast"
    | "lunch"
    | "dinner"
    | "snack"
    | "protein"
    | "carb"
    | "fat"
    | "veg"
    | "fruit"
    | "dairy"
  >;
};

export type MealNameRu = "Завтрак" | "Обед" | "Ужин" | "Перекус";

export type MealTarget = {
  name: MealNameRu;
  target: Macros;
};

export type MealLine = {
  foodId: string;
  nameRu: string;
  amount: number; // граммы/мл/шт
  unit: FoodUnit;
  macros: Macros;
};

export type MealPlan = {
  meal: MealNameRu;
  lines: MealLine[];
  totals: Macros;
};

export type DayPlan = {
  meals: MealPlan[];
  totals: Macros;
};
