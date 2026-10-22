import { useCallback, useEffect, useRef, useState } from 'react';

export type WisShareState = 'idle' | 'busy' | 'success' | 'error';

type NoticeSnapshot = {
  ownerStorageKey: string | null;
  revision: number;
  state: WisShareState;
  message: string | null;
};

/** Owns the transient status message shown while a WIS card is prepared or shared. */
export function useWisShareNotice(ownerStorageKey: string | null, enabled = true, resetDelayMs = 3500) {
  const scopeRef = useRef({ ownerStorageKey, enabled, revision: 0 });
  if (scopeRef.current.ownerStorageKey !== ownerStorageKey || scopeRef.current.enabled !== enabled) {
    scopeRef.current = {
      ownerStorageKey,
      enabled,
      revision: scopeRef.current.revision + 1,
    };
  }
  const revision = scopeRef.current.revision;
  const resetTimerRef = useRef<number | null>(null);
  const [snapshot, setSnapshot] = useState<NoticeSnapshot>(() => ({
    ownerStorageKey,
    revision,
    state: 'idle',
    message: null,
  }));

  const setWisShareNotice = useCallback((state: WisShareState, message: string | null) => {
    const ownerRevision = revision;
    if (!enabled || ownerStorageKey === null || scopeRef.current.revision !== ownerRevision) return;
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    setSnapshot(previous => scopeRef.current.revision === ownerRevision
      ? { ownerStorageKey, revision: ownerRevision, state, message }
      : previous);
    if (state !== 'busy' && message) {
      resetTimerRef.current = window.setTimeout(() => {
        if (scopeRef.current.revision !== ownerRevision) return;
        setSnapshot(previous => scopeRef.current.revision === ownerRevision
          && previous.ownerStorageKey === ownerStorageKey
          && previous.revision === ownerRevision
          ? { ownerStorageKey, revision: ownerRevision, state: 'idle', message: null }
          : previous);
      }, resetDelayMs);
    }
  }, [enabled, ownerStorageKey, resetDelayMs, revision]);

  useEffect(() => {
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = null;
    return () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    };
  }, [revision]);

  const ownsSnapshot = enabled && ownerStorageKey !== null
    && snapshot.ownerStorageKey === ownerStorageKey
    && snapshot.revision === revision;

  return {
    wisShareState: ownsSnapshot ? snapshot.state : 'idle' as const,
    wisShareMessage: ownsSnapshot ? snapshot.message : null,
    setWisShareNotice,
  };
}
