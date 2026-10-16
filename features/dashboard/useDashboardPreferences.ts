import { useEffect, useMemo, useRef, useState } from 'react';

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
export function useDashboardPreferences(userId: string | null | undefined) {
  const storageKeys = useMemo(() => ({
    newWeight: `fitfocus.dashboard.new-weight.v1:${userId ?? 'anon'}`,
    pdfIncludeMealLog: `fitfocus.dashboard.pdf-include-meal-log.v1:${userId ?? 'anon'}`,
  }), [userId]);
  const skipNextSaveRef = useRef(false);
  const [newWeight, setNewWeight] = useState('');
  const [pdfIncludeMealLog, setPdfIncludeMealLog] = useState(false);

  useEffect(() => {
    skipNextSaveRef.current = true;
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
  }, [storageKeys]);

  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    try {
      localStorage.setItem(storageKeys.newWeight, newWeight);
      localStorage.setItem(storageKeys.pdfIncludeMealLog, pdfIncludeMealLog ? '1' : '0');
    } catch {
      // Ignore storage quota or privacy errors.
    }
  }, [newWeight, pdfIncludeMealLog, storageKeys]);

  return {
    newWeight,
    setNewWeight,
    pdfIncludeMealLog,
    setPdfIncludeMealLog,
  };
}
