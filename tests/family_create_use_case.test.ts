import { describe, expect, it } from 'vitest';
import { normalizeFamilyName } from '../functions/api/_lib/family_create';

describe('family create use case', () => {
  it('uses the default name for missing input', () => {
    expect(normalizeFamilyName({})).toBe('Моя семья');
  });

  it('trims and bounds a custom family name', () => {
    expect(normalizeFamilyName({ name: '  Вместе  ' })).toBe('Вместе');
    expect(normalizeFamilyName({ name: 'x'.repeat(70) })).toHaveLength(60);
  });
});
