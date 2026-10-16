import { describe, expect, it } from 'vitest';
import { deliverPushNotifications } from '../functions/api/_lib/push_delivery';
import type { Recipient } from '../functions/api/_lib/push_recipient_selection';

function makeDb() {
  const batches: Array<Array<{ sql: string; binds: unknown[] }>> = [];
  return {
    batches,
    prepare(sql: string) {
      return {
        sql,
        binds: [] as unknown[],
        bind(...binds: unknown[]) { this.binds = binds; return this; },
      };
    },
    async batch(statements: Array<{ sql: string; binds: unknown[] }>) {
      batches.push(statements.map((statement) => ({ sql: statement.sql, binds: statement.binds })));
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };
}

describe('push delivery use case', () => {
  it('records failed delivery in one batch when push configuration is unavailable', async () => {
    const db = makeDb();
    const recipient = {
      id: 'sub-1', user_id: 'user-1', endpoint: 'https://fcm.googleapis.com/fcm/send/test',
      p256dh: 'key', auth: 'auth', content_encoding: 'aes128gcm', device_label: null, user_agent: null,
      created_at: 1, updated_at: 1, last_sent_at: null, last_error: null, enabled: 1, email: null,
      user_created_at: null, deleted_at: null, deletion_scheduled_at: null, is_active: 1,
      subscription_plan: 'free', subscription_status: 'inactive', current_period_end: null, profile_json: null,
      roles_csv: null, profile: {}, roles: [], device: 'Windows', browser: 'Chrome', plan: 'free',
      subscriptionStatus: 'inactive', active: true, familyIds: [],
    } as Recipient;

    const result = await deliverPushNotifications({
      db: db as unknown as D1Database,
      env: {},
      recipients: [recipient],
      payload: { title: 'Test' },
    });

    expect(result).toMatchObject({ sent: 0, failed: 1, removed: 0 });
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0][0].sql).toContain('UPDATE push_subscriptions SET last_error');
  });
});
