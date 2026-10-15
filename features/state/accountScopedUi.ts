import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';

/** Hide account-owned UI state until the active account's storage key is loaded. */
export function getAccountScopedUiValue<T>(
  activeStorageKey: string | null,
  hydratedStorageKey: string | null,
  currentValue: T,
  fallbackValue: T,
): T {
  return activeStorageKey !== null && activeStorageKey === hydratedStorageKey
    ? currentValue
    : fallbackValue;
}

export function createAccountScopedUiUpdater<T>(
  ownerStorageKey: string | null,
  getCurrentStorageKey: () => string | null,
  update: SetStateAction<T>,
): (previous: T) => T {
  return (previous) => {
    if (getCurrentStorageKey() !== ownerStorageKey) return previous;
    return typeof update === 'function'
      ? (update as (previous: T) => T)(previous)
      : update;
  };
}

/** A callback captured by an old account cannot write into the newly active scope. */
export function useAccountScopedUiSetter<T>(
  activeStorageKey: string | null,
  setValue: Dispatch<SetStateAction<T>>,
): Dispatch<SetStateAction<T>> {
  const currentStorageKeyRef = useRef(activeStorageKey);
  currentStorageKeyRef.current = activeStorageKey;

  return useCallback((update) => {
    const ownerKey = activeStorageKey;
    if (currentStorageKeyRef.current !== ownerKey) return;
    setValue(createAccountScopedUiUpdater(ownerKey, () => currentStorageKeyRef.current, update));
  }, [activeStorageKey, setValue]);
}
