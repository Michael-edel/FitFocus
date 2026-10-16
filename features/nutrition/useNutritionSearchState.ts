import { useEffect, useMemo, useRef, useState } from 'react';
import { parseJson } from '../../safeJson';

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
export function useNutritionSearchState(userId: string | null | undefined) {
  const storageKey = useMemo(
    () => `fitfocus.nutrition.search.v1:${userId ?? 'anon'}`,
    [userId],
  );
  const skipNextSaveRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  useEffect(() => {
    skipNextSaveRef.current = true;
    try {
      const next = parseNutritionSearchState(localStorage.getItem(storageKey));
      setSearchQuery(next.query);
      setShowSearchResults(next.open);
    } catch {
      setSearchQuery('');
      setShowSearchResults(false);
    }
  }, [storageKey]);

  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify({ query: searchQuery, open: showSearchResults }));
    } catch {
      // Ignore storage quota or privacy errors.
    }
  }, [searchQuery, showSearchResults, storageKey]);

  return {
    searchQuery,
    setSearchQuery,
    showSearchResults,
    setShowSearchResults,
  };
}
