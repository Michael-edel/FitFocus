import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { UserProfile } from './types';
import { collectLocalStateItems, persistAllUsersSnapshot, readStoredAllUsersSnapshotForUser } from './storage/hybrid';

type ProfileSyncState = 'idle' | 'saving' | 'saved' | 'error';

type ProfileSyncDeps = {
  currentUser: UserProfile | null;
  setProfileSyncState: Dispatch<SetStateAction<ProfileSyncState>>;
  setProfileSyncNote?: Dispatch<SetStateAction<string | null>>;
  setLastProfileSyncAt: Dispatch<SetStateAction<number | null>>;
  setAllUsers: Dispatch<SetStateAction<UserProfile[]>>;
  persistUser: (updated: UserProfile) => void;
  loginAsUser: (user: UserProfile) => Promise<void>;
  collectLocalStateItemsImpl?: typeof collectLocalStateItems;
  persistAllUsersSnapshotImpl?: typeof persistAllUsersSnapshot;
  fetchImpl?: typeof fetch;
  suppressNextFullProfileSyncRef?: MutableRefObject<boolean>;
  suppressProfileSyncStateRef?: MutableRefObject<boolean>;
};

function withFetch(fetchImpl?: typeof fetch) {
  return fetchImpl ?? fetch;
}

const PROFILE_SYNC_TIMEOUT_MS = 15_000;

let profileSyncQueue: Promise<void> = Promise.resolve();

function enqueueProfileSync(operation: () => Promise<void>): Promise<void> {
  const queuedOperation = profileSyncQueue.then(operation, operation);
  profileSyncQueue = queuedOperation.catch(() => undefined);
  return queuedOperation;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit | undefined, fetchImpl?: typeof fetch) {
  const fetchFn = withFetch(fetchImpl);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(new Error('PROFILE_SYNC_TIMEOUT')), PROFILE_SYNC_TIMEOUT_MS)
    : null;
  try {
    return await fetchFn(input, {
      ...(init || {}),
      signal: controller?.signal,
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error.message === 'PROFILE_SYNC_TIMEOUT')) {
      throw new Error('Сервер слишком долго отвечает. Проверьте сеть и повторите синхронизацию.');
    }
    throw error;
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
}

function isAccessDeniedStatus(status: number) {
  return status === 401 || status === 403;
}

async function readApiErrorMessage(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null);
  const message = typeof payload?.message === 'string' && payload.message.trim()
    ? payload.message.trim()
    : typeof payload?.error?.message === 'string' && payload.error.message.trim()
      ? payload.error.message.trim()
      : typeof payload?.error === 'string' && payload.error.trim()
        ? payload.error.trim()
        : '';
  return message || fallback;
}

async function handleProfileConflict(
  response: Response,
  deps: ProfileSyncDeps,
): Promise<UserProfile | null> {
  const payload = await response.json().catch(() => null);
  const serverProfile = payload?.profile as UserProfile | undefined;
  if (!serverProfile) return null;
  if (deps.suppressNextFullProfileSyncRef) {
    deps.suppressNextFullProfileSyncRef.current = true;
  }
  if (deps.suppressProfileSyncStateRef) {
    deps.suppressProfileSyncStateRef.current = true;
  }
  deps.setProfileSyncNote?.('Обнаружен конфликт версий. Обновляем данные и повторяем синхронизацию.');
  deps.persistUser(serverProfile);
  await deps.loginAsUser(serverProfile);
  return serverProfile;
}

function buildRetryProfile(localProfile: UserProfile, serverProfile: UserProfile): UserProfile {
  return {
    ...serverProfile,
    ...localProfile,
    version: serverProfile.version ?? localProfile.version ?? 0,
  };
}

