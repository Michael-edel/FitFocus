import { useCallback, useEffect, useState } from 'react';
import { type AppTabId, sidebarTabs } from '../../navigation';

/** Converts a FitFocus hash route into a public application tab. */
export function parseHashTab(hash: string): AppTabId | null {
  const tabId = hash.replace(/^#\/?/, '').split(/[?&]/)[0];
  if (!tabId || tabId === 'admin') return null;
  return sidebarTabs.some((tab) => tab.id === tabId) ? tabId as AppTabId : null;
}

function readInitialHashTab(): AppTabId | null {
  if (typeof window === 'undefined') return null;
  return parseHashTab(window.location.hash);
}

/** Keeps the selected application tab aligned with browser hash navigation. */
export function useHashTabNavigation(defaultTab: AppTabId) {
  const [activeTab, setTab] = useState<AppTabId>(() => readInitialHashTab() || defaultTab);
  const setActiveTab = useCallback((tab: AppTabId) => {
    const url = new URL(window.location.href);
    const hashTab = parseHashTab(url.hash);
    if (tab === 'nutrition' && hashTab !== 'nutrition') {
      url.hash = 'nutrition';
      window.history.replaceState(window.history.state, '', url);
    } else if (tab !== 'nutrition' && hashTab === 'nutrition') {
      url.hash = '';
      window.history.replaceState(window.history.state, '', url);
    }
    setTab(tab);
  }, []);

  useEffect(() => {
    const applyHashTab = () => {
      const tab = readInitialHashTab();
      if (tab) setTab(tab);
    };
    applyHashTab();
    window.addEventListener('hashchange', applyHashTab);
    return () => window.removeEventListener('hashchange', applyHashTab);
  }, []);

  return { activeTab, setActiveTab };
}
