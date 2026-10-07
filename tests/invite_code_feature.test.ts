import { describe, expect, it } from 'vitest';
import { parseInviteCode } from '../features/auth/useInviteCodeState';

describe('invite code feature', () => {
  it('restores the profile invitation code', () => {
    expect(parseInviteCode('FAMILY-2026')).toBe('FAMILY-2026');
  });

  it('clears a missing invitation code instead of reusing another profile value', () => {
    expect(parseInviteCode(null)).toBe('');
  });
});
