import { describe, expect, it } from 'vitest';
import { cleanupOldAiRateLimitBuckets } from '../functions/api/_lib/ai_limits';

type PreparedStatement = {
  sql: string;
  binds: unknown[];
  bind: (...args: unknown[]) => PreparedStatement;
  run: () => Promise<{ success: boolean; meta: { changes: number } }>;
};

function makeDb() {
  const runs: Array<{ sql: string; binds: unknown[] }> = [];
  return {
    runs,
    prepare(sql: string): PreparedStatement {
      const stmt: PreparedStatement = {
        sql,
        binds: [],
        bind(...args: unknown[]) {
          this.binds = args;
          return this;
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

    const deleted = await cleanupOldAiRateLimitBuckets(db as any, 12345, Number.NaN);

    expect(deleted).toBe(7);
    expect(db.runs).toHaveLength(1);
    expect(db.runs[0].binds).toEqual([12345, 500]);
  });
});
