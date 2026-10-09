import { describe, expect, it } from 'vitest';
import { normalizeStateWrite, parseStateBaseVersion } from '../functions/api/_lib/state_write';

describe('state write use case', () => {
  it.each([Number.MAX_SAFE_INTEGER + 1, '9007199254740992', -1, 1.5, NaN, Infinity, {}, true])
    ('rejects a version that cannot participate in exact CAS: %j', (value) => {
      expect(parseStateBaseVersion(value)).toBeNull();
    });

  it('keeps absent/zero/positive safe versions compatible with the existing parser', () => {
    for (const value of [undefined, null, '', '  ', 0, '0']) expect(parseStateBaseVersion(value)).toBe(0);
    expect(parseStateBaseVersion(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('rejects a batch above the D1 parameter budget before writing', () => {
    const items = Array.from({ length: 33 }, (_, index) => ({ key: `fitfocus_data_user-1_${index}`, value: '' }));
    expect(normalizeStateWrite({ items }, 'user-1')).toEqual({ ok: false, error: 'TOO_MANY_ITEMS' });
  });
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
