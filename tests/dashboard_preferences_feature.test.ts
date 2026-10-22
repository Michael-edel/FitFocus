import { describe, expect, it } from 'vitest';
import { parseDashboardPreferences } from '../features/dashboard/useDashboardPreferences';

describe('dashboard preferences feature', () => {
  it('restores the persisted weight draft and PDF option', () => {
    expect(parseDashboardPreferences('82.4', '1')).toEqual({
      newWeight: '82.4',
      pdfIncludeMealLog: true,
    });
  });

  it('uses safe defaults for missing or unsupported values', () => {
    expect(parseDashboardPreferences(null, null)).toEqual({
      newWeight: '',
      pdfIncludeMealLog: false,
    });
    expect(parseDashboardPreferences('', 'true')).toEqual({
      newWeight: '',
      pdfIncludeMealLog: false,
    });
  });
});
