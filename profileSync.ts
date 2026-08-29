import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { UserProfile } from './types';
import {
  applyRemoteStateItems,
  collectLocalStateItems,
  persistAllUsersSnapshot,
  readStoredAllUsersSnapshotForUser,
  rememberRemoteStateVersion,
} from './storage/hybrid';

type ProfileSyncState = 'idle' | 'saving' | 'saved' | 'error';
type LocalStateItem = { key: string; value: string; baseVersion?: number };
type JsonRecord = Record<string, unknown>;

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

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function readJsonRecord(response: Response): Promise<JsonRecord | null> {
  const payload: unknown = await response.json().catch(() => null);
  return isJsonRecord(payload) ? payload : null;
}

function readUserProfile(value: unknown): UserProfile | null {
  if (!isJsonRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return null;
  if (typeof value.weight !== 'number' || typeof value.height !== 'number' || typeof value.age !== 'number') return null;
  if (!Array.isArray(value.weightHistory) || !Array.isArray(value.familyMembers)) return null;
  return value as unknown as UserProfile;
}

async function readApiErrorMessage(response: Response, fallback: string): Promise<string> {
  const payload = await readJsonRecord(response);
  const message = typeof payload?.message === 'string' && payload.message.trim()
    ? payload.message.trim()
    : isJsonRecord(payload?.error) && typeof payload.error.message === 'string' && payload.error.message.trim()
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
  const payload = await readJsonRecord(response);
  const serverProfile = readUserProfile(payload?.profile);
  if (!serverProfile) return null;
  deps.setProfileSyncNote?.('Обнаружен конфликт версий. Облачные данные сохранены, автоматическая перезапись остановлена.');
  return serverProfile;
}

async function syncStateItemsToCloud(items: LocalStateItem[], fetchImpl?: typeof fetch): Promise<boolean> {
  if (!items.length) return true;
  const response = await fetchWithTimeout('/api/state', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  }, fetchImpl);
  const payload = await readJsonRecord(response);
  if (response.ok) {
    if (Array.isArray(payload?.items)) {
      for (const item of payload.items) {
        if (!isJsonRecord(item) || typeof item.key !== 'string' || typeof item.version !== 'number') continue;
        rememberRemoteStateVersion(item.key, item.version);
      }
    }
    return true;
  }
  if (response.status === 409 && typeof payload?.key === 'string' && typeof payload.value === 'string') {
    applyRemoteStateItems([{ key: payload.key, value: payload.value, version: typeof payload.version === 'number' ? payload.version : undefined }]);
  }
  return false;
}

async function pushProfileToCloudNow(profile: UserProfile, deps: ProfileSyncDeps): Promise<void> {
  deps.setProfileSyncNote?.(null);
  deps.setProfileSyncState('saving');
  try {
    const stateItems: LocalStateItem[] = (deps.collectLocalStateItemsImpl ?? collectLocalStateItems)(profile.id);
    const body = { ...profile, baseVersion: profile.version ?? 0 };
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
        deps.setProfileSyncState('error');
        return;
      }
    }
    const payload = await readJsonRecord(r);
    if (!r.ok) {
      const message = typeof payload?.message === 'string' && payload.message.trim()
        ? payload.message.trim()
        : isJsonRecord(payload?.error) && typeof payload.error.message === 'string' && payload.error.message.trim()
          ? payload.error.message.trim()
          : typeof payload?.error === 'string' && payload.error.trim()
            ? payload.error.trim()
            : 'PROFILE_SYNC_FAILED';
      throw new Error(message);
    }
    const serverProfile = readUserProfile(payload?.profile);
    if (serverProfile) {
      if (deps.suppressNextFullProfileSyncRef) {
        deps.suppressNextFullProfileSyncRef.current = true;
      }
      if (deps.suppressProfileSyncStateRef) {
        deps.suppressProfileSyncStateRef.current = true;
      }
      deps.persistUser(serverProfile);
    }
    if (!(await syncStateItemsToCloud(stateItems, deps.fetchImpl))) {
      deps.setProfileSyncNote?.('Профиль сохранён, но часть локальных данных не синхронизирована. Повторите синхронизацию.');
      deps.setProfileSyncState('error');
      return;
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
    const stateItems: LocalStateItem[] = (deps.collectLocalStateItemsImpl ?? collectLocalStateItems)(nextUser.id);
    const r = await fetchWithTimeout('/api/profile', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...patch, baseVersion: deps.currentUser.version ?? 0 }),
    }, deps.fetchImpl);
    if (isAccessDeniedStatus(r.status)) {
      deps.setProfileSyncNote?.('Облачная синхронизация недоступна для этой сессии.');
      deps.setProfileSyncState('idle');
      return;
    }
    if (r.status === 409) {
      const serverProfile = await handleProfileConflict(r, deps);
      if (serverProfile) {
        const retry = await fetchWithTimeout('/api/profile', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...patch, baseVersion: serverProfile.version ?? 0 }),
        }, deps.fetchImpl);
        const retryPayload = await readJsonRecord(retry);
        const retryProfile = readUserProfile(retryPayload?.profile);
        if (retry.ok && retryProfile) {
          if (deps.suppressNextFullProfileSyncRef) {
            deps.suppressNextFullProfileSyncRef.current = true;
          }
          if (deps.suppressProfileSyncStateRef) {
            deps.suppressProfileSyncStateRef.current = true;
          }
          deps.persistUser(retryProfile);
          if (!(await syncStateItemsToCloud(stateItems, deps.fetchImpl))) {
            deps.setProfileSyncNote?.('Изменение профиля сохранено, но часть локальных данных не синхронизирована. Повторите синхронизацию.');
            deps.setProfileSyncState('error');
            return;
          }
          deps.setProfileSyncState('saved');
          deps.setLastProfileSyncAt(Date.now());
          return;
        }
        deps.setProfileSyncState('error');
        return;
      }
    }
    const payload = await readJsonRecord(r);
    if (!r.ok) {
      const message = typeof payload?.message === 'string' && payload.message.trim()
        ? payload.message.trim()
        : isJsonRecord(payload?.error) && typeof payload.error.message === 'string' && payload.error.message.trim()
          ? payload.error.message.trim()
          : typeof payload?.error === 'string' && payload.error.trim()
            ? payload.error.trim()
            : 'PROFILE_PATCH_FAILED';
      throw new Error(message);
    }
    const serverProfile = readUserProfile(payload?.profile);
    if (serverProfile) {
      if (deps.suppressNextFullProfileSyncRef) {
        deps.suppressNextFullProfileSyncRef.current = true;
      }
      if (deps.suppressProfileSyncStateRef) {
        deps.suppressProfileSyncStateRef.current = true;
      }
      deps.persistUser(serverProfile);
    }
    if (!(await syncStateItemsToCloud(stateItems, deps.fetchImpl))) {
      deps.setProfileSyncNote?.('Изменение профиля сохранено, но часть локальных данных не синхронизирована. Повторите синхронизацию.');
      deps.setProfileSyncState('error');
      return;
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
    const payload = await readJsonRecord(pr);
    if (payload?.profile === null || payload?.profile === undefined) return;
    const profile = readUserProfile(payload.profile);
    if (!profile) throw new Error('PROFILE_INVALID_RESPONSE');
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
