import { describe, expect, it } from 'vitest';
import { getTomorrowRefeedDate } from '../features/adaptation/useRefeedSchedule';

describe('refeed schedule feature', () => {
  it('uses the next local calendar day', () => {
    expect(getTomorrowRefeedDate(new Date(2026, 0, 31, 12))).toBe('2026-02-01');
  });

  it('rolls over to the next year', () => {
    expect(getTomorrowRefeedDate(new Date(2026, 11, 31, 12))).toBe('2027-01-01');
  });
});
