import { isJsonObject } from './json';
import { normalizeShoppingIngredient } from './ingredients';

type ShoppingRow = { name?: unknown; grams?: unknown };
type ProjectionRow = { items_json: string; profile_version: number };

/** Announce the stronger contract only after the table and both atomic writers are deployed. */
export async function personalMenuProjectionReady(db: D1Database | undefined): Promise<boolean> {
  if (!db) return false;
  try {
    const result = await db.prepare(`SELECT name FROM sqlite_master WHERE
      (type = 'table' AND name = 'personal_menu_projections') OR
      (type = 'trigger' AND name IN ('profile_personal_menu_insert', 'profile_personal_menu_update'))`).all<{ name: string }>();
    const names = new Set((result.results || []).map(row => row.name));
    return ['personal_menu_projections', 'profile_personal_menu_insert', 'profile_personal_menu_update'].every(name => names.has(name));
  } catch { return false; }
}

/** Empty canonical data is authoritative; only an absent generation permits the legacy read path. */
export async function readPersonalMenuItems(db: D1Database, userId: string, week: string): Promise<ShoppingRow[]> {
  const rows = await db.prepare('SELECT items_json, profile_version FROM personal_menu_projections WHERE user_id = ? AND week_start = ? LIMIT 1')
    .bind(userId, week).all<ProjectionRow>();
  const projection = rows.results?.[0];
  if (projection) {
    const items: unknown = JSON.parse(projection.items_json);
    if (!Array.isArray(items) || !Number.isSafeInteger(projection.profile_version) || projection.profile_version < 1) {
      throw new Error('PERSONAL_MENU_PROJECTION_INVALID');
    }
    return items.filter(isJsonObject).map(item => normalizeShoppingIngredient(item.name, item.grams))
      .filter(item => item.name && item.grams > 0).slice(0, 500);
  }
  const legacy = await db.prepare(`SELECT ingredient_name as name, grams FROM weekly_menu_items
    WHERE user_id = ? AND week_start = ? AND family_id IS NULL ORDER BY ingredient_name`)
    .bind(userId, week).all<{ name: string; grams: number }>();
  return legacy.results || [];
}
