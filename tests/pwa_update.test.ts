import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let pwa: typeof import('../services/pwaUpdate');
let worker: EventTarget;
beforeEach(async () => {
  vi.useFakeTimers(); vi.resetModules();
  worker = new EventTarget();
  vi.stubGlobal('navigator', { serviceWorker: worker });
  pwa = await import('../services/pwaUpdate');
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('offers and dismissal never activate a worker, and repeated clicks activate once', async () => {
  let complete!: () => void;
  const update = vi.fn(() => new Promise<void>(resolve => { complete = resolve; }));
  pwa.offerPwaUpdate(update); pwa.dismissPwaUpdate();
  expect(update).not.toHaveBeenCalled(); expect(pwa.getPwaUpdateState().visible).toBe(false);
  pwa.offerPwaUpdate(update);
  const first = pwa.applyPwaUpdate(); await pwa.applyPwaUpdate();
  expect(update).toHaveBeenCalledOnce(); expect(pwa.getPwaUpdateState().applying).toBe(true);
  worker.dispatchEvent(new Event('controllerchange')); complete(); await first;
  await vi.advanceTimersByTimeAsync(10_000);
  expect(pwa.getPwaUpdateState().error).toBe(false);
});

it('a rejected activation allows the user to retry', async () => {
  const update = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  pwa.offerPwaUpdate(update); await pwa.applyPwaUpdate();
  expect(pwa.getPwaUpdateState()).toEqual({ visible: true, applying: false, error: true });
  await pwa.applyPwaUpdate(); expect(update).toHaveBeenCalledTimes(2);
  expect(pwa.getPwaUpdateState()).toEqual({ visible: true, applying: true, error: false });
  worker.dispatchEvent(new Event('controllerchange'));
});

it('a timed-out attempt cannot overwrite the state of a later retry', async () => {
  let reject!: (reason: Error) => void;
  const update = vi.fn<() => Promise<void>>()
    .mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail; }))
    .mockResolvedValue(undefined);
  pwa.offerPwaUpdate(update); const first = pwa.applyPwaUpdate();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(pwa.getPwaUpdateState()).toEqual({ visible: true, applying: false, error: true });
  await pwa.applyPwaUpdate(); reject(new Error('late failure')); await first;
  expect(pwa.getPwaUpdateState()).toEqual({ visible: true, applying: true, error: false });
  worker.dispatchEvent(new Event('controllerchange'));
});

it('controller activation before the message finishes is not undone by its late rejection', async () => {
  let reject!: (reason: Error) => void;
  pwa.offerPwaUpdate(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
  const applying = pwa.applyPwaUpdate(); worker.dispatchEvent(new Event('controllerchange'));
  reject(new Error('response after activation')); await applying;
  await vi.advanceTimersByTimeAsync(10_000);
  expect(pwa.getPwaUpdateState()).toEqual({ visible: true, applying: true, error: false });
});
