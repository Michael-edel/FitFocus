import { describe, expect, it } from 'vitest';
import { parseFamilyJoinCode } from '../functions/api/_lib/family_join_by_invite';

describe('family join use case', () => {
  it('normalizes an invitation code before reading the database', () => {
    expect(parseFamilyJoinCode({ code: '  join-me  ' })).toBe('JOIN-ME');
  });

  it('rejects missing and non-object invite payloads', () => {
    expect(() => parseFamilyJoinCode({ code: '' })).toThrow('BAD_REQUEST');
    expect(() => parseFamilyJoinCode([])).toThrow('BAD_REQUEST');
  });
});
