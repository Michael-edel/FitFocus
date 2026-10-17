import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { UserProfile } from './types';
import { isUserProfilePayload } from './profileValidation';
import { stateSync } from './storage/stateSync';
import type { UserStateRepository } from './storage/userStateRepository';
import type { OutboxOperation, OutboxReadGuard } from './storage/durableOutbox';

type ProfileSyncState = 'idle' | 'saving' | 'saved' | 'error';
type ProfileSyncDeps = {
  currentUser: UserProfile | null;
  repository: UserStateRepository | null;
  isCurrentSession: () => boolean;
  profileEditRevisionRef: MutableRefObject<number>;
  hasUncommittedDraft?: () => boolean;
  setProfileSyncState: Dispatch<SetStateAction<ProfileSyncState>>;
  setProfileSyncNote?: Dispatch<SetStateAction<string | null>>;
  setLastProfileSyncAt: Dispatch<SetStateAction<number | null>>;
  persistUser: (action: UserProfile | ((profile: UserProfile) => UserProfile)) => Promise<OutboxOperation | null>;
  applyRemoteProfile: (user: UserProfile) => void;
  syncStateImpl?: (accountId: string) => Promise<boolean>;
};

type ProfileReloadDeps = ProfileSyncDeps & {
  refreshProfileWithGuardImpl: (accountId: string) => Promise<{ value: string; readGuard: OutboxReadGuard } | null>;
  assertReadGuardImpl: (guard: OutboxReadGuard) => Promise<void>;
  setLoginReadGuard: (guard: OutboxReadGuard) => void;
};

function owns(profile: UserProfile, deps: ProfileSyncDeps): boolean {
  return deps.isCurrentSession() && deps.currentUser?.id === profile.id && deps.repository?.accountId === profile.id;
}

/** Local edits are committed by the editor. A flush never invents a new full snapshot or rebases a conflict. */
export async function pushProfileToCloud(profile: UserProfile, deps: ProfileSyncDeps): Promise<void> {
  if (!owns(profile, deps)) return;
  if (deps.hasUncommittedDraft?.()) {
    deps.setProfileSyncNote?.('Сначала сохраните или отмените изменения формы профиля.');
    return;
  }
  const revision = deps.profileEditRevisionRef.current;
  const current = () => owns(profile, deps) && revision === deps.profileEditRevisionRef.current;
  deps.setProfileSyncState('saving');
  deps.setProfileSyncNote?.(null);
  try {
    await deps.repository!.waitForWrites('profile');
    if (!current()) return;
    const complete = await (deps.syncStateImpl ?? (id => stateSync.syncNow(id)))(profile.id);
    if (!current()) return;
    if (!complete) {
      deps.setProfileSyncState('error');
      deps.setProfileSyncNote?.('Изменения сохранены локально. Синхронизация ожидает сеть, доступ или разрешение конфликта.');
      return;
    }
    deps.setProfileSyncState('saved');
    deps.setProfileSyncNote?.('Синхронизировано с облаком.');
    deps.setLastProfileSyncAt(Date.now());
  } catch (error) {
    if (!current()) return;
    deps.setProfileSyncState('error');
    deps.setProfileSyncNote?.(error instanceof Error ? error.message : 'Не удалось сохранить изменения.');
  }
}

export async function patchProfileInCloud(patch: Partial<UserProfile>, deps: ProfileSyncDeps): Promise<boolean> {
  const current = deps.currentUser;
  if (!current || !owns(current, deps)) return false;
  try {
    // Functional editing preserves earlier patches even when React has not rendered between calls.
    const operation = await deps.persistUser(previous => ({ ...previous, ...patch, id: previous.id, version: previous.version }));
    if (!owns(current, deps) || !operation) return false;
    if (operation.status === 'conflicted') {
      deps.setProfileSyncState('error');
      deps.setProfileSyncNote?.('Локальное изменение сохранено как конфликт. Автоматическая перезапись остановлена.');
      return true;
    }
    await pushProfileToCloud(current, deps);
    return true;
  } catch (error) {
    if (!owns(current, deps)) return false;
    deps.setProfileSyncState('error');
    deps.setProfileSyncNote?.(error instanceof Error ? error.message : 'Не удалось сохранить профиль локально.');
    return false;
  }
}

export async function syncAllLocalDataNow(deps: ProfileSyncDeps): Promise<void> {
  if (deps.currentUser) await pushProfileToCloud(deps.currentUser, deps);
}

export async function reloadUserFromCloud(deps: ProfileReloadDeps): Promise<void> {
  const current = deps.currentUser;
  if (!current || !owns(current, deps)) return;
  if (deps.hasUncommittedDraft?.()) {
    deps.setProfileSyncNote?.('Сначала сохраните или отмените изменения формы профиля.');
    return;
  }
  const revision = deps.profileEditRevisionRef.current;
  try {
    const refreshed = await deps.refreshProfileWithGuardImpl(current.id);
    if (!owns(current, deps) || revision !== deps.profileEditRevisionRef.current) return;
    if (refreshed === null) {
      deps.setProfileSyncNote?.('Обновление профиля не применено: проверьте сессию и ожидающие локальные изменения.');
      return;
    }
    const profile: unknown = JSON.parse(refreshed.value);
    if (!isUserProfilePayload(profile) || profile.id !== current.id) throw new Error('PROFILE_INVALID_RESPONSE');
    if (refreshed.readGuard.accountId !== current.id) return;
    await deps.assertReadGuardImpl(refreshed.readGuard);
    if (!owns(current, deps) || revision !== deps.profileEditRevisionRef.current) return;
    deps.setLoginReadGuard(refreshed.readGuard);
    // Replace only the profile editor, synchronously; no disabled edit window during state rehydration.
    deps.applyRemoteProfile(profile);
  } catch (error) {
    if (!owns(current, deps) || revision !== deps.profileEditRevisionRef.current) return;
    deps.setProfileSyncState('error');
    deps.setProfileSyncNote?.(error instanceof Error ? error.message : 'Не удалось загрузить профиль.');
  }
}
