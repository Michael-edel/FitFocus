import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { mockApp, openApp } from './support/appHarness';
import { startPwaReleaseServer } from './support/pwaReleaseServer';

test.describe('production PWA shell', () => {
  test('loads auth shell, manifest and service worker from production build', async ({ page }, info) => {
    const server = await startPwaReleaseServer(resolve('dist'), resolve('dist'), { unauthenticated: true });
    try {
      const identityRequests: string[] = [], errors: string[] = [];
      page.on('request', request => { if (new URL(request.url()).hostname === 'accounts.google.com') identityRequests.push(request.url()); });
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
      await mockApp(page, { session: 'auth', realServiceWorker: true, nativeApi: true });
      await openApp(page, server.origin + '/');

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
      // The client uses server redirects, so rendering the shell must not load GIS.
      expect(identityRequests).toEqual([]);
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      expect(errors).toEqual([]);
      await expect(page).toHaveTitle(/FitFocus/);
      await page.screenshot({ path: info.outputPath('auth-shell-no-sdk.png') });
      await page.locator('#invite-code').fill('E2E-INVITE');
      const signIn = page.getByRole('link', { name: /Google профиль/ });
      await expect(signIn).toHaveAttribute('href', /\/api\/auth\/google\/start\?/);
      await page.screenshot({ path: info.outputPath('auth-redirect-ready.png') });
      await signIn.click();
      await expect(page.getByRole('heading', { name: 'Server OAuth endpoint', exact: true })).toBeVisible();
      const destination = new URL(page.url());
      expect(destination.pathname).toBe('/api/auth/google/start');
      expect(destination.searchParams.get('invite')).toBe('E2E-INVITE');
      expect(destination.searchParams.get('redirect')).toBe(server.origin);
      expect(await page.evaluate(() => sessionStorage.getItem('fitfocus.auth.pending-oauth.v1'))).toBe('1');
      expect(identityRequests).toEqual([]); expect(errors).toEqual([]);
      expect(server.counts.oauth).toBe(1); expect(server.unexpectedApi).toEqual([]);
    } catch (error) {
      await page.screenshot({ path: info.outputPath('auth-shell-failed.png'), timeout: 3000 }).catch(() => {});
      throw error;
    } finally { await page.close(); await server.close(); }
  });
});
