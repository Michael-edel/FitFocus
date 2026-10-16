import { requireActiveFamilyForUser, requireFamilyOwner } from './family_access';
import { isJsonObject, safeJsonParse, type JsonObject } from './json';
import { requireFamilyPlan } from './plans';

type WeeklyMenuRow = {
  id: string;
  family_id: string;
  week_start: string;
  menu_json: string;
  created_at?: number;
};

type WeeklyPortionsRow = {
  portions_json: string;
  totals_json: string;
  updated_at?: number;
};

export type FamilyMenuReadResult =
  | { kind: 'invalid-week' }
  | { kind: 'empty'; weekStart: string }
  | {
      kind: 'loaded';
      weekStart: string;
      shared: { id: string; familyId: string; weekStart: string; menu: unknown | null };
      portions: { portions: unknown | null; totals: unknown | null; updatedAt?: number } | null;
    };

type FamilyMenuValidationError = 'BAD_JSON' | 'BAD_MENU' | 'BAD_MENU_DAYS' | 'BAD_WEEK';

export type FamilyMenuSaveResult =
  | { kind: 'invalid'; error: FamilyMenuValidationError }
  | { kind: 'saved'; weekStart: string; menuId: string };

function parseJsonValue(value: unknown): unknown | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return safeJsonParse(value);
}

export function isFamilyMenuWeekStart(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function defaultFamilyMenuWeekStart(date = new Date()) {
  const week = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = week.getUTCDay();
  week.setUTCDate(week.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return week.toISOString().slice(0, 10);
}

/** Loads a caller's active family menu and their personalized portions. */
export async function readFamilyMenu({
  db,
  userId,
  weekStart,
}: {
  db: D1Database;
  userId: string;
  weekStart: string;
}): Promise<FamilyMenuReadResult> {
  if (!isFamilyMenuWeekStart(weekStart)) return { kind: 'invalid-week' };

  const family = await requireActiveFamilyForUser(db, userId).catch(() => null);
  if (!family) return { kind: 'empty', weekStart };
  await requireFamilyPlan(db, family.owner_user_id);

  const shared = await db
    .prepare('SELECT id, family_id, week_start, menu_json, created_at FROM weekly_menus WHERE family_id=? AND week_start=? LIMIT 1')
    .bind(family.id, weekStart)
    .first<WeeklyMenuRow>();
  if (!shared) return { kind: 'empty', weekStart };

  const portions = await db
    .prepare('SELECT portions_json, totals_json, updated_at FROM weekly_menu_portions WHERE weekly_menu_id=? AND user_id=? LIMIT 1')
    .bind(shared.id, userId)
    .first<WeeklyPortionsRow>();

  return {
    kind: 'loaded',
    weekStart,
    shared: {
      id: shared.id,
      familyId: shared.family_id,
      weekStart: shared.week_start,
      menu: parseJsonValue(shared.menu_json),
    },
    portions: portions
      ? {
          portions: parseJsonValue(portions.portions_json),
          totals: parseJsonValue(portions.totals_json),
          updatedAt: portions.updated_at,
        }
      : null,
  };
}

function menuSaveInput(body: unknown):
  | { ok: true; menu: JsonObject; weekStart: string }
  | { ok: false; error: FamilyMenuValidationError } {
  if (!isJsonObject(body)) return { ok: false, error: 'BAD_JSON' };
  if (!isJsonObject(body.menu)) return { ok: false, error: 'BAD_MENU' };
  if (!Array.isArray(body.menu.days) || !body.menu.days.length) return { ok: false, error: 'BAD_MENU_DAYS' };

  const explicitWeek = String(body.weekStart || body.week_start || '').slice(0, 10);
  const weekStart = explicitWeek || defaultFamilyMenuWeekStart();
  if (!isFamilyMenuWeekStart(weekStart)) return { ok: false, error: 'BAD_WEEK' };
  return { ok: true, menu: body.menu, weekStart };
}

/** Validates and saves an owner-authored weekly family menu. */
export async function saveFamilyMenu({
  db,
  userId,
  body,
}: {
  db: D1Database;
  userId: string;
  body: unknown;
}): Promise<FamilyMenuSaveResult> {
  const input = menuSaveInput(body);
  if (input.ok === false) return { kind: 'invalid', error: input.error };

  const family = await requireFamilyOwner(db, userId);
  await requireFamilyPlan(db, userId);

  const createdAt = Math.floor(Date.now() / 1000);
  const menuJson = JSON.stringify({ ...input.menu, weekStart: input.weekStart });
  const existing = await db
    .prepare('SELECT id FROM weekly_menus WHERE family_id=? AND week_start=? LIMIT 1')
    .bind(family.id, input.weekStart)
    .first<{ id?: string }>();
  const menuId = existing?.id || crypto.randomUUID();

  if (existing?.id) {
    await db
      .prepare('UPDATE weekly_menus SET menu_json=?, created_by_user_id=?, created_at=? WHERE id=?')
      .bind(menuJson, userId, createdAt, existing.id)
      .run();
  } else {
    await db
      .prepare('INSERT INTO weekly_menus (id, family_id, week_start, menu_json, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(menuId, family.id, input.weekStart, menuJson, userId, createdAt)
      .run();
  }

  return { kind: 'saved', weekStart: input.weekStart, menuId };
}
