import { describe, expect, it } from 'vitest';
import { normalizeFamilyName } from '../functions/api/_lib/family_create';

describe('family create use case', () => {
  it('rejects missing and whitespace names without inventing a successful default', () => {
    expect(()=>normalizeFamilyName({})).toThrow('BAD_NAME');
    expect(()=>normalizeFamilyName({name:'   '})).toThrow('BAD_NAME');
  });

  it('trims and bounds a custom family name', () => {
    expect(normalizeFamilyName({ name: '  Вместе  ' })).toBe('Вместе');
    expect(()=>normalizeFamilyName({ name: 'x'.repeat(70) })).toThrow('BAD_NAME');
    expect(normalizeFamilyName({name:'x'.repeat(60)})).toHaveLength(60);
  });
});
