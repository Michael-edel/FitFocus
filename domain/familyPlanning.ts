import type { FamilyWeeklyMenu, FamilyWeeklyMenuMeal } from '../types';
import { FAMILY_ALLERGENS, FAMILY_INGREDIENTS, getFamilyIngredient, getFamilyRecipe, getFamilyRecipesForSlot } from './familyPlanningCatalog';

export type DiningProfileId = string;
export type PortionShare = 0.75 | 1 | 1.25;
export type IngredientId = string;
export type AllergenId = string;
export type RawUnit = 'g' | 'ml' | 'piece';
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type DiningCard = { id: DiningProfileId; familyId: string; kind: 'account' | 'managed'; displayName: string; version: number; active: boolean; canEdit: boolean };
export type DiningProfileInput = {
  displayName: string; portionShare: PortionShare;
  allergies: { state: 'unknown' | 'none' | 'list'; allergenIds: AllergenId[] };
  hardExcludedIngredientIds: IngredientId[]; dislikedIngredientIds: IngredientId[];
} & ({ ageGroup: 'adult'; goalContext?: 'LOSS' | 'MAINTAIN' | 'GAIN' } | { ageGroup: 'child'; goalContext?: never });
export type DiningPrivateProfile = DiningCard & { configuration: DiningProfileInput | null };
export type FamilyRoster = { familyId: string; rosterVersion: number; limit: 5; profiles: DiningCard[]; planningConstraints: { blockedIngredientIds: IngredientId[]; incomplete: boolean } };
export type IngredientAmount = { ingredientId: IngredientId; unit: RawUnit; quantity: number };
export type CatalogIngredient = { id: IngredientId; name: string; unit: RawUnit; allergenIds: AllergenId[] };
export type RecipeSnapshot = { recipeId: string; recipeVersion: number; title: string; ingredients: IngredientAmount[]; output?: { grams: number; basis: 'measured' | 'estimate' } };
export type PlannedMeal = { id: string; slot: MealSlot; recipeId: string; participantShares: Record<DiningProfileId, PortionShare> };
export type ManualShoppingItem = { id: string; name: string; unit: RawUnit; quantity: number; purchasedQuantity: number };
export type FamilyPlanningV1 = {
  schemaVersion: 1; date: string; rosterVersion: number; profileVersions: Record<DiningProfileId, number>;
  recipes: RecipeSnapshot[]; meals: PlannedMeal[]; purchasedQuantities: IngredientAmount[]; manualItems: ManualShoppingItem[];
};
export type FamilyPlanningMutationKind = 'planning' | 'purchases';
export type FamilyPlanningWrite = { familyId: string; weekStart: string; baseVersion: number; mutationKind: FamilyPlanningMutationKind; menu: FamilyWeeklyMenu };
export type LegacyFamilyMenuArchive = { familyId: string; periodStart: string; kind: 'legacy-weekly'; menu: FamilyWeeklyMenu };
export type ShoppingProjectionItem = IngredientAmount & { name: string; purchasedQuantity: number; toBuy: number };
export type FamilyDayProjection = { items: ShoppingProjectionItem[]; manualItems: Array<ManualShoppingItem & { toBuy: number }> };
export type DiningPlanningProfile = { id: DiningProfileId; version: number; configuration: DiningProfileInput | null };
export type FamilyMealSelection = { slot: MealSlot; recipeId?: string; participantShares: Record<DiningProfileId, PortionShare> };
export type FamilyPlanningContext = { rosterVersion: number; profiles: readonly DiningPlanningProfile[] };
export type FamilyDayBuildInput = FamilyPlanningContext & { date: string; selections: readonly FamilyMealSelection[]; previousPlanning?: FamilyPlanningV1 };
export type PlannedFamilyMenu = FamilyWeeklyMenu & { planningV1: FamilyPlanningV1 };
export type FamilyPlanningErrorCode = 'BAD_DATE' | 'BAD_SELECTION' | 'PROFILE_INCOMPLETE' | 'ALLERGIES_UNKNOWN' | 'UNKNOWN_CATALOG_ID' | 'NO_SAFE_RECIPE' | 'INVALID_PLANNING';
export class FamilyPlanningValidationError extends Error {
  constructor(readonly code: FamilyPlanningErrorCode) { super(code); this.name = 'FamilyPlanningValidationError'; }
}

const SLOTS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MAX_QUANTITY = 1_000_000;
type Dict = Record<string, unknown>;
const record = (value: unknown): value is Dict => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const keys = (value: Dict, allowed: readonly string[], required: readonly string[] = allowed) =>
  Object.keys(value).every(key => allowed.includes(key)) && required.every(key => Object.hasOwn(value, key));
