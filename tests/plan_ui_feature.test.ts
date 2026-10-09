import { describe, expect, it } from 'vitest';
import { parsePlanUiState } from '../features/plan/usePlanUiState';

describe('plan UI feature', () => {
  it('restores valid persisted controls and expanded days', () => {
    expect(parsePlanUiState(
      '{"planIntroOpen":true,"planRulesExpanded":true,"planScope":"family","familyMenuPrefsOpen":true,"planWeekExpanded":{"Пн":false,"Ср":true}}',
      ['Пн', 'Вт', 'Ср'],
    )).toEqual({
      planIntroOpen: true,
      planRulesExpanded: true,
      planScope: 'family',
      familyMenuPrefsOpen: true,
      planWeekExpanded: { Пн: false, Вт: true, Ср: true },
    });
  });

  it('uses safe defaults and opens the first two new days', () => {
    expect(parsePlanUiState(null, ['Пн', 'Вт', 'Ср'])).toEqual({
      planIntroOpen: false,
      planRulesExpanded: false,
      planScope: 'personal',
      familyMenuPrefsOpen: false,
      planWeekExpanded: { Пн: true, Вт: true, Ср: false },
    });
  });

  it('rejects malformed controls', () => {
    expect(parsePlanUiState('{"planScope":"admin","planWeekExpanded":{"Пн":"yes"}}', ['Пн'])).toEqual({
      planIntroOpen: false,
      planRulesExpanded: false,
      planScope: 'personal',
      familyMenuPrefsOpen: false,
      planWeekExpanded: { Пн: true },
    });
  });
});
