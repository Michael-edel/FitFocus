import { describe, expect, it } from 'vitest';
import { classifyWisShareFailure, getErrorMessage, isSoftWeeklyAiError } from '../services/frontendErrors';

describe('frontend error helpers', () => {
  it('classifies WIS share failures without exposing raw exception text', () => {
    const reason = classifyWisShareFailure(new Error('SecurityError: canvas has been tainted by cross-origin data'));

    expect(reason).toBe('canvas_security_blocked');
    expect(reason).not.toContain('SecurityError');
    expect(reason).not.toContain('cross-origin');
  });

  it('keeps expected weekly AI soft failures out of noisy logging', () => {
    expect(isSoftWeeklyAiError(new Error('already in progress'))).toBe(true);
    expect(isSoftWeeklyAiError(new Error('database stack trace'))).toBe(false);
  });

  it('extracts messages only from known string fields', () => {
    expect(getErrorMessage({ message: 'cooldown active' })).toBe('cooldown active');
    expect(getErrorMessage({ message: { raw: 'secret' } })).toBe('');
  });
});
