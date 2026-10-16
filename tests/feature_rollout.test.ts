import { describe, expect, it } from 'vitest';
import { loadFeatures } from '../functions/api/_lib/features';

function environment(rows: Array<{ key: string; enabled: number | boolean; rollout_percentage: number }>) {
  return {
    DB: {
      prepare(sql: string) {
        expect(sql).toContain('SELECT key, enabled, rollout_percentage FROM feature_flags');
        return {
          async all() {
            return { results: rows };
          },
        };
      },
    } as unknown as D1Database,
  };
}

describe('feature rollout contract', () => {
  it('honors disabled, zero-percent, and full-rollout flags for every actor', async () => {
    const features = await loadFeatures(environment([
      { key: 'disabled', enabled: 0, rollout_percentage: 100 },
      { key: 'zero', enabled: 1, rollout_percentage: 0 },
      { key: 'full', enabled: true, rollout_percentage: 100 },
    ]), 'user-1');

    expect(features).toEqual({ disabled: false, zero: false, full: true });
  });

  it('keeps a partial rollout decision stable for the same user', async () => {
    const env = environment([{ key: 'gradual', enabled: 1, rollout_percentage: 50 }]);

    const first = await loadFeatures(env, 'stable-user');
    const second = await loadFeatures(env, 'stable-user');

    expect(second.gradual).toBe(first.gradual);
  });

  it('fails closed for a partial rollout without an actor identity', async () => {
    const features = await loadFeatures(
      environment([{ key: 'gradual', enabled: 1, rollout_percentage: 50 }]),
    );

    expect(features.gradual).toBe(false);
  });
});
