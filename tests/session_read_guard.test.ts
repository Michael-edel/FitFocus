import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StateDatabase, stateTransaction } from '../storage/stateDatabase';
import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { verifyReadSession, readScopedJson } from '../storage/sessionRead';
import { sessionMe, sessionHeaders, testSessionId } from './_helpers/sessionRead';
let db: StateDatabase; let outbox: DurableOutbox;
const account = 'account-a';
const json = (body: unknown, headers?: HeadersInit) => new Response(JSON.stringify(body), { headers });
beforeEach(() => { db = new StateDatabase({ factory: new IDBFactory() }); outbox = new DurableOutbox(db); });
afterEach(() => { db.close(); vi.restoreAllMocks(); vi.useRealTimers(); });
const activate = async (): Promise<OutboxReadGuard> => (await outbox.acceptReadSession(account, testSessionId, (await outbox.sessionState()).fence))!;
it('cannot accept a delayed proof after a cross-tab logout', async () => {
  let began!: () => void; let release!: (response: Response) => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const request = verifyReadSession({ outbox, bootstrap: true, fetchImpl: async () => {
    began(); return new Promise<Response>(resolve => { release = resolve; });
  } });
  const rejected = expect(request).rejects.toThrow('LOGIN_SESSION_CHANGED');
  await started; await outbox.invalidateSessions(); release(json(sessionMe(account)));
  await rejected; expect((await outbox.sessionState()).active).toBeUndefined();
});
it('captures the accepted fence atomically instead of adopting a newer fence after the proof', async () => {
  const accept = outbox.acceptReadSession.bind(outbox);
  vi.spyOn(outbox, 'acceptReadSession').mockImplementation(async (...args) => {
    const guard = await accept(...args);
    const connection = await db.open();
    await stateTransaction(connection, ['outbox_meta'], 'readwrite', tx => {
      tx.objectStore('outbox_meta').put({ id: 'auth-fence', revision: guard!.authFence + 1 });
    });
    return guard;
  });
  await expect(verifyReadSession({ outbox, bootstrap: true, fetchImpl: async () => json(sessionMe(account)) })).rejects.toThrow('LOGIN_SESSION_CHANGED');
});
it('does not activate a bootstrap proof when the server lacks its independent capability', async () => {
  const body: Record<string, unknown> = sessionMe(account); delete body.bootstrapSync;
  expect((await verifyReadSession({ outbox, bootstrap: true, fetchImpl: async () => json(body) })).guard).toBeNull();
  expect((await outbox.sessionState()).active).toBeUndefined();
});
it('does not switch to another account while verifying a captured reader', async () => {
  await expect(verifyReadSession({ outbox, accountId: account, fetchImpl: async () => json(sessionMe('account-b')) })).rejects.toThrow('LOGIN_SESSION_CHANGED');
  expect((await outbox.sessionState()).active).toBeUndefined();
});
it.each(['scope', 'user', 'protocol'])('rejects a successful bootstrap response with invalid %s', async field => {
  const guard = await activate(); const headers = new Headers(sessionHeaders(account, 'bootstrap'));
  if (field === 'scope') headers.set('X-FitFocus-State-Session', 'b'.repeat(64));
  if (field === 'protocol') headers.delete('X-FitFocus-Bootstrap-Protocol');
  await expect(readScopedJson('/api/bootstrap', guard, 'bootstrap', { outbox,
    fetchImpl: async () => json({ user: { sub: field === 'user' ? 'account-b' : account }, profile: null }, headers),
  })).rejects.toThrow('SESSION_READ_PROTOCOL');
});
it('rejects an old response without invalidating the newly accepted account', async () => {
  const guard = await activate();
  await expect(readScopedJson('/api/bootstrap', guard, 'bootstrap', { outbox, fetchImpl: async (_url, init) => {
    expect(new Headers(init?.headers).get('X-FitFocus-State-Account')).toBe(account);
    expect(new Headers(init?.headers).get('X-FitFocus-State-Session')).toBe(testSessionId);
    await outbox.acceptReadSession('account-b', 'b'.repeat(64), (await outbox.sessionState()).fence);
    return json({ user: { sub: account }, profile: null }, sessionHeaders(account, 'bootstrap'));
  } })).rejects.toThrow('LOGIN_SESSION_CHANGED');
  expect((await outbox.sessionState()).active?.accountId).toBe('account-b');
});
it('bounds a body that never completes and aborts it without a hidden retry', async () => {
  const guard = await activate(); let began!: () => void; let signal: AbortSignal | undefined;
  const started = new Promise<void>(resolve => { began = resolve; }); const cancel = vi.fn();
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
    signal = init?.signal as AbortSignal; began();
    return new Response(new ReadableStream({ start: c => c.enqueue(new TextEncoder().encode('{"user":')), cancel }), {
      headers: sessionHeaders(account, 'bootstrap'),
    });
  });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const rejected = expect(readScopedJson('/api/bootstrap', guard, 'bootstrap', { outbox, fetchImpl, timeoutMs: 25 })).rejects.toThrow('STATE_REQUEST_ABORTED');
  await started; await vi.advanceTimersByTimeAsync(30); await rejected;
  expect(signal?.aborted).toBe(true); expect(fetchImpl).toHaveBeenCalledTimes(1); expect(cancel).toHaveBeenCalledTimes(1);
});
it.each(['beforeunload', 'pagehide'] as const)('cancels a scoped read on %s before its late response can apply', async eventName => {
  const target = new EventTarget(); vi.stubGlobal('window', target);
  const guard = await activate(); let began!: () => void; let signal: AbortSignal | undefined;
  const started = new Promise<void>(resolve => { began = resolve; });
  const cancel = vi.fn();
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
    signal = init?.signal as AbortSignal; began();
    return new Response(new ReadableStream({ start: () => {}, cancel }), { headers: sessionHeaders(account, 'bootstrap') });
  });
  const pending = readScopedJson('/api/bootstrap', guard, 'bootstrap', { outbox, fetchImpl });
  const result = expect(pending).rejects.toThrow('LOGIN_SESSION_CHANGED');
  await started;
  target.dispatchEvent(new Event(eventName));
  await result;
  expect(signal?.aborted).toBe(true);
  expect(cancel).toHaveBeenCalledOnce();
  expect(fetchImpl).toHaveBeenCalledOnce();
});
it('rejects an oversized successful response without retrying it', async () => {
  const guard = await activate();
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response('x'.repeat(1024 * 1024 + 1), { headers: sessionHeaders(account, 'bootstrap') }));
  await expect(readScopedJson('/api/bootstrap', guard, 'bootstrap', { outbox, fetchImpl })).rejects.toThrow('SESSION_READ_PROTOCOL');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
