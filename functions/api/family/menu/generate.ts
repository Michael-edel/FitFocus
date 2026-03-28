// /api/family/menu/generate
// POST: generate shared weekly menu + personalized portions for all active members (server-side)
// This enables true B2C Family mode: one shared menu, different portion sizes per member, one aggregated family shopping list.
import { json, requireUser } from "../../_lib/auth";
import { requireDB, ensureUserRow, uuid, nowMs, toApiError } from "../../_lib/db";
import { calculateDailyTargets } from "../../../../domain/profileMath";
import { Gender, Goal, ActivityLevel } from "../../../../domain/types";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

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
  | "apple"
  | "turkey_breast"
  | "tofu"
  | "pumpkin_seeds";

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
  apple: { name: "Яблоко", grams: 150 },
  turkey_breast: { name: "Индейка", grams: 180 },
  tofu: { name: "Тофу", grams: 180 },
  pumpkin_seeds: { name: "Тыквенные семечки", grams: 25 },
};

function normalizeToken(v: unknown) {
  return String(v || "").toLowerCase().replace(/ё/g, "е").trim();
}

function buildFamilyRestrictionSet(members: any[]) {
  const tokens = new Set<string>();
  for (const member of members) {
    const profile = (() => {
      if (!member?.profile_json || typeof member.profile_json !== "string") return {};
      try { return JSON.parse(member.profile_json); } catch { return {}; }
    })();
    const lists = [
      ...(profile?.dietary?.allergens || []),
      ...(profile?.dietary?.intolerances || []),
      ...(profile?.dietary?.excludedFoods || []),
      ...String(profile?.exclusions || "").split(","),
    ];
    for (const item of lists) {
      const token = normalizeToken(item);
      if (token) tokens.add(token);
    }
  }
  return tokens;
}

function hasRestriction(tokens: Set<string>, variants: string[]) {
  return variants.some((variant) => {
    const v = normalizeToken(variant);
    for (const token of tokens) {
      if (token.includes(v) || v.includes(token)) return true;
    }
    return false;
  });
}

function pickProtein(tokens: Set<string>) {
  if (hasRestriction(tokens, ["курица", "chicken"])) return "turkey_breast" as ItemKey;
  return "chicken_breast" as ItemKey;
}

function buildDeterministicSharedMenu(restrictions: Set<string>) {
  const days = ["Понедельник","Вторник","Среда","Четверг","Пятница","Суббота","Воскресенье"];
  const dairyRestricted = hasRestriction(restrictions, ["лакт", "молок", "молоч", "йогурт", "творог", "dairy", "lactose"]);
  const nutsRestricted = hasRestriction(restrictions, ["орех", "nuts", "nut"]);
  const eggsRestricted = hasRestriction(restrictions, ["яйц", "egg"]);
  const protein = pickProtein(restrictions);
  const breakfastItems: ItemKey[] = ["oatmeal", dairyRestricted ? "apple" : "greek_yogurt", "banana", eggsRestricted ? "berries" : "egg"];
  const snackItems: ItemKey[] = [dairyRestricted ? "tofu" : "cottage_cheese", "berries", nutsRestricted ? "pumpkin_seeds" : "nuts"];
  const breakfastTitle = dairyRestricted ? "Овсянка + фруктовый завтрак" : "Овсянка + йогурт + фрукт";
  const snackTitle = dairyRestricted ? "Тофу + ягоды + семечки" : (nutsRestricted ? "Творог + ягоды + семечки" : "Творог + ягоды + орехи");
  const lunchTitle = protein === "turkey_breast" ? "Индейка + рис + салат" : "Курица + рис + салат";
  const dinnerTitle = protein === "turkey_breast" ? "Индейка + гречка + салат" : "Курица + гречка + салат";
  const sharedDay = () => ({
    breakfast: { title: breakfastTitle, items: breakfastItems },
    lunch: { title: lunchTitle, items: [protein, "rice", "salad_mix", "olive_oil"] as ItemKey[] },
    dinner: { title: dinnerTitle, items: [protein, "buckwheat", "salad_mix", "olive_oil"] as ItemKey[] },
    snack: { title: snackTitle, items: snackItems },
  });
  return { version: 2, safety: { dairyRestricted, nutsRestricted, eggsRestricted }, days: days.map((name)=>({ name, ...sharedDay() })) };
}

function memberTargetKcal(member: any): number {
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
    const activityLevel = Object.values(ActivityLevel).includes(activityNum as any)
      ? (activityNum as any)
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
    } as any);
    return Math.max(1200, Math.round(targets.calories || 2000));
  }

  // Fallback simple defaults for B2C
  return goal === Goal.LOSS ? 1700 : 2000;
}

