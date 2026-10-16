import { useEffect } from 'react';
import type { AppTheme } from '../../types';

export function isDarkTheme(theme: AppTheme): boolean {
  return theme !== 'light';
}

/** Mirrors persisted application theme settings onto the document root. */
export function useDocumentTheme(theme: AppTheme) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.ffTheme = theme;
    root.classList.toggle('dark', isDarkTheme(theme));
  }, [theme]);
}