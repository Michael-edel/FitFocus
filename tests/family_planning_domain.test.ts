import { describe, expect, it } from 'vitest';
import {
  buildFamilyDayMenu, deriveLegacyFamilyMenu, FamilyPlanningValidationError, isDiningProfileInput,
  isFamilyPlanningMenu, isPurchaseOnlyChange, projectFamilyDay, validateFamilyPlanningForProfiles,
  type DiningPlanningProfile, type DiningProfileInput, type FamilyDayBuildInput, type FamilyPlanningV1,
} from '../domain/familyPlanning';
import { FAMILY_INGREDIENTS, FAMILY_RECIPES, getFamilyIngredient, getFamilyRecipe } from '../domain/familyPlanningCatalog';

const DATE = '2026-10-20'; // Tuesday must remain Tuesday, not its Monday.
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function config(overrides: Partial<DiningProfileInput> = {}): DiningProfileInput {
  return { displayName: 'Участник', ageGroup: 'adult', portionShare: 1,
    allergies: { state: 'none', allergenIds: [] }, hardExcludedIngredientIds: [], dislikedIngredientIds: [],
    ...overrides } as DiningProfileInput;
}
const people = (): DiningPlanningProfile[] => [
  { id: 'alex', version: 2, configuration: config({ displayName: 'Алексей', goalContext: 'LOSS', portionShare: 0.75 }) },
  { id: 'irina', version: 3, configuration: config({ displayName: 'Ирина', goalContext: 'MAINTAIN' }) },
  { id: 'denis', version: 4, configuration: config({ displayName: 'Денис', goalContext: 'GAIN', portionShare: 1.25 }) },
];
function input(overrides: Partial<FamilyDayBuildInput> = {}): FamilyDayBuildInput {
  return { date: DATE, rosterVersion: 7, profiles: people(), selections: [{ slot: 'lunch', recipeId: 'chicken-rice-v1',
    participantShares: { alex: 0.75, irina: 1, denis: 1.25 } }], ...overrides };
}
const row = (planning: FamilyPlanningV1, id: string) => projectFamilyDay(planning, FAMILY_INGREDIENTS).items.find(item => item.ingredientId === id)!;
function rejectsCode(action: () => unknown, code: string) {
  try { action(); throw new Error('Expected validation failure'); } catch (error) {
    expect(error).toBeInstanceOf(FamilyPlanningValidationError);
    expect((error as FamilyPlanningValidationError).code).toBe(code);
    expect((error as Error).message).toBe(code); // No private profile/diagnosis in error text.
  }
}

