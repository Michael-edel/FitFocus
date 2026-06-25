import { describe, expect, it } from 'vitest';
import { dailyAiLimitForPlan } from '../functions/api/_lib/plans';

describe('dailyAiLimitForPlan', () => {
  it('falls back to the free default when FREE_AI_DAILY_LIMIT is invalid', () => {
    expect(dailyAiLimitForPlan('free', { FREE_AI_DAILY_LIMIT: 'abc' })).toBe(3);
  });

  it('keeps explicit finite free limits', () => {
    expect(dailyAiLimitForPlan('free', { FREE_AI_DAILY_LIMIT: '0' })).toBe(0);
    expect(dailyAiLimitForPlan('free', { FREE_AI_DAILY_LIMIT: '5' })).toBe(5);
  });

  it('keeps missing and infinity paid limits unlimited', () => {
    expect(dailyAiLimitForPlan('pro', {})).toBeNull();
    expect(dailyAiLimitForPlan('family', { FAMILY_AI_DAILY_LIMIT: 'infinity' })).toBeNull();
  });

  it('falls back to a finite default when paid limits are invalid', () => {
    expect(dailyAiLimitForPlan('pro', { PRO_AI_DAILY_LIMIT: 'abc' })).toBe(3);
    expect(dailyAiLimitForPlan('family', { FAMILY_AI_DAILY_LIMIT: 'NaN' })).toBe(3);
  });
});
