import { describe, expect, it } from 'vitest';
import { normalizeStateWrite } from '../functions/api/_lib/state_write';

describe('state write use case', () => {
  it('normalizes a user-scoped state write and its version', () => {
    expect(normalizeStateWrite({
      key: 'fitfocus_data_user-1_diary',
      value: '[]',
      baseVersion: '2',
    }, 'user-1')).toEqual({
      ok: true,
      items: [{ key: 'fitfocus_data_user-1_diary', value: '[]', baseVersion: 2 }],
    });
  });

  it('rejects duplicate, invalid and foreign-key writes before persistence', () => {
    expect(normalizeStateWrite({
      items: [
        { key: 'fitfocus_data_user-1_diary', value: '[]' },
        { key: 'fitfocus_data_user-1_diary', value: '[]' },
      ],
    }, 'user-1')).toEqual({ ok: false, error: 'DUPLICATE_KEY', key: 'fitfocus_data_user-1_diary' });
    expect(normalizeStateWrite({ key: 'fitfocus_data_user-2_diary', value: '[]' }, 'user-1'))
      .toEqual({ ok: false, error: 'FORBIDDEN_KEYSPACE' });
    expect(normalizeStateWrite({ key: 'fitfocus_data_user-1_diary', value: '[]', baseVersion: -1 }, 'user-1'))
      .toEqual({ ok: false, error: 'BAD_BASE_VERSION', key: 'fitfocus_data_user-1_diary' });
  });
});
