import { useCallback, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { OutboxReadGuard } from '../../storage/durableOutbox';

/** Stable React key for stateful screens whose drafts belong to one login scope. */
export function accountSessionRenderKey(
  guard: OutboxReadGuard | null,
  accountId: string | null | undefined,
): string {
  // authFence guards commits, but advances during a sender pause without changing
  // the account session that owns local screen state.
  return guard
    ? `${guard.accountId}:${guard.sessionEpoch}:${guard.serverSessionId}`
    : `no-session:${accountId || 'anonymous'}`;
}

/** Feedback can survive cache reconciliation, but never a missing or mismatched login. */
export function authenticatedAccountSessionScope(
  guard: OutboxReadGuard | null,
  accountId: string | null | undefined,
): string | null {
  return accountId && guard?.accountId === accountId
    ? accountSessionRenderKey(guard, accountId)
    : null;
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

export type AccountScopedUiState<T> = {
  scopeKey: string | null;
  value: T;
};

export function getAccountScopedUiStateValue<T>(
  state: AccountScopedUiState<T>,
  activeScopeKey: string | null,
  fallbackValue: T,
): T {
  return activeScopeKey !== null && state.scopeKey === activeScopeKey
    ? state.value
    : fallbackValue;
}

export function updateAccountScopedUiState<T>(
  state: AccountScopedUiState<T>,
  scopeKey: string | null,
  update: SetStateAction<T>,
  fallbackValue: T,
): AccountScopedUiState<T> {
  if (scopeKey === null) return state;
  const previousValue = state.scopeKey === scopeKey ? state.value : fallbackValue;
  const value = typeof update === 'function'
    ? (update as (previous: T) => T)(previousValue)
    : update;
  return { scopeKey, value };
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

/** Hide transient UI state outside its owner session and reject stale setters. */
export function useAccountScopedUiState<T>(
  scopeKey: string | null,
  fallbackValue: T,
): { value: T; setValue: Dispatch<SetStateAction<T>> } {
  const [state, setState] = useState<AccountScopedUiState<T>>(() => ({
    scopeKey,
    value: fallbackValue,
  }));
  const currentScopeKeyRef = useRef(scopeKey);
  currentScopeKeyRef.current = scopeKey;
  const setScopedState = useAccountScopedUiSetter(scopeKey, setState, scopeKey !== null);

  useLayoutEffect(() => {
    setState({ scopeKey, value: fallbackValue });
  }, [fallbackValue, scopeKey]);

  const value = getAccountScopedUiStateValue(state, scopeKey, fallbackValue);
  const setValue = useCallback<Dispatch<SetStateAction<T>>>((update) => {
    if (scopeKey === null) return;
    setScopedState(previous => updateAccountScopedUiState(previous, scopeKey, update, fallbackValue));
  }, [fallbackValue, scopeKey, setScopedState]);

  return { value, setValue };
}
