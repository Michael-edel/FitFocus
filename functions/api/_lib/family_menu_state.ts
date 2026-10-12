import { isRecord, parseJson } from '../../../safeJson';
import { isFamilyMenuIntent, isFamilyMenuPayload, type FamilyMenuIntent, type FamilyMenuSnapshot } from '../../../familyMenuValidation';
import { requireFamilyMember } from './family_access';
import { requireFamilyPlan } from './plans';

export async function familyMenuStateReady(db: D1Database): Promise<boolean> {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='family_menu_generations'").first<{ name: string }>();
  if (row?.name !== 'family_menu_generations') return false;
  await db.prepare('SELECT family_id, week_start, version, menu_json, created_by_user_id, updated_at FROM family_menu_generations LIMIT 0').all();
  const required = ['family_menu_legacy_insert_block', 'family_menu_legacy_update_block', 'family_items_legacy_insert_block', 'family_items_legacy_update_block'];
  const triggers = await db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name IN (?, ?, ?, ?)").bind(...required).all<{ name: string }>();
  if (!required.every(name => triggers.results?.some(trigger => trigger.name === name))) throw new Error('FAMILY_MENU_MIGRATION_REQUIRED');
  return true;
}

/** Read only the accepted generation; missing and unreadable never select legacy rows. */
export async function readFamilyMenuGeneration(db: D1Database, familyId: string, weekStart: string): Promise<FamilyMenuSnapshot> {
  const row = await db.prepare('SELECT version, menu_json FROM family_menu_generations WHERE family_id=? AND week_start=?')
    .bind(familyId, weekStart).first<{ version: number; menu_json: string }>();
  if (!row) return { familyId, weekStart, version: 0, menu: null };
  const menu = parseJson(row.menu_json);
  if (!Number.isSafeInteger(row.version) || row.version < 1 || !isFamilyMenuPayload(menu, weekStart)) throw new Error('FAMILY_MENU_CORRUPT');
  return { familyId, weekStart, version: row.version, menu };
}

export async function readFamilyMenuState(db: D1Database, userId: string, familyId: string, weekStart: string): Promise<FamilyMenuSnapshot> {
  const family = await requireFamilyMember(db, familyId, userId);
  await requireFamilyPlan(db, family.owner_user_id);
  return readFamilyMenuGeneration(db, familyId, weekStart);
}

export type FamilyMenuWriteResult =
  | { kind: 'invalid'; error: 'FAMILY_MENU_STATE_REQUIRED' | 'BAD_MENU' }
  | { kind: 'conflicted'; snapshot: FamilyMenuSnapshot }
  | { kind: 'saved'; weekStart: string; menuId: string; version: number; snapshot: FamilyMenuSnapshot };

/** All fields are one CAS statement. RETURNING identifies this mutation even if triggers write. */
export async function writeFamilyMenuState(db: D1Database, userId: string, body: unknown): Promise<FamilyMenuWriteResult> {
  if (!isRecord(body) || typeof body.familyId !== 'string' || !body.familyId.length
    || typeof body.baseVersion !== 'number' || !Number.isSafeInteger(body.baseVersion) || body.baseVersion < 0) {
    return { kind: 'invalid', error: 'FAMILY_MENU_STATE_REQUIRED' };
  }
  const intent: unknown = { familyId: body.familyId, weekStart: body.weekStart, menu: body.menu };
  if (!isFamilyMenuIntent(intent)) return { kind: 'invalid', error: 'BAD_MENU' };
  const family = await requireFamilyMember(db, intent.familyId, userId);
  if (family.owner_user_id !== userId) throw new Error('FORBIDDEN');
  await requireFamilyPlan(db, userId);
  const json = JSON.stringify(intent.menu), now = Date.now();
  const result = await db.prepare(`INSERT INTO family_menu_generations
    (family_id, week_start, version, menu_json, created_by_user_id, updated_at)
    SELECT ?, ?, 1, ?, ?, ?
    WHERE (? = 0 OR EXISTS (SELECT 1 FROM family_menu_generations WHERE family_id=? AND week_start=?))
      AND EXISTS (SELECT 1 FROM families f JOIN family_members m ON m.family_id=f.id
        WHERE f.id=? AND f.owner_user_id=? AND f.is_active=1 AND m.user_id=? AND m.is_active=1 AND m.status='active')
      AND NOT EXISTS (SELECT 1 FROM json_each(?, '$.prefs.includeIds') p WHERE NOT EXISTS
        (SELECT 1 FROM family_members m WHERE m.family_id=? AND m.user_id=p.value AND m.is_active=1 AND m.status='active'))
    ON CONFLICT(family_id, week_start) DO UPDATE SET
      version=family_menu_generations.version+1, menu_json=excluded.menu_json,
      created_by_user_id=excluded.created_by_user_id, updated_at=excluded.updated_at
    WHERE family_menu_generations.version=? AND family_menu_generations.version < 9007199254740991
    RETURNING version`).bind(intent.familyId, intent.weekStart, json, userId, now,
      body.baseVersion, intent.familyId, intent.weekStart, intent.familyId, userId, userId,
      json, intent.familyId, body.baseVersion).first<{ version: number }>();
  if (result) {
    const snapshot = { ...intent, version: result.version };
    return { kind: 'saved', weekStart: intent.weekStart, menuId: `${intent.familyId}:${intent.weekStart}`, version: result.version, snapshot };
  }
  // Recheck access before exposing the current generation after an interleaving.
  const snapshot = await readFamilyMenuState(db, userId, intent.familyId, intent.weekStart);
  return { kind: 'conflicted', snapshot };
}

export function familyMenuIntent(value: unknown): FamilyMenuIntent | null { return isFamilyMenuIntent(value) ? value : null; }