describe('family planning explicit profile configuration', () => {
  it('accepts optional private adult goals without requiring body measurements', () => {
    for (const goalContext of ['LOSS', 'MAINTAIN', 'GAIN'] as const) expect(isDiningProfileInput(config({ goalContext }))).toBe(true);
    expect(isDiningProfileInput(config())).toBe(true);
    expect(isDiningProfileInput({ ...config(), weight: 80 })).toBe(false);
    expect(isDiningProfileInput({ ...config(), diagnosis: 'private' })).toBe(false);
  });
  it('requires an explicit age group and rejects every child goal instead of defaulting to an adult', () => {
    const child = { ...config(), ageGroup: 'child' };
    expect(isDiningProfileInput(child)).toBe(true);
    for (const goalContext of ['LOSS', 'MAINTAIN', 'GAIN', undefined]) expect(isDiningProfileInput({ ...child, goalContext })).toBe(false);
    const missing = { ...config() } as Record<string, unknown>;
    delete missing.ageGroup;
    expect(isDiningProfileInput(missing)).toBe(false);
    rejectsCode(() => buildFamilyDayMenu(input({ profiles: [{ id: 'alex', version: 1, configuration: null }],
      selections: [{ slot: 'lunch', participantShares: { alex: 1 } }] })), 'PROFILE_INCOMPLETE');
  });
  it('distinguishes unknown, explicit none, and a nonempty canonical allergen list', () => {
    expect(isDiningProfileInput(config({ allergies: { state: 'unknown', allergenIds: [] } }))).toBe(true);
    expect(isDiningProfileInput(config({ allergies: { state: 'list', allergenIds: ['milk'] } }))).toBe(true);
    for (const allergies of [
      { state: 'list', allergenIds: [] }, { state: 'none', allergenIds: ['milk'] },
      { state: 'unknown', allergenIds: ['milk'] }, { state: 'list', allergenIds: ['молоко'] },
      { state: 'list', allergenIds: ['milk', 'milk'] }, { state: 'list', allergenIds: ['apple'] },
    ]) expect(isDiningProfileInput({ ...config(), allergies })).toBe(false);
    expect(isDiningProfileInput(config({ hardExcludedIngredientIds: ['Milk'] }))).toBe(false);
    expect(isDiningProfileInput({ ...config(), ageGroup: ['adult'] })).toBe(false);
    expect(isDiningProfileInput({ ...config(), goalContext: ['LOSS'] })).toBe(false);
    expect(isDiningProfileInput({ ...config(), allergies: { state: ['none'], allergenIds: [] } })).toBe(false);
  });
  it('blocks an unknown allergy only when that profile participates', () => {
    const profiles = people(); profiles[2].configuration!.allergies = { state: 'unknown', allergenIds: [] };
    rejectsCode(() => buildFamilyDayMenu(input({ profiles })), 'ALLERGIES_UNKNOWN');
    const menu = buildFamilyDayMenu(input({ profiles, selections: [{ slot: 'lunch', participantShares: { alex: 1 } }] }));
    expect(menu.planningV1.profileVersions).toEqual({ alex: 2 });
  });
  it('accepts a canonical mushroom dislike or exclusion without inventing a dish or weakening an allergy', () => {
    expect(getFamilyIngredient('mushroom')).toMatchObject({ id: 'mushroom', name: 'Грибы', unit: 'g' });
    expect(isDiningProfileInput(config({ dislikedIngredientIds: ['mushroom'] }))).toBe(true);
    expect(isDiningProfileInput(config({ hardExcludedIngredientIds: ['mushroom'] }))).toBe(true);
    expect(isDiningProfileInput(config({ dislikedIngredientIds: ['Грибы'] }))).toBe(false);
    const profiles = people();
    profiles[1].configuration = config({ displayName: 'Ирина', dislikedIngredientIds: ['mushroom'],
      allergies: { state: 'list', allergenIds: ['milk'] } });
    const make = (recipeId?: string) => buildFamilyDayMenu(input({ profiles, selections: [
      { slot: 'breakfast', ...(recipeId ? { recipeId } : {}), participantShares: { irina: 1 } },
    ] }));
    rejectsCode(() => make('oats-milk-apple-v1'), 'NO_SAFE_RECIPE');
    const menu = make();
    expect(menu.planningV1.meals[0].recipeId).toBe('buckwheat-apple-v1');
    expect(menu.planningV1.recipes.every(recipe => recipe.ingredients.every(item => item.ingredientId !== 'mushroom'))).toBe(true);
    expect(menu.planningV1.purchasedQuantities.some(item => item.ingredientId === 'mushroom')).toBe(false);
  });
});

