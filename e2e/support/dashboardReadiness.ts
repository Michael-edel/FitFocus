import type { Page } from '@playwright/test';

type ReadinessStage = { stage: string; atMs: number };
type DiagnosticWindow = Window & { __dashboardReadiness?: ReadinessStage[] };

/** Test-only observations: never changes account state, rendering, or request results. */
export async function observeDashboardReadiness(page: Page) {
  await page.addInitScript(() => {
    const stages: Array<{ stage: string; atMs: number }> = [];
    (window as Window & { __dashboardReadiness?: typeof stages }).__dashboardReadiness = stages;
    const recorded = new Set<string>();
    const record = (stage: string) => {
      if (recorded.has(stage)) return;
      recorded.add(stage);
      stages.push({ stage, atMs: performance.now() });
    };
    record('document-start');
    const observe = () => {
      const status = document.querySelector('main [role="status"]')?.textContent;
      if (status === 'Проверяем активную сессию…') record('session-check-visible');
      if (document.querySelector('main')?.textContent?.includes('Загрузка dashboard...')) record('dashboard-suspense-visible');
      if (document.querySelector('main input[aria-label="Вес сегодня"]')) record('dashboard-input-present');
    };
    new MutationObserver(observe).observe(document, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', () => { record('dom-content-loaded'); observe(); }, { once: true });
  });
}

export async function dashboardReadinessSnapshot(page: Page) {
  return page.evaluate(() => ({
    timeOrigin: performance.timeOrigin,
    stages: (window as DiagnosticWindow).__dashboardReadiness ?? [],
    resources: performance.getEntriesByType('resource')
      .filter(entry => /\/(api\/(me|bootstrap|state)|assets\/(DashboardScreen|PlanIntroModal)-)/.test(new URL(entry.name).pathname))
      .map(entry => ({ path: new URL(entry.name).pathname, startMs: entry.startTime, durationMs: entry.duration })),
  }));
}
