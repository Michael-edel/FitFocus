import type { UserProfile } from '../types';
import { isUserProfilePayload } from '../profileValidation';
import { UserStateRepository } from './userStateRepository';
import { reportStateSaveIssue } from './stateSaveStatus';

/** Bootstrap may seed an empty profile, but cannot replace an existing local snapshot. */
export async function restoreProfile(repository: UserStateRepository, incoming: UserProfile): Promise<UserProfile> {
  if (incoming.id !== repository.accountId) throw new Error('PROFILE_ACCOUNT_MISMATCH');
  const first = await repository.observe('profile');
  if (first.value === null && first.revision === 0 && typeof incoming.version === 'number'
    && Number.isSafeInteger(incoming.version) && incoming.version > 0) {
    await repository.hydrate('profile', { value: JSON.stringify(incoming), version: incoming.version, exists: true }, first.revision);
  }
  const snapshot = await repository.observe('profile');
  if (snapshot.value === null) return incoming;
  let saved: unknown;
  try { saved = JSON.parse(snapshot.value); } catch {}
  if (!isUserProfilePayload(saved) || saved.id !== repository.accountId) {
    reportStateSaveIssue({ accountId: repository.accountId, key: repository.key('profile'), kind: 'error', reason: 'invalid-profile-snapshot' });
    throw new Error('PROFILE_INVALID_LOCAL_SNAPSHOT');
  }
  return { ...saved, version: snapshot.confirmedVersion };
}