describe('shared dishes, safe selection and raw deterministic quantities', () => {
  it('scales one shared lunch for three explicit shares and preserves a Tuesday key', () => {
    const menu = buildFamilyDayMenu(input());
    expect(menu.weekStart).toBe(DATE);
    expect(menu.planningV1.date).toBe(DATE);
    expect(menu.days).toHaveLength(1);
    expect(menu.planningV1.recipes).toHaveLength(1);
    expect(row(menu.planningV1, 'chicken')).toMatchObject({ quantity: 480, unit: 'g', toBuy: 480 });
    expect(row(menu.planningV1, 'rice').quantity).toBe(210);
    expect(row(menu.planningV1, 'carrot').quantity).toBe(360);
    expect(row(menu.planningV1, 'olive-oil')).toMatchObject({ quantity: 30, unit: 'ml' });
    expect(menu.days[0].lunch.portions.alex).toContain('120 г');
    expect(menu.days[0].lunch.portions.denis).toContain('200 г');
    expect(menu.days[0].lunch.portions.alex).toContain('~315 г (ориентир)');
    expect(JSON.stringify(menu)).not.toMatch(/LOSS|MAINTAIN|GAIN|ккал|Алексей|Ирина|Денис/);
    expect(isFamilyPlanningMenu(menu, DATE)).toBe(true);
  });
  it('does not derive shares or quantities from adult goals or a child age group', () => {
    const original = input();
    const changed = copy(original);
    changed.profiles[0].configuration = config({ goalContext: 'GAIN', portionShare: 1.25 });
    changed.profiles[1].configuration = config({ ageGroup: 'child', portionShare: 0.75 });
    expect(buildFamilyDayMenu(changed)).toEqual(buildFamilyDayMenu(original));
  });
  it('excludes absent eaters per meal while preserving one shared recipe and totals', () => {
    const menu = buildFamilyDayMenu(input({ selections: [
      { slot: 'lunch', recipeId: 'chicken-rice-v1', participantShares: { alex: 0.75 } },
      { slot: 'dinner', recipeId: 'chicken-rice-v1', participantShares: { denis: 1.25 } },
    ] }));
    expect(menu.planningV1.profileVersions).toEqual({ alex: 2, denis: 4 });
    expect(menu.days[0].lunch.portions.denis).toBe('Не участвует');
    expect(row(menu.planningV1, 'chicken').quantity).toBe(320);
    expect(menu.planningV1.recipes).toHaveLength(1);
  });
  it('uses exact raw units and never turns milk ml or eggs pieces into grams', () => {
    const eggs = buildFamilyDayMenu(input({ selections: [{ slot: 'breakfast', recipeId: 'eggs-carrot-v1', participantShares: { alex: 0.75 } }] }));
    expect(row(eggs.planningV1, 'egg')).toMatchObject({ quantity: 1.5, unit: 'piece' });
    expect(eggs.shoppingList).toContain('Яйцо — 1.5 шт');
    expect(eggs.shoppingListItems?.some(item => item.name === 'Яйцо')).toBe(false);
    const oats = buildFamilyDayMenu(input({ selections: [{ slot: 'breakfast', recipeId: 'oats-milk-apple-v1', participantShares: { alex: 0.75 } }] }));
    expect(row(oats.planningV1, 'milk')).toMatchObject({ quantity: 150, unit: 'ml' });
    expect(oats.shoppingListItems?.some(item => item.name === 'Молоко')).toBe(false);
  });
  it('never falls back to a forbidden ingredient when no breakfast is safe', () => {
    const profile = people()[0];
    profile.configuration = config({ allergies: { state: 'list', allergenIds: ['milk', 'egg'] }, hardExcludedIngredientIds: ['apple'] });
    rejectsCode(() => buildFamilyDayMenu(input({ profiles: [profile], selections: [{ slot: 'breakfast', participantShares: { alex: 1 } }] })), 'NO_SAFE_RECIPE');
  });
  it('enforces hard rules for an explicit recipe but treats dislikes as ranking preferences', () => {
    const profile = people()[0];
    profile.configuration = config({ dislikedIngredientIds: ['oats'] });
    const make = (recipeId?: string) => buildFamilyDayMenu(input({ profiles: [profile], selections: [{ slot: 'breakfast', ...(recipeId ? { recipeId } : {}), participantShares: { alex: 1 } }] }));
    expect(make().planningV1.meals[0].recipeId).toBe('buckwheat-apple-v1');
    expect(make('oats-milk-apple-v1').planningV1.meals[0].recipeId).toBe('oats-milk-apple-v1');
    profile.configuration.allergies = { state: 'list', allergenIds: ['milk'] };
    rejectsCode(() => make('oats-milk-apple-v1'), 'NO_SAFE_RECIPE');
    expect(make().planningV1.meals[0].recipeId).not.toBe('oats-milk-apple-v1');
    rejectsCode(() => make('OATS-MILK-APPLE-V1'), 'UNKNOWN_CATALOG_ID');
  });
  it('rejects invalid calendar dates, duplicated slots, foreign profiles and arbitrary shares', () => {
    rejectsCode(() => buildFamilyDayMenu(input({ date: '2026-02-30' })), 'BAD_DATE');
    rejectsCode(() => buildFamilyDayMenu(input({ selections: [input().selections[0], input().selections[0]] })), 'BAD_SELECTION');
    rejectsCode(() => buildFamilyDayMenu(input({ selections: [{ slot: 'lunch', participantShares: { stranger: 1 } }] })), 'PROFILE_INCOMPLETE');
    rejectsCode(() => buildFamilyDayMenu(input({ selections: [{ slot: 'lunch', participantShares: { alex: 100 } } as never] })), 'BAD_SELECTION');
  });
});