const text = (value: unknown, max = 256): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value;
const safeId = (value: unknown): value is string => text(value) && !['__proto__', 'prototype', 'constructor'].includes(value);
const version = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
const quantity = (value: unknown, positive = false): value is number => typeof value === 'number' && Number.isFinite(value) && value >= (positive ? Number.MIN_VALUE : 0) && value <= MAX_QUANTITY;
const share = (value: unknown): value is PortionShare => value === 0.75 || value === 1 || value === 1.25;
const unit = (value: unknown): value is RawUnit => value === 'g' || value === 'ml' || value === 'piece';
const slot = (value: unknown): value is MealSlot => SLOTS.includes(value as MealSlot);
const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const fail = (code: FamilyPlanningErrorCode): never => { throw new FamilyPlanningValidationError(code); };
function isoDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => same(item, b[index]));
  if (!record(a) || !record(b)) return false;
  const names = Object.keys(a);
  return names.length === Object.keys(b).length && names.every(name => Object.hasOwn(b, name) && same(a[name], b[name]));
}
function ids(value: unknown, allowed: (id: string) => boolean): value is string[] {
  return Array.isArray(value) && value.length <= 100 && value.every(id => safeId(id) && allowed(id)) && new Set(value).size === value.length;
}
export function isDiningProfileInput(value: unknown): value is DiningProfileInput {
  if (!record(value) || !keys(value, ['displayName', 'portionShare', 'allergies', 'hardExcludedIngredientIds', 'dislikedIngredientIds', 'ageGroup', 'goalContext'],
    ['displayName', 'portionShare', 'allergies', 'hardExcludedIngredientIds', 'dislikedIngredientIds', 'ageGroup'])
    || !text(value.displayName, 80) || !share(value.portionShare) || (value.ageGroup !== 'adult' && value.ageGroup !== 'child')) return false;
  if (value.ageGroup === 'child' && Object.hasOwn(value, 'goalContext')) return false;
  if (Object.hasOwn(value, 'goalContext') && value.goalContext !== 'LOSS' && value.goalContext !== 'MAINTAIN' && value.goalContext !== 'GAIN') return false;
  const allergy = value.allergies;
  return record(allergy) && keys(allergy, ['state', 'allergenIds']) && (allergy.state === 'unknown' || allergy.state === 'none' || allergy.state === 'list')
    && ids(allergy.allergenIds, id => FAMILY_ALLERGENS.some(item => item.id === id))
    && (allergy.state === 'list' ? allergy.allergenIds.length > 0 : allergy.allergenIds.length === 0)
    && ids(value.hardExcludedIngredientIds, id => !!getFamilyIngredient(id)) && ids(value.dislikedIngredientIds, id => !!getFamilyIngredient(id));
}
function validAmount(value: unknown): value is IngredientAmount {
  if (!record(value) || !keys(value, ['ingredientId', 'unit', 'quantity']) || !safeId(value.ingredientId) || !unit(value.unit) || !quantity(value.quantity)) return false;
  return getFamilyIngredient(value.ingredientId)?.unit === value.unit;
}
function validManual(value: unknown): value is ManualShoppingItem {
  return record(value) && keys(value, ['id', 'name', 'unit', 'quantity', 'purchasedQuantity']) && safeId(value.id) && text(value.name, 160)
    && unit(value.unit) && quantity(value.quantity, true) && quantity(value.purchasedQuantity);
}
function validShares(value: unknown): value is Record<DiningProfileId, PortionShare> {
  return record(value) && Object.keys(value).length <= 5 && Object.entries(value).every(([id, amount]) => safeId(id) && share(amount));
}
const participatingIds = (meals: readonly PlannedMeal[]) => [...new Set(meals.flatMap(meal => Object.keys(meal.participantShares)))].sort();
function needMap(planning: FamilyPlanningV1): Map<string, IngredientAmount> {
  const result = new Map<string, IngredientAmount>();
  for (const meal of planning.meals) {
    const recipe = planning.recipes.find(item => item.recipeId === meal.recipeId);
    if (!recipe) return fail('INVALID_PLANNING');
    const factor = Object.values(meal.participantShares).reduce<number>((sum, value) => sum + value, 0);
    for (const ingredient of recipe.ingredients) {
      const previous = result.get(ingredient.ingredientId);
      if (previous && previous.unit !== ingredient.unit) return fail('INVALID_PLANNING');
      const total = round((previous?.quantity ?? 0) + ingredient.quantity * factor);
      if (!quantity(total)) return fail('INVALID_PLANNING');
      if (total > 0) result.set(ingredient.ingredientId, { ...ingredient, quantity: total });
    }
  }
  return result;
}
function isPlanning(value: unknown): value is FamilyPlanningV1 {
  if (!record(value) || !keys(value, ['schemaVersion', 'date', 'rosterVersion', 'profileVersions', 'recipes', 'meals', 'purchasedQuantities', 'manualItems'])
    || value.schemaVersion !== 1 || !isoDay(value.date) || !version(value.rosterVersion) || !record(value.profileVersions)
    || !Array.isArray(value.recipes) || value.recipes.length > 4 || !value.recipes.length
    || !Array.isArray(value.meals) || !value.meals.length || value.meals.length > 4
    || !Array.isArray(value.purchasedQuantities) || value.purchasedQuantities.length > 100
    || !Array.isArray(value.manualItems) || value.manualItems.length > 100) return false;
  if (!value.recipes.every(recipe => record(recipe) && typeof recipe.recipeId === 'string' && !!getFamilyRecipe(recipe.recipeId) && same(recipe, getFamilyRecipe(recipe.recipeId)))
    || new Set(value.recipes.map(recipe => (recipe as RecipeSnapshot).recipeId)).size !== value.recipes.length) return false;
  if (!value.meals.every(meal => record(meal) && keys(meal, ['id', 'slot', 'recipeId', 'participantShares'])
    && slot(meal.slot) && meal.id === `${value.date}:${meal.slot}` && typeof meal.recipeId === 'string'
    && getFamilyRecipesForSlot(meal.slot).some(recipe => recipe.recipeId === meal.recipeId) && validShares(meal.participantShares))
    || new Set(value.meals.map(meal => (meal as PlannedMeal).slot)).size !== value.meals.length) return false;
  const meals = value.meals as PlannedMeal[], recipes = value.recipes as RecipeSnapshot[];
  if (meals.some(meal => !recipes.some(recipe => recipe.recipeId === meal.recipeId)) || recipes.some(recipe => !meals.some(meal => meal.recipeId === recipe.recipeId))) return false;
  const included = participatingIds(meals);
  if (!included.length || included.length > 5 || !same(Object.keys(value.profileVersions).sort(), included)
    || !Object.values(value.profileVersions).every(version)) return false;
  if (!value.purchasedQuantities.every(validAmount) || new Set(value.purchasedQuantities.map(item => (item as IngredientAmount).ingredientId)).size !== value.purchasedQuantities.length
    || !value.manualItems.every(validManual) || new Set(value.manualItems.map(item => (item as ManualShoppingItem).id)).size !== value.manualItems.length) return false;
  const planning = value as FamilyPlanningV1;
  try { return [...needMap(planning).keys()].every(id => planning.purchasedQuantities.some(item => item.ingredientId === id)); } catch { return false; }
}

