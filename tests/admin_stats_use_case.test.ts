import { describe, expect, it } from 'vitest';
import { readAdminStats } from '../functions/api/_lib/admin_stats';

function database() {
  return {
    prepare(sql: string) {
      const stmt = {
        bind() { return this; },
        async first() {
          if (sql.includes('FROM users') && sql.includes('COUNT(*)') && !sql.includes('deleted_at')) return { c: 12 };
          if (sql.includes('FROM sessions')) return { c: 5 };
          if (sql.includes("plan = ?")) return { c: sql.includes('family') ? 0 : 2 };
          if (sql.includes('deleted_at IS NOT NULL')) return { c: 1 };
          if (sql.includes('is_active = 0')) return { c: 3 };
          if (sql.includes('FROM family_members')) return { c: 4 };
          if (sql.includes('feature LIKE')) return { c: 23 };
          if (sql.includes("feature IN ('meal_add'")) return { c: 9 };
          if (sql.includes('FROM ai_events')) return { calls: 20, errors: 5, avg_latency: 5100 };
          if (sql.includes('FROM user_profiles')) return { with_measurements: 7, with_glucose: 2, with_wearable: 3, with_progress_photos: 4, with_family_members: 5 };
          return { c: 0 };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
}

describe('admin stats read use case', () => {
  it('returns dashboard totals, daily telemetry, and derived alerts without HTTP context', async () => {
    const stats = await readAdminStats(database(), new Date('2026-10-08T10:00:00.000Z'));

    expect(stats.totals).toMatchObject({ users: 12, active_sessions: 5, pro_active: 2, family_active: 2, deleted_users: 1, inactive_users: 3, family_members_active: 4, profiles_with_wearable: 3 });
    expect(stats.today).toEqual({ day: '2026-10-08', ai_calls: 23, meals_logged: 9, ai_event_calls: 20, ai_event_errors: 5, ai_event_avg_latency_ms: 5100 });
    expect(stats.alerts.map((alert) => alert.code)).toEqual(expect.arrayContaining(['ai_error_rate', 'ai_latency']));
  });
});
