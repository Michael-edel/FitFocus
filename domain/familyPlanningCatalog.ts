import type { AllergenId, CatalogIngredient, MealSlot, RecipeSnapshot } from './familyPlanning';

// Published recipe versions are immutable. Add a new version/ID instead of changing an accepted snapshot.
export const FAMILY_PLANNING_CATALOG_VERSION = 1;
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export const FAMILY_ALLERGENS: readonly { id: AllergenId; name: string }[] = freeze([
  { id: 'milk', name: 'Молоко' }, { id: 'egg', name: 'Яйца' },
  { id: 'gluten', name: 'Глютен' }, { id: 'soy', name: 'Соя' },
  { id: 'tree-nut', name: 'Древесные орехи' }, { id: 'peanut', name: 'Арахис' },
  { id: 'fish', name: 'Рыба' }, { id: 'shellfish', name: 'Ракообразные и моллюски' },
  { id: 'sesame', name: 'Кунжут' },
]);
export const FAMILY_INGREDIENTS: readonly CatalogIngredient[] = freeze([
  { id: 'oats', name: 'Овсяные хлопья', unit: 'g', allergenIds: ['gluten'] },
  { id: 'milk', name: 'Молоко', unit: 'ml', allergenIds: ['milk'] },
  { id: 'water', name: 'Вода', unit: 'ml', allergenIds: [] },
  { id: 'apple', name: 'Яблоко', unit: 'g', allergenIds: [] },
  { id: 'banana', name: 'Банан', unit: 'g', allergenIds: [] },
  { id: 'rice', name: 'Рис сухой', unit: 'g', allergenIds: [] },
  { id: 'buckwheat', name: 'Гречка сухая', unit: 'g', allergenIds: [] },
  { id: 'chicken', name: 'Куриная грудка сырая', unit: 'g', allergenIds: [] },
  { id: 'turkey', name: 'Филе индейки сырое', unit: 'g', allergenIds: [] },
  { id: 'carrot', name: 'Морковь', unit: 'g', allergenIds: [] },
  { id: 'zucchini', name: 'Кабачок', unit: 'g', allergenIds: [] },
  { id: 'mushroom', name: 'Грибы', unit: 'g', allergenIds: [] },
  { id: 'olive-oil', name: 'Оливковое масло', unit: 'ml', allergenIds: [] },
  { id: 'tofu', name: 'Тофу', unit: 'g', allergenIds: ['soy'] },
  { id: 'yogurt', name: 'Йогурт натуральный', unit: 'g', allergenIds: ['milk'] },
  { id: 'walnut', name: 'Грецкий орех', unit: 'g', allergenIds: ['tree-nut'] },
  { id: 'egg', name: 'Яйцо', unit: 'piece', allergenIds: ['egg'] },
]);
export const FAMILY_RECIPES: readonly RecipeSnapshot[] = freeze([
  { recipeId: 'oats-milk-apple-v1', recipeVersion: 1, title: 'Овсяная каша с яблоком', ingredients: [
    { ingredientId: 'oats', unit: 'g', quantity: 60 }, { ingredientId: 'milk', unit: 'ml', quantity: 200 },
    { ingredientId: 'apple', unit: 'g', quantity: 100 }], output: { grams: 340, basis: 'estimate' } },
  { recipeId: 'buckwheat-apple-v1', recipeVersion: 1, title: 'Гречневая каша с яблоком', ingredients: [
    { ingredientId: 'buckwheat', unit: 'g', quantity: 60 }, { ingredientId: 'water', unit: 'ml', quantity: 180 },
    { ingredientId: 'apple', unit: 'g', quantity: 100 }], output: { grams: 320, basis: 'estimate' } },
  { recipeId: 'eggs-carrot-v1', recipeVersion: 1, title: 'Яйца с морковью', ingredients: [
    { ingredientId: 'egg', unit: 'piece', quantity: 2 }, { ingredientId: 'carrot', unit: 'g', quantity: 150 },
    { ingredientId: 'olive-oil', unit: 'ml', quantity: 5 }], output: { grams: 240, basis: 'estimate' } },
  { recipeId: 'chicken-rice-v1', recipeVersion: 1, title: 'Курица с рисом и морковью', ingredients: [
    { ingredientId: 'chicken', unit: 'g', quantity: 160 }, { ingredientId: 'rice', unit: 'g', quantity: 70 },
    { ingredientId: 'carrot', unit: 'g', quantity: 120 }, { ingredientId: 'olive-oil', unit: 'ml', quantity: 10 }],
    output: { grams: 420, basis: 'estimate' } },
  { recipeId: 'tofu-rice-v1', recipeVersion: 1, title: 'Тофу с рисом и кабачком', ingredients: [
    { ingredientId: 'tofu', unit: 'g', quantity: 160 }, { ingredientId: 'rice', unit: 'g', quantity: 70 },
    { ingredientId: 'zucchini', unit: 'g', quantity: 120 }, { ingredientId: 'olive-oil', unit: 'ml', quantity: 10 }],
    output: { grams: 430, basis: 'estimate' } },
  { recipeId: 'turkey-buckwheat-v1', recipeVersion: 1, title: 'Индейка с гречкой и кабачком', ingredients: [
    { ingredientId: 'turkey', unit: 'g', quantity: 160 }, { ingredientId: 'buckwheat', unit: 'g', quantity: 70 },
    { ingredientId: 'zucchini', unit: 'g', quantity: 150 }, { ingredientId: 'olive-oil', unit: 'ml', quantity: 10 }],
    output: { grams: 440, basis: 'estimate' } },
  { recipeId: 'yogurt-banana-v1', recipeVersion: 1, title: 'Йогурт с бананом', ingredients: [
    { ingredientId: 'yogurt', unit: 'g', quantity: 150 }, { ingredientId: 'banana', unit: 'g', quantity: 100 }],
    output: { grams: 250, basis: 'estimate' } },
  { recipeId: 'apple-walnut-v1', recipeVersion: 1, title: 'Яблоко и грецкие орехи', ingredients: [
    { ingredientId: 'apple', unit: 'g', quantity: 150 }, { ingredientId: 'walnut', unit: 'g', quantity: 20 }],
    output: { grams: 170, basis: 'estimate' } },
  { recipeId: 'apple-banana-v1', recipeVersion: 1, title: 'Яблоко и банан', ingredients: [
    { ingredientId: 'apple', unit: 'g', quantity: 100 }, { ingredientId: 'banana', unit: 'g', quantity: 100 }],
    output: { grams: 200, basis: 'estimate' } },
]);
const slots: Readonly<Record<MealSlot, readonly string[]>> = freeze({
  breakfast: ['oats-milk-apple-v1', 'buckwheat-apple-v1', 'eggs-carrot-v1'],
  lunch: ['chicken-rice-v1', 'tofu-rice-v1', 'turkey-buckwheat-v1'],
  dinner: ['turkey-buckwheat-v1', 'tofu-rice-v1', 'chicken-rice-v1'],
  snack: ['yogurt-banana-v1', 'apple-walnut-v1', 'apple-banana-v1'],
});
export const getFamilyIngredient = (id: string): CatalogIngredient | undefined => FAMILY_INGREDIENTS.find(item => item.id === id);
export const getFamilyRecipe = (id: string): RecipeSnapshot | undefined => FAMILY_RECIPES.find(item => item.recipeId === id);
export const getFamilyRecipesForSlot = (slot: MealSlot): readonly RecipeSnapshot[] =>
  (slots[slot] ?? []).map(id => getFamilyRecipe(id)!).filter(Boolean);
