// /api/family/menu/generate
// POST: generate shared weekly menu + personalized portions for all active members (server-side)
// This enables true B2C Family mode: one shared menu, different portion sizes per member, one aggregated family shopping list.
import { json, requireUser } from "../../_lib/auth";
import { requireDB, ensureUserRow, uuid, nowMs, toApiError } from "../../_lib/db";
import { requireFamilyOwner } from "../../_lib/family_access";
import { aggregateShoppingRows, normalizeShoppingIngredient } from "../../_lib/ingredients";
import { requireFamilyPlan } from "../../_lib/plans";
import { calculateDailyTargets } from "../../../../domain/profileMath";
import { Gender, Goal, ActivityLevel } from "../../../../domain/types";
import { isJsonObject, safeJsonParse } from "../../_lib/json";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

function isIsoDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function weekStartISO(d: Date) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diff = (day === 0 ? -6 : 1 - day);
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

type ItemKey =
  | "oatmeal"
  | "greek_yogurt"
  | "banana"
  | "egg"
  | "chicken_breast"
  | "rice"
  | "salad_mix"
  | "olive_oil"
  | "buckwheat"
  | "cottage_cheese"
  | "berries"
  | "nuts"
  | "plant_yogurt"
  | "tofu"
  | "turkey"
  | "quinoa"
  | "seeds";

const BASE_DAY_KCAL = 2000;

// Base grams are calibrated for ~2000 kcal/day template.
// Portions for a member are scaled by (member_target_kcal / 2000).
const ITEM_META: Record<ItemKey, { name: string; grams: number }> = {
  oatmeal: { name: "Овсянка", grams: 60 },
  greek_yogurt: { name: "Йогурт греческий", grams: 200 },
  banana: { name: "Банан", grams: 120 },
  egg: { name: "Яйца", grams: 100 }, // ~2 eggs, handled as grams for now
  chicken_breast: { name: "Куриная грудка", grams: 180 },
  rice: { name: "Рис", grams: 70 },
  salad_mix: { name: "Салат (микс)", grams: 200 },
  olive_oil: { name: "Оливковое масло", grams: 15 },
  buckwheat: { name: "Гречка", grams: 70 },
  cottage_cheese: { name: "Творог", grams: 200 },
  berries: { name: "Ягоды", grams: 120 },
  nuts: { name: "Орехи", grams: 30 },
  plant_yogurt: { name: "Растительный йогурт", grams: 200 },
  tofu: { name: "Тофу", grams: 130 },
  turkey: { name: "Индейка", grams: 180 },
  quinoa: { name: "Киноа", grams: 70 },
  seeds: { name: "Семена тыквы", grams: 25 },
};

const ITEM_TERMS: Record<ItemKey, string[]> = {
  oatmeal: ["овсян", "глютен"],
  greek_yogurt: ["йогурт", "молоч", "молок", "лактоз"],
  banana: ["банан"],
  egg: ["яйц"],
  chicken_breast: ["куриц", "птиц"],
  rice: ["рис"],
  salad_mix: ["салат", "овощ"],
  olive_oil: ["масло", "олив"],
  buckwheat: ["греч"],
  cottage_cheese: ["творог", "молоч", "молок", "лактоз"],
  berries: ["ягод"],
  nuts: ["орех", "арахис", "миндаль", "фундук"],
  plant_yogurt: ["йогурт растительный"],
  tofu: ["тофу", "соя"],
  turkey: ["индей"],
  quinoa: ["киноа"],
  seeds: ["семен", "тыкв"],
};

const SUBSTITUTES: Record<ItemKey, ItemKey[]> = {
  oatmeal: ["buckwheat", "quinoa"],
  greek_yogurt: ["plant_yogurt", "berries"],
  banana: ["berries"],
  egg: ["tofu", "cottage_cheese"],
  chicken_breast: ["turkey", "egg"],
  rice: ["buckwheat", "quinoa"],
  salad_mix: ["berries"],
  olive_oil: ["seeds"],
  buckwheat: ["quinoa", "rice"],
  cottage_cheese: ["plant_yogurt", "tofu"],
  berries: ["banana"],
  nuts: ["seeds", "berries"],
  plant_yogurt: ["berries"],
  tofu: ["turkey"],
  turkey: ["chicken_breast"],
  quinoa: ["buckwheat"],
  seeds: ["berries"],
};

