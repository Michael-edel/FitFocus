import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { DurableOutbox } from '../storage/durableOutbox';
import { StateDatabase, stateTransaction } from '../storage/stateDatabase';
import { UserStateRepository } from '../storage/userStateRepository';
import { restoreProfile } from '../storage/profileState';
import { userProfile } from './_helpers/userProfile';
let database: StateDatabase; let outbox: DurableOutbox;
const account = 'account-a'; const sid = 'a'.repeat(64);
beforeEach(() => { database = new StateDatabase({ factory: new IDBFactory() }); outbox = new DurableOutbox(database); });
afterEach(() => database.close());
it('rejects a cloud apply when the auth fence changed even if the epoch is still present', async () => {
  const before = await outbox.sessionState(); const session = (await outbox.acceptSession(account, sid, before.fence))!;
  const fence = (await outbox.sessionState()).fence;
  const db = await database.open();
  await stateTransaction(db, ['outbox_meta'], 'readwrite', tx => { tx.objectStore('outbox_meta').put({ id: 'auth-fence', revision: fence + 1 }); });
  const key = `fitfocus_data_${account}_diary`;
  expect(await outbox.hydrate(account, key, { value: '[]', exists: true, version: 7 }, 0, session.sessionEpoch, fence)).toBe(false);
  expect(await outbox.snapshot(account, key)).toMatchObject({ value: null, revision: 0, confirmedVersion: 0 });
});
it('cannot seed a profile after logout invalidated the bootstrap proof', async () => {
  const before = await outbox.sessionState(); const session = (await outbox.acceptSession(account, sid, before.fence))!;
  const guard = { accountId: account, serverSessionId: sid, sessionEpoch: session.sessionEpoch, authFence: (await outbox.sessionState()).fence };
  await outbox.invalidateSessions();
  await expect(restoreProfile(new UserStateRepository(account, { outbox }), userProfile(account), guard)).rejects.toThrow('SESSION_CHANGED');
  expect(await outbox.snapshot(account, `fitfocus_data_${account}_profile`)).toMatchObject({ value: null, revision: 0 });
});
