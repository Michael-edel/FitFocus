import { afterEach, beforeEach, expect, it } from 'vitest';
import { sqliteD1 } from './_helpers/sqliteD1';
import { saveFamilyMenu } from '../functions/api/_lib/family_menu';
import { readShoppingList } from '../functions/api/_lib/shopping_list';
import { readFamilyMenuGeneration, familyMenuStateReady } from '../functions/api/_lib/family_menu_state';
import { generateFamilyMenu } from '../functions/api/_lib/family_menu_generate';
import { readFileSync } from 'node:fs';
import type { FamilyWeeklyMenu } from '../types';
import { buildUserDataExport } from '../functions/api/_lib/user_data_export';
import { softDeleteAccount } from '../functions/api/_lib/account_delete';

const owner = 'family-state-owner', familyId = 'family-state-a', week = '2026-10-12';
let fixture: ReturnType<typeof sqliteD1>;
const menu = (name: string, grams: number): FamilyWeeklyMenu => ({
  weekStart: week,
  prefs: { includeIds: [owner], cookingMode: 'all_meals', currency: 'KZT' },
  days: Array.from({ length: 7 }, (_, index) => ({ day: String(index),
    ...Object.fromEntries(['breakfast', 'lunch', 'dinner', 'snack'].map(key => [key, { base: name, portions: { [owner]: `${grams} г` } }])),
  } as FamilyWeeklyMenu['days'][number])),
  shoppingList: [`${name} ${grams} г`], shoppingListItems: [{ name, grams }],
});
beforeEach(() => {
  fixture = sqliteD1();
  fixture.sqlite.prepare('INSERT INTO users (id, created_at) VALUES (?, 1)').run(owner);
  fixture.sqlite.prepare('INSERT INTO families (id, owner_user_id, name, created_at) VALUES (?, ?, ?, 1)').run(familyId, owner, 'Synthetic family');
  fixture.sqlite.prepare("INSERT INTO family_members (id, family_id, user_id, role, status, created_at) VALUES (?, ?, ?, 'owner', 'active', 1)").run('family-state-membership', familyId, owner);
  fixture.sqlite.prepare("INSERT INTO subscriptions (user_id, plan, status, updated_at) VALUES (?, 'family', 'active', 1)").run(owner);
});
afterEach(() => fixture.sqlite.close());

it('acknowledges the accepted family version and reads purchases from the same menu snapshot', async () => {
  const result = await saveFamilyMenu({ db: fixture.db, userId: owner, body: { familyId, weekStart: week, baseVersion: 0, menu: menu('Рис', 400) } });
  expect(result).toMatchObject({ kind: 'saved', version: 1 });
  expect(await readShoppingList({ db: fixture.db, userId: owner, weekStart: week, familyId }))
    .toMatchObject({ items: [{ name: 'Рис', grams: 400, checked: false }] });
});

it('rejects a changed explicit family target instead of writing the current family', async () => {
  await expect(saveFamilyMenu({ db: fixture.db, userId: owner, body: { familyId: 'another-family', weekStart: week, baseVersion: 0, menu: menu('Рис', 400) } }))
    .rejects.toThrow('FORBIDDEN');
  expect(fixture.sqlite.prepare('SELECT count(*) AS n FROM weekly_menus').get()?.n).toBe(0);
});

it('returns a conflict for an independent stale family generation without replacing its purchases', async () => {
  await saveFamilyMenu({ db: fixture.db, userId: owner, body: { familyId, weekStart: week, baseVersion: 0, menu: menu('Рис', 400) } });
  const stale = await saveFamilyMenu({ db: fixture.db, userId: owner, body: { familyId, weekStart: week, baseVersion: 0, menu: menu('Гречка', 999) } });
  expect(stale).toMatchObject({ kind: 'conflicted', snapshot: { version: 1 } });
  expect(await readShoppingList({ db: fixture.db, userId: owner, weekStart: week, familyId }))
    .toMatchObject({ items: [{ name: 'Рис', grams: 400, checked: false }] });
});

