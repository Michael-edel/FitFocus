import { describe, expect, it } from 'vitest';
import { isDarkTheme } from '../features/settings/useDocumentTheme';

describe('document theme feature', () => {
  it('keeps every supported styled theme in dark mode except light', () => {
    expect(isDarkTheme('light')).toBe(false);
    expect(isDarkTheme('dark')).toBe(true);
    expect(isDarkTheme('violet')).toBe(true);
    expect(isDarkTheme('calm')).toBe(true);
    expect(isDarkTheme('premium')).toBe(true);
  });
});