async function pushProfileToCloudNow(profile: UserProfile, deps: ProfileSyncDeps): Promise<void> {
  deps.setProfileSyncNote?.(null);
  deps.setProfileSyncState('saving');
  try {
    const stateItems = (deps.collectLocalStateItemsImpl ?? collectLocalStateItems)(profile.id);
    const body = { ...profile, baseVersion: profile.version ?? 0, stateItems };
    const r = await fetchWithTimeout('/api/profile', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, deps.fetchImpl);
    if (isAccessDeniedStatus(r.status)) {
      deps.setProfileSyncNote?.('Облачная синхронизация недоступна для этой сессии.');
      deps.setProfileSyncState('idle');
      return;
    }
    if (r.status === 409) {
      const serverProfile = await handleProfileConflict(r, deps);
      if (serverProfile) {
        const retryProfile = buildRetryProfile(profile, serverProfile);
        const retry = await fetchWithTimeout('/api/profile', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...retryProfile, baseVersion: serverProfile.version ?? 0, stateItems }),
        }, deps.fetchImpl);
        const retryPayload = await retry.json().catch(() => null);
        if (retry.ok && retryPayload?.profile) {
          if (deps.suppressNextFullProfileSyncRef) {
            deps.suppressNextFullProfileSyncRef.current = true;
          }
          if (deps.suppressProfileSyncStateRef) {
            deps.suppressProfileSyncStateRef.current = true;
          }
          deps.persistUser(retryPayload.profile as UserProfile);
          deps.setProfileSyncState('saved');
          deps.setLastProfileSyncAt(Date.now());
          return;
        }
      }
    }
    const payload = await r.json().catch(() => null);
    if (!r.ok) {
      const message = typeof payload?.message === 'string' && payload.message.trim()
        ? payload.message.trim()
        : typeof payload?.error?.message === 'string' && payload.error.message.trim()
          ? payload.error.message.trim()
          : typeof payload?.error === 'string' && payload.error.trim()
            ? payload.error.trim()
            : 'PROFILE_SYNC_FAILED';
      throw new Error(message);
    }
    const serverProfile = payload?.profile as UserProfile | undefined;
    if (serverProfile) {
      if (deps.suppressNextFullProfileSyncRef) {
        deps.suppressNextFullProfileSyncRef.current = true;
      }
      if (deps.suppressProfileSyncStateRef) {
        deps.suppressProfileSyncStateRef.current = true;
      }
      deps.persistUser(serverProfile);
    }
    deps.setProfileSyncState('saved');
    deps.setProfileSyncNote?.('Синхронизировано с облаком.');
    deps.setLastProfileSyncAt(Date.now());
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Не удалось сохранить изменения в облако.';
    deps.setProfileSyncNote?.(message);
    deps.setProfileSyncState('error');
  } finally {
    if (deps.suppressProfileSyncStateRef) {
      deps.suppressProfileSyncStateRef.current = false;
    }
  }
}

async function patchProfileInCloudNow(patch: Partial<UserProfile>, deps: ProfileSyncDeps): Promise<void> {
  if (!deps.currentUser) return;

  const nextUser = { ...deps.currentUser, ...patch } as UserProfile;
  if (deps.suppressNextFullProfileSyncRef) {
    deps.suppressNextFullProfileSyncRef.current = true;
  }
  if (deps.suppressProfileSyncStateRef) {
    deps.suppressProfileSyncStateRef.current = true;
  }
  deps.persistUser(nextUser);

  deps.setProfileSyncNote?.(null);
  deps.setProfileSyncState('saving');
  try {
    const stateItems = (deps.collectLocalStateItemsImpl ?? collectLocalStateItems)(nextUser.id);
    const r = await fetchWithTimeout('/api/profile', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...patch, baseVersion: deps.currentUser.version ?? 0, stateItems }),
    }, deps.fetchImpl);
    if (isAccessDeniedStatus(r.status)) {
      deps.setProfileSyncNote?.('Облачная синхронизация недоступна для этой сессии.');
      deps.setProfileSyncState('idle');
      return;
    }
    if (r.status === 409) {
      const serverProfile = await handleProfileConflict(r, deps);
      if (serverProfile) {
        const retryProfile = buildRetryProfile(nextUser, serverProfile);
        const retry = await fetchWithTimeout('/api/profile', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...retryProfile, ...patch, baseVersion: serverProfile.version ?? 0, stateItems }),
        }, deps.fetchImpl);
        const retryPayload = await retry.json().catch(() => null);
        if (retry.ok && retryPayload?.profile) {
          if (deps.suppressNextFullProfileSyncRef) {
            deps.suppressNextFullProfileSyncRef.current = true;
          }
          if (deps.suppressProfileSyncStateRef) {
            deps.suppressProfileSyncStateRef.current = true;
          }
          deps.persistUser(retryPayload.profile as UserProfile);
          deps.setProfileSyncState('saved');
          deps.setLastProfileSyncAt(Date.now());
          return;
        }
      }
    }
    const payload = await r.json().catch(() => null);
    if (!r.ok) {
      const message = typeof payload?.message === 'string' && payload.message.trim()
        ? payload.message.trim()
        : typeof payload?.error?.message === 'string' && payload.error.message.trim()
          ? payload.error.message.trim()
          : typeof payload?.error === 'string' && payload.error.trim()
            ? payload.error.trim()
            : 'PROFILE_PATCH_FAILED';
      throw new Error(message);
    }
    const serverProfile = payload?.profile as UserProfile | undefined;
    if (serverProfile) {
      if (deps.suppressNextFullProfileSyncRef) {
        deps.suppressNextFullProfileSyncRef.current = true;
      }
      if (deps.suppressProfileSyncStateRef) {
        deps.suppressProfileSyncStateRef.current = true;
      }
      deps.persistUser(serverProfile);
    }
    deps.setProfileSyncState('saved');
    deps.setProfileSyncNote?.('Синхронизировано с облаком.');
    deps.setLastProfileSyncAt(Date.now());
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Не удалось сохранить изменения в облако.';
    deps.setProfileSyncNote?.(message);
    deps.setProfileSyncState('error');
  } finally {
    if (deps.suppressProfileSyncStateRef) {
      deps.suppressProfileSyncStateRef.current = false;
    }
  }
}

