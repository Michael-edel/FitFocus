import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import type { OutboxReadGuard } from '../../storage/durableOutbox';

/** Stable React key for stateful screens whose drafts belong to one login scope. */
export function accountSessionRenderKey(
  guard: OutboxReadGuard | null,
  accountId: string | null | undefined,
): string {
  return guard
    ? `${guard.accountId}:${guard.sessionEpoch}:${guard.serverSessionId}:${guard.authFence}`
    : `no-session:${accountId || 'anonymous'}`;
}

/** Hide account-owned UI state until the active account's storage key is loaded. */
export function getAccountScopedUiValue<T>(
  activeStorageKey: string | null,
  hydratedStorageKey: string | null,
  currentValue: T,
  fallbackValue: T,
  enabled = true,
): T {
  return enabled && activeStorageKey !== null && activeStorageKey === hydratedStorageKey
    ? currentValue
    : fallbackValue;
}

export function createAccountScopedUiUpdater<T>(
  ownerStorageKey: string | null,
  getCurrentStorageKey: () => string | null,
  update: SetStateAction<T>,
  isEnabled: () => boolean = () => true,
): (previous: T) => T {
  return (previous) => {
    if (!isEnabled() || getCurrentStorageKey() !== ownerStorageKey) return previous;
    return typeof update === 'function'
      ? (update as (previous: T) => T)(previous)
      : update;
  };
}

/** A callback captured by an old account cannot write into the newly active scope. */
export function useAccountScopedUiSetter<T>(
  activeStorageKey: string | null,
  setValue: Dispatch<SetStateAction<T>>,
  enabled = true,
): Dispatch<SetStateAction<T>> {
  const currentStorageKeyRef = useRef(activeStorageKey);
  const enabledRef = useRef(enabled);
  currentStorageKeyRef.current = activeStorageKey;
  enabledRef.current = enabled;

  return useCallback((update) => {
    const ownerKey = activeStorageKey;
    if (!enabled || !enabledRef.current || currentStorageKeyRef.current !== ownerKey) return;
    setValue(createAccountScopedUiUpdater(
      ownerKey,
      () => currentStorageKeyRef.current,
      update,
      () => enabledRef.current,
    ));
  }, [activeStorageKey, enabled, setValue]);
}
