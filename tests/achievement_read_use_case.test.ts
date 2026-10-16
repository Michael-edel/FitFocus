import { describe, expect, it } from 'vitest';
import { readUserAchievements } from '../functions/api/_lib/achievement_read';

describe('achievement read use case', () => {
  it('normalizes persisted rows and ignores malformed snapshots', async () => {
    const db = {
      prepare() {
        return {
          bind() { return this; },
          async all() {
            return { results: [{
              achievement_key: 'welcome', unlocked_at: '1000', tier: 'bronze', source: 'profile',
              snapshot_json: '{bad-json', created_at: '1001',
            }] };
          },
        };
      },
    } as unknown as D1Database;

    await expect(readUserAchievements(db, 'user-1')).resolves.toEqual([{
      key: 'welcome', unlocked_at: 1000, tier: 'bronze', source: 'profile', snapshot: null, created_at: 1001,
    }]);
  });
});
