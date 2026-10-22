import { describe, expect, it } from 'vitest';
import { getProfileAutoSyncMode } from '../features/profile/useProfileAutoSync';

describe('profile auto sync feature', () => {
  const profile = { id: 'user-1' } as never;

  it('selects the safe mode for missing session and profile state', () => {
    expect(getProfileAutoSyncMode({ currentUser: null, cloudUserId: 'user-1', suppressNextSync: false, hasPendingChanges: false })).toBe('none');
    expect(getProfileAutoSyncMode({ currentUser: profile, cloudUserId: undefined, suppressNextSync: false, hasPendingChanges: true })).toBe('offline');
  });

  it('honors a one-shot suppression before scheduling cloud persistence', () => {
    expect(getProfileAutoSyncMode({ currentUser: profile, cloudUserId: 'user-1', suppressNextSync: true, hasPendingChanges: true })).toBe('skip-once');
    expect(getProfileAutoSyncMode({ currentUser: profile, cloudUserId: 'user-1', suppressNextSync: false, hasPendingChanges: true })).toBe('schedule');
  });

  it('does not flush a clean bootstrap or refresh, while still consuming one-shot suppression', () => {
    expect(getProfileAutoSyncMode({ currentUser: profile, cloudUserId: 'user-1', suppressNextSync: false, hasPendingChanges: false })).toBe('none');
    expect(getProfileAutoSyncMode({ currentUser: profile, cloudUserId: 'user-1', suppressNextSync: true, hasPendingChanges: false })).toBe('skip-once');
  });

  it('defers pending profile writes while a form draft is open, then schedules after save', () => {
    expect(getProfileAutoSyncMode({ currentUser: profile, cloudUserId: 'user-1', suppressNextSync: false,
      hasPendingChanges: true, hasUncommittedDraft: true })).toBe('none');
    expect(getProfileAutoSyncMode({ currentUser: profile, cloudUserId: 'user-1', suppressNextSync: false,
      hasPendingChanges: true, hasUncommittedDraft: false })).toBe('schedule');
  });
});
