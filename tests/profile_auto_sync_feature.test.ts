import { describe, expect, it } from 'vitest';
import { getProfileAutoSyncMode } from '../features/profile/useProfileAutoSync';

describe('profile auto sync feature', () => {
  const profile = { id: 'user-1' } as never;

  it('selects the safe mode for missing session and profile state', () => {
    expect(getProfileAutoSyncMode({ currentUser: null, cloudUserId: 'user-1', suppressNextSync: false })).toBe('none');
    expect(getProfileAutoSyncMode({ currentUser: profile, cloudUserId: undefined, suppressNextSync: false })).toBe('offline');
  });

  it('honors a one-shot suppression before scheduling cloud persistence', () => {
    expect(getProfileAutoSyncMode({ currentUser: profile, cloudUserId: 'user-1', suppressNextSync: true })).toBe('skip-once');
    expect(getProfileAutoSyncMode({ currentUser: profile, cloudUserId: 'user-1', suppressNextSync: false })).toBe('schedule');
  });
});