type MemberRestrictions = {
  allergens: string[];
  intolerances: string[];
  excludedFoods: string[];
  severity: "soft" | "strict";
  notes: string;
};

type RestrictionsPayload = {
  allergens?: unknown;
  intolerances?: unknown;
  excludedFoods?: unknown;
  exclusions?: unknown;
  forbidden?: unknown;
  severity?: unknown;
  notes?: unknown;
};

type SharedMeal = {
  title: string;
  items: ItemKey[];
};

type SharedDay = {
  name: string;
  breakfast: SharedMeal;
  lunch: SharedMeal;
  dinner: SharedMeal;
  snack: SharedMeal;
};

type SharedMenu = {
  version: number;
  days: SharedDay[];
};

type PortionIngredient = { key: ItemKey; originalKey: ItemKey; name: string; grams: number };
type PortionMeal = { title: string; ingredients: PortionIngredient[] };
type PortionDay = { name: string; meals: Record<"breakfast" | "lunch" | "dinner" | "snack", PortionMeal> };
type PortionTotals = { name: string; grams: number };
type MemberPortions = {
  portions: PortionDay[];
  totals: PortionTotals[];
  kcalPerDay: number;
  replacements: Record<string, string>;
};

type FamilyMemberRow = {
  user_id: string;
  goal?: string | null;
  sex?: string | null;
  age?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  activity?: number | null;
  restrictions_json?: string | null;
};

type WeeklyMenuRow = { id?: string };

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").trim();
}

function splitTextList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(/[,;\n]/);
  return [];
}

function parseRestrictions(value: unknown): MemberRestrictions {
  let raw: unknown = value;
  if (typeof value === "string") {
    raw = safeJsonParse(value) ?? { notes: value };
  }
  if (!isJsonObject(raw)) {
    raw = {};
  }
  const data: RestrictionsPayload = raw;
  const clean = (v: unknown) => splitTextList(v).map((x) => normalizeText(x)).filter(Boolean).slice(0, 20);
  return {
    allergens: clean(data.allergens),
    intolerances: clean(data.intolerances),
    excludedFoods: clean(data.excludedFoods || data.exclusions || data.forbidden),
    severity: String(data.severity || "").toLowerCase() === "soft" ? "soft" : "strict",
    notes: String(data.notes || "").slice(0, 300),
  };
}

function restrictionTerms(r: MemberRestrictions): string[] {
  const fromNotes = r.notes
    ? normalizeText(r.notes)
        .split(/[,;\n]/)
        .map((x) => x.trim())
        .filter((x) => x.length >= 3)
    : [];
  return [...r.allergens, ...r.intolerances, ...r.excludedFoods, ...fromNotes]
    .map(normalizeText)
    .filter((x) => x.length >= 3);
}

function isRestrictedItem(key: ItemKey, r: MemberRestrictions): boolean {
  if (r.severity !== "strict") return false;
  const terms = restrictionTerms(r);
  if (!terms.length) return false;

  const labels = [ITEM_META[key]?.name || "", ...(ITEM_TERMS[key] || [])].map(normalizeText);
  return terms.some((term) => labels.some((label) => label.includes(term) || term.includes(label)));
}

function resolveItemKey(key: ItemKey, r: MemberRestrictions): ItemKey {
  if (!isRestrictedItem(key, r)) return key;
  const candidates = SUBSTITUTES[key] || [];
  return candidates.find((candidate) => !isRestrictedItem(candidate, r)) || key;
}

function buildDeterministicSharedMenu(): SharedMenu {
  const days = ["Понедельник","Вторник","Среда","Четверг","Пятница","Суббота","Воскресенье"];
  const sharedDay = () => ({
    breakfast: { title: "Овсянка + йогурт + фрукт", items: ["oatmeal","greek_yogurt","banana","egg"] as ItemKey[] },
    lunch: { title: "Курица + рис + салат", items: ["chicken_breast","rice","salad_mix","olive_oil"] as ItemKey[] },
    dinner: { title: "Курица + гречка + салат", items: ["chicken_breast","buckwheat","salad_mix","olive_oil"] as ItemKey[] },
    snack: { title: "Творог + ягоды + орехи", items: ["cottage_cheese","berries","nuts"] as ItemKey[] },
  });
  return { version: 1, days: days.map((name)=>({ name, ...sharedDay() })) };
}

