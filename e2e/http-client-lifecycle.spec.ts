import { expect } from '@playwright/test';
import { test } from './support/mockTest';
import { mockApp, openApp } from './support/appHarness';

const marker = '__e2e_http_client_unload__';

test('navigation aborts the held public environment request before unloading', async ({ page }) => {
  await page.addInitScript((markerKey) => {
    const mark = (suffix: string, value: string) => {
      try { localStorage.setItem(`${markerKey}:${suffix}`, value); } catch { /* The document may be unloading. */ }
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof Request ? input.url : String(input), location.href);
      if (url.pathname === '/api/env') {
        mark('request', 'started');
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          const abort = () => {
            mark('signal', 'aborted');
            reject(new DOMException('Aborted', 'AbortError'));
          };
          if (signal?.aborted) abort();
          else signal?.addEventListener('abort', abort, { once: true });
        });
      }
      return originalFetch(input, init);
    };
    window.addEventListener('beforeunload', () => mark('beforeunload', 'fired'));
  }, marker);

  await mockApp(page, { session: 'auth' });
  await page.route('**/__e2e_http_client_unload_probe__', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><title>Unload probe</title></head><body>Unload probe</body></html>',
  }));

  await openApp(page, '/');
  await expect.poll(() => page.evaluate(key => localStorage.getItem(`${key}:request`), marker)).toBe('started');

  const appOrigin = await page.evaluate(() => location.origin);
  await page.goto(`${appOrigin}/__e2e_http_client_unload_probe__`);
  await expect(page).toHaveTitle('Unload probe');
  await expect.poll(() => page.evaluate(key => ({
    request: localStorage.getItem(`${key}:request`),
    signal: localStorage.getItem(`${key}:signal`),
    beforeunload: localStorage.getItem(`${key}:beforeunload`),
  }), marker)).toEqual({ request: 'started', signal: 'aborted', beforeunload: 'fired' });
});
