import { describe, expect, it } from 'vitest';
import { classifyWisShareFailure, getErrorMessage, isExpectedAiSessionFailure, isSoftWeeklyAiError } from '../services/frontendErrors';
import { SessionReadError } from '../storage/sessionRead';

describe('frontend error helpers', () => {
  it('classifies WIS share failures without exposing raw exception text', () => {
    const reason = classifyWisShareFailure(new Error('SecurityError: canvas has been tainted by cross-origin data'));

    expect(reason).toBe('canvas_security_blocked');
    expect(reason).not.toContain('SecurityError');
    expect(reason).not.toContain('cross-origin');
  });

  it('keeps expected weekly AI soft failures out of noisy logging', () => {
    expect(isSoftWeeklyAiError(new Error('already in progress'))).toBe(true);
    expect(isSoftWeeklyAiError(new Error('LOGIN_SESSION_CHANGED'))).toBe(true);
    expect(isSoftWeeklyAiError(new Error('SESSION_READ_AUTH'))).toBe(true);
    expect(isSoftWeeklyAiError(new Error('SESSION_READ_SESSION'))).toBe(true);
    expect(isSoftWeeklyAiError(new Error('WEEKLY_REPORT_SESSION_CHANGED'))).toBe(true);
    expect(isSoftWeeklyAiError(new Error('WEEKLY_REPORT_ACTION_CHANGED'))).toBe(true);
    expect(isSoftWeeklyAiError(new Error('SESSION_READ_PROTOCOL'))).toBe(false);
    expect(isSoftWeeklyAiError(new Error('database stack trace'))).toBe(false);
  });

  it('suppresses only typed session and auth failures, not access or protocol errors', () => {
    expect(isExpectedAiSessionFailure(new SessionReadError('session'))).toBe(true);
    expect(isExpectedAiSessionFailure(new SessionReadError('auth'))).toBe(true);
    expect(isExpectedAiSessionFailure(new SessionReadError('access'))).toBe(false);
    expect(isExpectedAiSessionFailure(new SessionReadError('protocol'))).toBe(false);
    expect(isExpectedAiSessionFailure(new Error('SESSION_READ_AUTH'))).toBe(false);
  });

  it('extracts messages only from known string fields', () => {
    expect(getErrorMessage({ message: 'cooldown active' })).toBe('cooldown active');
    expect(getErrorMessage({ message: { raw: 'secret' } })).toBe('');
  });
});
