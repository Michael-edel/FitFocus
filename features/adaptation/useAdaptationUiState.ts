import { useEffect, useRef, useState } from 'react';
import { safeSetItem } from '../../storage/hybrid';

export type AdaptationUiState = {
  read: boolean;
  expanded: boolean;
};

const DEFAULT_ADAPTATION_UI_STATE: AdaptationUiState = {
  read: false,
  expanded: false,
};

export function parseAdaptationUiState(
  readValue: string | null,
  expandedValue: string | null,
): AdaptationUiState {
  return {
    read: readValue === '1',
    expanded: expandedValue === '1',
  };
}

function storageKeys(userId: string) {
  return {
    read: `fitfocus_data_${userId}_adapt_read`,
    expanded: `fitfocus_data_${userId}_adapt_expanded`,
  };
}

/** Keeps adaptation panel preferences isolated while the active profile changes. */
export function useAdaptationUiState(userId: string | null | undefined) {
  const [adaptExpanded, setAdaptExpanded] = useState(DEFAULT_ADAPTATION_UI_STATE.expanded);
  const [adaptRead, setAdaptRead] = useState(DEFAULT_ADAPTATION_UI_STATE.read);
  const hydratedUserIdRef = useRef<string | null>(null);
  const skipNextSaveRef = useRef(false);

  useEffect(() => {
    if (!userId) {
      hydratedUserIdRef.current = null;
      skipNextSaveRef.current = true;
      setAdaptExpanded(DEFAULT_ADAPTATION_UI_STATE.expanded);
      setAdaptRead(DEFAULT_ADAPTATION_UI_STATE.read);
      return;
    }
    if (hydratedUserIdRef.current === userId) return;

    const keys = storageKeys(userId);
    try {
      const readValue = localStorage.getItem(keys.read);
      const expandedValue = localStorage.getItem(keys.expanded);
      const next = parseAdaptationUiState(readValue, expandedValue);

      hydratedUserIdRef.current = userId;
      skipNextSaveRef.current = true;
      setAdaptRead(next.read);
      setAdaptExpanded(next.expanded);

      // Keep the existing remote-state synchronization for these legacy keys.
      safeSetItem(keys.read, next.read ? '1' : '0');
      safeSetItem(keys.expanded, next.expanded ? '1' : '0');
    } catch {
      hydratedUserIdRef.current = userId;
      skipNextSaveRef.current = true;
      setAdaptRead(DEFAULT_ADAPTATION_UI_STATE.read);
      setAdaptExpanded(DEFAULT_ADAPTATION_UI_STATE.expanded);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId || hydratedUserIdRef.current !== userId) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    const keys = storageKeys(userId);
    safeSetItem(keys.read, adaptRead ? '1' : '0');
    safeSetItem(keys.expanded, adaptExpanded ? '1' : '0');
  }, [adaptExpanded, adaptRead, userId]);

  return {
    adaptExpanded,
    setAdaptExpanded,
    adaptRead,
    setAdaptRead,
  };
}
