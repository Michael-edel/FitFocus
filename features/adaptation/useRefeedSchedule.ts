import { useCallback } from 'react';
import { toLocalDayKey } from '../../dateUtils';
import { useOwnedState } from '../state/useOwnedState';
import type { StateCodec } from '../../storage/stateEditor';

export function getTomorrowRefeedDate(now: Date = new Date()): string {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return toLocalDayKey(tomorrow);
}

const refeedCodec: StateCodec<string | null> = { decode: (raw, fallback) => raw ?? fallback, encode: (value) => value ?? '' };

/** Schedules a refeed with its outgoing intent in one account-owned transaction. */
export function useRefeedSchedule(userId: string | null | undefined) {
  const state = useOwnedState(userId, 'refeed', null, refeedCodec);
  const scheduleRefeedTomorrow = useCallback(() => { state.setValue(getTomorrowRefeedDate()); }, [state.setValue]);
  return { refeedDate: state.value, scheduleRefeedTomorrow };
}
