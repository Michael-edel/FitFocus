// /api/family/menu/generate
// POST: generate shared weekly menu + personalized portions for all active members
// MVP v0: deterministic shared menu skeleton (no AI). Portions are computed later by client MealEngine.
// This endpoint stores a simple shared structure so multiple devices can sync.
// Next step: move solver server-side.
import { json, requireUser } from "../../_lib/auth";
import { requireDB, ensureUserRow, uuid, nowMs, toApiError } from "../../_lib/db";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

type MemberGoal = 'LOSS' | 'MAINTAIN';

function goalMultiplier(goal?: string): number {
  const g = (goal || 'MAINTAIN').toUpperCase();
  if (g === 'LOSS') return 0.85;
  return 1.0;
}

const BASE_GRAMS: Record<string, number> = {
  oatmeal: 60,
  greek_yogurt: 150,
  banana: 120,
  egg: 100, // ~2 яйца
  chicken_breast: 180,
  rice: 70, // сухой
  buckwheat: 70, // сухая
  salad_mix: 200,
  olive_oil: 10,
  cottage_cheese: 200,
  berries: 100,
  nuts: 20,
};

function computeWeeklyTotalsFromShared(shared: any, multiplier: number) {
  const totals = new Map<string, number>();
  const days = Array.isArray(shared?.days) ? shared.days : [];
  for (const day of days) {
    for (const mealKey of ['breakfast','lunch','dinner','snack']) {
      const meal = (day as any)?.[mealKey];
      const items: string[] = Array.isArray(meal?.items) ? meal.items : [];
      for (const it of items) {
        const base = BASE_GRAMS[it] || 0;
        if (base <= 0) continue;
        totals.set(it, (totals.get(it) || 0) + base * multiplier);
      }
    }
  }
  // round to nearest 5g
  const out = Array.from(totals.entries()).map(([name, grams]) => ({
    name,
    grams: Math.max(0, Math.round(grams / 5) * 5),
  })).filter(x => x.grams > 0);
  out.sort((a,b)=>a.name.localeCompare(b.name));
  return out;
}


function weekStartISO(d: Date) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diff = (day === 0 ? -6 : 1 - day);
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

function buildDeterministicSharedMenu() {
  // Minimal stable structure in Russian; grams handled per-user later
  // days: 7, meals: breakfast/lunch/dinner/snack, each meal has template items
  const days = ["Понедельник","Вторник","Среда","Четверг","Пятница","Суббота","Воскресенье"];
  const sharedDay = () => ({
    breakfast: { title: "Овсянка + йогурт + фрукт", items: ["oatmeal","greek_yogurt","banana","egg"] },
    lunch: { title: "Курица + рис + салат", items: ["chicken_breast","rice","salad_mix","olive_oil"] },
    dinner: { title: "Курица + гречка + салат", items: ["chicken_breast","buckwheat","salad_mix","olive_oil"] },
    snack: { title: "Творог + ягоды + орехи", items: ["cottage_cheese","berries","nuts"] },
  });
  return { version: 1, days: days.map((name)=>({ name, ...sharedDay() })) };
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
         WHERE m.user_id = ? AND (m.status = 'active' OR m.is_active = 1)
         LIMIT 1`
      )
      .bind(user.sub)
      .first<any>();
    if (!fam) throw new Error("NOT_FOUND");
    if (fam.owner_user_id !== user.sub) throw new Error("FORBIDDEN");

    const now = Math.floor(nowMs() / 1000);
    const shared = buildDeterministicSharedMenu();

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
      // portions recalculation is next step; for now we clear existing portions so clients recompute
      await db.prepare("DELETE FROM weekly_menu_portions WHERE weekly_menu_id=?").bind(menuId).run();
    } else {
      await db
        .prepare("INSERT INTO weekly_menus (id, family_id, week_start, menu_json, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(menuId, fam.id, weekStart, JSON.stringify(shared), user.sub, now)
        .run();
    }

    
    // B2C: compute per-member weekly totals server-side so all devices sync immediately.
    const members = await db
      .prepare(
        `SELECT user_id, COALESCE(goal,'MAINTAIN') as goal
         FROM family_members
         WHERE family_id = ? AND (status='active' OR is_active=1)`
      )
      .bind(fam.id)
      .all<any>();

    const memberRows = members.results || [];
    // For each member: compute totals and upsert weekly_menu_portions + weekly_menu_items
    for (const m of memberRows) {
      const mult = goalMultiplier(m.goal);
      const totals = computeWeeklyTotalsFromShared(shared, mult);

      // store portions as multiplier (clients may render per-person text later)
      const portionsPayload = { multiplier: mult };
      const totalsPayload = { items: totals };

      // upsert weekly_menu_portions
      const existingPort = await db
        .prepare("SELECT id FROM weekly_menu_portions WHERE weekly_menu_id=? AND user_id=? LIMIT 1")
        .bind(menuId, m.user_id)
        .first<any>();

      if (existingPort?.id) {
        await db
          .prepare("UPDATE weekly_menu_portions SET portions_json=?, totals_json=?, updated_at=? WHERE id=?")
          .bind(JSON.stringify(portionsPayload), JSON.stringify(totalsPayload), now, existingPort.id)
          .run();
      } else {
        await db
          .prepare("INSERT INTO weekly_menu_portions (id, weekly_menu_id, user_id, portions_json, totals_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(uuid(), menuId, m.user_id, JSON.stringify(portionsPayload), JSON.stringify(totalsPayload), now)
          .run();
      }

      // replace weekly_menu_items for this member + family + week
      await db
        .prepare("DELETE FROM weekly_menu_items WHERE user_id=? AND family_id=? AND week_start=?")
        .bind(m.user_id, fam.id, weekStart)
        .run();

      const created_at_ms = nowMs();
      for (const it of totals) {
        await db
          .prepare(
            "INSERT INTO weekly_menu_items (id, user_id, family_id, week_start, ingredient_name, grams, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
          )
          .bind(uuid(), m.user_id, fam.id, weekStart, it.name, Math.round(it.grams), created_at_ms)
          .run();
      }
    }

    return json({ ok: true, weekStart, menuId, shared }, 200);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : 400);
  }
};
