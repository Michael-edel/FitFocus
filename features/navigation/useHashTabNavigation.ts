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
  const [activeTab, setSelectedTab] = useState<AppTabId>(() => readInitialHashTab() || defaultTab);
  const setActiveTab = useCallback((tab: AppTabId) => {
    setSelectedTab(tab);
    if (typeof window !== 'undefined' && parseHashTab(window.location.hash) !== tab) {
      window.history.pushState(null, '', `#/${tab}`);
    }
  }, []);

  useEffect(() => {
    const applyHashTab = () => {
      const tab = readInitialHashTab();
      if (tab) setSelectedTab(tab);
      else if (!window.location.hash) setSelectedTab(defaultTab);
    };
    applyHashTab();
    window.addEventListener('hashchange', applyHashTab);
    window.addEventListener('popstate', applyHashTab);
    return () => { window.removeEventListener('hashchange', applyHashTab); window.removeEventListener('popstate', applyHashTab); };
  }, [defaultTab]);

  return { activeTab, setActiveTab };
}
