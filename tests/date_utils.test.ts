import { describe, expect, it } from 'vitest';
import { getDayKey, getWeekKey, last7DayKeys, toLocalDayKey } from '../dateUtils';

describe('date utilities', () => {
  it('formats local day keys consistently', () => {
    expect(getDayKey(new Date(2026, 7, 5))).toBe('2026-08-05');
    expect(toLocalDayKey('invalid')).toBe('');
  });

  it('uses ISO week boundaries across a new year', () => {
    expect(getWeekKey(new Date(2026, 11, 31))).toBe('2026-53');
    expect(getWeekKey(new Date(2027, 0, 1))).toBe('2026-53');
  });

  it('returns seven consecutive day keys ending at the anchor date', () => {
    expect(last7DayKeys(new Date(2026, 7, 7))).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
    ]);
  });
});
