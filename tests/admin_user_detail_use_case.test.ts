import { describe, expect, it } from 'vitest';
import { readAdminUserDetail } from '../functions/api/_lib/admin_user_detail';

function makeDb() {
  return {
    prepare(sql: string) {
      const statement = {
        bind() { return statement; },
        async first() {
          if (sql.includes('FROM users')) return { id: 'user-1', email: 'u@example.com', name: 'User', is_active: 1 };
          if (sql.includes('FROM user_profiles')) return {
            version: 3,
            profile_json: JSON.stringify({ weight: 72, wearableEnabled: true, measurementsHistory: [{ date: '2026-01-01' }] }),
          };
          if (sql.includes('FROM family_members m')) return null;
          if (sql.includes('FROM subscriptions')) return { plan: 'pro', status: 'active' };
          if (sql.includes('COUNT(*) as total_sessions')) return { total_sessions: 1, active_sessions: 1, ttl_seconds: 3600 };
          if (sql.includes('FROM ai_events')) return { calls: 2, tokens: 50, cost_usd: 0.12, errors: 1, fallback_calls: 1, last_ts: 123 };
          return null;
        },
        async all() {
          if (sql.includes('FROM user_roles')) return { results: [{ role: 'user' }] };
          if (sql.includes('FROM sessions')) return { results: [{ id: 'session-1', created_at: 1000, expires_at: 4600, revoked: 0 }] };
          return { results: [] };
        },
      };
      return statement;
    },
  };
}

describe('admin user detail use case', () => {
  it('projects profile, session, and AI summaries without exposing raw profile JSON', async () => {
    const detail = await readAdminUserDetail(makeDb() as unknown as D1Database, 'user-1', 2_000_000);

    expect(detail).toMatchObject({
      user: { id: 'user-1', email: 'u@example.com' },
      profile: { weight: 72, wearable_enabled: true, measurements_count: 1, has_measurements: true },
      roles: ['user'],
      subscription: { plan: 'pro', status: 'active' },
      summary: { total_sessions: 1, session_ttl_seconds: 3600, ai_calls_7d: 2, ai_errors_7d: 1 },
    });
    expect(detail?.sessions).toEqual([expect.objectContaining({ id: 'session-1', ttl_seconds: 3600, remaining_seconds: 2600 })]);
    expect(JSON.stringify(detail)).not.toContain('profile_json');
  });
});
