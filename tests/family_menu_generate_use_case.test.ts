import { describe, expect, it } from 'vitest';
import { generateFamilyMenu } from '../functions/api/_lib/family_menu_generate';

describe('family menu generation use case', () => {
  it('rejects an invalid week before accessing D1', async () => {
    const db = {
      prepare() {
        throw new Error('D1 must not be queried');
      },
    } as unknown as D1Database;

    await expect(generateFamilyMenu({ db, userId: 'user-1', weekStart: 'invalid-week' }))
      .resolves.toEqual({ kind: 'invalid-week' });
  });
});
