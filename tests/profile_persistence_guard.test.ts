import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isProfileCommitErrorCurrent } from '../features/profile/useProfilePersistence';
import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { StateDatabase } from '../storage/stateDatabase';
import { UserStateRepository } from '../storage/userStateRepository';

const accountId = 'profile-owner';
let db: StateDatabase;
let outbox: DurableOutbox;
let repository: UserStateRepository;
let guard: OutboxReadGuard;

beforeEach(async () => {
  db = new StateDatabase({ factory: new IDBFactory() });
  outbox = new DurableOutbox(db);
  repository = new UserStateRepository(accountId, { outbox });
  guard = (await outbox.acceptReadSession(accountId, 'a'.repeat(64), 0))!;
});

afterEach(() => db.close());

describe('guarded profile error reporting', () => {
  it('reports a failed commit only while its exact IndexedDB read session remains current', async () => {
    let current = true;
    const canCommit = () => current;

    expect(await isProfileCommitErrorCurrent(repository, guard, canCommit)).toBe(true);
    await outbox.invalidateSessions();
    const { fence } = await outbox.sessionState();
    await outbox.acceptReadSession(accountId, 'b'.repeat(64), fence);
    expect(await isProfileCommitErrorCurrent(repository, guard, canCommit)).toBe(false);

    current = false;
    expect(await isProfileCommitErrorCurrent(repository, guard, canCommit)).toBe(false);
  });
});
