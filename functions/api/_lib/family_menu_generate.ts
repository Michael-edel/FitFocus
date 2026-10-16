import { nowMs, uuid } from './db';
import { requireFamilyOwner } from './family_access';
import { isFamilyMenuWeekStart } from './family_menu';
import { aggregateShoppingRows, normalizeShoppingIngredient } from './ingredients';
import { isJsonObject, safeJsonParse } from './json';
import { requireFamilyPlan } from './plans';
import { calculateDailyTargets } from '../../../domain/profileMath';
import { ActivityLevel, Gender, Goal } from '../../../domain/types';

type ItemKey =
  | 'oatmeal' | 'greek_yogurt' | 'banana' | 'egg' | 'chicken_breast' | 'rice' | 'salad_mix'
  | 'olive_oil' | 'buckwheat' | 'cottage_cheese' | 'berries' | 'nuts' | 'plant_yogurt'
  | 'tofu' | 'turkey' | 'quinoa' | 'seeds';

const BASE_DAY_KCAL = 2000;
const ITEM_META: Record<ItemKey, { name: string; grams: number }> = {
  oatmeal: { name: 'Овсянка', grams: 60 }, greek_yogurt: { name: 'Йогурт греческий', grams: 200 },
  banana: { name: 'Банан', grams: 120 }, egg: { name: 'Яйца', grams: 100 },
  chicken_breast: { name: 'Куриная грудка', grams: 180 }, rice: { name: 'Рис', grams: 70 },
  salad_mix: { name: 'Салат (микс)', grams: 200 }, olive_oil: { name: 'Оливковое масло', grams: 15 },
  buckwheat: { name: 'Гречка', grams: 70 }, cottage_cheese: { name: 'Творог', grams: 200 },
  berries: { name: 'Ягоды', grams: 120 }, nuts: { name: 'Орехи', grams: 30 },
  plant_yogurt: { name: 'Растительный йогурт', grams: 200 }, tofu: { name: 'Тофу', grams: 130 },
  turkey: { name: 'Индейка', grams: 180 }, quinoa: { name: 'Киноа', grams: 70 },
  seeds: { name: 'Семена тыквы', grams: 25 },
};
const ITEM_TERMS: Record<ItemKey, string[]> = {
  oatmeal: ['овсян', 'глютен'], greek_yogurt: ['йогурт', 'молоч', 'молок', 'лактоз'], banana: ['банан'], egg: ['яйц'],
  chicken_breast: ['куриц', 'птиц'], rice: ['рис'], salad_mix: ['салат', 'овощ'], olive_oil: ['масло', 'олив'],
  buckwheat: ['греч'], cottage_cheese: ['творог', 'молоч', 'молок', 'лактоз'], berries: ['ягод'],
  nuts: ['орех', 'арахис', 'миндаль', 'фундук'], plant_yogurt: ['йогурт растительный'], tofu: ['тофу', 'соя'],
  turkey: ['индей'], quinoa: ['киноа'], seeds: ['семен', 'тыкв'],
};
const SUBSTITUTES: Record<ItemKey, ItemKey[]> = {
  oatmeal: ['buckwheat', 'quinoa'], greek_yogurt: ['plant_yogurt', 'berries'], banana: ['berries'], egg: ['tofu', 'cottage_cheese'],
  chicken_breast: ['turkey', 'egg'], rice: ['buckwheat', 'quinoa'], salad_mix: ['berries'], olive_oil: ['seeds'],
  buckwheat: ['quinoa', 'rice'], cottage_cheese: ['plant_yogurt', 'tofu'], berries: ['banana'], nuts: ['seeds', 'berries'],
  plant_yogurt: ['berries'], tofu: ['turkey'], turkey: ['chicken_breast'], quinoa: ['buckwheat'], seeds: ['berries'],
};

