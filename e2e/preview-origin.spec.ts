import { expect } from '@playwright/test';
import { test } from './support/mockTest';
import { mockApp, openApp } from './support/appHarness';

const hosts = [
  ['branch preview', 'qa-preview.fitfocus.pages.dev'],
  ['commit preview', '7ac102ab.fitfocus.pages.dev'],
  ['canonical host', 'fitfocus.pages.dev'],
] as const;

for (const [name, host] of hosts) {
  test(`${name} keeps its origin and its own API while settings remain usable`, async ({ page, context, baseURL }, info) => {
    const origin = `https://${host}`;
    const entry = `${origin}/?source=preview-smoke#settings`;
    const unexpectedRequests: string[] = [], apiOrigins = new Set<string>(), errors: string[] = [];
    if (!baseURL) throw new Error('Preview origin test requires the local build server');

    // All static bytes come from the local production build. Never contact a real Pages host.
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || url.pathname.startsWith('/api/')) {
        unexpectedRequests.push(url.toString());
        await route.fulfill({ status: 502, contentType: 'text/plain', body: 'Unexpected fixture request' });
        return;
      }
      const local = new URL(url.pathname + url.search, baseURL);
      // Firefox includes the original Host; the local fetch must retain Vite's host allowlist.
      const response = await route.fetch({ url: local.toString(), headers: { ...route.request().headers(), host: local.host } });
      await route.fulfill({ response });
    });
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) apiOrigins.add(url.origin);
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
    // This is an origin-routing test; the existing app fixture mocks SW and API.
    await mockApp(page, { session: 'app' });
    await openApp(page, entry);
    const light = page.getByRole('button', { name: /^Светлая/ });
    await expect(light).toBeVisible();
    await expect(page).toHaveTitle(/FitFocus/); await expect(page).toHaveURL(entry);
    await light.click(); await expect(light).toHaveClass(/border-indigo-500\/40/);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    expect(apiOrigins).toEqual(new Set([origin])); expect(unexpectedRequests).toEqual([]); expect(errors).toEqual([]);
    await page.screenshot({ path: info.outputPath('origin-settings.png') });
    await info.attach('origin-proof', { body: JSON.stringify({ entry, url: page.url(), apiOrigins: [...apiOrigins], unexpectedRequests }), contentType: 'application/json' });
  });
}
