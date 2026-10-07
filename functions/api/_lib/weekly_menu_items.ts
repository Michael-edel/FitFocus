import { nowMs, uuid } from './db';
import { requireFamilyMember } from './family_access';
import { normalizeShoppingIngredient } from './ingredients';
import { asString, isJsonObject } from './json';
import { requireFamilyPlan } from './plans';

type WeeklyMenuItemInput = { name: string; grams: number; key: string };
type WeeklyMenuItemsValidationError = 'BAD_JSON' | 'BAD_WEEK';

export type WeeklyMenuItemsSaveResult =
  | { kind: 'invalid'; error: WeeklyMenuItemsValidationError }
  | { kind: 'saved'; stored: number; weekStart: string };

function isIsoDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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
  const items = Array.isArray(body.items) ? body.items : [];
  if (!isIsoDay(weekStart)) return { kind: 'invalid', error: 'BAD_WEEK' };

  if (familyId) {
    const family = await requireFamilyMember(db, familyId, userId);
    await requireFamilyPlan(db, family.owner_user_id);
  }

  const normalized: WeeklyMenuItemInput[] = items
    .filter(isJsonObject)
    .map((item) => normalizeShoppingIngredient(item.name, item.grams))
    .filter((item) => item.name && item.grams > 0)
    .slice(0, 500);

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
