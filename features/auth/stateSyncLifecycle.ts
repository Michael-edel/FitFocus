import { stateSync, type StateSync } from '../../storage/stateSync';
import { listenForPageExit } from '../../storage/sessionTransport';

/** Stop old-page requests before unload; a BFCache restore must verify the captured account again. */
export function startStateSyncLifecycle(accountId: string, target: EventTarget = window,
  service: Pick<StateSync, 'start' | 'stop'> = stateSync): () => void {
  let removePageExit = listenForPageExit(() => service.stop(), target);
  const onShow = (event: Event) => {
    if (!(event as PageTransitionEvent).persisted) return;
    removePageExit();
    removePageExit = listenForPageExit(() => service.stop(), target);
    service.start(accountId);
  };
  target.addEventListener('pageshow', onShow);
  service.start(accountId);
  return () => {
    removePageExit();
    target.removeEventListener('pageshow', onShow);
    service.stop();
  };
}
