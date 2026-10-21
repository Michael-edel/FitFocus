import { useEffect, useRef, type MutableRefObject } from 'react';

export type CloudSyncRecoveryAction = 'none' | 'flush-local' | 'reload-cloud';

export type CloudSyncRecoveryAttempt = { scopeKey: string; attemptedAtMs: number };

export function cloudSyncRecoveryScopeKey({ cloudUserId, currentUserId, sessionKey }: {
  cloudUserId?: string;
  currentUserId?: string;
  sessionKey?: string | null;
}): string {
  return JSON.stringify([cloudUserId ?? null, currentUserId ?? null, sessionKey ?? null]);
}

export function isCloudSyncRecoveryWithinCooldown(
  lastAttempt: CloudSyncRecoveryAttempt | null,
  scopeKey: string,
  nowMs: number,
  cooldownMs: number,
): boolean {
  return lastAttempt?.scopeKey === scopeKey && nowMs - lastAttempt.attemptedAtMs < cooldownMs;
}

export function selectCloudSyncRecoveryAction({
  cloudUserId,
  currentUserId,
  isVisible,
  withinCooldown,
  hasPendingChanges,
  profileSyncState,
}: {
  cloudUserId?: string;
  currentUserId?: string;
  isVisible: boolean;
  withinCooldown: boolean;
  hasPendingChanges: boolean;
  profileSyncState: 'idle' | 'saving' | 'saved' | 'error';
}): CloudSyncRecoveryAction {
  if (!cloudUserId || !currentUserId || cloudUserId !== currentUserId || !isVisible || withinCooldown) return 'none';
  return hasPendingChanges || profileSyncState === 'error' ? 'flush-local' : 'reload-cloud';
}

/** Recovers cloud state when the browser reconnects without overwriting queued local work. */
export function useCloudSyncRecovery({
  cloudUserId,
  currentUserId,
  sessionKey,
  profileSyncState,
  hasPendingProfileChangesRef,
  syncAllLocalDataNow,
  reloadUserFromCloud,
  cooldownMs = 60_000,
}: {
  cloudUserId: string | undefined;
  currentUserId: string | undefined;
  sessionKey: string | null;
  profileSyncState: 'idle' | 'saving' | 'saved' | 'error';
  hasPendingProfileChangesRef: MutableRefObject<boolean>;
  syncAllLocalDataNow: () => Promise<void>;
  reloadUserFromCloud: () => Promise<void>;
  cooldownMs?: number;
}) {
  const lastAttemptRef = useRef<CloudSyncRecoveryAttempt | null>(null);
  const recoveryScopeKey = cloudSyncRecoveryScopeKey({ cloudUserId, currentUserId, sessionKey });

  useEffect(() => {
    if (!cloudUserId || !currentUserId) return;
    const syncFromCloud = () => {
      const now = Date.now();
      const action = selectCloudSyncRecoveryAction({
        cloudUserId,
        currentUserId,
        isVisible: !document.visibilityState || document.visibilityState === 'visible',
        withinCooldown: isCloudSyncRecoveryWithinCooldown(lastAttemptRef.current, recoveryScopeKey, now, cooldownMs),
        hasPendingChanges: hasPendingProfileChangesRef.current,
        profileSyncState,
      });
      if (action === 'none') return;
      lastAttemptRef.current = { scopeKey: recoveryScopeKey, attemptedAtMs: now };
      if (action === 'flush-local') {
        void syncAllLocalDataNow();
        return;
      }
      void reloadUserFromCloud();
    };
    window.addEventListener('online', syncFromCloud);
    document.addEventListener('visibilitychange', syncFromCloud);
    return () => {
      window.removeEventListener('online', syncFromCloud);
      document.removeEventListener('visibilitychange', syncFromCloud);
    };
  }, [cloudUserId, cooldownMs, currentUserId, hasPendingProfileChangesRef, profileSyncState, recoveryScopeKey, reloadUserFromCloud, syncAllLocalDataNow]);
}
