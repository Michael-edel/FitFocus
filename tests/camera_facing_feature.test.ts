import { describe, expect, it } from 'vitest';
import { parseCameraFacing } from '../features/nutrition/useCameraFacingPreference';

describe('camera facing preference', () => {
  it('restores the user-facing camera option', () => {
    expect(parseCameraFacing('user')).toBe('user');
  });

  it('uses the environment camera for missing or unsupported values', () => {
    expect(parseCameraFacing(null)).toBe('environment');
    expect(parseCameraFacing('rear')).toBe('environment');
  });
});
