import { nowMs } from './db';
import { requireFamilyMember } from './family_access';
import { normalizeShoppingIngredient } from './ingredients';
import { asString, isJsonObject } from './json';
import { requireFamilyPlan } from './plans';

type ShoppingCheckValidationError = 'BAD_JSON' | 'BAD_WEEK' | 'BAD_INGREDIENT';
type ShoppingBulkValidationError = 'BAD_JSON' | 'BAD_WEEK';
type ShoppingCheckUpdate = { ingredientName: string; checked: boolean };

export type ShoppingCheckResult =
  | { kind: 'invalid'; error: ShoppingCheckValidationError }
  | { kind: 'saved'; weekStart: string; ingredientName: string; checked: boolean };

export type ShoppingBulkResult =
  | { kind: 'invalid'; error: ShoppingBulkValidationError }
  | { kind: 'saved'; weekStart: string; updated: number };

function isIsoDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function shoppingScopeId(userId: string, familyId: string | null) {
  return familyId ? `family:${familyId}` : `personal:${userId}`;
}

async function requireShoppingScope(db: D1Database, userId: string, familyId: string | null) {
  if (!familyId) return;
  const family = await requireFamilyMember(db, familyId, userId);
  await requireFamilyPlan(db, family.owner_user_id);
}

function normalizedBulkUpdates(body: Record<string, unknown>): ShoppingCheckUpdate[] {
  const updates = Array.isArray(body.updates) ? body.updates : [];
  return updates
    .filter(isJsonObject)
    .map((update) => ({
      ingredientName: normalizeShoppingIngredient(update.ingredient_name || update.ingredient, 1).name,
      checked: Boolean(update.checked),
    }))
    .filter((update) => update.ingredientName)
    .slice(0, 500);
}

/** Writes a single normalized checkmark in the caller's personal or family shopping scope. */
export async function updateShoppingCheck({
  db,
  userId,
  body,
}: {
  db: D1Database;
  userId: string;
  body: unknown;
}): Promise<ShoppingCheckResult> {
  if (!isJsonObject(body)) return { kind: 'invalid', error: 'BAD_JSON' };
  const weekStart = asString(body.week_start).slice(0, 10);
  const ingredientName = normalizeShoppingIngredient(body.ingredient_name || body.ingredient, 1).name;
  const checked = Boolean(body.checked);
  const familyId = body.family_id ? asString(body.family_id) : null;
  if (!isIsoDay(weekStart)) return { kind: 'invalid', error: 'BAD_WEEK' };
  if (!ingredientName) return { kind: 'invalid', error: 'BAD_INGREDIENT' };

  await requireShoppingScope(db, userId, familyId);
  await db
    .prepare(
      `INSERT INTO shopping_checked (scope_id, week_start, family_id, ingredient_name, checked, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(scope_id, week_start, ingredient_name)
       DO UPDATE SET checked=excluded.checked, updated_at=excluded.updated_at`,
    )
    .bind(shoppingScopeId(userId, familyId), weekStart, familyId, ingredientName, checked ? 1 : 0, nowMs())
    .run();

  return { kind: 'saved', weekStart, ingredientName, checked };
}

/** Batch-updates normalized shopping checkmarks without per-item D1 writes. */
export async function updateShoppingChecks({
  db,
  userId,
  body,
}: {
  db: D1Database;
  userId: string;
  body: unknown;
}): Promise<ShoppingBulkResult> {
  if (!isJsonObject(body)) return { kind: 'invalid', error: 'BAD_JSON' };
  const weekStart = asString(body.week_start).slice(0, 10);
  const familyId = body.family_id ? asString(body.family_id) : null;
  if (!isIsoDay(weekStart)) return { kind: 'invalid', error: 'BAD_WEEK' };

  await requireShoppingScope(db, userId, familyId);
  const updates = normalizedBulkUpdates(body);
  const updatedAt = nowMs();
  const scopeId = shoppingScopeId(userId, familyId);
  const statements = updates.map((update) => db
    .prepare(
      `INSERT INTO shopping_checked (scope_id, week_start, family_id, ingredient_name, checked, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(scope_id, week_start, ingredient_name)
       DO UPDATE SET checked=excluded.checked, updated_at=excluded.updated_at`,
    )
    .bind(scopeId, weekStart, familyId, update.ingredientName, update.checked ? 1 : 0, updatedAt));
  await db.batch(statements);

  return { kind: 'saved', weekStart, updated: updates.length };
}
