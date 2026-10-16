import { describe, expect, it } from 'vitest';
import { validateAppleIdTokenClaims } from '../functions/api/auth/_oauth';

describe('Apple ID token claims', () => {
  const now = 1_000;

  it('accepts a valid claim set and normalizes the subject', () => {
    expect(validateAppleIdTokenClaims({ iss: 'https://appleid.apple.com', aud: 'client', exp: 1_001, sub: ' apple-user ' }, 'client', now)).toMatchObject({ sub: 'apple-user' });
  });

  it.each([
    [{ iss: 'https://attacker.test', aud: 'client', exp: 1_001, sub: 'apple-user' }],
    [{ iss: 'https://appleid.apple.com', aud: 'other', exp: 1_001, sub: 'apple-user' }],
    [{ iss: 'https://appleid.apple.com', aud: 'client', exp: 1_000, sub: 'apple-user' }],
    [{ iss: 'https://appleid.apple.com', aud: 'client', exp: 1_001, sub: { unexpected: true } }],
    [{ iss: 'https://appleid.apple.com', aud: 'client', exp: 1_001, sub: '   ' }],
  ])('rejects invalid identity claims: %#', (claims) => {
    expect(validateAppleIdTokenClaims(claims, 'client', now)).toBeNull();
  });
});