function memberTargetKcal(member: FamilyMemberRow): number {
  const goalRaw = String(member?.goal || "").toUpperCase();
  const goal = goalRaw === "LOSS" ? Goal.LOSS : Goal.MAINTAIN;

  // If profile exists, compute targets
  const sexRaw = String(member?.sex || "").toUpperCase();
  const age = Number(member?.age || 0);
  const height = Number(member?.height_cm || 0);
  const weight = Number(member?.weight_kg || 0);
  const activityNum = Number(member?.activity || 0);

  if ((sexRaw === "MALE" || sexRaw === "FEMALE") && age > 0 && height > 0 && weight > 0) {
    const gender = sexRaw === "MALE" ? Gender.MALE : Gender.FEMALE;
    const activityLevel = Object.values(ActivityLevel).includes(activityNum as ActivityLevel)
      ? (activityNum as ActivityLevel)
      : ActivityLevel.SEDENTARY;

    const targets = calculateDailyTargets({
      gender,
      age,
      height,
      weight,
      activityLevel,
      goal,
      adaptationMultiplier: 1.0,
      lossDeficit: undefined,
      gainSurplus: undefined,
    });
    return Math.max(1200, Math.round(targets.calories || 2000));
  }

  // Fallback simple defaults for B2C
  return goal === Goal.LOSS ? 1700 : 2000;
}

