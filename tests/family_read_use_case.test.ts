import { describe, expect, it } from 'vitest';
import { readActiveFamilyContext } from '../functions/api/_lib/family_read';

describe('family read use case', () => {
  it('returns only active members of the caller active family', async () => {
    const queries: string[] = [];
    const db = {
      prepare(sql: string) {
        queries.push(sql);
        const statement = {
          bind: () => statement,
          first: async () => {
            if (sql.includes('JOIN family_members')) return { id: 'family-1', owner_user_id: 'owner-1', role: 'member' };
            return { id: 'family-1', name: 'Семья', owner_user_id: 'owner-1', created_at: 1 };
          },
          all: async () => ({ results: [{ user_id: 'user-1', role: 'member', status: 'active' }] }),
        };
        return statement;
      },
    } as unknown as D1Database;

    await expect(readActiveFamilyContext(db, 'user-1')).resolves.toEqual({
      family: { id: 'family-1', name: 'Семья', owner_user_id: 'owner-1', created_at: 1 },
      members: [{ user_id: 'user-1', role: 'member', status: 'active' }],
    });
    expect(queries.some((sql) => sql.includes("status = 'active' AND is_active = 1"))).toBe(true);
  });
});
