import { describe, expect, it } from 'vitest';
import { listAdministrators } from '../functions/api/_lib/admin_list';

describe('admin list use case', () => {
  it('uses a bounded active-admin query', async () => {
    let sql = '';
    const db = {
      prepare(query: string) {
        sql = query;
        return { all: async () => ({ results: [{ id: 'admin-1', email: 'admin@example.com' }] }) };
      },
    } as unknown as D1Database;

    await expect(listAdministrators(db)).resolves.toEqual([{ id: 'admin-1', email: 'admin@example.com' }]);
    expect(sql).toContain("r.role = 'admin'");
    expect(sql).toContain('u.deleted_at IS NULL');
    expect(sql).toContain('LIMIT 200');
  });
});
