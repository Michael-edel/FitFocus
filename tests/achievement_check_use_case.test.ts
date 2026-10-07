import { describe, expect, it } from 'vitest';
import { checkAchievements } from '../functions/api/_lib/achievement_check';

function makeDb(existingKeys: string[] = []) {
  const writes: unknown[][] = [];
  const db = {
    prepare(sql: string) {
      const statement = {
        binds: [] as unknown[],
        bind(...binds: unknown[]) {
          this.binds = binds;
          return this;
        },
        async first() {
          if (sql.includes('FROM user_profiles')) {
            return { profile_json: JSON.stringify({ profileDetailsCompleted: true }) };
          }
          return null;
        },
        async all() {
          if (sql.includes('FROM user_achievements')) {
            return { results: existingKeys.map((achievement_key) => ({ achievement_key })) };
          }
          return { results: [] };
        },
        async run() {
          writes.push(this.binds);
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };
  return { db: db as unknown as D1Database, writes };
}

describe('achievement check use case', () => {
  it('derives achievements from the stored profile and does not rewrite existing keys', async () => {
    const { db, writes } = makeDb(['welcome']);

    const result = await checkAchievements(db, 'user-1', {});

    expect(result.newlyUnlocked.map((achievement) => achievement.key)).toEqual(['profile_details_completed']);
    expect(writes).toHaveLength(1);
    expect(writes[0][2]).toBe('profile_details_completed');
  });
});
