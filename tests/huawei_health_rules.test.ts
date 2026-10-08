import { describe, expect, it } from 'vitest';
import { huaweiChangedFields, loadHuaweiProfile, parseHuaweiBaseVersion } from '../functions/api/_lib/huawei_health';

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
});
