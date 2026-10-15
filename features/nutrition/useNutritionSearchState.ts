import { useEffect, useMemo, useState } from 'react';
import { parseJson } from '../../safeJson';
import { getAccountScopedUiValue, useAccountScopedUiSetter } from '../state/accountScopedUi';

export type NutritionSearchState = {
  query: string;
  open: boolean;
};

const EMPTY_SEARCH_STATE: NutritionSearchState = { query: '', open: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Supports the current JSON value as well as the old plain-text search query. */
export function parseNutritionSearchState(raw: string | null): NutritionSearchState {
  if (!raw) return EMPTY_SEARCH_STATE;
  const parsed = parseJson(raw);
  if (isRecord(parsed)) {
    return {
      query: typeof parsed.query === 'string' ? parsed.query : '',
      open: parsed.open === true,
    };
  }
  if (typeof parsed === 'string') return { query: parsed, open: false };
  return { query: raw, open: false };
}

/** Persists food search input per user without losing legacy plain-text values. */
export function useNutritionSearchState(userId: string | null | undefined, allowCachedUiStateRestore = true) {
  const storageKey = useMemo(
    () => `fitfocus.nutrition.search.v1:${userId ?? 'anon'}`,
    [userId],
  );
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  useEffect(() => {
    if (!allowCachedUiStateRestore) {
      setSearchQuery('');
      setShowSearchResults(false);
      setHydratedStorageKey(null);
      return;
    }
    try {
      const next = parseNutritionSearchState(localStorage.getItem(storageKey));
      setSearchQuery(next.query);
      setShowSearchResults(next.open);
    } catch {
      setSearchQuery('');
      setShowSearchResults(false);
    }
    setHydratedStorageKey(storageKey);
  }, [allowCachedUiStateRestore, storageKey]);

  useEffect(() => {
    if (!allowCachedUiStateRestore || hydratedStorageKey !== storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ query: searchQuery, open: showSearchResults }));
    } catch {
      // Ignore storage quota or privacy errors.
    }
  }, [allowCachedUiStateRestore, hydratedStorageKey, searchQuery, showSearchResults, storageKey]);

  const visibleState = getAccountScopedUiValue(storageKey, hydratedStorageKey, {
    query: searchQuery,
    open: showSearchResults,
  }, EMPTY_SEARCH_STATE, allowCachedUiStateRestore);
  const setSearchQueryForScope = useAccountScopedUiSetter(storageKey, setSearchQuery, allowCachedUiStateRestore);
  const setShowResultsForScope = useAccountScopedUiSetter(storageKey, setShowSearchResults, allowCachedUiStateRestore);

  return {
    searchQuery: visibleState.query,
    setSearchQuery: setSearchQueryForScope,
    showSearchResults: visibleState.open,
    setShowSearchResults: setShowResultsForScope,
  };
}