type MemberRestrictions = { allergens: string[]; intolerances: string[]; excludedFoods: string[]; severity: 'soft' | 'strict'; notes: string };
type RestrictionsPayload = { allergens?: unknown; intolerances?: unknown; excludedFoods?: unknown; exclusions?: unknown; forbidden?: unknown; severity?: unknown; notes?: unknown };
type SharedMeal = { title: string; items: ItemKey[] };
type SharedDay = { name: string; breakfast: SharedMeal; lunch: SharedMeal; dinner: SharedMeal; snack: SharedMeal };
type SharedMenu = { version: number; days: SharedDay[] };
type PortionIngredient = { key: ItemKey; originalKey: ItemKey; name: string; grams: number };
type PortionMeal = { title: string; ingredients: PortionIngredient[] };
type PortionDay = { name: string; meals: Record<'breakfast' | 'lunch' | 'dinner' | 'snack', PortionMeal> };
type PortionTotals = { name: string; grams: number };
type MemberPortions = { portions: PortionDay[]; totals: PortionTotals[]; kcalPerDay: number; replacements: Record<string, string> };
type FamilyMemberRow = { user_id: string; goal?: string | null; sex?: string | null; age?: number | null; height_cm?: number | null; weight_kg?: number | null; activity?: number | null; restrictions_json?: string | null };
type WeeklyMenuRow = { id?: string };

export type FamilyMenuGenerateResult =
  | { kind: 'invalid-week' }
  | { kind: 'generated'; weekStart: string; menuId: string; familyId: string; menu: unknown; memberCount: number };

function normalizeText(value: string) {
  return value.toLowerCase().replace(/ё/g, 'е').trim();
}

function parseRestrictions(value: unknown): MemberRestrictions {
  let raw: unknown = value;
  if (typeof value === 'string') raw = safeJsonParse(value) ?? { notes: value };
  if (!isJsonObject(raw)) raw = {};
  const data: RestrictionsPayload = raw;
  const clean = (input: unknown) => (Array.isArray(input) ? input.map(String) : typeof input === 'string' ? input.split(/[,;\n]/) : [])
    .map(normalizeText).filter(Boolean).slice(0, 20);
  return {
    allergens: clean(data.allergens),
    intolerances: clean(data.intolerances),
    excludedFoods: clean(data.excludedFoods || data.exclusions || data.forbidden),
    severity: String(data.severity || '').toLowerCase() === 'soft' ? 'soft' : 'strict',
    notes: String(data.notes || '').slice(0, 300),
  };
}

function isRestrictedItem(key: ItemKey, restrictions: MemberRestrictions) {
  if (restrictions.severity !== 'strict') return false;
  const noteTerms = restrictions.notes ? normalizeText(restrictions.notes).split(/[,;\n]/).map((value) => value.trim()).filter((value) => value.length >= 3) : [];
  const terms = [...restrictions.allergens, ...restrictions.intolerances, ...restrictions.excludedFoods, ...noteTerms].map(normalizeText).filter((value) => value.length >= 3);
  if (!terms.length) return false;
  const labels = [ITEM_META[key]?.name || '', ...(ITEM_TERMS[key] || [])].map(normalizeText);
  return terms.some((term) => labels.some((label) => label.includes(term) || term.includes(label)));
}

function buildDeterministicSharedMenu(): SharedMenu {
  const days = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const sharedDay = () => ({
    breakfast: { title: 'Овсянка + йогурт + фрукт', items: ['oatmeal', 'greek_yogurt', 'banana', 'egg'] as ItemKey[] },
    lunch: { title: 'Курица + рис + салат', items: ['chicken_breast', 'rice', 'salad_mix', 'olive_oil'] as ItemKey[] },
    dinner: { title: 'Курица + гречка + салат', items: ['chicken_breast', 'buckwheat', 'salad_mix', 'olive_oil'] as ItemKey[] },
    snack: { title: 'Творог + ягоды + орехи', items: ['cottage_cheese', 'berries', 'nuts'] as ItemKey[] },
  });
  return { version: 1, days: days.map((name) => ({ name, ...sharedDay() })) };
}

