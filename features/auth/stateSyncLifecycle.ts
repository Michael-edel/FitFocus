import { stateSync, type StateSync } from '../../storage/stateSync';

/** Stop old-page requests before unload; a BFCache restore must verify the captured account again. */
export function startStateSyncLifecycle(accountId: string, target: EventTarget = window,
  service: Pick<StateSync, 'start' | 'stop'> = stateSync): () => void {
  const onHide = () => service.stop();
  const onShow = (event: Event) => { if ((event as PageTransitionEvent).persisted) service.start(accountId); };
  target.addEventListener('pagehide', onHide);
  target.addEventListener('pageshow', onShow);
  service.start(accountId);
  return () => {
    target.removeEventListener('pagehide', onHide);
    target.removeEventListener('pageshow', onShow);
    service.stop();
  };
}
