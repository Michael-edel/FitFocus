import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteStateItem, writeStateItems } from '../functions/api/_lib/state_store';
import { readStateItems } from '../functions/api/_lib/state_read';
import { migrateLegacyStateToCurrentUser } from '../functions/api/_lib/legacy_sync';
import { buildUserDataExport } from '../functions/api/_lib/user_data_export';
import { hardDeleteAccount } from '../functions/api/_lib/account_delete';
import { readFileSync, readdirSync } from 'node:fs';
import { sqliteD1 } from './_helpers/sqliteD1';

const userId = 'user-1';
const key = `fitfocus_data_${userId}_diary`;
let fixture: ReturnType<typeof sqliteD1>;
beforeEach(() => { fixture = sqliteD1(); });
afterEach(() => fixture.sqlite.close());

function seed(targetKey = key, version = 1, value = 'private diary') {
  fixture.sqlite.prepare('INSERT INTO user_kv (user_id, k, v, version, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(userId, targetKey, value, version, 100);
}
const row = (targetKey = key) => fixture.sqlite.prepare('SELECT * FROM user_kv WHERE user_id = ? AND k = ?').get(userId, targetKey);
const write = (value: string, baseVersion: number, targetKey = key) =>
  writeStateItems(fixture.db, userId, [{ key: targetKey, value, baseVersion }], 300);

describe('state generations on real SQLite', () => {
  it('creates, updates, deletes and recreates without accepting the original version again', async () => {
    expect(await write('original', 0)).toMatchObject({ ok: true, items: [{ version: 1, exists: true }] });
    expect(await write('updated', 1)).toMatchObject({ ok: true, items: [{ version: 2 }] });
    expect(await deleteStateItem(fixture.db, userId, key, 2, 400))
      .toEqual({ ok: true, item: { key, version: 3, exists: false } });
    expect(await write('blind recreate', 0)).toMatchObject({ ok: false, conflict: { version: 3, exists: false, value: '' } });
    expect(await write('recreated', 3)).toMatchObject({ ok: true, items: [{ version: 4, exists: true }] });
    expect(await write('stale original', 1)).toMatchObject({ ok: false, conflict: { version: 4, value: 'recreated' } });
    expect(await deleteStateItem(fixture.db, userId, key, 2)).toMatchObject({ ok: false });
    expect(row()).toMatchObject({ v: 'recreated', version: 4, deleted_at: null });
  });

  it('creates a deletion generation for a never-created key and rejects blind creation afterwards', async () => {
    expect(await deleteStateItem(fixture.db, userId, key, 0, 0))
      .toEqual({ ok: true, item: { key, version: 1, exists: false } });
    expect(row()).toMatchObject({ v: '', version: 1, deleted_at: 0 });
    expect(await write('stale offline create', 0)).toMatchObject({ ok: false, conflict: { exists: false, version: 1 } });
    expect(await write('confirmed recreate', 1)).toMatchObject({ ok: true, items: [{ version: 2 }] });
  });

  it('requires the current tombstone version for a repeated deletion', async () => {
    seed();
    await deleteStateItem(fixture.db, userId, key, 1);
    expect(await deleteStateItem(fixture.db, userId, key, 1)).toMatchObject({ ok: false, conflict: { version: 2, exists: false } });
    expect(await deleteStateItem(fixture.db, userId, key, 2)).toMatchObject({ ok: true, item: { version: 3, exists: false } });
  });

  it('retains the generation and clears the payload when deleting', async () => {
    seed();
    await deleteStateItem(fixture.db, userId, key, 1);
    expect(row()).toMatchObject({ version: 2, v: '' });
    expect(row()?.deleted_at).toEqual(expect.any(Number));
  });

  it('rejects an unversioned old-client delete instead of destroying a newer value', async () => {
    seed(key, 7);
    expect(await deleteStateItem(fixture.db, userId, key, 0))
      .toMatchObject({ ok: false, conflict: { version: 7, exists: true } });
    expect(row()).toMatchObject({ version: 7, v: 'private diary' });
  });

  it('does not fabricate a successful delete acknowledgement for a missing positive version', async () => {
    expect(await deleteStateItem(fixture.db, userId, key, 3))
      .toMatchObject({ ok: false, conflict: { version: 0, exists: false } });
    expect(row()).toBeUndefined();
  });

  it('rejects the entire batch if another request changes a later key before the conditional mutation', async () => {
    const other = `${key}-other`;
    seed(); seed(other);
    fixture.hooks.before = (sql) => {
      if (!sql.includes('WITH input')) return;
      fixture.hooks.before = undefined;
      fixture.sqlite.prepare('UPDATE user_kv SET v = ?, version = 2 WHERE k = ?').run('concurrent', other);
    };
    const result = await writeStateItems(fixture.db, userId, [
      { key, value: 'must not commit', baseVersion: 1 },
      { key: other, value: 'stale', baseVersion: 1 },
    ], 300);
    expect(result).toMatchObject({ ok: false, conflict: { key: other, version: 2 } });
    expect(row()).toMatchObject({ version: 1, v: 'private diary' });
    expect(row(other)).toMatchObject({ version: 2, v: 'concurrent' });
  });

  it.each(['put', 'delete'] as const)('returns the %s mutation version even if another write commits before the response', async (kind) => {
    seed();
    fixture.hooks.after = (sql) => {
      if (!sql.includes('RETURNING')) return;
      fixture.hooks.after = undefined;
      fixture.sqlite.prepare('UPDATE user_kv SET v = ?, version = 3, deleted_at = NULL WHERE k = ?').run('later write', key);
    };
    const result = kind === 'put' ? await write('ours', 1) : await deleteStateItem(fixture.db, userId, key, 1);
    expect(result).toMatchObject(kind === 'put' ? { ok: true, items: [{ version: 2 }] } : { ok: true, item: { version: 2, exists: false } });
    expect(row()).toMatchObject({ v: 'later write', version: 3 });
  });

  it('rechecks a delete after another request updates the same key', async () => {
    seed();
    fixture.hooks.before = (sql) => {
      if (!sql.includes('WITH input')) return;
      fixture.hooks.before = undefined;
      fixture.sqlite.prepare('UPDATE user_kv SET v = ?, version = 2 WHERE k = ?').run('newer', key);
    };
    expect(await deleteStateItem(fixture.db, userId, key, 1)).toMatchObject({ ok: false, conflict: { version: 2, exists: true } });
    expect(row()).toMatchObject({ v: 'newer', version: 2, deleted_at: null });
  });

  it('blocks an entire batch when a never-created key receives a tombstone before the conditional mutation', async () => {
    seed();
    const other = `${key}-absent`;
    fixture.hooks.before = (sql) => {
      if (!sql.includes('WITH input')) return;
      fixture.hooks.before = undefined;
      fixture.sqlite.prepare('INSERT INTO user_kv (user_id, k, v, version, updated_at, deleted_at) VALUES (?, ?, ?, 1, 200, 200)')
        .run(userId, other, '');
    };
    expect(await writeStateItems(fixture.db, userId, [
      { key, value: 'must not commit', baseVersion: 1 }, { key: other, value: 'blind create', baseVersion: 0 },
    ], 300)).toMatchObject({ ok: false, conflict: { key: other, version: 1, exists: false } });
    expect(row()).toMatchObject({ version: 1, v: 'private diary' });
  });

  it('keeps tombstones out of legacy reads and returns their generation to an opt-in reader', async () => {
    seed(); seed(`${key}-live`);
    await deleteStateItem(fixture.db, userId, key, 1, 400);
    expect(await readStateItems(fixture.db, userId, `fitfocus_data_${userId}_`))
      .toEqual([{ key: `${key}-live`, value: 'private diary', version: 1, updated_at: 100, exists: true }]);
    expect(await readStateItems(fixture.db, userId, key, true)).toEqual(expect.arrayContaining([
      { key, value: '', version: 2, updated_at: 400, exists: false },
    ]));
  });

  it('matches the read prefix literally and keeps account data isolated', async () => {
    fixture.sqlite.prepare('INSERT INTO user_kv (user_id, k, v, updated_at) VALUES (?, ?, ?, 1)')
      .run(userId, 'ff_ai_feature_lastcall_v1:a%b', 'literal');
    fixture.sqlite.prepare('INSERT INTO user_kv (user_id, k, v, updated_at) VALUES (?, ?, ?, 1)')
      .run(userId, 'ff_ai_feature_lastcall_v1:axb', 'wildcard');
    fixture.sqlite.prepare('INSERT INTO user_kv (user_id, k, v, updated_at) VALUES (?, ?, ?, 1)')
      .run('another-user', 'ff_ai_feature_lastcall_v1:a%b', 'foreign');
    expect(await readStateItems(fixture.db, userId, 'ff_ai_feature_lastcall_v1:a%b', true))
      .toEqual([{ key: 'ff_ai_feature_lastcall_v1:a%b', value: 'literal', version: 1, updated_at: 1, exists: true }]);
  });

  it('does not wrap or reset the largest safe version', async () => {
    seed(key, Number.MAX_SAFE_INTEGER);
    expect(await write('overflow', Number.MAX_SAFE_INTEGER)).toMatchObject({ ok: false });
    expect(await deleteStateItem(fixture.db, userId, key, Number.MAX_SAFE_INTEGER)).toMatchObject({ ok: false });
    expect(row()).toMatchObject({ version: Number.MAX_SAFE_INTEGER, v: 'private diary' });
  });

  it('rechecks version exhaustion during a concurrent batch without partial writes', async () => {
    seed(); seed(`${key}-other`, Number.MAX_SAFE_INTEGER - 1);
    fixture.hooks.before = (sql) => {
      if (!sql.includes('WITH input')) return;
      fixture.hooks.before = undefined;
      fixture.sqlite.prepare('UPDATE user_kv SET version = ? WHERE k = ?').run(Number.MAX_SAFE_INTEGER, `${key}-other`);
    };
    expect(await writeStateItems(fixture.db, userId, [
      { key, value: 'must not commit', baseVersion: 1 },
      { key: `${key}-other`, value: 'overflow', baseVersion: Number.MAX_SAFE_INTEGER - 1 },
    ], 300)).toMatchObject({ ok: false });
    expect(row()).toMatchObject({ version: 1, v: 'private diary' });
  });

  it('commits a 32-key batch using no more than 100 D1 bind parameters', async () => {
    const items = Array.from({ length: 32 }, (_, index) => ({ key: `${key}-${index}`, value: 'new', baseVersion: 0 }));
    fixture.hooks.before = (sql, binds) => { if (sql.includes('WITH input')) expect(binds.length).toBeLessThanOrEqual(100); };
    const result = await writeStateItems(fixture.db, userId, items, 300);
    expect(result).toMatchObject({ ok: true, items: items.map((item) => ({ key: item.key, version: 1 })) });
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM user_kv').get()?.n).toBe(32);
  });

  it('rolls back every item on an SQL failure inside the batch', async () => {
    seed(); seed(`${key}-other`);
    fixture.sqlite.exec(`CREATE TRIGGER reject_other BEFORE INSERT ON user_kv WHEN NEW.k = 'fitfocus_data_user-1_diary-other'
      BEGIN SELECT RAISE(ABORT, 'injected SQL failure'); END;`);
    await expect(writeStateItems(fixture.db, userId, [
      { key, value: 'must not commit', baseVersion: 1 }, { key: `${key}-other`, value: 'rejected', baseVersion: 1 },
    ], 300)).rejects.toThrow('injected SQL failure');
    expect(row()).toMatchObject({ version: 1, v: 'private diary' });
    expect(row(`${key}-other`)).toMatchObject({ version: 1, v: 'private diary' });
  });

  it('adds tombstones to the previous migration chain without changing live values or generations', () => {
    const legacy = sqliteD1('');
    try {
      const directory = new URL('../migrations/', import.meta.url);
      for (const name of readdirSync(directory).filter((name) => name.endsWith('.sql') && !name.startsWith('0019')).sort()) {
        legacy.sqlite.exec(readFileSync(new URL(name, directory), 'utf8'));
      }
      legacy.sqlite.prepare('INSERT INTO user_kv (user_id, k, v, version, updated_at) VALUES (?, ?, ?, 7, 100)')
        .run(userId, key, 'existing');
      legacy.sqlite.exec(readFileSync(new URL('0019_state_tombstones.sql', directory), 'utf8'));
      expect(legacy.sqlite.prepare('SELECT v, version, deleted_at FROM user_kv').get())
        .toEqual({ v: 'existing', version: 7, deleted_at: null });
    } finally { legacy.sqlite.close(); }
  });

  it('migrates only missing legacy keys, preserves tombstones and never overwrites target generations', async () => {
    seed(key, 2, 'keep target');
    seed(`${key}-deleted`, 7);
    await deleteStateItem(fixture.db, userId, `${key}-deleted`, 7, 400);
    const insert = fixture.sqlite.prepare('INSERT INTO user_kv (user_id, k, v, version, updated_at, deleted_at) VALUES (?, ?, ?, ?, 100, ?)');
    insert.run('old_%', 'fitfocus_data_old_%_diary', 'old should not overwrite', 99, null);
    insert.run('old_%', 'fitfocus_data_old_%_diary-deleted', 'old should not resurrect', 100, null);
    insert.run('old_%', 'fitfocus_data_old_%_new-live', 'migrate', 4, null);
    insert.run('old_%', 'fitfocus_data_old_%_new-deleted', 'never retain deleted payload', 5, 200);
    insert.run('old_%', 'fitfocusXdataXoldXX_wrong-prefix', 'must not migrate', 9, null);
    await migrateLegacyStateToCurrentUser(fixture.db, 'old_%', userId);
    expect(row()).toMatchObject({ version: 2, v: 'keep target' });
    expect(row(`${key}-deleted`)).toMatchObject({ version: 8, v: '', deleted_at: 400 });
    expect(row(`fitfocus_data_${userId}_new-live`)).toMatchObject({ version: 4, v: 'migrate', deleted_at: null });
    expect(row(`fitfocus_data_${userId}_new-deleted`)).toMatchObject({ version: 5, v: '', deleted_at: 200 });
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM user_kv WHERE user_id = ?').get(userId)?.n).toBe(4);
  });

  it('exports deletion metadata without the erased payload or another account data', async () => {
    seed();
    await deleteStateItem(fixture.db, userId, key, 1, 400);
    fixture.sqlite.prepare('INSERT INTO user_kv (user_id, k, v, updated_at) VALUES (?, ?, ?, 100)').run('other', key, 'foreign');
    const exported = await buildUserDataExport(fixture.db, { sub: userId, sid: 'test', emailVerified: true, roles: [] });
    expect(exported.kv).toEqual([{ key, value: '', version: 2, updated_at: 400, deleted_at: 400, exists: false }]);
    expect(JSON.stringify(exported)).not.toContain('private diary');
    expect(JSON.stringify(exported)).not.toContain('foreign');
  });

  it('physically purges live state and tombstones only on whole-account hard deletion', async () => {
    fixture.sqlite.prepare('INSERT INTO users (id, created_at) VALUES (?, 100)').run(userId);
    fixture.sqlite.prepare('INSERT INTO users (id, created_at) VALUES (?, 100)').run('other');
    seed(); seed(`${key}-live`);
    await deleteStateItem(fixture.db, userId, key, 1);
    fixture.sqlite.prepare('INSERT INTO user_kv (user_id, k, v, updated_at, deleted_at) VALUES (?, ?, ?, 100, 100)')
      .run('other', 'fitfocus_data_other_diary', '');
    expect(await hardDeleteAccount(fixture.db, userId)).toEqual({ ok: true });
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM user_kv WHERE user_id = ?').get(userId)?.n).toBe(0);
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM user_kv WHERE user_id = ?').get('other')?.n).toBe(1);
  });
});