describe('purchases remain part of the accepted day snapshot', () => {
  it('preserves purchased stock and manual rows when demand grows or a recipe is replaced', () => {
    const original = buildFamilyDayMenu(input({ selections: [{ slot: 'lunch', recipeId: 'chicken-rice-v1', participantShares: { alex: 1 } }] }));
    original.planningV1.purchasedQuantities.find(item => item.ingredientId === 'rice')!.quantity = 70;
    original.planningV1.purchasedQuantities.find(item => item.ingredientId === 'chicken')!.quantity = 160;
    original.planningV1.manualItems.push({ id: 'manual:tea', name: 'Чай', unit: 'piece', quantity: 2, purchasedQuantity: 1 });
    const grown = buildFamilyDayMenu(input({ previousPlanning: original.planningV1 }));
    expect(row(grown.planningV1, 'rice')).toMatchObject({ quantity: 210, purchasedQuantity: 70, toBuy: 140 });
    const replaced = buildFamilyDayMenu(input({ previousPlanning: grown.planningV1, selections: [
      { slot: 'lunch', recipeId: 'tofu-rice-v1', participantShares: { alex: 0.75, irina: 1, denis: 1.25 } },
    ] }));
    expect(row(replaced.planningV1, 'chicken')).toMatchObject({ quantity: 0, purchasedQuantity: 160, toBuy: 0 });
    expect(row(replaced.planningV1, 'tofu')).toMatchObject({ quantity: 480, purchasedQuantity: 0, toBuy: 480 });
    expect(projectFamilyDay(replaced.planningV1, FAMILY_INGREDIENTS).manualItems[0]).toMatchObject({ name: 'Чай', quantity: 2, purchasedQuantity: 1, toBuy: 1 });
    expect(original.planningV1.recipes[0].recipeId).toBe('chicken-rice-v1');
  });
  it('allows only purchase amounts on existing keys and manual rows', () => {
    const accepted = buildFamilyDayMenu(input()).planningV1;
    accepted.manualItems.push({ id: 'manual:tea', name: 'Чай', unit: 'piece', quantity: 2, purchasedQuantity: 0 });
    const purchase = copy(accepted);
    purchase.purchasedQuantities.find(item => item.ingredientId === 'rice')!.quantity = 210;
    purchase.manualItems[0].purchasedQuantity = 2;
    expect(isPurchaseOnlyChange(accepted, purchase)).toBe(true);
    expect(isFamilyPlanningMenu(deriveLegacyFamilyMenu(purchase), DATE)).toBe(true);
    for (const change of [
      (p: FamilyPlanningV1) => { p.manualItems[0].name = 'Другой товар'; },
      (p: FamilyPlanningV1) => { p.manualItems[0].quantity = 3; },
      (p: FamilyPlanningV1) => { p.manualItems[0].unit = 'g'; },
      (p: FamilyPlanningV1) => { p.meals[0].participantShares.alex = 1.25; },
      (p: FamilyPlanningV1) => { delete p.meals[0].participantShares.alex; },
      (p: FamilyPlanningV1) => { p.profileVersions.alex = 3; },
      (p: FamilyPlanningV1) => { p.rosterVersion += 1; },
      (p: FamilyPlanningV1) => { p.purchasedQuantities.push({ ingredientId: 'banana', unit: 'g', quantity: 10 }); },
      (p: FamilyPlanningV1) => { p.purchasedQuantities[0].unit = 'piece'; },
      (p: FamilyPlanningV1) => { p.purchasedQuantities[0].quantity = -1; },
      (p: FamilyPlanningV1) => { p.purchasedQuantities[0].quantity = Infinity; },
    ]) {
      const edited = copy(purchase); change(edited);
      expect(isPurchaseOnlyChange(accepted, edited)).toBe(false);
    }
    const otherRecipe = buildFamilyDayMenu(input({ previousPlanning: accepted, selections: [{ slot: 'lunch', recipeId: 'tofu-rice-v1', participantShares: { alex: 0.75, irina: 1, denis: 1.25 } }] })).planningV1;
    expect(isPurchaseOnlyChange(accepted, otherRecipe)).toBe(false);
  });
  it('does not carry purchases or manual rows into a different day implicitly', () => {
    const previous = buildFamilyDayMenu(input()).planningV1;
    rejectsCode(() => buildFamilyDayMenu(input({ date: '2026-10-21', previousPlanning: previous })), 'INVALID_PLANNING');
    const next = buildFamilyDayMenu(input({ date: '2026-10-21' }));
    expect(next.planningV1.purchasedQuantities.every(item => item.quantity === 0)).toBe(true);
    expect(previous.date).toBe(DATE);
  });
});