function memberTargetKcal(member: FamilyMemberRow): number {
  const goal = String(member.goal || '').toUpperCase() === 'LOSS' ? Goal.LOSS : Goal.MAINTAIN;
  const sex = String(member.sex || '').toUpperCase();
  const age = Number(member.age || 0), height = Number(member.height_cm || 0), weight = Number(member.weight_kg || 0), activity = Number(member.activity || 0);
  if ((sex === 'MALE' || sex === 'FEMALE') && age > 0 && height > 0 && weight > 0) {
    const targets = calculateDailyTargets({
      gender: sex === 'MALE' ? Gender.MALE : Gender.FEMALE, age, height, weight,
      activityLevel: Object.values(ActivityLevel).includes(activity as ActivityLevel) ? activity as ActivityLevel : ActivityLevel.SEDENTARY,
      goal, adaptationMultiplier: 1, lossDeficit: undefined, gainSurplus: undefined,
    });
    return Math.max(1200, Math.round(targets.calories || 2000));
  }
  return goal === Goal.LOSS ? 1700 : 2000;
}

function buildPortionsForMember(shared: SharedMenu, kcalPerDay: number, restrictions: MemberRestrictions): MemberPortions {
  const factor = Math.max(0.6, Math.min(1.8, kcalPerDay / BASE_DAY_KCAL));
  const totals: Record<string, number> = {}, replacements: Record<string, string> = {};
  const portions = shared.days.map((day) => {
    const meals = {} as Record<'breakfast' | 'lunch' | 'dinner' | 'snack', PortionMeal>;
    for (const mealKey of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
      const meal = day[mealKey];
      const ingredients = meal.items.map((key) => {
        const resolvedKey = isRestrictedItem(key, restrictions)
          ? (SUBSTITUTES[key] || []).find((candidate) => !isRestrictedItem(candidate, restrictions)) || key
          : key;
        if (resolvedKey !== key) replacements[ITEM_META[key].name] = ITEM_META[resolvedKey].name;
        const meta = ITEM_META[resolvedKey], grams = Math.max(1, Math.round(meta.grams * factor));
        totals[meta.name] = (totals[meta.name] || 0) + grams;
        return { key: resolvedKey, originalKey: key, name: meta.name, grams };
      });
      meals[mealKey] = { title: meal.title, ingredients };
    }
    return { name: day.name, meals };
  });
  return { portions, totals: Object.entries(totals).map(([name, grams]) => ({ name, grams })).sort((a, b) => a.name.localeCompare(b.name, 'ru')), kcalPerDay, replacements };
}

function formatMealPortion(ingredients: { name: string; grams: number }[], kcal: number) {
  return `${ingredients.map((ingredient) => `${ingredient.name} ${Math.max(1, Math.round(Number(ingredient.grams || 0)))}г`).join(' + ')} (≈${Math.max(1, Math.round(kcal))} ккал)`;
}

