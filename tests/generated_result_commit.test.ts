import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DurableOutbox, type OutboxReadGuard, type OutboxWrite } from '../storage/durableOutbox';
import { StateDatabase } from '../storage/stateDatabase';
import { UserStateRepository } from '../storage/userStateRepository';
import { StateEditor } from '../storage/stateEditor';

let connection: StateDatabase, secondConnection: StateDatabase, outbox: DurableOutbox, other: DurableOutbox;
const account = 'generated-owner', key = `fitfocus_data_${account}_profile`;
beforeEach(() => {
  const factory = new IDBFactory();
  connection = new StateDatabase({ factory }); secondConnection = new StateDatabase({ factory });
  outbox = new DurableOutbox(connection); other = new DurableOutbox(secondConnection);
});
afterEach(() => { vi.restoreAllMocks(); connection.close(); secondConnection.close(); });
const write = (options: Partial<OutboxWrite> = {}) => outbox.write({
  accountId: account, writerId: 'generated-editor', resource: 'profile',
  intent: { type: 'put', key, value: '{"name":"generated"}' }, baseVersion: 0, expectedRevision: 0, ...options,
});
async function proof() {
  return (await other.acceptReadSession(account, 'a'.repeat(64), (await other.sessionState()).fence))!;
}

it.each(['logout', 'account', 'same-account-login', 'local-lifetime', 'mutated-proof'])
('rejects a queued generated write after %s without touching values or outbox', async change => {
  const readGuard = await proof(); let current = true;
  const originalOpen = connection.open.bind(connection);
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  vi.spyOn(connection, 'open').mockImplementationOnce(async () => { await wait; return originalOpen(); });
  const rejected = expect(write({ readGuard, canCommit: () => current })).rejects.toMatchObject({
    cause: { message: 'OUTBOX_WRITE_SESSION_CHANGED' },
  });
  if (change === 'local-lifetime') current = false;
  else {
    await other.invalidateSessions();
    if (change !== 'logout') {
      const fresh = (await other.acceptReadSession(change === 'account' ? 'another-owner' : account,
        'b'.repeat(64), (await other.sessionState()).fence))!;
      if (change === 'mutated-proof') Object.assign(readGuard, fresh);
    }
  }
  release(); await rejected;
  expect(await other.snapshot(account, key)).toEqual({ value: null, revision: 0, confirmedVersion: 0 });
  expect(await other.list(account)).toEqual([]);
});

it('commits a current generated value and intent atomically without persisting its proof', async () => {
  const operation = await write({ readGuard: await proof(), canCommit: () => true });
  expect(operation.status).toBe('pending');
  expect((await other.snapshot(account, key)).value).toBe('{"name":"generated"}');
  expect(await other.list(account)).toEqual([operation]);
  expect(operation).not.toHaveProperty('readGuard'); expect(operation).not.toHaveProperty('canCommit');
});

it('does not require an active HTTP session for an ordinary local edit', async () => {
  await proof(); await other.invalidateSessions();
  expect((await write()).status).toBe('pending');
});

it.each(['owner', 'epoch', 'session-id', 'fence'])('rejects invalid generated proof %s', async change => {
  const guard = await proof();
  const invalid: OutboxReadGuard = { ...guard,
    ...(change === 'owner' ? { accountId: 'another-owner' } : {}),
    ...(change === 'epoch' ? { sessionEpoch: '' } : {}),
    ...(change === 'session-id' ? { serverSessionId: 'bad-proof' } : {}),
    ...(change === 'fence' ? { authFence: -1 } : {}),
  };
  await expect(write({ readGuard: invalid })).rejects.toThrow();
  expect(await other.list(account)).toEqual([]);
});

it('keeps the visible editor unchanged after a rejected generated commit', async () => {
  const readGuard = await proof();
  const editor = new StateEditor(new UserStateRepository(account, { outbox }), 'profile', 'original',
    { encode: value => value, decode: (raw, fallback) => raw ?? fallback });
  await editor.load(); await other.invalidateSessions();
  await expect(editor.commitGenerated('generated', { readGuard, canCommit: () => true })).rejects.toThrow();
  expect(editor.getSnapshot().value).toBe('original');
  expect(await other.list(account)).toEqual([]);
});

it('does not publish or queue a generated snapshot over a newer editor change', async () => {
  const readGuard = await proof();
  const editor = new StateEditor(new UserStateRepository(account, { outbox }), 'profile', 'original',
    { encode: value => value, decode: (raw, fallback) => raw ?? fallback });
  await editor.load();
  const open = connection.open.bind(connection); let release!: () => void, started!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const pending = new Promise<void>(resolve => { started = resolve; });
  vi.spyOn(connection, 'open').mockImplementationOnce(async () => { started(); await wait; return open(); });
  const rejected = expect(editor.commitGenerated('generated', { readGuard, canCommit: () => true })).rejects.toThrow();
  await pending;
  const normalEdit = editor.set('newer-user-edit');
  expect(editor.getSnapshot().value).toBe('newer-user-edit');
  release(); await rejected; await normalEdit;
  expect((await other.snapshot(account, key)).value).toBe('newer-user-edit');
  expect((await other.list(account)).map(op => op.type === 'put' && op.value)).toEqual(['newer-user-edit']);
});
