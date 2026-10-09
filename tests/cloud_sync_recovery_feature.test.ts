import { describe, expect, it } from 'vitest';
import { selectCloudSyncRecoveryAction } from '../features/profile/useCloudSyncRecovery';

describe('cloud sync recovery feature', () => {
  const ready = {
    hasCloudSession: true,
    hasCurrentUser: true,
    isVisible: true,
    withinCooldown: false,
    hasPendingChanges: false,
    profileSyncState: 'saved' as const,
  };

  it('skips hidden, disconnected, and rate-limited recovery events', () => {
    expect(selectCloudSyncRecoveryAction({ ...ready, isVisible: false })).toBe('none');
    expect(selectCloudSyncRecoveryAction({ ...ready, hasCloudSession: false })).toBe('none');
    expect(selectCloudSyncRecoveryAction({ ...ready, withinCooldown: true })).toBe('none');
  });

  it('flushes queued work before reading cloud state', () => {
    expect(selectCloudSyncRecoveryAction({ ...ready, hasPendingChanges: true })).toBe('flush-local');
    expect(selectCloudSyncRecoveryAction({ ...ready, profileSyncState: 'error' })).toBe('flush-local');
    expect(selectCloudSyncRecoveryAction(ready)).toBe('reload-cloud');
  });
});