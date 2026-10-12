import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rollbackPwaDist } from './support/preparePwaFixture';
import { startPwaReleaseServer } from './support/pwaReleaseServer';
import { mockApp, openApp } from './support/appHarness';
import { saved, healthy } from './support/familyHarness';

test('fresh rollback installation can explicitly update to the candidate and preserve its family intent', async ({ context }, info) => {
  test.setTimeout(90_000);
  const server = await startPwaReleaseServer(rollbackPwaDist, resolve('dist'));
  const page = await context.newPage(), errors: string[] = [], googleRequests: string[] = [];
  let navigations = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/(^|\.)google\.com$/.test(new URL(request.url()).hostname)) googleRequests.push(request.url());
  });
  page.on('console', message => {
    if (!['error', 'warning'].includes(message.type())) return;
    if (message.location().url.includes('/api/family/menu/state') && /\b503\b/.test(message.text())) return;
    errors.push(message.text());
  });
  try {
    await mockApp(page, { session: 'app', realServiceWorker: true, nativeApi: true,
      push: { standalone: info.project.name.includes('-pwa') } });
    await openApp(page, server.origin + '/#family'); await expect(page).toHaveTitle(/FitFocus/);
    await expect(page.getByText('Семья с постоянным меню', { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toContain('/sw.js');
    const installedScript = await page.locator('script[type="module"][src]').getAttribute('src');
    const candidateScript = readFileSync(resolve('dist/index.html'), 'utf8').match(/src="([^"]*\/assets\/index-[^"]+\.js)"/)?.[1];
    expect(candidateScript).toBeTruthy(); expect(installedScript).not.toBe(candidateScript);
    await page.getByRole('button', { name: 'Сгенерировать семейное меню', exact: true }).click();
    await expect.poll(async () => (await saved(page)).operations[0]?.status).toBe('pending');
    const operation = (await saved(page)).operations[0];
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations += 1; });
    server.release(); await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update(); });
    await expect(page.getByRole('button', { name: 'Обновить приложение', exact: true })).toBeVisible();
    expect(navigations).toBe(0);
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).waiting?.state)).toBe('installed');
    const reloaded = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame(), timeout: 10_000 });
    await page.getByRole('button', { name: 'Обновить приложение', exact: true }).click({ noWaitAfter: true }); await reloaded;
    await page.waitForLoadState('load');
    await expect(page.locator('script[type="module"][src]')).toHaveAttribute('src', candidateScript!);
    await expect(page.getByText('Семья с постоянным меню', { exact: true })).toBeVisible();
    await expect.poll(async () => (await saved(page)).operations[0]?.opId).toBe(operation.opId);
    expect((await saved(page)).operations[0].value).toBe(operation.value); expect((await saved(page)).version).toBe(3);
    await healthy(page, errors); expect(server.unexpectedApi).toEqual([]); expect(googleRequests).toEqual([]);
    await page.screenshot({ path: info.outputPath('fresh-rollback-updated.png') });
    await info.attach('fresh-rollback-proof', { body: JSON.stringify({ installedScript, candidateScript, navigations, operation, googleRequests }), contentType: 'application/json' });
  } catch (error) {
    console.error('Fresh rollback diagnostics:', JSON.stringify({ navigations, errors, googleRequests, unexpectedApi: server.unexpectedApi }));
    await page.screenshot({ path: info.outputPath('fresh-rollback-failed.png'), timeout: 3000 }).catch(() => {}); throw error;
  } finally { await page.close(); await server.close(); }
});
