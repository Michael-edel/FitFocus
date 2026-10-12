import { describe, expect, it } from 'vitest';
import { writeProfileCas } from '../functions/api/profile';

import { afterEach } from 'vitest';
import { sqliteD1 } from './_helpers/sqliteD1';
const fixtures: ReturnType<typeof sqliteD1>[] = [];
afterEach(() => { for (const fixture of fixtures.splice(0)) fixture.sqlite.close(); });
type StoredProfile = { userId: string; profileJson: string; version: number };
function makeDb(initial: StoredProfile | null = null) {
  const fixture = sqliteD1(); fixtures.push(fixture);
  if (initial) fixture.sqlite.prepare('INSERT INTO user_profiles (user_id, profile_json, updated_at, version) VALUES (?, ?, ?, ?)')
    .run(initial.userId, initial.profileJson, 1, initial.version);
  Object.defineProperty(fixture.db, 'stored', { get() {
    const row = fixture.sqlite.prepare('SELECT user_id, profile_json, version FROM user_profiles').get();
    return row ? { userId: row.user_id, profileJson: row.profile_json, version: row.version } : null;
  } });
  return fixture.db as D1Database & { readonly stored: StoredProfile | null };
}

describe('profile CAS writes', () => {
  it.each([0, 1])('acknowledges only its own profile mutation despite trigger writes at base version %s', async baseVersion => {
    const fixture = sqliteD1(); fixtures.push(fixture);
    if (baseVersion) fixture.sqlite.prepare('INSERT INTO user_profiles (user_id, profile_json, updated_at, version) VALUES (?, ?, ?, ?)')
      .run('user-1', '{"name":"Before"}', 1, baseVersion);
    fixture.sqlite.exec(`CREATE TABLE profile_side_effects (version INTEGER);
      CREATE TRIGGER profile_insert_effect AFTER INSERT ON user_profiles BEGIN
        INSERT INTO profile_side_effects VALUES (NEW.version); END;
      CREATE TRIGGER profile_update_effect AFTER UPDATE ON user_profiles BEGIN
        INSERT INTO profile_side_effects VALUES (NEW.version); END;`);
    const command = { name: 'Accepted', version: baseVersion + 1 };
    expect(await writeProfileCas(fixture.db, 'user-1', command, baseVersion, 100)).toBe(true);
    expect(fixture.sqlite.prepare('SELECT version FROM user_profiles WHERE user_id = ?').get('user-1')?.version).toBe(baseVersion + 1);
    expect(fixture.sqlite.prepare('SELECT count(*) AS n FROM profile_side_effects').get()?.n).toBe(1);
    expect(await writeProfileCas(fixture.db, 'user-1', command, baseVersion, 101)).toBe(false);
    expect(fixture.sqlite.prepare('SELECT count(*) AS n FROM profile_side_effects').get()?.n).toBe(1);
  });
  it('allows exactly one of two concurrent writes for the same base version', async () => {
    const db = makeDb({ userId: 'user-1', profileJson: JSON.stringify({ name: 'Before' }), version: 4 });

    const results = await Promise.all([
      writeProfileCas(db, 'user-1', { name: 'First', version: 5 }, 4, 100),
      writeProfileCas(db, 'user-1', { name: 'Second', version: 5 }, 4, 101),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(db.stored?.version).toBe(5);
    expect(['First', 'Second']).toContain(JSON.parse(db.stored?.profileJson || '{}').name);
  });

  it('does not overwrite an existing profile when the client sends base version zero', async () => {
    const db = makeDb({ userId: 'user-1', profileJson: JSON.stringify({ name: 'Cloud' }), version: 3 });

    const written = await writeProfileCas(db, 'user-1', { name: 'Stale local', version: 1 }, 0, 100);

    expect(written).toBe(false);
    expect(JSON.parse(db.stored?.profileJson || '{}').name).toBe('Cloud');
    expect(db.stored?.version).toBe(3);
  });

  it('creates a profile only once when two clients initialize at the same time', async () => {
    const db = makeDb();

    const results = await Promise.all([
      writeProfileCas(db, 'user-1', { name: 'First', version: 1 }, 0, 100),
      writeProfileCas(db, 'user-1', { name: 'Second', version: 1 }, 0, 101),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(db.stored?.version).toBe(1);
  });
});