/** Quantities are raw ingredient amounts; units are never guessed or converted. */
export function projectFamilyDay(planning: FamilyPlanningV1, catalog: readonly CatalogIngredient[]): FamilyDayProjection {
  if (!isPlanning(planning)) return fail('INVALID_PLANNING');
  const need = needMap(planning);
  const items = planning.purchasedQuantities.map(purchased => {
    const ingredient = catalog.find(item => item.id === purchased.ingredientId);
    const trusted = getFamilyIngredient(purchased.ingredientId);
    if (!ingredient || !trusted || !same(ingredient, trusted)) return fail('UNKNOWN_CATALOG_ID');
    const required = need.get(purchased.ingredientId)?.quantity ?? 0;
    return { ingredientId: purchased.ingredientId, unit: purchased.unit, quantity: required, name: ingredient.name,
      purchasedQuantity: purchased.quantity, toBuy: round(Math.max(required - purchased.quantity, 0)) };
  }).sort((a, b) => a.ingredientId < b.ingredientId ? -1 : a.ingredientId > b.ingredientId ? 1 : 0);
  return { items, manualItems: planning.manualItems.map(item => ({ ...item, toBuy: round(Math.max(item.quantity - item.purchasedQuantity, 0)) })) };
}
const unitLabel = (value: RawUnit) => value === 'g' ? 'г' : value === 'ml' ? 'мл' : 'шт';
export function deriveLegacyFamilyMenu(planning: FamilyPlanningV1): PlannedFamilyMenu {
  if (!isPlanning(planning)) return fail('INVALID_PLANNING');
  const included = participatingIds(planning.meals), projection = projectFamilyDay(planning, FAMILY_INGREDIENTS);
  const mealView = (mealSlot: MealSlot): FamilyWeeklyMenuMeal => {
    const meal = planning.meals.find(item => item.slot === mealSlot);
    const recipe = planning.recipes.find(item => item.recipeId === meal?.recipeId);
    const portions = Object.fromEntries(included.map(id => {
      const factor = meal?.participantShares[id];
      if (!factor || !recipe) return [id, 'Не участвует'];
      const raw = recipe.ingredients.map(item => `${getFamilyIngredient(item.ingredientId)!.name} ${round(item.quantity * factor)} ${unitLabel(item.unit)}`).join(' + ');
      const output = recipe.output ? `; выход ${recipe.output.basis === 'estimate' ? '~' : ''}${round(recipe.output.grams * factor)} г${recipe.output.basis === 'estimate' ? ' (ориентир)' : ' (по измеренному выходу)'}` : '';
      return [id, `Доля ${factor}; сырьё: ${raw}${output}`];
    }));
    return { base: recipe?.title ?? 'Не запланировано', portions };
  };
  const rows = [...projection.items.filter(item => item.toBuy > 0).map(item => ({ name: item.name, unit: item.unit, quantity: item.toBuy })),
    ...projection.manualItems.filter(item => item.toBuy > 0).map(item => ({ name: item.name, unit: item.unit, quantity: item.toBuy }))];
  return { weekStart: planning.date, planningV1: clone(planning), prefs: { includeIds: included, cookingMode: 'all_meals', currency: 'KZT' },
    days: [{ day: planning.date, breakfast: mealView('breakfast'), lunch: mealView('lunch'), dinner: mealView('dinner'), snack: mealView('snack') }],
    shoppingList: rows.map(item => `${item.name} — ${item.quantity} ${unitLabel(item.unit)}`),
    shoppingListItems: rows.filter(item => item.unit === 'g').map(item => ({ name: item.name, grams: item.quantity })) };
}
/** Stored reads do not require the latest roster or a mutationKind. */
export function isFamilyPlanningMenu(value: unknown, date: string): value is PlannedFamilyMenu {
  if (!record(value) || !keys(value, ['weekStart', 'planningV1', 'prefs', 'days', 'shoppingList', 'shoppingListItems'])
    || !isPlanning(value.planningV1) || value.weekStart !== date || value.planningV1.date !== date) return false;
  try { return same(value, deriveLegacyFamilyMenu(value.planningV1)); } catch { return false; }
}
function selectedProfiles(idsToUse: readonly string[], context: FamilyPlanningContext): DiningPlanningProfile[] {
  if (!version(context.rosterVersion) || !Array.isArray(context.profiles)
    || new Set(context.profiles.map(profile => profile.id)).size !== context.profiles.length) return fail('PROFILE_INCOMPLETE');
  return idsToUse.map(id => {
    const profile = context.profiles.find(item => item.id === id);
    if (!profile || !version(profile.version) || !isDiningProfileInput(profile.configuration)) return fail('PROFILE_INCOMPLETE');
    if (profile.configuration.allergies.state === 'unknown') return fail('ALLERGIES_UNKNOWN');
    return profile;
  });
}
function safeRecipe(recipe: RecipeSnapshot, profiles: readonly DiningPlanningProfile[]): boolean {
  return profiles.every(profile => {
    const configuration = profile.configuration;
    return !!configuration && recipe.ingredients.every(amount => {
      const ingredient = getFamilyIngredient(amount.ingredientId);
      return !!ingredient && !configuration.hardExcludedIngredientIds.includes(ingredient.id)
        && !ingredient.allergenIds.some(id => configuration.allergies.allergenIds.includes(id));
    });
  });
}
/** Call this only for planning mutations, followed by atomic SQL revision predicates. */
export function validateFamilyPlanningForProfiles(menu: PlannedFamilyMenu, context: FamilyPlanningContext): boolean {
  if (!isFamilyPlanningMenu(menu, menu?.weekStart ?? '') || menu.planningV1.rosterVersion !== context.rosterVersion) return false;
  try {
    const planning = menu.planningV1, profiles = selectedProfiles(participatingIds(planning.meals), context);
    return profiles.every(profile => planning.profileVersions[profile.id] === profile.version)
      && planning.meals.every(meal => safeRecipe(getFamilyRecipe(meal.recipeId)!, profiles.filter(profile => Object.hasOwn(meal.participantShares, profile.id))));
  } catch { return false; }
}
export function buildFamilyDayMenu(input: FamilyDayBuildInput): PlannedFamilyMenu {
  if (!isoDay(input.date)) return fail('BAD_DATE');
  if (!Array.isArray(input.selections) || !input.selections.length || input.selections.length > 4
    || !input.selections.every(selection => record(selection) && keys(selection, ['slot', 'recipeId', 'participantShares'], ['slot', 'participantShares'])
      && slot(selection.slot) && validShares(selection.participantShares) && (selection.recipeId === undefined || safeId(selection.recipeId)))
    || new Set(input.selections.map(selection => selection.slot)).size !== input.selections.length) return fail('BAD_SELECTION');
  const allIds = [...new Set(input.selections.flatMap(selection => Object.keys(selection.participantShares)))].sort();
  if (!allIds.length || allIds.length > 5) return fail('BAD_SELECTION');
  const profiles = selectedProfiles(allIds, input);
  const recipes: RecipeSnapshot[] = [], meals: PlannedMeal[] = [];
  for (const mealSlot of SLOTS) {
    const selection = input.selections.find(item => item.slot === mealSlot);
    if (!selection) continue;
    const participants = profiles.filter(profile => Object.hasOwn(selection.participantShares, profile.id));
    let recipe: RecipeSnapshot | undefined;
    if (selection.recipeId !== undefined) {
      recipe = getFamilyRecipe(selection.recipeId);
      if (!recipe) return fail('UNKNOWN_CATALOG_ID');
      if (!getFamilyRecipesForSlot(mealSlot).some(item => item.recipeId === recipe!.recipeId)) return fail('BAD_SELECTION');
      if (!safeRecipe(recipe, participants)) return fail('NO_SAFE_RECIPE');
    } else {
      const candidates = getFamilyRecipesForSlot(mealSlot).filter(item => safeRecipe(item, participants));
      const dislikes = (item: RecipeSnapshot) => participants.reduce((sum, profile) => sum + item.ingredients.filter(ingredient => profile.configuration!.dislikedIngredientIds.includes(ingredient.ingredientId)).length, 0);
      recipe = candidates.map((item, index) => ({ item, index, score: dislikes(item) })).sort((a, b) => a.score - b.score || a.index - b.index)[0]?.item;
      if (!recipe) return fail('NO_SAFE_RECIPE');
    }
    const chosenRecipe = recipe;
    if (!recipes.some(item => item.recipeId === chosenRecipe.recipeId)) recipes.push(clone(chosenRecipe));
    meals.push({ id: `${input.date}:${mealSlot}`, slot: mealSlot, recipeId: chosenRecipe.recipeId, participantShares: clone(selection.participantShares) });
  }
  const previous = input.previousPlanning;
  if (previous && (!isPlanning(previous) || previous.date !== input.date)) return fail('INVALID_PLANNING');
  const planning: FamilyPlanningV1 = { schemaVersion: 1, date: input.date, rosterVersion: input.rosterVersion,
    profileVersions: Object.fromEntries(profiles.map(profile => [profile.id, profile.version])), recipes, meals,
    purchasedQuantities: previous ? clone(previous.purchasedQuantities) : [], manualItems: previous ? clone(previous.manualItems) : [] };
  for (const item of needMap(planning).values()) {
    if (!planning.purchasedQuantities.some(purchased => purchased.ingredientId === item.ingredientId)) planning.purchasedQuantities.push({ ...item, quantity: 0 });
  }
  planning.purchasedQuantities.sort((a, b) => a.ingredientId < b.ingredientId ? -1 : a.ingredientId > b.ingredientId ? 1 : 0);
  return deriveLegacyFamilyMenu(planning);
}
/** Permission check on a full snapshot; the server must still CAS the accepted base and membership. */
export function isPurchaseOnlyChange(accepted: FamilyPlanningV1, incoming: FamilyPlanningV1): boolean {
  if (!isPlanning(accepted) || !isPlanning(incoming)) return false;
  const fixed = (planning: FamilyPlanningV1) => ({ ...planning,
    purchasedQuantities: planning.purchasedQuantities.map(item => ({ ...item, quantity: 0 })).sort((a, b) => a.ingredientId < b.ingredientId ? -1 : a.ingredientId > b.ingredientId ? 1 : 0),
    manualItems: planning.manualItems.map(item => ({ ...item, purchasedQuantity: 0 })) });
  return same(fixed(accepted), fixed(incoming));
}
