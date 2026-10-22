import { describe, expect, it } from 'vitest';
import { cloudSyncRecoveryScopeKey, isCloudSyncRecoveryWithinCooldown, selectCloudSyncRecoveryAction } from '../features/profile/useCloudSyncRecovery';

describe('cloud sync recovery feature', () => {
  const ready = {
    cloudUserId: 'user-1',
    currentUserId: 'user-1',
    isVisible: true,
    withinCooldown: false,
    hasPendingChanges: false,
    profileSyncState: 'saved' as const,
  };

  it('skips hidden, disconnected, and rate-limited recovery events', () => {
    expect(selectCloudSyncRecoveryAction({ ...ready, isVisible: false })).toBe('none');
    expect(selectCloudSyncRecoveryAction({ ...ready, cloudUserId: undefined })).toBe('none');
    expect(selectCloudSyncRecoveryAction({ ...ready, currentUserId: undefined })).toBe('none');
    expect(selectCloudSyncRecoveryAction({ ...ready, cloudUserId: 'account-a', currentUserId: 'account-b' })).toBe('none');
    expect(selectCloudSyncRecoveryAction({ ...ready, withinCooldown: true })).toBe('none');
  });

  it('flushes queued work before reading cloud state', () => {
    expect(selectCloudSyncRecoveryAction({ ...ready, hasPendingChanges: true })).toBe('flush-local');
    expect(selectCloudSyncRecoveryAction({ ...ready, profileSyncState: 'error' })).toBe('flush-local');
    expect(selectCloudSyncRecoveryAction(ready)).toBe('reload-cloud');
  });

  it('does not carry the recovery cooldown across account or verified-session changes', () => {
    const previousScope = cloudSyncRecoveryScopeKey({ cloudUserId: 'account-a', currentUserId: 'account-a', sessionKey: 'session-a' });
    const sameScope = cloudSyncRecoveryScopeKey({ cloudUserId: 'account-a', currentUserId: 'account-a', sessionKey: 'session-a' });
    const accountB = cloudSyncRecoveryScopeKey({ cloudUserId: 'account-b', currentUserId: 'account-b', sessionKey: 'session-b' });
    const reauthenticatedA = cloudSyncRecoveryScopeKey({ cloudUserId: 'account-a', currentUserId: 'account-a', sessionKey: 'session-a2' });
    const attempt = { scopeKey: previousScope, attemptedAtMs: 1_000 };

    expect(isCloudSyncRecoveryWithinCooldown(attempt, sameScope, 1_500, 60_000)).toBe(true);
    expect(isCloudSyncRecoveryWithinCooldown(attempt, accountB, 1_500, 60_000)).toBe(false);
    expect(isCloudSyncRecoveryWithinCooldown(attempt, reauthenticatedA, 1_500, 60_000)).toBe(false);
    expect(isCloudSyncRecoveryWithinCooldown(attempt, sameScope, 61_000, 60_000)).toBe(false);
  });
});