function buildPortionsForMember(shared: SharedMenu, kcalPerDay: number, restrictions: MemberRestrictions = parseRestrictions(null)): MemberPortions {
  const k = Math.max(0.6, Math.min(1.8, kcalPerDay / BASE_DAY_KCAL));
  const totals: Record<string, number> = {};
  const replacements: Record<string, string> = {};
  const portions: PortionDay[] = shared.days.map((d) => {
    const meals = {} as Record<"breakfast" | "lunch" | "dinner" | "snack", PortionMeal>;
    for (const mealKey of ["breakfast","lunch","dinner","snack"]) {
      const m = d[mealKey];
      const ing = (m.items as ItemKey[]).map((key) => {
        const resolvedKey = resolveItemKey(key, restrictions);
        if (resolvedKey !== key) {
          replacements[ITEM_META[key].name] = ITEM_META[resolvedKey].name;
        }
        const meta = ITEM_META[resolvedKey];
        const grams = Math.max(1, Math.round(meta.grams * k));
        totals[meta.name] = (totals[meta.name] || 0) + grams;
        return { key: resolvedKey, originalKey: key, name: meta.name, grams };
      });
      meals[mealKey] = { title: m.title, ingredients: ing };
    }
    return { name: d.name, meals };
  });

  // Totals for the whole week
  const totalsArr = Object.entries(totals)
    .map(([name, grams]) => ({ name, grams }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  return { portions, totals: totalsArr, kcalPerDay, replacements };
}

function formatMealPortion(ingredients: { name: string; grams: number }[], kcal: number): string {
  const parts = ingredients
    .map((it) => `${it.name} ${Math.max(1, Math.round(Number(it.grams || 0)))}г`)
    .join(" + ");
  // Не дублируем общий вес: в UI он воспринимается как отдельная граммовка справа.
  return `${parts} (≈${Math.max(1, Math.round(kcal))} ккал)`;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const url = new URL(request.url);
    const week = url.searchParams.get("week");
    const weekStart = week ? week : weekStartISO(new Date());
    if (!isIsoDay(weekStart)) return json({ error: "BAD_WEEK" }, 400);

    const fam = await requireFamilyOwner(db, user.sub);
    await requireFamilyPlan(db, user.sub);

    const now = Math.floor(nowMs() / 1000);
    const shared = buildDeterministicSharedMenu();

    const existing = await db
      .prepare("SELECT id FROM weekly_menus WHERE family_id=? AND week_start=? LIMIT 1")
      .bind(fam.id, weekStart)
      .first<WeeklyMenuRow>();

    const menuId = existing?.id || uuid();

    // Compute and store portions for all active members (B2C sync)
    const members = await db
      .prepare(
        `SELECT user_id, goal, sex, age, height_cm, weight_kg, activity
                , restrictions_json
         FROM family_members
         WHERE family_id = ? AND status = 'active' AND is_active = 1`
      )
      .bind(fam.id)
      .all<FamilyMemberRow>();

    const membersList = members.results || [];
    const portionsByUser: Record<string, MemberPortions> = {};
    const portionStatements: D1PreparedStatement[] = [];
    const itemStatements: D1PreparedStatement[] = [];

    for (const m of membersList) {
      const kcal = memberTargetKcal(m);
      const restrictions = parseRestrictions(m.restrictions_json);
      const computed = buildPortionsForMember(shared, kcal, restrictions);
      portionsByUser[String(m.user_id)] = computed;

      portionStatements.push(
        db
        .prepare(
          `INSERT INTO weekly_menu_portions (weekly_menu_id, user_id, portions_json, totals_json, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(weekly_menu_id, user_id)
           DO UPDATE SET portions_json=excluded.portions_json, totals_json=excluded.totals_json, updated_at=excluded.updated_at`
        )
        .bind(menuId, String(m.user_id), JSON.stringify(computed.portions), JSON.stringify(computed.totals), now)
      );

      for (const it of computed.totals) {
        const normalized = normalizeShoppingIngredient(it.name, it.grams);
        if (!normalized.name || normalized.grams <= 0) continue;
        itemStatements.push(
          db
          .prepare(
            "INSERT INTO weekly_menu_items (id, user_id, family_id, week_start, ingredient_name, grams, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
          )
          .bind(uuid(), String(m.user_id), fam.id, weekStart, normalized.name, normalized.grams, now)
        );
      }
    }

    const mealShares: Record<"breakfast" | "lunch" | "dinner" | "snack", number> = {
      breakfast: 0.25,
      lunch: 0.35,
      dinner: 0.30,
      snack: 0.10,
    };

    const shoppingListRows = membersList.flatMap((m) => {
        const computed = portionsByUser[String(m.user_id)];
        return (computed?.totals || []).map((item) => ({ name: item.name, grams: item.grams }));
      });
    const shoppingListItems = aggregateShoppingRows(shoppingListRows).map((it) => ({
      name: it.name,
      grams: Math.round(Number(it.grams || 0)),
    }));

    const familyWeeklyMenu = {
      prefs: {
        includeIds: membersList.map((m) => String(m.user_id)),
        cookingMode: "all_meals" as const,
        budgetPerWeek: undefined,
        currency: "KZT",
        replacementsByUser: Object.fromEntries(
          Object.entries(portionsByUser).map(([userId, computed]) => [userId, computed.replacements || {}])
        ),
      },
      weekStart,
      days: shared.days.map((day, dayIdx: number) => {
        const buildMeal = (mealKey: "breakfast" | "lunch" | "dinner" | "snack") => {
          const baseMeal = day[mealKey];
          const portions: Record<string, string> = {};
          for (const m of membersList) {
            const userId = String(m.user_id);
            const computed = portionsByUser[userId];
            const meal = computed?.portions?.[dayIdx]?.meals?.[mealKey];
            const ingredients = Array.isArray(meal?.ingredients) ? meal.ingredients : [];
            const targetKcal = memberTargetKcal(m);
            portions[userId] = formatMealPortion(ingredients, targetKcal * mealShares[mealKey]);
          }
          return {
            base: String(baseMeal?.title || ""),
            portions,
          };
        };

        return {
          day: String(day?.name || ""),
          breakfast: buildMeal("breakfast"),
          lunch: buildMeal("lunch"),
          dinner: buildMeal("dinner"),
          snack: buildMeal("snack"),
          };
        }),
      shoppingListItems,
      shoppingList: shoppingListItems.map((it) => `${it.name} — ${it.grams} г`),
    };

    const menuJson = JSON.stringify(familyWeeklyMenu);
    const statements: D1PreparedStatement[] = [
      existing
        ? db
            .prepare("UPDATE weekly_menus SET menu_json=?, created_by_user_id=?, created_at=? WHERE id=?")
            .bind(menuJson, user.sub, now, menuId)
        : db
            .prepare("INSERT INTO weekly_menus (id, family_id, week_start, menu_json, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(menuId, fam.id, weekStart, menuJson, user.sub, now),
      db.prepare("DELETE FROM weekly_menu_portions WHERE weekly_menu_id=?").bind(menuId),
      db.prepare("DELETE FROM weekly_menu_items WHERE family_id=? AND week_start=?").bind(fam.id, weekStart),
      ...portionStatements,
      ...itemStatements,
    ];
    await db.batch(statements);

    return json({ ok: true, weekStart, menuId, shared: { id: menuId, familyId: fam.id, weekStart, menu: familyWeeklyMenu }, members: membersList.length }, 200);
  } catch (error: unknown) {
    const apiErr = toApiError(error);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "PLAN_REQUIRED_FAMILY" ? 402 : 400);
  }
};
