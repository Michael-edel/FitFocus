import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { patchProfileInCloud, pushProfileToCloud, reloadUserFromCloud } from '../profileSync';
import { UserStateRepository } from '../storage/userStateRepository';
import { StateDatabase } from '../storage/stateDatabase';
import { DurableOutbox } from '../storage/durableOutbox';
import { restoreProfile } from '../storage/profileState';
import { userProfile } from './_helpers/userProfile';
import type { UserProfile } from '../types';
import type { OutboxReadGuard } from '../storage/durableOutbox';

let db: StateDatabase; let outbox: DurableOutbox; let repository: UserStateRepository;
const profile = userProfile();
beforeEach(async () => {
  db = new StateDatabase({ factory: new IDBFactory() }); outbox = new DurableOutbox(db);
  repository = new UserStateRepository(profile.id, { outbox });
  const guard = (await outbox.acceptReadSession(profile.id, 'a'.repeat(64), (await outbox.sessionState()).fence))!;
  await restoreProfile(repository, profile, guard);
});
afterEach(() => { db.close(); vi.restoreAllMocks(); });
function deps() {
  let draft = profile;
  const profileEditRevisionRef = { current: 0 };
  return { currentUser: profile, repository, profileEditRevisionRef, isCurrentSession: vi.fn(() => true),
    setProfileSyncState: vi.fn(), setProfileSyncNote: vi.fn(), setLastProfileSyncAt: vi.fn(),
    applyRemoteProfile: vi.fn(), syncStateImpl: vi.fn(async () => true),
    refreshProfileWithGuardImpl: vi.fn(async () => null as { value: string; readGuard: OutboxReadGuard } | null),
    assertReadGuardImpl: vi.fn(async () => {}), setLoginReadGuard: vi.fn(),
    persistUser: vi.fn((action: UserProfile | ((previous: UserProfile) => UserProfile)) => {
      draft = typeof action === 'function' ? action(draft) : action;
      profileEditRevisionRef.current += 1;
      return repository.writeJson('profile', draft);
    }),
  };
}
describe('durable profile actions', () => {
  it('flushes the owned queue without enqueueing a default snapshot', async () => {
    const d = deps(); await pushProfileToCloud(profile, d);
    expect(d.syncStateImpl).toHaveBeenCalledWith(profile.id); expect(await outbox.list(profile.id)).toEqual([]);
    expect(d.persistUser).not.toHaveBeenCalled(); expect(d.setProfileSyncState).toHaveBeenLastCalledWith('saved');
  });
  it('retains two rapid patches in one causally ordered profile editor', async () => {
    const d = deps(); d.syncStateImpl.mockResolvedValue(false);
    await Promise.all([patchProfileInCloud({ name: 'Новое имя' }, d), patchProfileInCloud({ weight: 68 }, d)]);
    const ops = (await outbox.list(profile.id)).sort((a, b) => a.revision - b.revision);
    expect(ops).toHaveLength(2); expect(ops[1]).toMatchObject({ resource: 'profile', status: 'pending', parentOpId: ops[0].opId });
    expect(JSON.parse((await outbox.snapshot(profile.id, repository.key('profile'))).value!)).toMatchObject({ name: 'Новое имя', weight: 68 });
  });
  it('uses a durable session-bound local commit for settings patches', async () => {
    const loginGuard: OutboxReadGuard = {
      accountId: profile.id, serverSessionId: 'a'.repeat(64), sessionEpoch: 'active-epoch', authFence: 1,
    };
    const d = { ...deps(), loginGuard };
    d.syncStateImpl.mockResolvedValue(false);

    expect(await patchProfileInCloud({ name: 'Сохранённая форма' }, d)).toBe(true);

    expect(d.persistUser).toHaveBeenCalledWith(expect.any(Function), {
      localCommitGuard: {
        accountId: loginGuard.accountId,
        serverSessionId: loginGuard.serverSessionId,
        sessionEpoch: loginGuard.sessionEpoch,
      },
      canCommit: expect.any(Function),
    }, { durable: true });
    expect(await outbox.list(profile.id)).toHaveLength(1);
  });
  it('does not show success while the sender retains an intent', async () => {
    const d = deps(); d.syncStateImpl.mockResolvedValue(false); await pushProfileToCloud(profile, d);
    expect(d.setProfileSyncState).toHaveBeenLastCalledWith('error'); expect(d.setLastProfileSyncAt).not.toHaveBeenCalled();
  });
  it.each(['session', 'edit'])('ignores a late flush after a newer %s', async (change) => {
    const d = deps(); d.syncStateImpl.mockImplementation(async () => {
      if (change === 'session') d.isCurrentSession.mockReturnValue(false); else d.profileEditRevisionRef.current += 1;
      return true;
    });
    await pushProfileToCloud(profile, d);
    expect(d.setLastProfileSyncAt).not.toHaveBeenCalled(); expect(d.setProfileSyncState).not.toHaveBeenCalledWith('saved');
  });
  it('does not run a captured account callback or accept an identity patch', async () => {
    const d = deps(); d.isCurrentSession.mockReturnValue(false); await patchProfileInCloud({ name: 'stale' }, d);
    expect(d.persistUser).not.toHaveBeenCalled(); expect(d.syncStateImpl).not.toHaveBeenCalled();
    d.isCurrentSession.mockReturnValue(true); await patchProfileInCloud({ id: 'account-b', version: 500 }, d);
    expect(JSON.parse((await outbox.snapshot(profile.id, repository.key('profile'))).value!).id).toBe(profile.id);
    expect(await outbox.list('account-b')).toEqual([]);
  });
  it('does not replace a newer profile edit after a refresh', async () => {
    const d = deps(); d.refreshProfileWithGuardImpl.mockImplementation(async () => {
      d.profileEditRevisionRef.current += 1;
      return { value: JSON.stringify(profile), readGuard: { accountId: profile.id, serverSessionId: 'a'.repeat(64), sessionEpoch: 'refresh-epoch', authFence: 2 } };
    });
    await reloadUserFromCloud(d); expect(d.applyRemoteProfile).not.toHaveBeenCalled();
  });
  it('applies a clean refresh synchronously without another login or a later old-editor callback', async () => {
    const d = deps();
    d.refreshProfileWithGuardImpl.mockResolvedValue({
      value: JSON.stringify({ ...profile, version: 3 }),
      readGuard: { accountId: profile.id, serverSessionId: 'a'.repeat(64), sessionEpoch: 'refresh-epoch', authFence: 2 },
    });
    d.applyRemoteProfile.mockImplementation(() => { d.isCurrentSession.mockReturnValue(false); });
    await reloadUserFromCloud(d);
    expect(d.applyRemoteProfile).toHaveBeenCalledWith({ ...profile, version: 3 });
    expect(d.setProfileSyncState).not.toHaveBeenCalledWith('saved'); expect(await outbox.list(profile.id)).toEqual([]);
  });
  it('adopts the exact read guard that accepted a refreshed profile before applying it', async () => {
    const readGuard: OutboxReadGuard = { accountId: profile.id, serverSessionId: 'a'.repeat(64), sessionEpoch: 'refresh-epoch', authFence: 2 };
    const d = {
      ...deps(),
      refreshProfileWithGuardImpl: vi.fn(async () => ({ value: JSON.stringify({ ...profile, version: 3 }), readGuard })),
      assertReadGuardImpl: vi.fn(async () => {}),
      setLoginReadGuard: vi.fn(),
    };
    await reloadUserFromCloud(d);
    expect(d.assertReadGuardImpl).toHaveBeenCalledWith(readGuard);
    expect(d.setLoginReadGuard).toHaveBeenCalledWith(readGuard);
    expect(d.setLoginReadGuard.mock.invocationCallOrder[0]).toBeLessThan(d.applyRemoteProfile.mock.invocationCallOrder[0]);
    expect(d.applyRemoteProfile).toHaveBeenCalledWith({ ...profile, version: 3 });
  });
  it('does not adopt or apply a refresh after its read guard becomes stale', async () => {
    const readGuard: OutboxReadGuard = { accountId: profile.id, serverSessionId: 'a'.repeat(64), sessionEpoch: 'refresh-epoch', authFence: 2 };
    const d = {
      ...deps(),
      refreshProfileWithGuardImpl: vi.fn(async () => ({ value: JSON.stringify({ ...profile, version: 3 }), readGuard })),
      assertReadGuardImpl: vi.fn(async () => { throw new Error('LOGIN_SESSION_CHANGED'); }),
      setLoginReadGuard: vi.fn(),
    };
    await reloadUserFromCloud(d);
    expect(d.setLoginReadGuard).not.toHaveBeenCalled();
    expect(d.applyRemoteProfile).not.toHaveBeenCalled();
  });
  it('rejects a refreshed profile whose guard belongs to another account', async () => {
    const d = deps();
    d.refreshProfileWithGuardImpl.mockResolvedValue({
      value: JSON.stringify({ ...profile, version: 3 }),
      readGuard: { accountId: 'account-b', serverSessionId: 'b'.repeat(64), sessionEpoch: 'other', authFence: 2 },
    });
    await reloadUserFromCloud(d);
    expect(d.assertReadGuardImpl).not.toHaveBeenCalled();
    expect(d.setLoginReadGuard).not.toHaveBeenCalled();
    expect(d.applyRemoteProfile).not.toHaveBeenCalled();
  });
  it('does not refresh over an uncommitted form draft', async () => {
    const d = { ...deps(), hasUncommittedDraft: () => true };
    await reloadUserFromCloud(d);
    expect(d.refreshProfileWithGuardImpl).not.toHaveBeenCalled(); expect(d.applyRemoteProfile).not.toHaveBeenCalled();
    await pushProfileToCloud(profile, d);
    expect(d.syncStateImpl).not.toHaveBeenCalled(); expect(d.setLastProfileSyncAt).not.toHaveBeenCalled();
  });
  it('returns failure to the form after a rejected local commit', async () => {
    const d = deps(); d.persistUser.mockRejectedValueOnce(new Error('STATE_STORAGE_QUOTA'));
    expect(await patchProfileInCloud({ name: 'unsaved' }, d)).toBe(false);
    expect(d.syncStateImpl).not.toHaveBeenCalled(); expect(d.setProfileSyncState).toHaveBeenLastCalledWith('error');
  });
  it('keeps a reloaded local profile when bootstrap brings a different cloud snapshot', async () => {
    await repository.writeJson('profile', { ...profile, name: 'Локальная правка' });
    const reloaded = new UserStateRepository(profile.id, { outbox });
    expect(await restoreProfile(reloaded, { ...profile, name: 'Облако', version: 8 })).toMatchObject({ name: 'Локальная правка', version: 2 });
    expect(await outbox.list(profile.id)).toHaveLength(1);
  });
  it('does not adopt another editor revision merely by requesting a flush', async () => {
    const d = deps(); const other = new UserStateRepository(profile.id, { outbox }); await other.observe('profile');
    await other.writeJson('profile', { ...profile, name: 'Другая вкладка' });
    await pushProfileToCloud(profile, d);
    expect(await repository.writeJson('profile', { ...profile, name: 'Старый редактор' })).toMatchObject({ status: 'conflicted' });
  });
});
