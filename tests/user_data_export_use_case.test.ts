import { describe, expect, it } from 'vitest';
import { buildUserDataExport } from '../functions/api/_lib/user_data_export';

function makeDb() {
  const queries: string[] = [];
  const db = {
    prepare(sql: string) {
      queries.push(sql);
      return {
        bind() {
          return this;
        },
        async first() {
          if (sql.includes('FROM users')) return { id: 'user-1', email: 'user@example.com', name: 'User' };
          if (sql.includes('FROM user_profiles')) {
            return { profile_json: JSON.stringify({ weight: 72 }), updated_at: 1000, version: 3 };
          }
          return null;
        },
        async all() {
          if (sql.includes('FROM support_feedback_messages')) {
            return {
              results: [{
                id: 'message-1',
                attachments_json: JSON.stringify([{
                  name: 'reply.png', mime: 'image/png', size: 12, kind: 'photo',
                  storage_key: 'support/ticket-1/messages/message-1/00-reply.png', data_url: 'data:image/png;base64,AA==',
                }]),
              }],
            };
          }
          if (sql.includes('FROM support_feedback')) {
            return {
              results: [{
                id: 'ticket-1',
                attachments_json: JSON.stringify([{
                  name: 'ticket.png', mime: 'image/png', size: 10, kind: 'photo',
                  storage_key: 'support/ticket-1/00-ticket.png', data_url: 'data:image/png;base64,AA==',
                }]),
              }],
            };
          }
          return { results: [] };
        },
      };
    },
  };
  return { db: db as unknown as D1Database, queries };
}

describe('user data export use case', () => {
  it('collects the portable payload and removes internal support attachment locations', async () => {
    const { db, queries } = makeDb();

    const payload = await buildUserDataExport(db, {
      sub: 'user-1', sid: 'sid-1', roles: ['user'], emailVerified: true, email: 'user@example.com',
    });

    expect(payload.profile).toEqual({ weight: 72 });
    expect(payload.support_feedback).toEqual([{ id: 'ticket-1', attachments: [{
      name: 'ticket.png', mime: 'image/png', size: 10, kind: 'photo', data_url: 'data:image/png;base64,AA==',
    }] }]);
    expect(payload.support_messages).toEqual([{ id: 'message-1', attachments: [{
      name: 'reply.png', mime: 'image/png', size: 12, kind: 'photo', data_url: 'data:image/png;base64,AA==',
    }] }]);
    expect(JSON.stringify(payload)).not.toContain('storage_key');
    expect(queries.some((sql) => sql.includes('FROM push_subscriptions'))).toBe(true);
  });
});
