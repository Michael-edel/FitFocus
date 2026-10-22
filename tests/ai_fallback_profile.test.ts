import { describe, expect, it } from 'vitest';
import { buildFallbackAdvice, calcTargetCalories } from '../functions/api/ai';
import { loadAiFallbackProfile } from '../functions/api/_lib/ai_fallback';

describe('AI fallback profile mapping', () => {
  it('prefers canonical profile fields over legacy aliases', () => {
    const advice = buildFallbackAdvice({
      weight: 82,
      weight_kg: 60,
      targetWeight: 74,
      target_weight_kg: 55,
      activityLevel: 'high',
      activity_level: 'low',
      goal: 'gain',
    });

    expect(advice.plan.profileSnapshot).toEqual({
      weight: 82,
      targetWeight: 74,
      activity: 'high',
    });
  });

  it('uses canonical weight when estimating fallback calories', () => {
    expect(calcTargetCalories({
      weight: 80,
      weight_kg: 50,
      activityLevel: 'medium',
      goal: 'loss',
    })).toBe(Math.max(1200, Math.round(80 * 30) - 350));
  });

  it('normalizes stored canonical values before building a fallback', async () => {
    const db = {
      prepare: () => ({
        bind: () => ({ first: async () => ({ profile_json: JSON.stringify({ weight: '81', wearableStepsToday: -1 }) }) }),
      }),
    } as unknown as D1Database;

    await expect(loadAiFallbackProfile(db, 'user-1')).resolves.toMatchObject({ weight: 81 });
  });
});
