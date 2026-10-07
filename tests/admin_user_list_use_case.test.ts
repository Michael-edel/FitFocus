import { describe, expect, it } from 'vitest';
import { listAdminUsers } from '../functions/api/_lib/admin_user_list';

function makeDb() {
  const calls: Array<{ sql: string; binds: unknown[] }> = [];
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
          return sql.includes('COUNT(*)') ? { c: 1 } : null;
        },
        async all() {
          calls.push({ sql, binds: this.binds });
          return {
            results: [{
              id: 'user-1', email: 'user@example.com', created_at: 1000, is_active: 1,
              subscription_plan: 'pro', subscription_status: 'active', current_period_end: 2000,
              profile_json: JSON.stringify({
                name: 'Анна', plan: 'free', weight: 72, wearableEnabled: true,
                bloodGlucoseMmolL: 5.2, measurementsHistory: [{ date: '2026-01-01' }],
              }), profile_version: 4, profile_updated_at: 999,
            }],
          };
        },
      };
      return statement;
    },
  };
  return { db: db as unknown as D1Database, calls };
}

describe('admin user list use case', () => {
  it('normalizes supported filters, bounds pagination and projects profile summary fields', async () => {
    const { db, calls } = makeDb();
    const result = await listAdminUsers(db, new URLSearchParams({
      plan: 'PRO', wearable: 'connected', glucose: 'yes', measurements: 'yes', limit: '999', offset: '-5',
    }));

    expect(result).toMatchObject({
      total: 1, limit: 200, offset: 0,
      users: [{
        id: 'user-1', name: 'Анна', subscription_plan: 'pro', has_measurements: true,
        measurements_count: 1, wearable_enabled: true, glucose_has_data: true, blood_glucose_mmol_l: 5.2,
      }],
    });
    const listCall = calls.find((call) => call.sql.includes('ORDER BY u.created_at DESC'));
    expect(listCall?.binds).toEqual(['pro', 200, 0]);
    expect(listCall?.sql).toContain("json_extract(p.profile_json, '$.wearableEnabled')");
  });
});