/** Generates and atomically persists a shared family menu and each member's portions. */
export async function generateFamilyMenu({ db, userId, weekStart }: { db: D1Database; userId: string; weekStart: string }): Promise<FamilyMenuGenerateResult> {
  if (!isFamilyMenuWeekStart(weekStart)) return { kind: 'invalid-week' };
  const family = await requireFamilyOwner(db, userId);
  await requireFamilyPlan(db, userId);
  const now = Math.floor(nowMs() / 1000), shared = buildDeterministicSharedMenu();
  const existing = await db.prepare('SELECT id FROM weekly_menus WHERE family_id=? AND week_start=? LIMIT 1').bind(family.id, weekStart).first<WeeklyMenuRow>();
  const menuId = existing?.id || uuid();
  const members = await db.prepare(`SELECT user_id, goal, sex, age, height_cm, weight_kg, activity
          , restrictions_json FROM family_members WHERE family_id = ? AND status = 'active' AND is_active = 1`).bind(family.id).all<FamilyMemberRow>();
  const memberList = members.results || [];
  const portionsByUser: Record<string, MemberPortions> = {};
  const portionStatements: D1PreparedStatement[] = [], itemStatements: D1PreparedStatement[] = [];

  for (const member of memberList) {
    const memberId = String(member.user_id);
    const computed = buildPortionsForMember(shared, memberTargetKcal(member), parseRestrictions(member.restrictions_json));
    portionsByUser[memberId] = computed;
    portionStatements.push(db.prepare(`INSERT INTO weekly_menu_portions (weekly_menu_id, user_id, portions_json, totals_json, updated_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(weekly_menu_id, user_id)
      DO UPDATE SET portions_json=excluded.portions_json, totals_json=excluded.totals_json, updated_at=excluded.updated_at`)
      .bind(menuId, memberId, JSON.stringify(computed.portions), JSON.stringify(computed.totals), now));
    for (const total of computed.totals) {
      const normalized = normalizeShoppingIngredient(total.name, total.grams);
      if (!normalized.name || normalized.grams <= 0) continue;
      itemStatements.push(db.prepare('INSERT INTO weekly_menu_items (id, user_id, family_id, week_start, ingredient_name, grams, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(uuid(), memberId, family.id, weekStart, normalized.name, normalized.grams, now));
    }
  }

  const mealShares: Record<'breakfast' | 'lunch' | 'dinner' | 'snack', number> = { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snack: 0.1 };
  const shoppingListItems = aggregateShoppingRows(memberList.flatMap((member) => (portionsByUser[String(member.user_id)]?.totals || []).map((item) => ({ name: item.name, grams: item.grams }))))
    .map((item) => ({ name: item.name, grams: Math.round(Number(item.grams || 0)) }));
  const familyWeeklyMenu = {
    prefs: {
      includeIds: memberList.map((member) => String(member.user_id)), cookingMode: 'all_meals' as const, budgetPerWeek: undefined, currency: 'KZT',
      replacementsByUser: Object.fromEntries(Object.entries(portionsByUser).map(([memberId, portions]) => [memberId, portions.replacements || {}])),
    },
    weekStart,
    days: shared.days.map((day, dayIndex) => {
      const buildMeal = (mealKey: 'breakfast' | 'lunch' | 'dinner' | 'snack') => {
        const portions: Record<string, string> = {};
        for (const member of memberList) {
          const memberId = String(member.user_id), meal = portionsByUser[memberId]?.portions?.[dayIndex]?.meals?.[mealKey];
          portions[memberId] = formatMealPortion(Array.isArray(meal?.ingredients) ? meal.ingredients : [], memberTargetKcal(member) * mealShares[mealKey]);
        }
        return { base: String(day[mealKey]?.title || ''), portions };
      };
      return { day: String(day.name || ''), breakfast: buildMeal('breakfast'), lunch: buildMeal('lunch'), dinner: buildMeal('dinner'), snack: buildMeal('snack') };
    }),
    shoppingListItems,
    shoppingList: shoppingListItems.map((item) => `${item.name} — ${item.grams} г`),
  };
  const menuJson = JSON.stringify(familyWeeklyMenu);
  const statements: D1PreparedStatement[] = [
    existing ? db.prepare('UPDATE weekly_menus SET menu_json=?, created_by_user_id=?, created_at=? WHERE id=?').bind(menuJson, userId, now, menuId)
      : db.prepare('INSERT INTO weekly_menus (id, family_id, week_start, menu_json, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(menuId, family.id, weekStart, menuJson, userId, now),
    db.prepare('DELETE FROM weekly_menu_portions WHERE weekly_menu_id=?').bind(menuId),
    db.prepare('DELETE FROM weekly_menu_items WHERE family_id=? AND week_start=?').bind(family.id, weekStart),
    ...portionStatements, ...itemStatements,
  ];
  await db.batch(statements);
  return { kind: 'generated', weekStart, menuId, familyId: family.id, menu: familyWeeklyMenu, memberCount: memberList.length };
}
