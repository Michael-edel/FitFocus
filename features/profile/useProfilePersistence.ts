import { useCallback, useEffect, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { UserProfile } from '../../types';
import { normalizeUserProfiles } from '../../storage/hybrid';
import { StateEditor } from '../../storage/stateEditor';
import { UserStateRepository } from '../../storage/userStateRepository';
import type { OutboxCommitGuard } from '../../storage/durableOutbox';

export type ProfileUpdate = UserProfile | ((profile: UserProfile) => UserProfile);

type ProfileSyncState = 'idle' | 'saving' | 'saved' | 'error';
const codec = {
  encode: (value: UserProfile) => JSON.stringify(value),
  // Login already restored the IDB profile and derived its display defaults.
  // Observe its revision without replacing that prepared working value a second time.
  decode: (_raw: string | null, fallback: UserProfile): UserProfile => fallback,
};

/** One editor per login owns both full edits and functional patches; reads never enqueue defaults. */
export function useProfilePersistence({ repository, currentUser, isCurrentSession, profileEditRevisionRef, hasPendingProfileChangesRef,
  setCurrentUser, setAllUsers, setProfileSyncState }: {
  repository: UserStateRepository | null;
  currentUser: UserProfile | null;
  isCurrentSession: () => boolean;
  profileEditRevisionRef: MutableRefObject<number>;
  hasPendingProfileChangesRef: MutableRefObject<boolean>;
  setCurrentUser: Dispatch<SetStateAction<UserProfile | null>>;
  setAllUsers: Dispatch<SetStateAction<UserProfile[]>>;
  setProfileSyncState: Dispatch<SetStateAction<ProfileSyncState>>;
}) {
  // The initial profile belongs to this repository/login, not to subsequent React renders.
  const editor = useMemo(() => repository && currentUser ? new StateEditor(repository, 'profile', currentUser, codec) : null, [repository]);
  useEffect(() => { void editor?.load(); }, [editor]);
  return useCallback((action: ProfileUpdate, guard?: OutboxCommitGuard) => {
    if (!editor || !repository || !isCurrentSession()) return Promise.resolve(null);
    if (guard) {
      const editRevision = profileEditRevisionRef.current;
      const current = guard.canCommit;
      const canCommit = () => isCurrentSession() && current() && editRevision === profileEditRevisionRef.current;
      const committed = editor.commitGenerated(previous => {
        const update = typeof action === 'function' ? action(previous) : action;
        if (update.id !== repository.accountId) throw new Error('OUTBOX_KEY_OWNERSHIP');
        return update;
      }, { readGuard: { ...guard.readGuard }, canCommit }).then(operation => {
        if (!canCommit()) return null;
        if (operation?.status !== 'pending') return operation;
        const update = editor.getSnapshot().value;
        if (update.id !== repository.accountId) throw new Error('OUTBOX_KEY_OWNERSHIP');
        profileEditRevisionRef.current += 1;
        setCurrentUser(update);
        setAllUsers(previous => normalizeUserProfiles(previous.some(user => user.id === update.id)
          ? previous.map(user => user.id === update.id ? update : user) : [update, ...previous]));
        hasPendingProfileChangesRef.current = true;
        setProfileSyncState('saving');
        return operation;
      });
      void committed.catch(() => { if (canCommit()) setProfileSyncState('error'); });
      return committed;
    }
    const update = typeof action === 'function' ? action(editor.getSnapshot().value) : action;
    if (update.id !== repository.accountId) return Promise.resolve(null);
    profileEditRevisionRef.current += 1;
    const committed = editor.set(update);
    setCurrentUser(update);
    setAllUsers(previous => normalizeUserProfiles(previous.some(user => user.id === update.id)
      ? previous.map(user => user.id === update.id ? update : user) : [update, ...previous]));
    hasPendingProfileChangesRef.current = true;
    setProfileSyncState('saving');
    // Callers can await the commit; event handlers that ignore it still get the shared storage notice.
    void committed.catch(() => { if (isCurrentSession()) setProfileSyncState('error'); });
    return committed;
  }, [editor, repository, isCurrentSession, profileEditRevisionRef, hasPendingProfileChangesRef, setAllUsers, setCurrentUser, setProfileSyncState]);
}
