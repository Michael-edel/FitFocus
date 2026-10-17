import { afterEach, beforeEach, expect, it, vi } from 'vitest';
let registerPwaUpdates: typeof import('../services/pwaRegistration').registerPwaUpdates;
let applyPwaUpdate: typeof import('../services/pwaUpdate').applyPwaUpdate;
let getPwaUpdateState: typeof import('../services/pwaUpdate').getPwaUpdateState;
beforeEach(async () => {
  vi.useFakeTimers(); vi.resetModules();
  ({ registerPwaUpdates } = await import('../services/pwaRegistration'));
  ({ applyPwaUpdate, getPwaUpdateState } = await import('../services/pwaUpdate'));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function fixture(controlled: boolean) {
  const first = new EventTarget();
  const waiting = Object.assign(new EventTarget(), { state: 'installed', postMessage: vi.fn() });
  const registration = Object.assign(new EventTarget(), { waiting: null as typeof waiting | null,
    installing: null as typeof waiting | null, update: vi.fn().mockRejectedValue(new Error('offline')) });
  const container = Object.assign(new EventTarget(), { controller: controlled ? first : null as EventTarget | null,
    register: vi.fn().mockResolvedValue(registration) });
  vi.stubGlobal('navigator', { serviceWorker: container });
  return { first, waiting, registration, container: container as unknown as ServiceWorkerContainer, raw: container };
}
it('does not reload at first control but reloads once when that worker is replaced', async () => {
  const f = fixture(false), reload = vi.fn(); await registerPwaUpdates(f.container, '/sw.js', reload);
  f.raw.controller = f.first; f.raw.dispatchEvent(new Event('controllerchange')); expect(reload).not.toHaveBeenCalled();
  f.raw.controller = f.waiting; f.raw.dispatchEvent(new Event('controllerchange'));
  f.raw.dispatchEvent(new Event('controllerchange')); expect(reload).toHaveBeenCalledOnce();
});
it('offers an existing waiting worker without activation, and sends only after explicit action', async () => {
  const f = fixture(true), reload = vi.fn(); f.registration.waiting = f.waiting;
  await registerPwaUpdates(f.container, '/sw.js', reload);
  expect(getPwaUpdateState().visible).toBe(true); expect(f.waiting.postMessage).not.toHaveBeenCalled();
  await applyPwaUpdate(); expect(f.waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  f.raw.controller = f.waiting; f.raw.dispatchEvent(new Event('controllerchange')); expect(reload).toHaveBeenCalledOnce();
});
it('observes later installation and reloads the controlled tab after another tab activates it', async () => {
  const f = fixture(true), reload = vi.fn(); await registerPwaUpdates(f.container, '/sw.js', reload);
  f.registration.installing = f.waiting; f.registration.dispatchEvent(new Event('updatefound'));
  f.registration.waiting = f.waiting; f.waiting.dispatchEvent(new Event('statechange'));
  expect(getPwaUpdateState()).toEqual({ visible: true, applying: false, error: false });
  expect(f.waiting.postMessage).not.toHaveBeenCalled();
  f.raw.controller = f.waiting; f.raw.dispatchEvent(new Event('controllerchange')); expect(reload).toHaveBeenCalledOnce();
});
it('removes the controller listener after registration fails', async () => {
  const f = fixture(true), reload = vi.fn(); f.raw.register.mockRejectedValue(new Error('registration failed'));
  await expect(registerPwaUpdates(f.container, '/sw.js', reload)).rejects.toThrow('registration failed');
  f.raw.controller = f.waiting; f.raw.dispatchEvent(new Event('controllerchange')); expect(reload).not.toHaveBeenCalled();
});
