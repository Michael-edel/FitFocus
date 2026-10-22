import { offerPwaUpdate } from './pwaUpdate';

/** Native controller identity also covers tabs that installed their first worker. */
export async function registerPwaUpdates(container: ServiceWorkerContainer, scriptURL: string, reload: () => void) {
  let controller = container.controller ?? null;
  let reloading = false;
  const changed = () => {
    const next = container.controller ?? null;
    const replaced = controller !== null && next !== null && next !== controller;
    controller = next;
    // First control must not reload a form; replacement follows explicit activation.
    if (replaced && !reloading) { reloading = true; reload(); }
  };
  container.addEventListener('controllerchange', changed);
  let registration: ServiceWorkerRegistration;
  try { registration = await container.register(scriptURL); }
  catch (error) { container.removeEventListener('controllerchange', changed); throw error; }
  const offer = () => {
    if (!container.controller || !registration.waiting) return;
    offerPwaUpdate(async () => {
      if (!registration.waiting) throw new Error('PWA_UPDATE_NOT_READY');
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    });
  };
  const watch = () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => { if (installing.state === 'installed') offer(); });
    if (installing.state === 'installed') offer();
  };
  registration.addEventListener('updatefound', watch);
  watch(); offer();
  // Availability checks never activate a waiting worker and may fail offline.
  void registration.update().catch(() => undefined);
  return registration;
}
