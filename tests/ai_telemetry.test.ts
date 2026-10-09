import { describe, expect, it } from 'vitest';
import { logAiEvent, logAiUsage } from '../functions/api/_lib/ai_telemetry';

describe('AI telemetry', () => {
  it('falls back to the legacy ai_events schema without interrupting delivery', async () => {
    const statements: Array<{ sql: string; binds: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        const statement = {
          binds: [] as unknown[],
          bind(...binds: unknown[]) { this.binds = binds; return this; },
          async run() {
            statements.push({ sql, binds: this.binds });
            if (sql.includes('estimated_cost_usd')) throw new Error('legacy schema');
            return { success: true };
          },
        };
        return statement;
      },
    };
    await logAiEvent({ DB: db as unknown as D1Database }, {
      userId: 'user-1', feature: 'advice', status: 200, latencyMs: 12, safeMode: false, model: 'model-1', totalTokens: 4,
    });
    expect(statements).toHaveLength(2);
    expect(statements[1].sql).not.toContain('estimated_cost_usd');
    expect(statements[1].binds).not.toContain('model-1');
  });

  it('aggregates compact usage without request content', async () => {
    const writes: Array<{ key: string; value: string }> = [];
    const env = {
      FITFOCUS_KV: {
        async get() { return JSON.stringify({ count: 2, totalLatency: 5 }); },
        async put(key: string, value: string) { writes.push({ key, value }); },
      },
    };
    await logAiUsage(env, { identity: 'user-1', feature: 'advice', status: 500, latency: 8, bytesIn: 12, cacheHit: true });
    const usage = JSON.parse(writes[0].value);
    expect(usage).toMatchObject({ count: 3, errorCount: 1, totalLatency: 13, totalBytesIn: 12, cacheHits: 1, lastStatus: 500 });
    expect(writes[0].key).toContain(':user-1:advice');
  });
});