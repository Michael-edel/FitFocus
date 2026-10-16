import { useCallback, useEffect, useRef, useState } from 'react';

export type WisShareState = 'idle' | 'busy' | 'success' | 'error';

/** Owns the transient status message shown while a WIS card is prepared or shared. */
export function useWisShareNotice(resetDelayMs = 3500) {
  const resetTimerRef = useRef<number | null>(null);
  const [wisShareState, setWisShareState] = useState<WisShareState>('idle');
  const [wisShareMessage, setWisShareMessage] = useState<string | null>(null);

  const setWisShareNotice = useCallback((state: WisShareState, message: string | null) => {
    setWisShareState(state);
    setWisShareMessage(message);
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    if (state !== 'busy' && message) {
      resetTimerRef.current = window.setTimeout(() => {
        setWisShareState('idle');
        setWisShareMessage(null);
      }, resetDelayMs);
    }
  }, [resetDelayMs]);

  useEffect(() => () => {
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
  }, []);

  return { wisShareState, wisShareMessage, setWisShareNotice };
}