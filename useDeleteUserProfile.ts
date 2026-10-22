import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { UserProfile } from './types';
import { clearLocalUserData, persistAllUsersSnapshot } from './storage/hybrid';

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
  return useCallback(async (userId: string) => {
    const cleanup = await clearLocalUserData(userId);

    setAllUsers(prev => {
      const next = prev.filter(u => u.id !== userId);
      if (currentUserId && currentUserId !== userId) persistAllUsersSnapshot(currentUserId, next);
      return next;
    });

    if (currentUserId === userId) {
      setCurrentUser(null);
      setAuthState('auth_choice');
    }
    if (!cleanup.complete) {
      const reasons = [
        !cleanup.localStorageCleared ? 'часть данных localStorage недоступна для удаления' : '',
        !cleanup.indexedDbCleared ? 'не удалось полностью очистить IndexedDB' : '',
        cleanup.legacyEvidenceRetained ? 'legacy-очередь содержит записи аккаунта или неразбираемые данные; она сохранена для безопасной миграции' : '',
      ].filter(Boolean);
      alert(`Локальная очистка завершена не полностью: ${reasons.join('; ')}.`);
    }
  }, [currentUserId, setAllUsers, setAuthState, setCurrentUser]);
}
