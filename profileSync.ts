import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { UserProfile } from './types';
import { collectLocalStateItems, persistAllUsersSnapshot } from './storage/hybrid';

type ProfileSyncState = 'idle' | 'saving' | 'saved' | 'error';

type ProfileSyncDeps = {
  currentUser: UserProfile | null;
  setProfileSyncState: Dispatch<SetStateAction<ProfileSyncState>>;
  setLastProfileSyncAt: Dispatch<SetStateAction<number | null>>;
  setAllUsers: Dispatch<SetStateAction<UserProfile[]>>;
  persistUser: (updated: UserProfile) => void;
  loginAsUser: (user: UserProfile) => Promise<void>;
  collectLocalStateItemsImpl?: typeof collectLocalStateItems;
  persistAllUsersSnapshotImpl?: typeof persistAllUsersSnapshot;
  fetchImpl?: typeof fetch;
  suppressNextFullProfileSyncRef?: MutableRefObject<boolean>;
};

function withFetch(fetchImpl?: typeof fetch) {
  return fetchImpl ?? fetch;
}

export async function pushProfileToCloud(profile: UserProfile, deps: ProfileSyncDeps): Promise<void> {
  const fetchFn = withFetch(deps.fetchImpl);
  deps.setProfileSyncState('saving');
  try {
    const stateItems = (deps.collectLocalStateItemsImpl ?? collectLocalStateItems)(profile.id);
    const r = await fetchFn('/api/profile', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...profile, stateItems }),
    });
    if (!r.ok) throw new Error('PROFILE_SYNC_FAILED');
    deps.setProfileSyncState('saved');
    deps.setLastProfileSyncAt(Date.now());
  } catch {
    deps.setProfileSyncState('error');
  }
}

export async function patchProfileInCloud(patch: Partial<UserProfile>, deps: ProfileSyncDeps): Promise<void> {
  if (!deps.currentUser) return;

  const nextUser = { ...deps.currentUser, ...patch } as UserProfile;
  if (deps.suppressNextFullProfileSyncRef) {
    deps.suppressNextFullProfileSyncRef.current = true;
  }
  deps.persistUser(nextUser);

  const fetchFn = withFetch(deps.fetchImpl);
  deps.setProfileSyncState('saving');
  try {
    const stateItems = (deps.collectLocalStateItemsImpl ?? collectLocalStateItems)(nextUser.id);
    const r = await fetchFn('/api/profile', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...patch, stateItems }),
    });
    if (!r.ok) throw new Error('PROFILE_PATCH_FAILED');
    const payload = await r.json().catch(() => null);
    const serverProfile = payload?.profile as UserProfile | undefined;
    if (serverProfile) {
      if (deps.suppressNextFullProfileSyncRef) {
        deps.suppressNextFullProfileSyncRef.current = true;
      }
      deps.persistUser(serverProfile);
    }
    deps.setProfileSyncState('saved');
    deps.setLastProfileSyncAt(Date.now());
  } catch {
    deps.setProfileSyncState('error');
  }
}

export async function syncAllLocalDataNow(deps: ProfileSyncDeps): Promise<void> {
  if (!deps.currentUser) return;
  await pushProfileToCloud(deps.currentUser, deps);
}

export async function reloadUserFromCloud(deps: ProfileSyncDeps): Promise<void> {
  if (!deps.currentUser) return;
  const fetchFn = withFetch(deps.fetchImpl);
  try {
    const pr = await fetchFn('/api/profile', { credentials: 'include' });
    if (!pr.ok) throw new Error('PROFILE_LOAD_FAILED');
    const pj = await pr.json();
    const profile = pj?.profile as UserProfile | null;
    if (!profile) return;
    await deps.loginAsUser(profile);
    deps.setAllUsers([profile]);
    (deps.persistAllUsersSnapshotImpl ?? persistAllUsersSnapshot)(deps.currentUser?.id ?? profile.id, [profile]);
    deps.setProfileSyncState('saved');
    deps.setLastProfileSyncAt(Date.now());
  } catch {
    deps.setProfileSyncState('error');
  }
}
