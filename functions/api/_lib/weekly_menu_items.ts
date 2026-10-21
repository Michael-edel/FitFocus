import { nowMs, uuid } from './db';
import { requireFamilyMember } from './family_access';
import { normalizeShoppingIngredient } from './ingredients';
import { asString, isJsonObject } from './json';
import { requireFamilyPlan } from './plans';
import { familyMenuStateReady } from './family_menu_state';

type WeeklyMenuItemInput = { name: string; grams: number; key: string };
type WeeklyMenuItemsValidationError = 'BAD_JSON' | 'BAD_WEEK' | 'BAD_ITEMS' | 'BAD_ITEM' | 'TOO_MANY_ITEMS';
const MAX_WEEKLY_MENU_ITEMS = 500;

export type WeeklyMenuItemsSaveResult =
  | { kind: 'invalid'; error: WeeklyMenuItemsValidationError }
  | { kind: 'profile-required' }
  | { kind: 'family-state-required' }
  | { kind: 'saved'; stored: number; weekStart: string };

function isIsoDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeWeeklyMenuItems(value: unknown):
  | { ok: true; items: WeeklyMenuItemInput[] }
  | { ok: false; error: Exclude<WeeklyMenuItemsValidationError, 'BAD_JSON' | 'BAD_WEEK'> } {
  if (!Array.isArray(value)) return { ok: false, error: 'BAD_ITEMS' };
  if (value.length > MAX_WEEKLY_MENU_ITEMS) return { ok: false, error: 'TOO_MANY_ITEMS' };

  const normalized: WeeklyMenuItemInput[] = [];
  for (const rawItem of value) {
    if (!isJsonObject(rawItem)
      || typeof rawItem.name !== 'string'
      || !rawItem.name.trim()
      || rawItem.name.trim().length > 256
      || typeof rawItem.grams !== 'number'
      || !Number.isFinite(rawItem.grams)
      || rawItem.grams <= 0
      || rawItem.grams > 1_000_000_000) {
      return { ok: false, error: 'BAD_ITEM' };
    }

    const item = normalizeShoppingIngredient(rawItem.name, rawItem.grams);
    if (!item.name || item.grams <= 0) return { ok: false, error: 'BAD_ITEM' };
    normalized.push(item);
  }

  return { ok: true, items: normalized };
}

/** Replaces one user's normalized weekly items inside their personal or family scope. */
export async function saveWeeklyMenuItems({
  db,
  userId,
  body,
}: {
  db: D1Database;
  userId: string;
  body: unknown;
}): Promise<WeeklyMenuItemsSaveResult> {
  if (!isJsonObject(body)) return { kind: 'invalid', error: 'BAD_JSON' };
  const weekStart = asString(body.week_start).slice(0, 10);
  const familyId = body.family_id ? asString(body.family_id) : null;
  if (!isIsoDay(weekStart)) return { kind: 'invalid', error: 'BAD_WEEK' };
  // A delayed old client must not replace the projection of a newer accepted profile.
  if (!familyId) return { kind: 'profile-required' };

  if (familyId) {
    const family = await requireFamilyMember(db, familyId, userId);
    await requireFamilyPlan(db, family.owner_user_id);
    if (await familyMenuStateReady(db)) return { kind: 'family-state-required' };
  }

  const validation = normalizeWeeklyMenuItems(body.items);
  if (validation.ok === false) return { kind: 'invalid', error: validation.error };
  const normalized = validation.items;

  const createdAt = nowMs();
  const statements = [
    familyId
      ? db.prepare(
          'DELETE FROM weekly_menu_items WHERE user_id = ? AND week_start = ? AND family_id = ?',
        ).bind(userId, weekStart, familyId)
      : db.prepare(
          'DELETE FROM weekly_menu_items WHERE user_id = ? AND week_start = ? AND family_id IS NULL',
        ).bind(userId, weekStart),
    ...normalized.map((item) => db.prepare(
      'INSERT INTO weekly_menu_items (id, user_id, family_id, week_start, ingredient_name, grams, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(uuid(), userId, familyId, weekStart, item.name, item.grams, createdAt)),
  ];
  await db.batch(statements);

  return { kind: 'saved', stored: normalized.length, weekStart };
}
