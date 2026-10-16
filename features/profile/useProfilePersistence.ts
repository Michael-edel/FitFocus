import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { UserProfile } from '../../types';
import { normalizeUserProfiles, persistAllUsersSnapshot } from '../../storage/hybrid';

type ProfileSyncState = 'idle' | 'saving' | 'saved' | 'error';

type UseProfilePersistenceParams = {
  googleSubject?: string;
  suppressNextFullProfileSyncRef: MutableRefObject<boolean>;
  suppressProfileSyncStateRef: MutableRefObject<boolean>;
  hasPendingProfileChangesRef: MutableRefObject<boolean>;
  setCurrentUser: Dispatch<SetStateAction<UserProfile | null>>;
  setAllUsers: Dispatch<SetStateAction<UserProfile[]>>;
  setProfileSyncState: Dispatch<SetStateAction<ProfileSyncState>>;
};

/**
 * Keeps local profile updates atomic from the UI's perspective: current-user
 * state and the legacy local snapshot are updated together before cloud sync.
 */
export function useProfilePersistence({
  googleSubject,
  suppressNextFullProfileSyncRef,
  suppressProfileSyncStateRef,
  hasPendingProfileChangesRef,
  setCurrentUser,
  setAllUsers,
  setProfileSyncState,
}: UseProfilePersistenceParams) {
  return useCallback((updated: UserProfile) => {
    setCurrentUser(updated);
    if (!suppressProfileSyncStateRef.current) {
      setProfileSyncState('saving');
    }
    if (googleSubject && !suppressNextFullProfileSyncRef.current) {
      hasPendingProfileChangesRef.current = true;
    }
    setAllUsers((previous) => {
      const found = previous.some((user) => user.id === updated.id);
      const next = found
        ? previous.map((user) => (user.id === updated.id ? updated : user))
        : [updated, ...previous];
      const normalized = normalizeUserProfiles(next);
      persistAllUsersSnapshot(updated.id, normalized);
      return normalized;
    });
  }, [
    googleSubject,
    hasPendingProfileChangesRef,
    setAllUsers,
    setCurrentUser,
    setProfileSyncState,
    suppressNextFullProfileSyncRef,
    suppressProfileSyncStateRef,
  ]);
}