it('updates the accepted generation once and returns its own mutation version despite an extra trigger write', async () => {
  fixture.sqlite.exec(`CREATE TRIGGER synthetic_extra_family_write AFTER INSERT ON family_menu_generations
    BEGIN UPDATE family_menu_generations SET version=version+1 WHERE family_id=NEW.family_id AND week_start=NEW.week_start; END;`);
  const saved = await saveFamilyMenu({ db: fixture.db, userId: owner, body: { familyId, weekStart: week, baseVersion: 0, menu: menu('Рис', 400) } });
  expect(saved).toMatchObject({ kind: 'saved', version: 1, snapshot: { version: 1 } });
  expect((await readFamilyMenuGeneration(fixture.db, familyId, week)).version).toBe(2);
});
it('rechecks active membership in the CAS statement after request-level authorization', async () => {
  fixture.hooks.before = sql => { if (sql.startsWith('INSERT INTO family_menu_generations')) fixture.sqlite.prepare('UPDATE family_members SET is_active=0 WHERE user_id=?').run(owner); };
  await expect(saveFamilyMenu({ db: fixture.db, userId: owner, body: { familyId, weekStart: week, baseVersion: 0, menu: menu('Рис', 400) } })).rejects.toThrow('FORBIDDEN');
  expect(fixture.sqlite.prepare('SELECT count(*) AS n FROM family_menu_generations').get()?.n).toBe(0);
});
it('refuses an included person outside the explicit active family without writing any generation', async () => {
  const value = menu('Рис', 400); value.prefs.includeIds.push('outsider');
  for (const day of value.days) for (const meal of [day.breakfast, day.lunch, day.dinner, day.snack]) meal.portions.outsider = '500 г';
  expect(await saveFamilyMenu({ db: fixture.db, userId: owner, body: { familyId, weekStart: week, baseVersion: 0, menu: value } })).toMatchObject({ kind: 'conflicted' });
  expect(fixture.sqlite.prepare('SELECT count(*) AS n FROM family_menu_generations').get()?.n).toBe(0);
});
it('returns a pure preview and leaves canonical and legacy menu/item tables untouched', async () => {
  const preview = await generateFamilyMenu({ db: fixture.db, userId: owner, familyId, weekStart: week, preview: true });
  expect(preview).toMatchObject({ kind: 'generated', preview: true, familyId });
  for (const table of ['family_menu_generations', 'weekly_menus', 'weekly_menu_portions', 'weekly_menu_items']) {
    expect(fixture.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n).toBe(0);
  }
  expect(await generateFamilyMenu({ db: fixture.db, userId: owner, weekStart: week })).toEqual({ kind: 'state-required' });
});
const migration = () => readFileSync(new URL('../migrations/0021_family_menu_generations.sql', import.meta.url), 'utf8');
function seedLegacy() {
  for (const trigger of ['family_menu_legacy_insert_block', 'family_menu_legacy_update_block', 'family_items_legacy_insert_block', 'family_items_legacy_update_block']) fixture.sqlite.exec(`DROP TRIGGER ${trigger}`);
  fixture.sqlite.prepare('INSERT INTO weekly_menus (id, family_id, week_start, menu_json, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, 1)')
    .run('synthetic-legacy', familyId, week, JSON.stringify(menu('Рис', 400)), owner);
  fixture.sqlite.exec(migration());
}
it('copies legacy JSON verbatim, preserves its source and never overwrites a newer generation when migration repeats', async () => {
  seedLegacy();
  const original = fixture.sqlite.prepare('SELECT menu_json FROM weekly_menus').get()?.menu_json;
  expect(fixture.sqlite.prepare('SELECT menu_json FROM family_menu_generations').get()?.menu_json).toBe(original);
  expect(await saveFamilyMenu({ db: fixture.db, userId: owner, body: { familyId, weekStart: week, baseVersion: 1, menu: menu('Рис', 500) } })).toMatchObject({ version: 2 });
  fixture.sqlite.exec(migration());
  expect((await readFamilyMenuGeneration(fixture.db, familyId, week)).menu?.shoppingListItems?.[0].grams).toBe(500);
  expect(fixture.sqlite.prepare('SELECT menu_json FROM weekly_menus').get()?.menu_json).toBe(original);
});
it('does not fall back to legacy menus/items for absent, empty or corrupt canonical generations', async () => {
  seedLegacy(); fixture.sqlite.exec('DELETE FROM family_menu_generations');
  expect(await readFamilyMenuGeneration(fixture.db, familyId, week)).toMatchObject({ version: 0, menu: null });
  expect(await readShoppingList({ db: fixture.db, userId: owner, familyId, weekStart: week })).toMatchObject({ items: [] });
  const empty = { ...menu('Рис', 400), days: [], shoppingList: [], shoppingListItems: [] };
  await saveFamilyMenu({ db: fixture.db, userId: owner, body: { familyId, weekStart: week, baseVersion: 0, menu: empty } });
  expect(await readShoppingList({ db: fixture.db, userId: owner, familyId, weekStart: week })).toMatchObject({ items: [] });
  fixture.sqlite.prepare('UPDATE family_menu_generations SET menu_json=?').run('{broken');
  await expect(readFamilyMenuGeneration(fixture.db, familyId, week)).rejects.toThrow('FAMILY_MENU_CORRUPT');
  await expect(readShoppingList({ db: fixture.db, userId: owner, familyId, weekStart: week })).rejects.toThrow('FAMILY_MENU_CORRUPT');
});
it('blocks old SQL family writers after the migration while allowing personal items and account cleanup', () => {
  seedLegacy();
  expect(() => fixture.sqlite.prepare('UPDATE weekly_menus SET menu_json=? WHERE family_id=?').run('{}', familyId)).toThrow('FAMILY_MENU_STATE_REQUIRED');
  const insert = fixture.sqlite.prepare('INSERT INTO weekly_menu_items (id,user_id,family_id,week_start,ingredient_name,grams,created_at) VALUES (?,?,?,?,?,?,1)');
  expect(() => insert.run('old-family-item', owner, familyId, week, 'Рис', 999)).toThrow('FAMILY_MENU_STATE_REQUIRED');
  expect(() => insert.run('personal-item', owner, null, week, 'Рис', 400)).not.toThrow();
  expect(() => fixture.sqlite.prepare('DELETE FROM weekly_menus WHERE family_id=?').run(familyId)).not.toThrow();
});

