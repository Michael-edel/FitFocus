import { expect, test } from '@playwright/test';
import { mockApp, openApp } from './support/appHarness';

test.describe('production PWA shell', () => {
  test('loads auth shell, manifest and service worker from production build', async ({ page }) => {
    await mockApp(page, { session: 'auth' });
    await openApp(page, '/');

    await expect(page.getByRole('heading', { name: 'FitFocus' })).toBeVisible();
    await expect(page.getByText('Только cloud-профиль')).toBeVisible();

    const manifestHref = await page.locator('link[rel="manifest"]').first().getAttribute('href');
    expect(manifestHref).toBeTruthy();

    const manifest = await page.evaluate(async (href) => {
      const response = await fetch(String(href));
      return response.json();
    }, manifestHref);

    expect(manifest.name).toBe('FitFocus');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');

    const swState = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) {
        return { supported: false, scriptURL: '' };
      }
      const registration = await navigator.serviceWorker.ready;
      return {
        supported: true,
        scriptURL: registration.active?.scriptURL || '',
      };
    });

    expect(swState.supported).toBe(true);
    expect(swState.scriptURL).toContain('sw');
  });
});
