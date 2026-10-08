import { describe, expect, it } from 'vitest';
import { buildHuaweiSyncedProfile, huaweiChangedFields, loadHuaweiProfile, markHuaweiSynced, parseHuaweiBaseVersion } from '../functions/api/_lib/huawei_health';

describe('Huawei sync field rules', () => {
  it('accepts non-negative integer base versions and rejects invalid values', () => {
    expect(parseHuaweiBaseVersion(undefined)).toBe(0);
    expect(parseHuaweiBaseVersion(' 4 ')).toBe(4);
    expect(parseHuaweiBaseVersion(0)).toBe(0);
    expect(parseHuaweiBaseVersion(-1)).toBeNull();
    expect(parseHuaweiBaseVersion(1.5)).toBeNull();
    expect(parseHuaweiBaseVersion({})).toBeNull();
  });

  it('reports only wearable profile fields supplied by the snapshot', () => {
    expect(huaweiChangedFields({ stepsToday: 12, pulse: 60 })).toEqual(['wearableStepsToday', 'restingPulse']);
    expect(huaweiChangedFields({})).toEqual([]);
  });

  it('loads a normalized persisted profile with its version', async () => {
    const db = {
      prepare: () => ({ bind: () => ({ first: async () => ({ profile_json: '{"height":"180","weight":"80"}', version: 7 }) }) }),
    } as unknown as D1Database;
    await expect(loadHuaweiProfile(db, 'user-1')).resolves.toMatchObject({ version: 7, profile: { height: 180, weight: 80 } });
  });

  it('returns an empty profile when the user has no persisted record', async () => {
    const db = { prepare: () => ({ bind: () => ({ first: async () => null }) }) } as unknown as D1Database;
    await expect(loadHuaweiProfile(db, 'user-1')).resolves.toEqual({ profile: {}, version: 0 });
  });

  it('preserves the original connection time while applying valid metrics', () => {
    const profile = buildHuaweiSyncedProfile({
      user: { sub: 'user-1', sid: 'sid-1', emailVerified: false, roles: [] },
      currentProfile: { wearableConnectedAt: '2025-01-01T00:00:00.000Z' },
      plan: 'pro', version: 5, timestamp: '2026-01-02T03:04:05.000Z', date: '2026-01-02',
      snapshot: { stepsToday: 10, pulse: 72, raw: {} },
    });
    expect(profile).toMatchObject({ wearableConnectedAt: '2025-01-01T00:00:00.000Z', wearableStepsToday: 10, restingPulse: 72, wearableMetricsDayKey: '2026-01-02', version: 5 });
  });

  it('records the sync timestamp in seconds for the Huawei connection', async () => {
    const calls: unknown[][] = [];
    const db = { prepare: () => ({ bind: (...args: unknown[]) => ({ run: async () => { calls.push(args); } }) }) } as unknown as D1Database;
    await markHuaweiSynced(db, 'user-1', 1_700_000_123_456);
    expect(calls).toEqual([[1_700_000_123, 1_700_000_123, 'user-1', 'huawei_health']]);
  });
});
