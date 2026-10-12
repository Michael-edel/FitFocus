import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { previousPwaDist } from './support/preparePwaFixture';
import { startPwaReleaseServer } from './support/pwaReleaseServer';
import { saved, navigate, healthy } from './support/familyHarness';
import { mockApp, openApp } from './support/appHarness';

async function openNative(page: Page, url: string, standalone: boolean) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (!['error', 'warning'].includes(message.type())) return;
    if (message.location().url.includes('/api/family/menu/state') && /\b503\b/.test(message.text())) return;
    errors.push(message.text());
  });
  await mockApp(page, { session: 'app', realServiceWorker: true, nativeApi: true, push: { standalone } });
  await openApp(page, url); await expect(page).toHaveTitle(/FitFocus/); await expect(page).toHaveURL(/#family$/);
  await expect(page.getByText('Семья с постоянным меню', { exact: true })).toBeVisible();
  return errors;
}

test('real service worker waits for an explicit update and preserves durable family intent', async ({ context }, info) => {
  // Two real installations, two tabs, update activation and reload are one integration flow.
  test.setTimeout(90_000);
  const server = await startPwaReleaseServer(previousPwaDist, resolve('dist'));
  const oldPage = await context.newPage(), page = await context.newPage();
  const diagnostics: string[] = [];
  for (const tab of [oldPage, page]) {
    tab.on('pageerror', error => diagnostics.push(error.message));
    tab.on('console', message => { if (['warning', 'error'].includes(message.type())) diagnostics.push(message.text()); });
    tab.on('response', response => { if (response.status() >= 400) diagnostics.push(`${response.status()} ${response.url()}`); });
  }
  try {
    const standalone = info.project.name.includes('-pwa');
    const oldErrors = await openNative(oldPage, server.origin + '/#family', standalone);
    await expect.poll(() => oldPage.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toContain('/sw.js');
    expect((await saved(oldPage)).version).toBe(2);
    server.release();
    // A release query bypasses the old precached index while retaining the same origin/scope/IDB.
    const errors = await openNative(page, server.origin + '/?release=next#family', standalone);
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).waiting?.state)).toBe('installed');
    await page.getByRole('button', { name: 'Сгенерировать семейное меню', exact: true }).click();
    await expect.poll(() => server.counts.put).toBeGreaterThan(0);
    const pending = (await saved(page)).operations[0]; expect(pending.status).toBe('pending');
    const update = page.getByRole('button', { name: 'Обновить приложение', exact: true });
    await expect(update).toBeVisible();
    await expect(page.getByRole('status', { name: 'Обновление FitFocus', exact: true })).toHaveCSS('background-color', /^rgb\(/);
    await page.getByRole('button', { name: 'Позже', exact: true }).click();
    await expect(update).not.toBeVisible();
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).waiting?.state)).toBe('installed');
    await page.reload();
    await expect(page.getByText('Семья с постоянным меню', { exact: true })).toBeVisible();
    await expect(update).toBeVisible();
    await expect.poll(async () => (await saved(page)).operations[0]?.opId).toBe(pending.opId);
    await navigate(page, 'Настройки');
    const name = page.getByPlaceholder('Как к вам обращаться');
    await name.fill('Черновик перед обновлением');
    await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update(); });
    await expect(name).toHaveValue('Черновик перед обновлением');
    await expect(page.getByText('Сохраните изменения во всех открытых вкладках перед обновлением.', { exact: true })).toBeVisible();
    await name.evaluate(element => element.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: info.outputPath('pwa-update-ready-with-draft.png') });
    let navigations = 0; page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations += 1; });
    let oldNavigations = 0; oldPage.on('framenavigated', frame => { if (frame === oldPage.mainFrame()) oldNavigations += 1; });
    // Drop one activation message; keep the actual worker, registration and network intact.
    await page.evaluate(() => {
      const post = ServiceWorker.prototype.postMessage;
      ServiceWorker.prototype.postMessage = function(message: unknown, options?: StructuredSerializeOptions | Transferable[]) {
        if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'SKIP_WAITING') {
          ServiceWorker.prototype.postMessage = post; return;
        }
        Reflect.apply(post, this, [message, options ?? []]);
      };
    });
    await update.click();
    await expect(page.getByText('Не удалось завершить обновление. Повторите попытку.', { exact: true })).toBeVisible({ timeout: 15_000 });
    expect(navigations).toBe(0); expect(oldNavigations).toBe(0);
    await expect(name).toHaveValue('Черновик перед обновлением');
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).waiting?.state)).toBe('installed');
    await expect.poll(async () => (await saved(page)).operations[0]?.value).toBe(pending.value);
    await name.evaluate(element => element.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: info.outputPath('pwa-update-retry-preserved-draft.png') });
    await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
    await expect.poll(async () => (await saved(page)).profiles[0]?.name).toBe('Черновик перед обновлением');
    await update.click();
    await expect.poll(() => navigations).toBeGreaterThan(0);
    await expect.poll(() => oldNavigations).toBeGreaterThan(0);
    await Promise.all([page.waitForLoadState('load'), oldPage.waitForLoadState('load')]);
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).waiting === null)).toBe(true);
    await expect.poll(async () => (await saved(page)).profiles[0]?.name).toBe('Черновик перед обновлением');
    // In-app tab selection does not change the original #family deep link.
    await expect(page.getByText('Семья с постоянным меню', { exact: true })).toBeVisible();
    await navigate(page, 'Настройки');
    await expect(page.getByPlaceholder('Как к вам обращаться')).toHaveValue('Черновик перед обновлением');
    await expect.poll(async () => (await saved(page)).operations[0]?.opId).toBe(pending.opId);
    await expect.poll(async () => (await saved(page)).operations[0]?.value).toBe(pending.value);
    expect((await saved(page)).version).toBe(3); expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(700);
    await expect.poll(async () => (await saved(oldPage)).operations[0]?.opId).toBe(pending.opId);
    expect((await saved(oldPage)).version).toBe(3);
    await expect(oldPage.getByText('Семья с постоянным меню', { exact: true })).toBeVisible();
    const cachedApi = await page.evaluate(async () => {
      const requests = await Promise.all((await caches.keys()).map(async name => (await caches.open(name)).keys()));
      return requests.flat().filter(request => new URL(request.url).pathname.startsWith('/api/')).map(request => request.url);
    });
    expect(cachedApi).toEqual([]); expect(server.unexpectedApi).toEqual([]);
    await expect(page).toHaveTitle(/FitFocus/); await healthy(page, errors); await healthy(oldPage, oldErrors);
    await page.getByPlaceholder('Как к вам обращаться').evaluate(element => element.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: info.outputPath('pwa-updated-preserved-profile.png') });
    await info.attach('pwa-runtime-diagnostics', { body: JSON.stringify({ diagnostics, unexpectedApi: server.unexpectedApi,
      counts: server.counts, idbVersion: (await saved(page)).version, preservedFamilyOpId: pending.opId }), contentType: 'application/json' });
  } catch (error) {
    console.error('PWA runtime diagnostics:', JSON.stringify({ diagnostics, unexpectedApi: server.unexpectedApi }));
    await info.attach('pwa-runtime-diagnostics', { body: JSON.stringify({ diagnostics, unexpectedApi: server.unexpectedApi }), contentType: 'application/json' });
    await Promise.allSettled([
      oldPage.screenshot({ path: info.outputPath('pwa-old-failed.png'), timeout: 3000 }),
      page.screenshot({ path: info.outputPath('pwa-current-failed.png'), timeout: 3000 }),
    ]);
    throw error;
  } finally { await Promise.allSettled([oldPage.close(), page.close()]); await server.close(); }
});
