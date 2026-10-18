import { expect } from '@playwright/test';
import { test } from './support/mockTest';
import { mockApp, openApp } from './support/appHarness';

const account = 'google-e2e-sub';
const sid = 'a'.repeat(64);
const marker = '__e2e_admin_unload__';

test('navigation aborts a held admin response before unload without losing its captured scope', async ({ page }) => {
  await page.addInitScript(markerKey => {
    const mark = (suffix: string, value: string) => {
      try { localStorage.setItem(`${markerKey}:${suffix}`, value); } catch { /* The document may be unloading. */ }
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof Request ? input.url : String(input), location.href);
      if (url.pathname === '/api/admin/stats') {
        const count = Number(localStorage.getItem(`${markerKey}:stats`)) || 0;
        mark('stats', String(count + 1));
        const headers = new Headers(init?.headers);
        mark('scope', `${headers.get('X-FitFocus-State-Account')}:${headers.get('X-FitFocus-State-Session')}`);
        init?.signal?.addEventListener('abort', () => mark('signal', 'aborted'), { once: true });
      }
      return originalFetch(input, init);
    };
    window.addEventListener('beforeunload', () => mark('beforeunload', 'fired'));
  }, marker);

  let statsCount = 0;
  let signalFirstStats!: () => void;
  let releaseFirstStats!: () => void;
  const firstStatsStarted = new Promise<void>(resolve => { signalFirstStats = resolve; });
  const firstStatsGate = new Promise<void>(resolve => { releaseFirstStats = resolve; });
  await mockApp(page, {
    session: 'app',
    admin: true,
    acknowledgeStateWrites: true,
    beforeAdminStats: async () => {
      statsCount += 1;
      if (statsCount === 1) {
        signalFirstStats();
        await firstStatsGate;
      }
    },
  });
  await page.route('**/__e2e_admin_unload_probe__', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><title>Unload probe</title></head><body>Unload probe</body></html>',
  }));

  await openApp(page, '/');
  if ((page.viewportSize()?.width ?? 1024) < 768) {
    await page.getByRole('button', { name: 'Ещё', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Админ', exact: true }).click();
  await firstStatsStarted;
  await expect.poll(() => page.evaluate(key => localStorage.getItem(`${key}:stats`), marker)).toBe('1');

  const appOrigin = await page.evaluate(() => location.origin);
  try {
    await page.goto(`${appOrigin}/__e2e_admin_unload_probe__`);
  } finally {
    releaseFirstStats();
  }
  await expect(page).toHaveTitle('Unload probe');
  expect(await page.evaluate(key => ({
    signal: localStorage.getItem(`${key}:signal`),
    beforeunload: localStorage.getItem(`${key}:beforeunload`),
    scope: localStorage.getItem(`${key}:scope`),
  }), marker)).toEqual({ signal: 'aborted', beforeunload: 'fired', scope: `${account}:${sid}` });
});