describe('stored reads and planning revalidation have separate boundaries', () => {
  it('reads a stored plan after a profile change but refuses planning with stale versions or new restrictions', () => {
    const menu = buildFamilyDayMenu(input());
    expect(validateFamilyPlanningForProfiles(menu, input())).toBe(true);
    const context = input(); context.profiles[0].version += 1;
    expect(isFamilyPlanningMenu(menu, DATE)).toBe(true);
    expect(validateFamilyPlanningForProfiles(menu, context)).toBe(false);
    const restricted = input(); restricted.profiles[0].configuration!.hardExcludedIngredientIds = ['chicken'];
    expect(validateFamilyPlanningForProfiles(menu, restricted)).toBe(false);
    expect(validateFamilyPlanningForProfiles(menu, { ...input(), rosterVersion: 8 })).toBe(false);
  });
  it('rejects tampered projections, catalog ingredients, extra private fields and a different day key', () => {
    const menu = buildFamilyDayMenu(input());
    const badProjection = copy(menu); badProjection.shoppingListItems![0].grams += 1;
    expect(isFamilyPlanningMenu(badProjection, DATE)).toBe(false);
    const badRecipe = copy(menu); badRecipe.planningV1.recipes[0].ingredients[0].quantity = 1;
    expect(isFamilyPlanningMenu(badRecipe, DATE)).toBe(false);
    expect(isFamilyPlanningMenu({ ...menu, privateWeight: 80 }, DATE)).toBe(false);
    expect(isFamilyPlanningMenu({ ...menu, planningV1: { ...menu.planningV1, diagnosis: 'private' } }, DATE)).toBe(false);
    expect(isFamilyPlanningMenu(menu, '2026-10-19')).toBe(false);
    expect(isFamilyPlanningMenu({ ...menu, days: Array(7).fill(menu.days[0]) }, DATE)).toBe(false);
  });
  it('does not accept fuzzy IDs, unsafe object keys, duplicate purchase keys or missing known composition', () => {
    const menu = buildFamilyDayMenu(input());
    const duplicate = copy(menu.planningV1); duplicate.purchasedQuantities.push(copy(duplicate.purchasedQuantities[0]));
    rejectsCode(() => deriveLegacyFamilyMenu(duplicate), 'INVALID_PLANNING');
    const unsafeShares = JSON.parse('{"__proto__":1}');
    rejectsCode(() => buildFamilyDayMenu(input({ selections: [{ slot: 'lunch', participantShares: unsafeShares }] })), 'BAD_SELECTION');
    const wrongCatalog = FAMILY_INGREDIENTS.map(item => ({ ...item, allergenIds: [] }));
    const breakfast = buildFamilyDayMenu(input({ selections: [{ slot: 'breakfast', recipeId: 'oats-milk-apple-v1', participantShares: { alex: 1 } }] }));
    rejectsCode(() => projectFamilyDay(breakfast.planningV1, wrongCatalog), 'UNKNOWN_CATALOG_ID');
  });
  it('keeps immutable catalog versions separate from editable output snapshots', () => {
    expect(Object.isFrozen(FAMILY_RECIPES)).toBe(true);
    expect(Object.isFrozen(getFamilyRecipe('chicken-rice-v1')!.ingredients)).toBe(true);
    expect(Object.isFrozen(getFamilyIngredient('milk')!.allergenIds)).toBe(true);
    const menu = buildFamilyDayMenu(input());
    menu.planningV1.recipes[0].title = 'Локальная правка';
    expect(getFamilyRecipe('chicken-rice-v1')!.title).toBe('Курица с рисом и морковью');
    expect(isFamilyPlanningMenu(menu, DATE)).toBe(false);
  });
});
