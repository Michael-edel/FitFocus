// /api/family/menu
// GET: returns shared menu for week + personalized portions for current user
// POST: saves the family's weekly menu as the server source of truth
import { json, requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, toApiError } from "../_lib/db";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

function weekStartISO(d: Date) {
  // Monday as week start
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0 Sun ... 6 Sat
  const diff = (day === 0 ? -6 : 1 - day);
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const url = new URL(request.url);
    const week = url.searchParams.get("week");
    const weekStart = week ? week : weekStartISO(new Date());

    const fam = await db
      .prepare(
        `SELECT f.id
         FROM families f
         JOIN family_members m ON m.family_id = f.id
         WHERE m.user_id = ? AND m.status = 'active'
         LIMIT 1`
      )
      .bind(user.sub)
      .first<any>();
    if (!fam) return json({ weekStart, shared: null, portions: null }, 200);

    const shared = await db
      .prepare("SELECT id, family_id, week_start, menu_json, created_at FROM weekly_menus WHERE family_id=? AND week_start=? LIMIT 1")
      .bind(fam.id, weekStart)
      .first<any>();

    if (!shared) return json({ weekStart, shared: null, portions: null }, 200);

    const portions = await db
      .prepare("SELECT portions_json, totals_json, updated_at FROM weekly_menu_portions WHERE weekly_menu_id=? AND user_id=? LIMIT 1")
      .bind(shared.id, user.sub)
      .first<any>();

    return json({
      weekStart,
      shared: { id: shared.id, familyId: shared.family_id, weekStart: shared.week_start, menu: JSON.parse(shared.menu_json) },
      portions: portions ? { portions: JSON.parse(portions.portions_json), totals: JSON.parse(portions.totals_json), updatedAt: portions.updated_at } : null,
    });
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : 400);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const body: any = await request.json().catch(() => ({}));
    const menu = body?.menu;
    const weekStart = String(body?.weekStart || body?.week_start || "").slice(0, 10) || weekStartISO(new Date());

    if (!menu || typeof menu !== "object") return json({ error: "BAD_MENU" }, 400);
    if (!Array.isArray(menu.days) || !menu.days.length) return json({ error: "BAD_MENU_DAYS" }, 400);

    const fam = await db
      .prepare(
        `SELECT f.id, f.owner_user_id
         FROM families f
         JOIN family_members m ON m.family_id = f.id
         WHERE m.user_id = ? AND m.status = 'active'
         LIMIT 1`
      )
      .bind(user.sub)
      .first<any>();
    if (!fam) return json({ error: "NOT_IN_FAMILY" }, 403);
    if (fam.owner_user_id !== user.sub) return json({ error: "FORBIDDEN" }, 403);

    const now = Math.floor(Date.now() / 1000);
    const menuId = crypto.randomUUID();
    const menuJson = JSON.stringify({ ...menu, weekStart });

    await db.prepare("DELETE FROM weekly_menus WHERE family_id = ? AND week_start = ?")
      .bind(fam.id, weekStart)
      .run();

    await db
      .prepare("INSERT INTO weekly_menus (id, family_id, week_start, menu_json, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(menuId, fam.id, weekStart, menuJson, user.sub, now)
      .run();

    return json({ ok: true, weekStart, menuId }, 200);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : 400);
  }
};
