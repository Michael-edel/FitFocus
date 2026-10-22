import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { StateDatabase } from '../storage/stateDatabase';
import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { UserStateRepository } from '../storage/userStateRepository';
import { StateEditor } from '../storage/stateEditor';
import { userProfile } from './_helpers/userProfile';

let db: StateDatabase, outbox: DurableOutbox, guard: OutboxReadGuard;
const account = 'ack-settings-owner';
const initial = userProfile(account, { version: 0, targetWeight: 999 });
const codec = { encode: JSON.stringify, decode: (_raw: string | null, fallback: typeof initial) => fallback };
beforeEach(async () => {
  db = new StateDatabase({ factory: new IDBFactory() });
  outbox = new DurableOutbox(db);
  guard = (await outbox.acceptReadSession(account, 'a'.repeat(64), 0))!;
});
afterEach(() => db.close());
async function pendingRegistration() {
  const registration = new UserStateRepository(account, { outbox });
  await registration.observe('profile');
  return registration.writeLocalJson('profile', initial, { localCommitGuard: guard, canCommit: () => true });
}
async function acknowledge() {
  const claim = await outbox.claim({ accountId: account, owner: 'sender', sessionEpoch: guard.sessionEpoch, nowMs: Date.now() + 100, leaseMs: 30000 });
  expect(claim).not.toBeNull();
  expect(await outbox.finish(claim!, { kind: 'acknowledged', version: 1 })).toBe(true);
}
it('accepts a first save when the displayed registration revision was acknowledged after the editor loaded', async () => {
  await pendingRegistration();
  const editor = new StateEditor(new UserStateRepository(account, { outbox }), 'profile', initial, codec);
  await editor.load();
  await acknowledge();
  const operation = await editor.commitGenerated(previous => ({ ...previous, targetWeight: 75 }), { localCommitGuard: guard, canCommit: () => true });
  expect(operation).toMatchObject({ status: 'pending', baseVersion: 1 });
  expect(editor.getSnapshot().value.targetWeight).toBe(75);
  expect(JSON.parse((await outbox.snapshot(account, `fitfocus_data_${account}_profile`)).value!).targetWeight).toBe(75);
});
it('accepts the first save if the new editor observes after the registration ACK', async () => {
  await pendingRegistration();
  await acknowledge();
  const editor = new StateEditor(new UserStateRepository(account, { outbox }), 'profile', initial, codec);
  await editor.load();
  const operation = await editor.commitGenerated(previous => ({ ...previous, targetWeight: 75 }), { localCommitGuard: guard, canCommit: () => true });
  expect(operation).toMatchObject({ status: 'pending', baseVersion: 1 });
  expect(editor.getSnapshot().value.targetWeight).toBe(75);
});
