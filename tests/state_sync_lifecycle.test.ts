import { IDBFactory } from 'fake-indexeddb';
import { afterEach, expect, it, vi } from 'vitest';
import { startStateSyncLifecycle } from '../features/auth/stateSyncLifecycle';
import { StateSync } from '../storage/stateSync';
import { DurableOutbox } from '../storage/durableOutbox';
import { StateDatabase } from '../storage/stateDatabase';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const show = (persisted: boolean) => Object.assign(new Event('pageshow'), { persisted });
it.each(['beforeunload', 'pagehide'] as const)('stops on %s, verifies again only for BFCache restore, and removes old-account listeners', eventName => {
  const target = new EventTarget(); const service = { start: vi.fn(), stop: vi.fn() };
  const cleanup = startStateSyncLifecycle('owner-a', target, service);
  target.dispatchEvent(new Event(eventName)); expect(service.stop).toHaveBeenCalledTimes(1);
  target.dispatchEvent(show(false)); expect(service.start).toHaveBeenCalledTimes(1);
  target.dispatchEvent(show(true)); expect(service.start).toHaveBeenLastCalledWith('owner-a'); expect(service.start).toHaveBeenCalledTimes(2);
  cleanup(); target.dispatchEvent(show(true)); expect(service.start).toHaveBeenCalledTimes(2);
});
it.each(['beforeunload', 'pagehide'] as const)('aborts a live sender proof on %s and cannot accept its late response', async eventName => {
  const target = new EventTarget(); vi.stubGlobal('window', target);
  const database = new StateDatabase({ factory: new IDBFactory() }); const outbox = new DurableOutbox(database);
  let release!: (response: Response) => void; let began!: () => void; let signal: AbortSignal | undefined;
  const started = new Promise<void>(resolve => { began = resolve; });
  const sender = new StateSync({ outbox, legacyPending: () => false, fetchImpl: async (_url, init) => {
    signal = init?.signal as AbortSignal; began(); return new Promise<Response>(resolve => { release = resolve; });
  } });
  const connecting = vi.spyOn(sender, 'connect');
  const cleanup = startStateSyncLifecycle('owner-a', target, sender);
  try {
    await started; target.dispatchEvent(new Event(eventName)); expect(signal?.aborted).toBe(true);
    release(new Response(JSON.stringify({ user: { sub: 'owner-a' }, hasAccess: true,
      stateSync: { protocol: 2, guard: 1, accountId: 'owner-a', sessionId: 'a'.repeat(64) } })));
    expect(await connecting.mock.results[0].value).toBe(false);
    expect((await outbox.sessionState()).active).toBeUndefined();
  } finally { cleanup(); database.close(); }
});
