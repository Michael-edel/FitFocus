import { useCallback, useEffect, useState } from 'react';
import { toLocalDayKey } from '../../dateUtils';
import { safeSetItem } from '../../storage/hybrid';

export function getTomorrowRefeedDate(now: Date = new Date()): string {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return toLocalDayKey(tomorrow);
}

/** Schedules a refeed day in the current profile's synchronized browser state. */
export function useRefeedSchedule(userId: string | null | undefined) {
  const [refeedDate, setRefeedDate] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setRefeedDate(null);
      return;
    }
    const key = `fitfocus_data_${userId}_refeed`;
    try {
      const value = localStorage.getItem(key);
      if (value) safeSetItem(key, value);
      setRefeedDate(value);
    } catch {
      setRefeedDate(null);
    }
  }, [userId]);

  const scheduleRefeedTomorrow = useCallback(() => {
    if (!userId) return;
    const value = getTomorrowRefeedDate();
    safeSetItem(`fitfocus_data_${userId}_refeed`, value);
    setRefeedDate(value);
  }, [userId]);

  return { refeedDate, scheduleRefeedTomorrow };
}
