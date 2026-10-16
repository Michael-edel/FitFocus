import { describe, expect, it } from 'vitest';
import { parseHashTab } from '../features/navigation/useHashTabNavigation';

describe('hash tab navigation', () => {
  it('accepts known public tab routes with optional route parameters', () => {
    expect(parseHashTab('#/nutrition?source=shortcut')).toBe('nutrition');
    expect(parseHashTab('#course&resume=true')).toBe('course');
  });

  it('rejects empty, unknown, and admin routes', () => {
    expect(parseHashTab('')).toBeNull();
    expect(parseHashTab('#/unknown')).toBeNull();
    expect(parseHashTab('#admin')).toBeNull();
  });
});