import { describe, expect, it } from 'vitest';
import { listMySupportTickets, readMySupportTicketDetail } from '../functions/api/_lib/support_ticket_user_read';

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
          return {
            id: 'ticket-1',
            created_at: 1000,
            updated_at: 1001,
            category: 'Ошибка',
            section: 'Настройки',
            subject: 'Push',
            message: 'Публичное описание\n\n---\nСистемная диагностика\nUser-Agent: private',
            status: 'new',
            priority: 'normal',
            attachment_count: 1,
            attachments_json: JSON.stringify([{ name: 'ticket.png', mime: 'image/png', size: 10, kind: 'image' }]),
          };
        },
        async all() {
          if (sql.includes('support_feedback_messages')) {
            return {
              results: [{
                id: 'message-1',
                ticket_id: 'ticket-1',
                author_user_id: 'admin-1',
                author_role: 'admin',
                message: 'Ответ\n\n---\nСистемная диагностика\nCF-Ray: private',
                attachment_count: 1,
                attachments_json: JSON.stringify([{ name: 'reply.png', mime: 'image/png', size: 10, kind: 'image' }]),
                created_at: 1002,
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

describe('user support read use case', () => {
  it('projects an owner-safe detail with route URLs for ticket and message attachments', async () => {
    const { db } = makeDb();

    const ticket = await readMySupportTicketDetail(db, 'user-1', 'ticket-1');

    expect(ticket).toMatchObject({
      id: 'ticket-1',
      message: 'Публичное описание',
      attachments: [{ data_url: expect.stringContaining('id=ticket-1') }],
      messages: [{ message: 'Ответ', attachments: [{ data_url: expect.stringContaining('messageId=message-1') }] }],
    });
    expect(JSON.stringify(ticket)).not.toContain('private');
  });

  it('lists tickets without message thread or attachment URLs', async () => {
    const { db, queries } = makeDb();

    const tickets = await listMySupportTickets(db, 'user-1');

    expect(tickets).toEqual([]);
    expect(queries[0]).toContain('WHERE user_id = ?');
  });
});