function buildPortionsForMember(shared: any, kcalPerDay: number) {
  const k = Math.max(0.6, Math.min(1.8, kcalPerDay / BASE_DAY_KCAL));
  const totals: Record<string, number> = {};
  const portions = shared.days.map((d: any) => {
    const outDay: any = { name: d.name, meals: {} };
    for (const mealKey of ["breakfast","lunch","dinner","snack"]) {
      const m = d[mealKey];
      const ing = (m.items as ItemKey[]).map((key) => {
        const meta = ITEM_META[key];
        const grams = Math.max(1, Math.round(meta.grams * k));
        totals[meta.name] = (totals[meta.name] || 0) + grams;
        return { key, name: meta.name, grams };
      });
      outDay.meals[mealKey] = { title: m.title, ingredients: ing };
    }
    return outDay;
  });

  // Totals for the whole week
  const totalsArr = Object.entries(totals)
    .map(([name, grams]) => ({ name, grams }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  return { portions, totals: totalsArr, kcalPerDay };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const url = new URL(request.url);
    const week = url.searchParams.get("week");
    const weekStart = week ? week : weekStartISO(new Date());

    const fam = await db
      .prepare(
        `SELECT f.id, f.owner_user_id
         FROM families f
         JOIN family_members m ON m.family_id = f.id
         WHERE m.user_id = ? AND m.status='active'
         LIMIT 1`
      )
      .bind(user.sub)
      .first<any>();
    if (!fam) throw new Error("NOT_FOUND");
    if (fam.owner_user_id !== user.sub) throw new Error("FORBIDDEN");

    const now = Math.floor(nowMs() / 1000);

    const members = await db
      .prepare(
        `SELECT m.user_id, m.goal, m.sex, m.age, m.height_cm, m.weight_kg, m.activity, up.profile_json
         FROM family_members m
         LEFT JOIN user_profiles up ON up.user_id = m.user_id
         WHERE m.family_id = ? AND m.status = 'active'`
      )
      .bind(fam.id)
      .all<any>();

    const membersList = members.results || [];
    const familyRestrictions = buildFamilyRestrictionSet(membersList);
    const shared = buildDeterministicSharedMenu(familyRestrictions);

    const existing = await db
      .prepare("SELECT id FROM weekly_menus WHERE family_id=? AND week_start=? LIMIT 1")
      .bind(fam.id, weekStart)
      .first<any>();

    const menuId = existing?.id || uuid();

    if (existing) {
      await db
        .prepare("UPDATE weekly_menus SET menu_json=?, created_by_user_id=?, created_at=? WHERE id=?")
        .bind(JSON.stringify(shared), user.sub, now, menuId)
        .run();
      await db.prepare("DELETE FROM weekly_menu_portions WHERE weekly_menu_id=?").bind(menuId).run();
    } else {
      await db
        .prepare("INSERT INTO weekly_menus (id, family_id, week_start, menu_json, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(menuId, fam.id, weekStart, JSON.stringify(shared), user.sub, now)
        .run();
    }

    // Compute and store portions for all active members (B2C sync)

    for (const m of membersList) {
      const kcal = memberTargetKcal(m);
      const computed = buildPortionsForMember(shared, kcal);

      // Upsert portions
      await db
        .prepare(
          `INSERT INTO weekly_menu_portions (weekly_menu_id, user_id, portions_json, totals_json, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(weekly_menu_id, user_id)
           DO UPDATE SET portions_json=excluded.portions_json, totals_json=excluded.totals_json, updated_at=excluded.updated_at`
        )
        .bind(menuId, String(m.user_id), JSON.stringify(computed.portions), JSON.stringify(computed.totals), now)
        .run();

      // Replace user's family-scoped weekly_menu_items so shopping list works immediately on all devices
      await db
        .prepare("DELETE FROM weekly_menu_items WHERE user_id=? AND family_id=? AND week_start=?")
        .bind(String(m.user_id), fam.id, weekStart)
        .run();

      for (const it of computed.totals) {
        await db
          .prepare(
            "INSERT INTO weekly_menu_items (id, user_id, family_id, week_start, ingredient_name, grams, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
          )
          .bind(uuid(), String(m.user_id), fam.id, weekStart, String(it.name), Math.round(Number(it.grams)), now)
          .run();
      }
    }

    return json({ ok: true, weekStart, menuId, shared, members: membersList.length }, 200);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : 400);
  }
};