it('exports canonical menus only to their owner or active members', async () => {
  await saveFamilyMenu({ db: fixture.db, userId: owner, body: { familyId, weekStart: week, baseVersion: 0, menu: menu('Рис', 400) } });
  fixture.sqlite.prepare('INSERT INTO users (id,created_at) VALUES (?,1)').run('unrelated-export-account');
  const owned = await buildUserDataExport(fixture.db, { sub: owner, sid: 'synthetic-owner', roles: ['user'], emailVerified: true });
  const unrelated = await buildUserDataExport(fixture.db, { sub: 'unrelated-export-account', sid: 'synthetic-unrelated', roles: ['user'], emailVerified: true });
  expect(owned.family_menu_generations).toHaveLength(1); expect(unrelated.family_menu_generations).toEqual([]);
});
it('soft deletion removes the owner canonical family menus and prevents subsequent reads', async () => {
  await saveFamilyMenu({ db: fixture.db, userId: owner, body: { familyId, weekStart: week, baseVersion: 0, menu: menu('Рис', 400) } });
  await softDeleteAccount(fixture.db, owner);
  expect(fixture.sqlite.prepare('SELECT count(*) AS n FROM family_menu_generations').get()?.n).toBe(0);
  await expect(readShoppingList({ db: fixture.db, userId: owner, familyId, weekStart: week })).rejects.toThrow('FORBIDDEN');
});
it('refuses a partially applied migration instead of advertising or falling back to legacy writers', async () => {
  fixture.sqlite.exec('DROP TRIGGER family_items_legacy_insert_block');
  await expect(familyMenuStateReady(fixture.db)).rejects.toThrow('FAMILY_MENU_MIGRATION_REQUIRED');
  await expect(saveFamilyMenu({ db: fixture.db, userId: owner, body: { weekStart: week, menu: menu('Рис', 400) } }))
    .rejects.toThrow('FAMILY_MENU_MIGRATION_REQUIRED');
  expect(fixture.sqlite.prepare('SELECT count(*) AS n FROM weekly_menus').get()?.n).toBe(0);
});
