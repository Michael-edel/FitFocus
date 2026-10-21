import { afterEach, beforeEach, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { sqliteD1 } from './_helpers/sqliteD1';
import { writeProfileCas } from '../functions/api/_lib/profile_cas';
import { readShoppingList } from '../functions/api/_lib/shopping_list';
import { personalMenuProjectionReady } from '../functions/api/_lib/personal_menu_projection';
import { buildPersonalShoppingExport } from '../functions/api/_lib/shopping_export';
import { buildUserDataExport } from '../functions/api/_lib/user_data_export';
import { hardDeleteAccount } from '../functions/api/_lib/account_delete';

const userId = 'projection-owner', week = '2026-10-12';
const profile = (name: string, grams: number, version: number, weekStart = week) => ({
  id: userId, version, aiPlan: { weeklyMenu: { weekStart, days: [], shoppingList: [], shoppingListItems: [{ name, grams }] } },
});
const shopping = (weekStart = week) => readShoppingList({ db: fixture.db, userId, weekStart, familyId: null });
let fixture: ReturnType<typeof sqliteD1>;
beforeEach(() => {
  fixture = sqliteD1();
  fixture.sqlite.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').run(userId, 1);
});

const projection = (weekStart = week) => fixture.sqlite.prepare('SELECT * FROM personal_menu_projections WHERE user_id = ? AND week_start = ?').get(userId, weekStart);

it('accepts exactly one concurrent profile version and keeps its own projected items', async () => {
  await writeProfileCas(fixture.db, userId, profile('Овсянка', 100, 1), 0, 100);
  const results = await Promise.all([
    writeProfileCas(fixture.db, userId, profile('Рис', 200, 2), 1, 200),
    writeProfileCas(fixture.db, userId, profile('Гречка', 300, 2), 1, 201),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  const stored = JSON.parse(String(fixture.sqlite.prepare('SELECT profile_json FROM user_profiles WHERE user_id = ?').get(userId)?.profile_json));
  expect(JSON.parse(String(projection()?.items_json))).toEqual(stored.aiPlan.weeklyMenu.shoppingListItems);
  expect(projection()?.profile_version).toBe(2);
});

it('rolls back the profile CAS when projection persistence fails', async () => {
  const original = profile('Овсянка', 100, 1);
  await writeProfileCas(fixture.db, userId, original, 0, 100);
  fixture.sqlite.exec("CREATE TRIGGER injected_projection_failure BEFORE UPDATE ON personal_menu_projections BEGIN SELECT RAISE(ABORT, 'projection unavailable'); END");
  await expect(writeProfileCas(fixture.db, userId, profile('Рис', 200, 2), 1, 200)).rejects.toThrow('projection unavailable');
  expect(fixture.sqlite.prepare('SELECT version, profile_json FROM user_profiles WHERE user_id = ?').get(userId))
    .toMatchObject({ version: 1, profile_json: JSON.stringify(original) });
  expect(projection()?.profile_version).toBe(1);
  expect(JSON.parse(String(projection()?.items_json))).toEqual(original.aiPlan.weeklyMenu.shoppingListItems);
});

it('retains an empty generation instead of resurrecting legacy shopping rows', async () => {
  fixture.sqlite.prepare('INSERT INTO weekly_menu_items (id, user_id, week_start, ingredient_name, grams, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('legacy-empty', userId, week, 'Банан', 100, 1);
  const empty = profile('Рис', 100, 1); empty.aiPlan.weeklyMenu.shoppingListItems = [];
  await writeProfileCas(fixture.db, userId, empty, 0, 100);
  expect(projection()).toMatchObject({ items_json: '[]', profile_version: 1 });
  expect(await shopping()).toMatchObject({ kind: 'loaded', items: [], totalGrams: 0 });
  expect(await buildPersonalShoppingExport(fixture.db, userId, week)).toBe('Продукт,Количество');
});

it('clears the removed current menu and preserves snapshots of other weeks', async () => {
  await writeProfileCas(fixture.db, userId, profile('Овсянка', 100, 1), 0, 100);
  await writeProfileCas(fixture.db, userId, profile('Рис', 200, 2, '2026-10-19'), 1, 200);
  expect(projection()?.profile_version).toBe(1);
  expect(await shopping()).toMatchObject({ items: [{ name: 'Овсянка', grams: 100 }] });
  await writeProfileCas(fixture.db, userId, { id: userId, version: 3, aiPlan: {} }, 2, 300);
  expect(projection('2026-10-19')).toMatchObject({ items_json: '[]', profile_version: 3 });
  expect(projection()?.profile_version).toBe(1);
});

it('rejects a malformed menu atomically instead of acknowledging an unprojectable profile', async () => {
  await writeProfileCas(fixture.db, userId, profile('Овсянка', 100, 1), 0, 100);
  await expect(writeProfileCas(fixture.db, userId, { version: 2, aiPlan: { weeklyMenu: { days: [] } } }, 1, 200))
    .rejects.toThrow('PROFILE_INVALID_WEEKLY_MENU');
  expect(projection()?.profile_version).toBe(1);
  expect(fixture.sqlite.prepare('SELECT version FROM user_profiles WHERE user_id = ?').get(userId)?.version).toBe(1);
});

it('does not fall back to legacy data when a canonical snapshot is corrupt', async () => {
  await writeProfileCas(fixture.db, userId, profile('Овсянка', 100, 1), 0, 100);
  fixture.sqlite.prepare('UPDATE personal_menu_projections SET items_json = ? WHERE user_id = ?').run('broken JSON', userId);
  await expect(shopping()).rejects.toThrow();
});

it('advertises projection readiness only with the table and both SQL triggers', async () => {
  expect(await personalMenuProjectionReady(fixture.db)).toBe(true);
  fixture.sqlite.exec('DROP TRIGGER profile_personal_menu_update');
  expect(await personalMenuProjectionReady(fixture.db)).toBe(false);
});

it('exports owned projection history and deletes it with the account', async () => {
  await writeProfileCas(fixture.db, userId, profile('Овсянка', 100, 1), 0, 100);
  const exported = await buildUserDataExport(fixture.db, { sub: userId, sid: 'projection-session', email: 'projection@example.test', emailVerified: true, roles: ['user'] });
  expect(exported.personal_menu_projections).toEqual([expect.objectContaining({ week_start: week, profile_version: 1 })]);
  await hardDeleteAccount(fixture.db, userId);
  expect(projection()).toBeUndefined();
});
afterEach(() => fixture.sqlite.close());

it('projects a successful profile CAS into the personal shopping list in the same commit', async () => {
  fixture.sqlite.prepare('INSERT INTO weekly_menu_items (id, user_id, week_start, ingredient_name, grams, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('legacy', userId, week, 'Банан', 100, 1);
  expect(await writeProfileCas(fixture.db, userId, profile('Овсянка', 1400, 1), 0, 100)).toBe(true);
  expect(await shopping()).toMatchObject({ kind: 'loaded', items: [{ name: 'Овсянка', grams: 1400, checked: false }] });
});

it('upgrades existing databases without losing legacy purchases or requiring a guessed menu week', async () => {
  const migrations = new URL('../migrations/', import.meta.url);
  const previous = readdirSync(migrations).filter(name => name.endsWith('.sql') && name < '0020_').sort()
    .map(name => readFileSync(new URL(name, migrations), 'utf8')).join('\n');
  const older = sqliteD1(previous);
  try {
    older.sqlite.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').run(userId, 1);
    older.sqlite.prepare('INSERT INTO weekly_menu_items (id, user_id, week_start, ingredient_name, grams, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('pre-migration', userId, week, 'Банан', 100, 1);
    expect(await personalMenuProjectionReady(older.db)).toBe(false);
    older.sqlite.exec(readFileSync(new URL('0020_personal_menu_projections.sql', migrations), 'utf8'));
    expect(await personalMenuProjectionReady(older.db)).toBe(true);
    const read = () => readShoppingList({ db: older.db, userId, weekStart: week, familyId: null });
    expect(await read()).toMatchObject({ items: [{ name: 'Бананы', grams: 100 }] });
    expect(await writeProfileCas(older.db, userId, profile('Рис', 200, 1), 0, 100)).toBe(true);
    expect(await read()).toMatchObject({ items: [{ name: 'Рис', grams: 200 }] });
    expect(older.sqlite.prepare('SELECT ingredient_name FROM weekly_menu_items WHERE id = ?').get('pre-migration')?.ingredient_name).toBe('Банан');
  } finally { older.sqlite.close(); }
});

it('keeps another account projection out of personal reads, exports and account deletion', async () => {
  const otherId = 'projection-other';
  fixture.sqlite.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').run(otherId, 1);
  await writeProfileCas(fixture.db, userId, profile('Овсянка', 100, 1), 0, 100);
  await writeProfileCas(fixture.db, otherId, { ...profile('Другой продукт', 999, 1), id: otherId }, 0, 100);
  expect(await shopping()).toMatchObject({ items: [{ name: 'Овсянка', grams: 100 }], totalGrams: 100 });
  const exported = await buildUserDataExport(fixture.db, { sub: userId, sid: 'projection-session', emailVerified: true, roles: ['user'] });
  expect(exported.personal_menu_projections).toHaveLength(1);
  expect(exported.personal_menu_projections[0]).toMatchObject({ week_start: week, items_json: JSON.stringify([{ name: 'Овсянка', grams: 100 }]), profile_version: 1 });
  await hardDeleteAccount(fixture.db, userId);
  expect(fixture.sqlite.prepare('SELECT items_json FROM personal_menu_projections WHERE user_id = ?').get(otherId)?.items_json)
    .toBe(JSON.stringify([{ name: 'Другой продукт', grams: 999 }]));
});
