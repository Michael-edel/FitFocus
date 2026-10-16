import { describe, expect, it } from 'vitest';
import { readAdminAiCost } from '../functions/api/_lib/admin_ai_cost';

function makeDb() {
  const calls: Array<{ sql: string; binds: unknown[] }> = [];
  let aggregateIndex = 0;
  const db = {
    prepare(sql: string) {
      const statement = {
        binds: [] as unknown[],
        bind(...binds: unknown[]) {
          this.binds = binds;
          return this;
        },
        async first() {
          calls.push({ sql, binds: this.binds });
          aggregateIndex += 1;
          return aggregateIndex === 1
            ? { calls: 4, errors: 1, tokens: 120, cost_usd: 0.04, fallback_calls: 1, avg_latency_ms: 250 }
            : { calls: 10, tokens: 320, cost_usd: 0.12, fallback_calls: 2 };
        },
        async all() {
          calls.push({ sql, binds: this.binds });
          return { results: [{ user_id: 'user-1', email: 'member@example.com', plan: 'pro', cost_usd: 0.12, tokens: 320, calls: 10 }] };
        },
      };
      return statement;
    },
  };
  return { db: db as unknown as D1Database, calls };
}

describe('admin AI cost use case', () => {
  it('returns normalized aggregates for a deterministic reporting instant', async () => {
    const { db, calls } = makeDb();
    const now = Date.UTC(2026, 9, 7, 15, 30, 0);

    await expect(readAdminAiCost(db, now)).resolves.toMatchObject({
      today: { day_start_ms: Date.UTC(2026, 9, 7), calls: 4, errors: 1, fallback_pct: 25, avg_latency_ms: 250 },
      last_7d: { from_ms: Date.UTC(2026, 8, 30), calls: 10, fallback_pct: 20 },
      top_users_7d: [{ user_id: 'user-1', email: 'member@example.com', plan: 'pro', subscription_status: 'inactive' }],
      schema_version: 1,
    });

    expect(calls.map((call) => call.binds)).toEqual([
      [Date.UTC(2026, 9, 7)],
      [Date.UTC(2026, 8, 30)],
      [now, now, Date.UTC(2026, 8, 30)],
    ]);
  });
});
