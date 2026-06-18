import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { UserProfile } from './types';
import { persistAllUsersSnapshot, safeRemoveItem } from './storage/hybrid';

type UseDeleteUserProfileParams = {
  currentUserId: string | null | undefined;
  setAllUsers: Dispatch<SetStateAction<UserProfile[]>>;
  setAuthState: Dispatch<SetStateAction<'loading' | 'auth_choice' | 'register' | 'app'>>;
  setCurrentUser: Dispatch<SetStateAction<UserProfile | null>>;
};

export function useDeleteUserProfile({
  currentUserId,
  setAllUsers,
  setAuthState,
  setCurrentUser,
}: UseDeleteUserProfileParams) {
  return useCallback((userId: string) => {
    const prefix = `fitfocus_data_${userId}_`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) safeRemoveItem(k);
    }

    setAllUsers(prev => {
      const next = prev.filter(u => u.id !== userId);
      persistAllUsersSnapshot(currentUserId, next);
      return next;
    });

    if (currentUserId === userId) {
      setCurrentUser(null);
      setAuthState('auth_choice');
    }
  }, [currentUserId, setAllUsers, setAuthState, setCurrentUser]);
}
