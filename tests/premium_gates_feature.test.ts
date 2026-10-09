import { describe, expect, it } from 'vitest';
import { canUsePremiumGate, incrementUsageCounter } from '../features/usage/premiumGates';

describe('premium gates', () => {
  it('enforces free AI daily limits and keeps paid plans unlimited', () => {
    expect(canUsePremiumGate('aiFoodPhotoPerDay', 'free', { aiFoodPhotoCount: 2 })).toBe(true);
    expect(canUsePremiumGate('aiFoodPhotoPerDay', 'free', { aiFoodPhotoCount: 3 })).toBe(false);
    expect(canUsePremiumGate('aiCoachAdvicePerDay', 'pro', { aiCoachCount: 100_000 })).toBe(true);
  });

  it('uses tariff booleans and menu quotas', () => {
    expect(canUsePremiumGate('weeklyReview', 'free', undefined)).toBe(false);
    expect(canUsePremiumGate('weeklyReview', 'family', undefined)).toBe(true);
    expect(canUsePremiumGate('familyMenuGenerationsPerWeek', 'pro', { familyMenuCount: 10 })).toBe(true);
  });

  it('increments only valid usage values without mutating the source snapshot', () => {
    const usage = { aiFoodPhotoCount: Number.NaN, aiCoachCount: 2 };
    expect(incrementUsageCounter(usage, 'aiFoodPhotoCount')).toEqual({ aiFoodPhotoCount: 1, aiCoachCount: 2 });
    expect(usage.aiFoodPhotoCount).toBeNaN();
  });
});
