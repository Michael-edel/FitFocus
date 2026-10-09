import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { UserProfile } from '../../types';

export type ProfileAutoSyncMode = 'none' | 'offline' | 'skip-once' | 'schedule';

type ProfileSyncState = 'idle' | 'saving' | 'saved' | 'error';

export function getProfileAutoSyncMode({
  currentUser,
  cloudUserId,
  suppressNextSync,
}: {
  currentUser: UserProfile | null;
  cloudUserId: string | undefined;
  suppressNextSync: boolean;
}): ProfileAutoSyncMode {
  if (!currentUser) return 'none';
  if (!cloudUserId) return 'offline';
  return suppressNextSync ? 'skip-once' : 'schedule';
}

/** Debounces profile writes while preserving the local-only and one-shot suppression paths. */
export function useProfileAutoSync({
  currentUser,
  cloudUserId,
  suppressNextFullProfileSyncRef,
  pushProfileToCloud,
  setProfileSyncState,
  setProfileSyncNote,
  setLastProfileSyncAt,
  debounceMs = 500,
}: {
  currentUser: UserProfile | null;
  cloudUserId: string | undefined;
  suppressNextFullProfileSyncRef: MutableRefObject<boolean>;
  pushProfileToCloud: (profile: UserProfile) => Promise<void>;
  setProfileSyncState: Dispatch<SetStateAction<ProfileSyncState>>;
  setProfileSyncNote: Dispatch<SetStateAction<string | null>>;
  setLastProfileSyncAt: Dispatch<SetStateAction<number | null>>;
  debounceMs?: number;
}) {
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const mode = getProfileAutoSyncMode({
      currentUser,
      cloudUserId,
      suppressNextSync: suppressNextFullProfileSyncRef.current,
    });
    if (mode === 'none') return;
    if (mode === 'offline') {
      setProfileSyncState('idle');
      setProfileSyncNote(null);
      setLastProfileSyncAt(null);
      return;
    }
    if (mode === 'skip-once') {
      suppressNextFullProfileSyncRef.current = false;
      return;
    }
    saveTimerRef.current = window.setTimeout(() => {
      void pushProfileToCloud(currentUser!);
    }, debounceMs);
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [cloudUserId, currentUser, debounceMs, pushProfileToCloud, setLastProfileSyncAt, setProfileSyncNote, setProfileSyncState, suppressNextFullProfileSyncRef]);
}