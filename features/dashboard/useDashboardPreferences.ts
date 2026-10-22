import { useEffect, useMemo, useState } from 'react';
import { getAccountScopedUiValue, useAccountScopedUiSetter } from '../state/accountScopedUi';

export type DashboardPreferences = {
  newWeight: string;
  pdfIncludeMealLog: boolean;
};

export function parseDashboardPreferences(
  newWeightValue: string | null,
  pdfIncludeMealLogValue: string | null,
): DashboardPreferences {
  return {
    newWeight: newWeightValue || '',
    pdfIncludeMealLog: pdfIncludeMealLogValue === '1',
  };
}

/** Persists dashboard-only preferences after the active profile has been loaded. */
export function useDashboardPreferences(userId: string | null | undefined, allowCachedUiStateRestore = true) {
  const storageKeys = useMemo(() => ({
    newWeight: `fitfocus.dashboard.new-weight.v1:${userId ?? 'anon'}`,
    pdfIncludeMealLog: `fitfocus.dashboard.pdf-include-meal-log.v1:${userId ?? 'anon'}`,
  }), [userId]);
  const scopeKey = storageKeys.newWeight;
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null);
  const [newWeight, setNewWeight] = useState('');
  const [pdfIncludeMealLog, setPdfIncludeMealLog] = useState(false);

  useEffect(() => {
    if (!allowCachedUiStateRestore) {
      setNewWeight('');
      setPdfIncludeMealLog(false);
      setHydratedStorageKey(null);
      return;
    }
    try {
      const next = parseDashboardPreferences(
        localStorage.getItem(storageKeys.newWeight),
        localStorage.getItem(storageKeys.pdfIncludeMealLog),
      );
      setNewWeight(next.newWeight);
      setPdfIncludeMealLog(next.pdfIncludeMealLog);
    } catch {
      setNewWeight('');
      setPdfIncludeMealLog(false);
    }
    setHydratedStorageKey(scopeKey);
  }, [allowCachedUiStateRestore, scopeKey, storageKeys]);

  useEffect(() => {
    if (!allowCachedUiStateRestore || hydratedStorageKey !== scopeKey) return;
    try {
      localStorage.setItem(storageKeys.newWeight, newWeight);
      localStorage.setItem(storageKeys.pdfIncludeMealLog, pdfIncludeMealLog ? '1' : '0');
    } catch {
      // Ignore storage quota or privacy errors.
    }
  }, [allowCachedUiStateRestore, hydratedStorageKey, newWeight, pdfIncludeMealLog, scopeKey, storageKeys]);

  const visibleState = getAccountScopedUiValue(scopeKey, hydratedStorageKey, {
    newWeight,
    pdfIncludeMealLog,
  }, { newWeight: '', pdfIncludeMealLog: false }, allowCachedUiStateRestore);
  const setNewWeightForScope = useAccountScopedUiSetter(scopeKey, setNewWeight, allowCachedUiStateRestore);
  const setPdfIncludeMealLogForScope = useAccountScopedUiSetter(scopeKey, setPdfIncludeMealLog, allowCachedUiStateRestore);

  return {
    newWeight: visibleState.newWeight,
    setNewWeight: setNewWeightForScope,
    pdfIncludeMealLog: visibleState.pdfIncludeMealLog,
    setPdfIncludeMealLog: setPdfIncludeMealLogForScope,
  };
}
