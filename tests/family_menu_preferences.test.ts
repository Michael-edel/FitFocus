import { describe, expect, it } from 'vitest';
import { readFamilyMenuPrefs } from '../useFamilyMenu';

describe('family menu preferences', () => {
  it('restores valid stored preferences', () => {
    expect(readFamilyMenuPrefs(
      '{"includeIds":["user-1","user-2"],"cookingMode":"once_per_day","budgetPerWeek":45000,"currency":"RUB"}',
      ['user-3'],
    )).toEqual({
      includeIds: ['user-1', 'user-2'],
      cookingMode: 'once_per_day',
      budgetPerWeek: '45000',
      currency: 'RUB',
    });
  });

  it('uses current profile defaults when no state exists', () => {
    expect(readFamilyMenuPrefs(null, ['user-3', 'user-4'])).toEqual({
      includeIds: ['user-3', 'user-4'],
      cookingMode: 'all_meals',
      budgetPerWeek: '',
      currency: 'KZT',
    });
  });

  it('rejects malformed or incomplete preference values', () => {
    expect(readFamilyMenuPrefs('{"includeIds":["",3],"cookingMode":"fast","budgetPerWeek":{},"currency":0}', ['user-5'])).toEqual({
      includeIds: ['user-5'],
      cookingMode: 'all_meals',
      budgetPerWeek: '',
      currency: 'KZT',
    });
  });
});
