// /api/family/menu/generate
// POST: generate shared weekly menu + personalized portions for all active members
// MVP v0: deterministic shared menu skeleton (no AI). Portions are computed later by client MealEngine.
// This endpoint stores a simple shared structure so multiple devices can sync.
// Next step: move solver server-side.
import { json, requireUser } from "../../_lib/auth";
import { requireDB, ensureUserRow, uuid, nowMs, toApiError } from "../../_lib/db";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

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
         WHERE m.user_id = ? AND m.status='active'
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

    return json({ ok: true, weekStart, menuId, shared }, 200);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : 400);
  }
};