export function pushProfileToCloud(profile: UserProfile, deps: ProfileSyncDeps): Promise<void> {
  return enqueueProfileSync(() => pushProfileToCloudNow(profile, deps));
}

export function patchProfileInCloud(patch: Partial<UserProfile>, deps: ProfileSyncDeps): Promise<void> {
  return enqueueProfileSync(() => patchProfileInCloudNow(patch, deps));
}

export async function syncAllLocalDataNow(deps: ProfileSyncDeps): Promise<void> {
  if (!deps.currentUser) return;
  await pushProfileToCloud(deps.currentUser, deps);
}

export async function reloadUserFromCloud(deps: ProfileSyncDeps): Promise<void> {
  if (!deps.currentUser) return;
  try {
    const pr = await fetchWithTimeout('/api/profile', { credentials: 'include' }, deps.fetchImpl);
    if (isAccessDeniedStatus(pr.status)) {
      deps.setProfileSyncNote?.('Облачная синхронизация недоступна для этой сессии.');
      deps.setProfileSyncState('idle');
      return;
    }
    if (!pr.ok) {
      throw new Error(await readApiErrorMessage(pr, 'PROFILE_LOAD_FAILED'));
    }
    const pj = await pr.json();
    const profile = pj?.profile as UserProfile | null;
    if (!profile) return;
    if (deps.suppressNextFullProfileSyncRef) {
      deps.suppressNextFullProfileSyncRef.current = true;
    }
    if (deps.suppressProfileSyncStateRef) {
      deps.suppressProfileSyncStateRef.current = true;
    }
    await deps.loginAsUser(profile);
    const storedAllUsers = readStoredAllUsersSnapshotForUser<UserProfile>(profile.id);
    const nextAllUsers = Array.isArray(storedAllUsers) && storedAllUsers.length > 0 ? storedAllUsers : [profile];
    deps.setAllUsers(nextAllUsers);
    (deps.persistAllUsersSnapshotImpl ?? persistAllUsersSnapshot)(profile.id, nextAllUsers);
    deps.setProfileSyncState('saved');
    deps.setProfileSyncNote?.('Профиль загружен из облака.');
    deps.setLastProfileSyncAt(Date.now());
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Не удалось загрузить профиль из облака.';
    deps.setProfileSyncNote?.(message);
    deps.setProfileSyncState('error');
  } finally {
    if (deps.suppressProfileSyncStateRef) {
      deps.suppressProfileSyncStateRef.current = false;
    }
  }
}
