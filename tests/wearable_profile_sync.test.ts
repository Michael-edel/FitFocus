import { describe, expect, it } from 'vitest';
import { syncWearableProfile } from '../functions/api/_lib/wearable_profile_sync';

describe('mobile wearable profile sync', () => {
  it('returns the current protected profile when an explicit version is stale', async () => {
    const db = {
      prepare: () => ({ bind: () => ({ first: async () => ({ profile_json: '{"weight":82}', version: 4 }) }) }),
    } as unknown as D1Database;
    const result = await syncWearableProfile({
      db,
      user: { sub: 'user-1', sid: 'session-1', emailVerified: false, roles: [] },
      payload: { provider: 'apple_health', stepsToday: 100 },
      baseVersion: 3,
      hasExplicitBaseVersion: true,
      now: 1_700_000_000_000,
    });
    expect(result).toMatchObject({ kind: 'conflict', profile: { weight: 82, version: 4 }, version: 4 });
  });

  it('rejects a non-integer base version before reading or writing a profile', async () => {
    const db = { prepare: () => { throw new Error('profile should not be read'); } } as unknown as D1Database;
    await expect(syncWearableProfile({
      db,
      user: { sub: 'user-1', sid: 'session-1', emailVerified: false, roles: [] },
      payload: { provider: 'manual', stepsToday: 100 },
      baseVersion: 1.5,
      hasExplicitBaseVersion: true,
    })).resolves.toEqual({ kind: 'bad-base-version' });
  });
});
