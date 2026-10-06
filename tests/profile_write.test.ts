import { describe, expect, it } from 'vitest';
import { sanitizeProfilePatch, writeProfile } from '../functions/api/_lib/profile_write';

type StoredProfile = { userId: string; profileJson: string; version: number };

function makeDb(initial: StoredProfile | null) {
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
        async first() {
          if (sql.startsWith('SELECT profile_json, version FROM user_profiles')) {
            return stored ? { profile_json: stored.profileJson, version: stored.version } : null;
          }
          if (sql.includes('FROM subscriptions')) return null;
          throw new Error(`Unexpected SELECT: ${sql}`);
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
          throw new Error(`Unexpected write: ${sql}`);
        },
      };
    },
  } as unknown as D1Database & { readonly stored: StoredProfile | null };
}

describe('profile write use case', () => {
  it('keeps only editable fields from a profile command', () => {
    expect(sanitizeProfilePatch({
      name: 'Анна',
      weight: 63,
      id: 'attacker-controlled-id',
      plan: 'family',
      role: 'admin',
    })).toEqual({ name: 'Анна', weight: 63 });
  });

  it('writes a versioned patch with server-owned identity and plan', async () => {
    const db = makeDb({
      userId: 'user-1',
      profileJson: JSON.stringify({ name: 'До', plan: 'pro' }),
      version: 3,
    });

    const result = await writeProfile(db, { sub: 'user-1', email: 'user@example.com' }, {
      name: 'После',
      id: 'attacker-controlled-id',
      plan: 'family',
      baseVersion: 3,
    }, 'patch');

    expect(result).toMatchObject({
      kind: 'saved',
      updatedFields: ['name'],
      version: 4,
      profile: { id: 'user-1', googleSub: 'user-1', name: 'После', plan: 'free' },
    });
    expect(JSON.parse(db.stored?.profileJson || '{}')).toMatchObject({
      id: 'user-1',
      name: 'После',
      plan: 'free',
      version: 4,
    });
  });

  it('rejects a forbidden state key before accessing persistence', async () => {
    const db = makeDb(null);

    const result = await writeProfile(db, { sub: 'user-1' }, {
      name: 'Анна',
      stateItems: [{ key: 'fitfocus_data_user-1_all_users', value: '[]', baseVersion: 0 }],
    }, 'replace');

    expect(result).toEqual({ kind: 'forbidden-keyspace' });
  });
});
