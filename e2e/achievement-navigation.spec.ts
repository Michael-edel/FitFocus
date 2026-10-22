import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { startPwaReleaseServer } from './support/pwaReleaseServer';
import { mockApp, openApp } from './support/appHarness';

test('a native achievement check is aborted before reload leaves the document', async ({ context }) => {
  const requests: Array<{ method: string | undefined; account: string | undefined; session: string | undefined }> = [];
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const server = await startPwaReleaseServer(resolve('dist'), resolve('dist'), {
    achievementCheckGate: { started: scope => { requests.push(scope); }, wait },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await mockApp(page, { session: 'app', realServiceWorker: true, nativeApi: true });
    await page.addInitScript(() => {
      const key = 'fitfocus.e2e.achievement-navigation';
      const documentId = performance.timeOrigin;
      const record = (event: string) => {
        const events = JSON.parse(localStorage.getItem(key) ?? '[]');
        events.push({ documentId, event });
        localStorage.setItem(key, JSON.stringify(events));
      };
      let observed = false;
      const original = window.fetch;
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (new URL(url, location.href).pathname === '/api/achievements/check' && !observed) {
          observed = true;
          record('request');
          init?.signal?.addEventListener('abort', () => record('abort'), { once: true });
        }
        return original.call(window, input, init);
      };
      window.addEventListener('beforeunload', () => { if (observed) record('beforeunload'); });
      window.addEventListener('pagehide', () => { if (observed) record('pagehide'); });
    });
    await openApp(page, `${server.origin}/#dashboard`);
    await expect(page).toHaveTitle(/FitFocus/);
    await expect(page.getByLabel('Вес сегодня')).toBeVisible();
    await expect.poll(() => requests.length).toBeGreaterThan(0);
    expect(requests[0]).toEqual({ method: 'POST', account: 'google-e2e-sub', session: 'a'.repeat(64) });
    const documentId = await page.evaluate(() => performance.timeOrigin);
    await page.reload();
    // Keep document identities separate even if the new page starts a check early.
    const events = await page.evaluate(documentId =>
      (JSON.parse(localStorage.getItem('fitfocus.e2e.achievement-navigation') ?? '[]') as Array<{ documentId: number; event: string }>)
        .filter(entry => entry.documentId === documentId).map(entry => entry.event), documentId);
    expect(events).toContain('beforeunload');
    expect(events).toContain('abort');
    expect(events.indexOf('abort')).toBeGreaterThan(events.indexOf('beforeunload'));
    expect(events.indexOf('pagehide')).toBeGreaterThan(events.indexOf('abort'));
    release();
    await expect(page.getByLabel('Вес сегодня')).toBeVisible();
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(server.unexpectedApi).toEqual([]);
  } finally {
    release();
    try { await page.goto('about:blank'); }
    finally { await server.close(); }
  }
});
