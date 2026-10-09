import { describe, expect, it } from 'vitest';
import { readStateItems } from '../functions/api/_lib/state_read';

function makeDb() {
  return {
    prepare() {
      return {
        bind() {
          return this;
        },
        async all() {
          return {
            results: [
              { k: 'fitfocus_data_user-1_diary', v: '[]', version: 2, updated_at: 100 },
              { k: 'fitfocus_data_user-1_all_users', v: '[{"name":"Hidden"}]', version: 3, updated_at: 101 },
              { k: 'fitfocus_data_user-2_diary', v: '[]', version: 4, updated_at: 102 },
              { k: 42, v: '[]', version: 5, updated_at: 103 },
            ],
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe('state read use case', () => {
  it('returns only state keys allowed for the authenticated account', async () => {
    await expect(readStateItems(makeDb(), 'user-1', 'fitfocus_data_user-1_')).resolves.toEqual([
      { key: 'fitfocus_data_user-1_diary', value: '[]', version: 2, updated_at: 100 },
    ]);
  });
});
