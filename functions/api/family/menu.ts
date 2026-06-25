// /api/family/menu
// GET: returns shared menu for week + personalized portions for current user
// POST: saves the family's weekly menu as the server source of truth
import { json, requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, toApiError } from "../_lib/db";
import { requireActiveFamilyForUser, requireFamilyOwner } from "../_lib/family_access";
import { requireFamilyPlan } from "../_lib/plans";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

function isIsoDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

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
    if (!isIsoDay(weekStart)) return json({ error: "BAD_WEEK" }, 400);

    const fam = await requireActiveFamilyForUser(db, user.sub).catch(() => null);
    if (!fam) return json({ weekStart, shared: null, portions: null }, 200);
    await requireFamilyPlan(db, fam.owner_user_id);

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
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "PLAN_REQUIRED_FAMILY" ? 402 : 400);
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
    if (!isIsoDay(weekStart)) return json({ error: "BAD_WEEK" }, 400);

    const fam = await requireFamilyOwner(db, user.sub);
    await requireFamilyPlan(db, user.sub);

    const now = Math.floor(Date.now() / 1000);
    const menuJson = JSON.stringify({ ...menu, weekStart });
    const existing = await db
      .prepare("SELECT id FROM weekly_menus WHERE family_id=? AND week_start=? LIMIT 1")
      .bind(fam.id, weekStart)
      .first<{ id?: string }>();
    const menuId = existing?.id || crypto.randomUUID();

    if (existing?.id) {
      await db
        .prepare("UPDATE weekly_menus SET menu_json=?, created_by_user_id=?, created_at=? WHERE id=?")
        .bind(menuJson, user.sub, now, existing.id)
        .run();
    } else {
      await db
        .prepare("INSERT INTO weekly_menus (id, family_id, week_start, menu_json, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(menuId, fam.id, weekStart, menuJson, user.sub, now)
        .run();
    }

    return json({ ok: true, weekStart, menuId }, 200);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "PLAN_REQUIRED_FAMILY" ? 402 : 400);
  }
};
