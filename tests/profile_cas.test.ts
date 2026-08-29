import { describe, expect, it } from 'vitest';
import { writeProfileCas } from '../functions/api/profile';

type StoredProfile = { userId: string; profileJson: string; version: number };

function makeDb(initial: StoredProfile | null = null) {
  let stored = initial;
  return {
    get stored() {
      return stored;
    },
    prepare(sql: string) {
      let binds: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          binds = values;
          return this;
        },
        async run() {
          if (sql.startsWith('UPDATE user_profiles')) {
            const [profileJson, , version, userId, expectedVersion] = binds;
            if (stored?.userId !== userId || stored.version !== expectedVersion) {
              return { success: true, meta: { changes: 0 } };
            }
            stored = { userId: String(userId), profileJson: String(profileJson), version: Number(version) };
            return { success: true, meta: { changes: 1 } };
          }

          if (sql.startsWith('INSERT INTO user_profiles')) {
            const [userId, profileJson, , version] = binds;
            if (stored) return { success: true, meta: { changes: 0 } };
            stored = { userId: String(userId), profileJson: String(profileJson), version: Number(version) };
            return { success: true, meta: { changes: 1 } };
          }

          throw new Error(`Unexpected SQL: ${sql}`);
        },
      };
    },
  } as unknown as D1Database & { readonly stored: StoredProfile | null };
}

describe('profile CAS writes', () => {
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
