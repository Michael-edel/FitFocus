import { expect, it, vi } from 'vitest';
import { listenForPageExit } from '../storage/sessionTransport';

it.each(['beforeunload', 'pagehide'] as const)('handles the first %s signal and removes both listeners', eventName => {
  const target = new EventTarget();
  const removeListener = vi.spyOn(target, 'removeEventListener');
  const onPageExit = vi.fn();
  const cleanup = listenForPageExit(onPageExit, target);

  target.dispatchEvent(new Event(eventName));
  target.dispatchEvent(new Event(eventName === 'beforeunload' ? 'pagehide' : 'beforeunload'));

  expect(onPageExit).toHaveBeenCalledOnce();
  expect(removeListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  expect(removeListener).toHaveBeenCalledWith('pagehide', expect.any(Function));
  cleanup();
  expect(onPageExit).toHaveBeenCalledOnce();
});
