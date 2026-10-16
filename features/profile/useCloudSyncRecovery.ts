import { useEffect, useRef, type MutableRefObject } from 'react';

export type CloudSyncRecoveryAction = 'none' | 'flush-local' | 'reload-cloud';

export function selectCloudSyncRecoveryAction({
  hasCloudSession,
  hasCurrentUser,
  isVisible,
  withinCooldown,
  hasPendingChanges,
  profileSyncState,
}: {
  hasCloudSession: boolean;
  hasCurrentUser: boolean;
  isVisible: boolean;
  withinCooldown: boolean;
  hasPendingChanges: boolean;
  profileSyncState: 'idle' | 'saving' | 'saved' | 'error';
}): CloudSyncRecoveryAction {
  if (!hasCloudSession || !hasCurrentUser || !isVisible || withinCooldown) return 'none';
  return hasPendingChanges || profileSyncState === 'error' ? 'flush-local' : 'reload-cloud';
}

/** Recovers cloud state when the browser reconnects without overwriting queued local work. */
export function useCloudSyncRecovery({
  cloudUserId,
  currentUserId,
  profileSyncState,
  hasPendingProfileChangesRef,
  syncAllLocalDataNow,
  reloadUserFromCloud,
  cooldownMs = 60_000,
}: {
  cloudUserId: string | undefined;
  currentUserId: string | undefined;
  profileSyncState: 'idle' | 'saving' | 'saved' | 'error';
  hasPendingProfileChangesRef: MutableRefObject<boolean>;
  syncAllLocalDataNow: () => Promise<void>;
  reloadUserFromCloud: () => Promise<void>;
  cooldownMs?: number;
}) {
  const lastAttemptAtRef = useRef(0);

  useEffect(() => {
    if (!cloudUserId || !currentUserId) return;
    const syncFromCloud = () => {
      const now = Date.now();
      const action = selectCloudSyncRecoveryAction({
        hasCloudSession: true,
        hasCurrentUser: true,
        isVisible: !document.visibilityState || document.visibilityState === 'visible',
        withinCooldown: now - lastAttemptAtRef.current < cooldownMs,
        hasPendingChanges: hasPendingProfileChangesRef.current,
        profileSyncState,
      });
      if (action === 'none') return;
      lastAttemptAtRef.current = now;
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
  }, [cloudUserId, cooldownMs, currentUserId, hasPendingProfileChangesRef, profileSyncState, reloadUserFromCloud, syncAllLocalDataNow]);
}