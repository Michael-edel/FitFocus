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
  let legacyIdentityLoads = 0;
  const currentIdentityRequests: string[] = [];
  // The retained v2 HTML has an unused GIS loader. Its first, uncontrolled page
  // uses a synthetic login; isolate that external SDK, preserving all v2 app/SW bytes.
  await oldPage.route('https://accounts.google.com/gsi/client', route => {
    legacyIdentityLoads += 1;
    return route.fulfill({ contentType: 'text/javascript', body: '/* Synthetic legacy OAuth session. */' });
  });
  page.on('request', request => { if (new URL(request.url()).hostname === 'accounts.google.com') currentIdentityRequests.push(request.url()); });
  const diagnostics: string[] = [];
  for (const tab of [oldPage, page]) {
    tab.on('pageerror', error => diagnostics.push(error.message));
    tab.on('console', message => {
      if (message.text().startsWith('[FITFOCUS-IDB]') || message.text().startsWith('[FITFOCUS-SAVED]')
        || ['warning', 'error'].includes(message.type())) diagnostics.push(message.text());
    });
    tab.on('response', response => { if (response.status() >= 400) diagnostics.push(`${response.status()} ${response.url()}`); });
    // Preserve real IDB/SW behavior while recording blocked upgrades and which tab
    // closes its connection; this makes Firefox's intermittent open() hang diagnosable.
    await tab.addInitScript(() => {
      (window as Window & { __fitfocusE2eIdbDiagnostics?: boolean }).__fitfocusE2eIdbDiagnostics = true;
      const originalOpen = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function(name: string, version?: number) {
        const request = version === undefined
          ? originalOpen.call(this, name)
          : originalOpen.call(this, name, version);
        const report = (event: string, detail: Record<string, unknown> = {}) => {
          console.log('[FITFOCUS-IDB]', JSON.stringify({ name, requestedVersion: version ?? null, event, ...detail }));
        };
        request.addEventListener('blocked', () => report('blocked'));
        request.addEventListener('upgradeneeded', event => report('upgradeneeded', {
          oldVersion: event.oldVersion, newVersion: event.newVersion,
        }));
        request.addEventListener('error', () => report('error', { error: request.error?.name ?? null }));
        request.addEventListener('success', () => {
          const database = request.result;
          report('success', { databaseVersion: database.version });
          database.addEventListener('versionchange', event => report('versionchange', {
            databaseVersion: database.version, newVersion: event.newVersion,
          }));
          const close = database.close.bind(database);
          database.close = () => { report('close', { databaseVersion: database.version }); close(); };
        });
        return request;
      };
    });
  }
  try {
    const standalone = info.project.name.includes('-pwa');
    const oldErrors = await openNative(oldPage, server.origin + '/#family', standalone);
    await expect.poll(() => oldPage.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toContain('/sw.js');
    expect((await saved(oldPage)).version).toBe(2);
    server.release();
    // A release query bypasses the old precached index while retaining the same origin/scope/IDB.
    const errors = await openNative(page, server.origin + '/?release=next#family', standalone);
    const candidateScript = await page.locator('script[type="module"][src]').getAttribute('src');
    expect(candidateScript).toBeTruthy();
    expect(await oldPage.locator('script[type="module"][src]').getAttribute('src')).not.toBe(candidateScript);
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
    const reloaded = [page, oldPage].map(tab => tab.waitForEvent('framenavigated', frame => frame === tab.mainFrame()));
    // Waiting for navigation inside click can snapshot the new DOM before its CSS loads.
    // Subscribe first, return from the click on the old document, then wait for both loads.
    await update.click({ noWaitAfter: true });
    await Promise.all(reloaded);
    await Promise.all([page.waitForLoadState('load'), oldPage.waitForLoadState('load')]);
    expect(navigations).toBeGreaterThan(0); expect(oldNavigations).toBeGreaterThan(0);
    await expect(page.locator('script[type="module"][src]')).toHaveAttribute('src', candidateScript!);
    await expect(oldPage.locator('script[type="module"][src]')).toHaveAttribute('src', candidateScript!);
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
    expect(legacyIdentityLoads).toBeGreaterThan(0); expect(currentIdentityRequests).toEqual([]);
    await expect(page).toHaveTitle(/FitFocus/); await healthy(page, errors); await healthy(oldPage, oldErrors);
    await page.getByPlaceholder('Как к вам обращаться').evaluate(element => element.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: info.outputPath('pwa-updated-preserved-profile.png') });
    await info.attach('pwa-runtime-diagnostics', { body: JSON.stringify({ diagnostics, unexpectedApi: server.unexpectedApi,
      counts: server.counts, legacyIdentityLoads, currentIdentityRequests, candidateScript,
      idbVersion: (await saved(page)).version, preservedFamilyOpId: pending.opId }), contentType: 'application/json' });
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
