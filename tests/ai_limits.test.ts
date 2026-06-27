import { describe, expect, it } from 'vitest';
import { cleanupOldAiRateLimitBuckets, enforceAiRateControls } from '../functions/api/_lib/ai_limits';

type PreparedStatement = {
  sql: string;
  binds: unknown[];
  bind: (...args: unknown[]) => PreparedStatement;
  first: () => Promise<unknown>;
  run: () => Promise<{ success: boolean; meta: { changes: number } }>;
};

function makeDb(options: { dailyCount?: number | null } = {}) {
  const runs: Array<{ sql: string; binds: unknown[] }> = [];
  const firsts: Array<{ sql: string; binds: unknown[] }> = [];
  return {
    runs,
    firsts,
    prepare(sql: string): PreparedStatement {
      const stmt: PreparedStatement = {
        sql,
        binds: [],
        bind(...args: unknown[]) {
          this.binds = args;
          return this;
        },
        async first() {
          firsts.push({ sql, binds: this.binds });
          if (sql.includes('SELECT count FROM usage_daily')) {
            return options.dailyCount == null ? null : { count: options.dailyCount };
          }
          return null;
        },
        async run() {
          runs.push({ sql, binds: this.binds });
          return { success: true, meta: { changes: 7 } };
        },
      };
      return stmt;
    },
  };
}

describe('AI rate limit cleanup', () => {
  it('falls back invalid cleanup limits before binding SQL', async () => {
    const db = makeDb();

    const deleted = await cleanupOldAiRateLimitBuckets(db as unknown as D1Database, 12345, Number.NaN);

    expect(deleted).toBe(7);
    expect(db.runs).toHaveLength(1);
    expect(db.runs[0].binds).toEqual([12345, 500]);
  });

  it('rejects exhausted daily limits before mutating cooldown or burst buckets', async () => {
    const db = makeDb({ dailyCount: 1 });

    await expect(enforceAiRateControls({
      db: db as unknown as D1Database,
      userId: 'user-1',
      feature: 'coach',
      plan: 'free',
      planDailyLimit: 1,
      nowMs: Date.UTC(2026, 0, 2, 3, 4, 5),
    })).rejects.toMatchObject({
      code: 'PAYWALL',
      kind: 'daily',
      status: 402,
    });

    expect(db.firsts.some((call) => call.sql.includes('SELECT count FROM usage_daily'))).toBe(true);
    expect(db.runs).toHaveLength(0);
  });
});
