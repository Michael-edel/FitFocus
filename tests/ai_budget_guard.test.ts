import { describe, expect, it } from 'vitest';
import { checkAiBudgetGuard, evaluateAiBudgetGuard } from '../functions/api/_lib/ai_budget_guard';

describe('AI budget guard', () => {
  it('marks each independently exhausted budget', () => {
    expect(evaluateAiBudgetGuard(
      { callsToday: 5, costUserToday: 1.2, costTotalToday: 8 },
      { maxCallsPerUserDay: 5, maxCostPerUserDay: 2, maxCostTotalDay: 8 },
    )).toMatchObject({ exceeded: true, exceedCalls: true, exceedUserCost: false, exceedTotalCost: true });
  });

  it('reads all counters and treats malformed aggregate values as zero', async () => {
    const rows = [{ cnt: '3' }, { cost: 'bad' }, { cost: 4.5 }];
    const db = {
      prepare: () => ({ bind: () => ({ first: async () => rows.shift() }) }),
    } as unknown as D1Database;
    await expect(checkAiBudgetGuard({
      db, userId: 'user-1', dayStart: 1, maxCallsPerUserDay: 4, maxCostPerUserDay: 1, maxCostTotalDay: 5,
    })).resolves.toMatchObject({ callsToday: 3, costUserToday: 0, costTotalToday: 4.5, exceeded: false });
  });
});
