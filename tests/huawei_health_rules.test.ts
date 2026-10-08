import { describe, expect, it } from 'vitest';
import { huaweiChangedFields, parseHuaweiBaseVersion } from '../functions/api/_lib/huawei_health';

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
});
