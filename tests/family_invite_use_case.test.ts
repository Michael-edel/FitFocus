import { describe, expect, it } from 'vitest';
import { normalizeFamilyInviteTtlHours } from '../functions/api/_lib/family_invite_create';

describe('family invite create use case', () => {
  it('uses the default invite lifetime for missing and invalid values', () => {
    expect(normalizeFamilyInviteTtlHours(undefined)).toBe(72);
    expect(normalizeFamilyInviteTtlHours('bad')).toBe(72);
  });

  it('keeps the invite lifetime within the allowed range', () => {
    expect(normalizeFamilyInviteTtlHours(-4)).toBe(1);
    expect(normalizeFamilyInviteTtlHours(999)).toBe(24 * 14);
  });
});
