import type { UserProfile } from '../types';
import { isUserProfilePayload } from '../profileValidation';
import { UserStateRepository } from './userStateRepository';
import { reportStateSaveIssue } from './stateSaveStatus';
import type { OutboxOperation } from './durableOutbox';

/** Registration creates an intent with baseVersion 0; an existing local profile is never adopted as its base. */
export async function createProfileIntent(profile: UserProfile, repository: UserStateRepository): Promise<OutboxOperation> {
  if (!isUserProfilePayload(profile) || profile.id !== repository.accountId || profile.version !== 0) throw new Error('PROFILE_INVALID_CREATE');
  const snapshot = await repository.observe('profile');
  if (snapshot.value !== null || snapshot.revision !== 0 || snapshot.confirmedVersion !== 0 || await repository.hasPending('profile')) {
    throw new Error('PROFILE_ALREADY_EXISTS');
  }
  const operation = await repository.writeJson('profile', profile);
  if (operation.status === 'conflicted') throw new Error('PROFILE_CREATE_CONFLICT');
  return operation;
}

/** Only account-owned IDB data can restore a local login; email/legacy display identity is not ownership proof. */
export async function readOwnedProfile(repository: UserStateRepository): Promise<UserProfile | null> {
  const snapshot = await repository.observe('profile');
  if (snapshot.value === null) return null;
  let saved: unknown;
  try { saved = JSON.parse(snapshot.value); } catch {}
  if (!isUserProfilePayload(saved) || saved.id !== repository.accountId) {
    reportStateSaveIssue({ accountId: repository.accountId, key: repository.key('profile'), kind: 'error', reason: 'invalid-profile-snapshot' });
    throw new Error('PROFILE_INVALID_LOCAL_SNAPSHOT');
  }
  return { ...saved, version: snapshot.confirmedVersion };
}

/** Bootstrap may seed an empty profile, but cannot replace an existing local snapshot. */
export async function restoreProfile(repository: UserStateRepository, incoming: UserProfile): Promise<UserProfile> {
  if (incoming.id !== repository.accountId) throw new Error('PROFILE_ACCOUNT_MISMATCH');
  const first = await repository.observe('profile');
  if (first.value === null && first.revision === 0 && typeof incoming.version === 'number'
    && Number.isSafeInteger(incoming.version) && incoming.version > 0) {
    await repository.hydrate('profile', { value: JSON.stringify(incoming), version: incoming.version, exists: true }, first.revision);
  }
  return await readOwnedProfile(repository) ?? incoming;
}
