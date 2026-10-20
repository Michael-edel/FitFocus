import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { previousPwaDist } from './support/preparePwaFixture';
import { startPwaReleaseServer } from './support/pwaReleaseServer';
import { saved, navigate, healthy, isExpectedStateProtocolRejection } from './support/familyHarness';
import { mockApp, openApp, buildMockProfile } from './support/appHarness';

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
  await expectCapturedAppDatabase(page);
  return errors;
}

test('a native profile refresh cancelled by reload stays handled in Safari', async ({ page }, info) => {
  test.skip(!['desktop-webkit', 'iphone-safari', 'iphone-pwa'].includes(info.project.name), 'Safari/WebKit reload acceptance');
  let release!: () => void;
  let requestStarted!: () => void;
  let shouldHoldProfileRead = false;
  const profileReadStarted = new Promise<void>(resolve => { requestStarted = resolve; });
  const profileReadWait = new Promise<void>(resolve => { release = resolve; });
  const server = await startPwaReleaseServer(resolve('dist'), resolve('dist'), {
    profileGetGate: {
      shouldHold: () => shouldHoldProfileRead,
      started: () => requestStarted(),
      wait: profileReadWait,
    },
  });
  const errors: string[] = [];
  const expectedWebKitAiReloadWarnings: string[] = [];
  const isWebKit = ['desktop-webkit', 'iphone-safari', 'iphone-pwa'].includes(info.project.name);
  let reloadStarted = false;
  const cancelledProfileReads: string[] = [];
  page.on('pageerror', error => {
    if (isWebKit && reloadStarted && /^\/127\.0\.0\.1:\d+\/api\/ai due to access control checks\.$/.test(error.message)) {
      expectedWebKitAiReloadWarnings.push(error.message);
      return;
    }
    errors.push(error.message);
  });
  page.on('requestfailed', request => {
    if (new URL(request.url()).pathname === '/api/profile' && request.method() === 'GET') {
      cancelledProfileReads.push(request.failure()?.errorText ?? 'unknown failure');
    }
  });
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });

  try {
    await mockApp(page, { session: 'app', realServiceWorker: true, nativeApi: true,
      push: { standalone: info.project.name.endsWith('-pwa') } });
    await openApp(page, server.origin + '/#settings');
    const name = page.getByPlaceholder('Как к вам обращаться');
    await expect(name).toHaveValue(buildMockProfile().name);

    shouldHoldProfileRead = true;
    await page.bringToFront();
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await profileReadStarted;

    reloadStarted = true;
    try {
      await page.reload();
    } finally {
      reloadStarted = false;
    }
    shouldHoldProfileRead = false;
    release();

    await expect(name).toHaveValue(buildMockProfile().name);
    expect(server.counts.profileGet).toBeGreaterThan(0);
    expect(cancelledProfileReads).toHaveLength(1);
    expect(cancelledProfileReads[0]).toMatch(/cancel|abort/i);
    expect(server.counts.profile).toBe(0);
    expect(server.unexpectedApi).toEqual([]);
    expect(expectedWebKitAiReloadWarnings).toEqual([]);
    expect(errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    shouldHoldProfileRead = false;
    release();
    await server.close();
  }
});

async function requestLegacyWriterFence(page: Page, timeoutMs = 750) {
  return page.evaluate((timeout) => new Promise<unknown>((resolve) => {
    const worker = navigator.serviceWorker.controller;
    const buildId = localStorage.getItem('fitfocus.build.id');
    if (!worker || !buildId) return resolve(null);
    const channel = new MessageChannel();
    const challengeId = crypto.randomUUID();
    let settled = false;
    const finish = (result: unknown) => {
      if (settled) return;
      settled = true; clearTimeout(timer); channel.port1.close(); channel.port2.close(); resolve(result);
    };
    const timer = setTimeout(() => finish(null), timeout);
    channel.port1.onmessage = event => finish(event.data);
    worker.postMessage({ type: 'FITFOCUS_LEGACY_WRITER_FENCE_CHECK', challengeId, buildId }, [channel.port2]);
  }), timeoutMs);
}

function isExpectedFirefoxIdbNavigationWarning(message: string): boolean {
  return message.includes('An IndexedDB transaction that was not yet complete has been aborted due to page navigation.')
    && message.includes('/assets/ai-');
}

async function expectCapturedAppDatabase(page: Page) {
  await expect.poll(() => page.evaluate(() => Boolean(
    (window as Window & { __fitfocusE2eDatabase?: IDBDatabase }).__fitfocusE2eDatabase,
  ))).toBe(true);
}

async function stateDebug(page: Page) {
  return page.evaluate(async () => {
    let db = (window as Window & { __fitfocusE2eDatabase?: IDBDatabase }).__fitfocusE2eDatabase;
    let closeDatabase = false;
    if (!db) {
      const request = indexedDB.open('fitfocus-user-state-v1');
      db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      closeDatabase = true;
    }
    try {
      const tx = db.transaction(['outbox_meta', 'outbox'], 'readonly');
      const complete = new Promise<void>((resolve, reject) => {
        tx.addEventListener('complete', () => resolve(), { once: true });
        tx.addEventListener('abort', () => reject(tx.error), { once: true });
      });
      const get = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const [meta, outbox] = await Promise.all([
        get(tx.objectStore('outbox_meta').getAll()), get(tx.objectStore('outbox').getAll()),
      ]);
      await complete;
      return {
        fence: meta.find((entry: { id: string }) => entry.id === 'auth-fence') ?? null,
        activeSession: meta.find((entry: { id: string }) => entry.id === 'active-session') ?? null,
        migration: meta.find((entry: { id: string }) => entry.id === 'legacy-migration:v1') ?? null,
        operations: outbox.map((operation: { opId: string; resource?: string; status: string; reason?: string; baseVersion: number }) => ({
        opId: operation.opId, resource: operation.resource, status: operation.status, reason: operation.reason, baseVersion: operation.baseVersion,
        })),
      };
    } finally { if (closeDatabase) db.close(); }
  });
}

test('real service worker waits for an explicit update and preserves durable family intent', async ({ context }, info) => {
  // Two real installations, two tabs, update activation and reload are one integration flow.
  test.setTimeout(90_000);
  const server = await startPwaReleaseServer(previousPwaDist, resolve('dist'));
  const oldPage = await context.newPage(), page = await context.newPage();
  let legacyIdentityLoads = 0;
  const currentIdentityRequests: string[] = [];
  const apiRequests: string[] = [];
  const failedApiRequests: Array<{ tab: string; path: string; errorText: string | null }> = [];
  const meResponses: Array<{ tab: string; status: number }> = [];
  const stateProtocolRejectionResponses: Array<{ tab: string; status: number }> = [];
  // The retained v2 HTML has an unused GIS loader. Its first, uncontrolled page
  // uses a synthetic login; isolate that external SDK, preserving all v2 app/SW bytes.
  await oldPage.route('https://accounts.google.com/gsi/client', route => {
    legacyIdentityLoads += 1;
    return route.fulfill({ contentType: 'text/javascript', body: '/* Synthetic legacy OAuth session. */' });
  });
  page.on('request', request => { if (new URL(request.url()).hostname === 'accounts.google.com') currentIdentityRequests.push(request.url()); });
  const diagnostics: string[] = [];
  const familyPutResponses: Array<{ tab: string; status: number; headers: Record<string, string>; body: unknown }> = [];
  for (const tab of [oldPage, page]) {
    tab.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/')) apiRequests.push(`${tab === oldPage ? 'old' : 'new'} ${request.method()} ${path}`);
    });
    tab.on('requestfailed', request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/')) failedApiRequests.push({ tab: tab === oldPage ? 'old' : 'new', path,
        errorText: request.failure()?.errorText ?? null });
    });
    tab.on('pageerror', error => diagnostics.push(error.message));
    tab.on('console', message => {
      if (message.text().startsWith('[FITFOCUS-IDB]') || message.text().startsWith('[FITFOCUS-SAVED]')
        || ['warning', 'error'].includes(message.type())) diagnostics.push(message.text());
    });
    tab.on('response', response => {
      if (new URL(response.url()).pathname === '/api/state' && response.status() === 426) {
        stateProtocolRejectionResponses.push({ tab: tab === oldPage ? 'old' : 'new', status: response.status() });
      }
      if (new URL(response.url()).pathname === '/api/me') {
        meResponses.push({ tab: tab === oldPage ? 'old' : 'new', status: response.status() });
      }
      if (response.status() >= 400) diagnostics.push(`${response.status()} ${response.url()}`);
      if (new URL(response.url()).pathname === '/api/family/menu/state' && response.request().method() === 'PUT') {
        const body = response.request().postDataJSON();
        familyPutResponses.push({ tab: tab === oldPage ? 'old' : 'new', status: response.status(),
          headers: Object.fromEntries(['x-fitfocus-state-account', 'x-fitfocus-state-session'].map(name => [name, response.request().headers()[name] ?? ''])),
          body: { familyId: body.familyId, weekStart: body.weekStart, baseVersion: body.baseVersion } });
      }
    });
    // Preserve real IDB/SW behavior while recording blocked upgrades and which tab
    // closes its connection; this makes Firefox's intermittent open() hang diagnosable.
    await tab.addInitScript(() => {
      (window as Window & { __fitfocusE2eIdbDiagnostics?: boolean }).__fitfocusE2eIdbDiagnostics = true;
      const report = (event: string, detail: Record<string, unknown> = {}) => {
        console.log('[FITFOCUS-IDB]', JSON.stringify({ event, ...detail }));
      };
      let openRequestSequence = 0;
      const originalOpen = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function(name: string, version?: number) {
        const requestId = ++openRequestSequence;
        const detail = {
          name,
          requestId,
          requestedVersion: version ?? null,
          callStack: new Error().stack?.split('\n').slice(1, 7),
        };
        report('open-requested', detail);
        const request = version === undefined
          ? originalOpen.call(this, name)
          : originalOpen.call(this, name, version);
        request.addEventListener('blocked', () => report('blocked', detail));
        request.addEventListener('upgradeneeded', event => report('upgradeneeded', { ...detail,
          oldVersion: event.oldVersion, newVersion: event.newVersion,
        }));
        request.addEventListener('error', () => report('error', { ...detail, error: request.error?.name ?? null }));
        request.addEventListener('success', () => {
          const database = request.result;
          report('success', { ...detail, databaseVersion: database.version });
          const diagnosticWindow = window as Window & { __fitfocusE2eDatabase?: IDBDatabase };
          diagnosticWindow.__fitfocusE2eDatabase = database;
          database.addEventListener('versionchange', event => {
            report('versionchange', { databaseVersion: database.version, newVersion: event.newVersion });
            if (diagnosticWindow.__fitfocusE2eDatabase === database) delete diagnosticWindow.__fitfocusE2eDatabase;
          });
          const close = database.close.bind(database);
          database.close = () => {
            report('close', { databaseVersion: database.version });
            if (diagnosticWindow.__fitfocusE2eDatabase === database) delete diagnosticWindow.__fitfocusE2eDatabase;
            close();
          };
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
    // The currently open v2 page still lacks the writer-fence responder, so the
    // active old worker cannot prove that all old writers have stopped.
    expect(await requestLegacyWriterFence(page)).toBeNull();
    await page.getByRole('button', { name: 'Сгенерировать семейное меню', exact: true }).click();
    await expect.poll(async () => (await saved(page)).operations.length).toBeGreaterThan(0);
    await expect.poll(async () => (await saved(page)).operations[0]?.status).toBe('pending');
    const pending = (await saved(page)).operations[0]; expect(pending.status).toBe('pending');
    expect(server.counts.put).toBe(0);
    const update = page.getByRole('button', { name: 'Обновить приложение', exact: true });
    await expect(update).toBeVisible();
    await expect(page.getByRole('status', { name: 'Обновление FitFocus', exact: true })).toHaveCSS('background-color', /^rgb\(/);
    await page.getByRole('button', { name: 'Позже', exact: true }).click();
    await expect(update).not.toBeVisible();
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).waiting?.state)).toBe('installed');
    await page.reload();
    // The previous build is still an open same-origin writer, so the new runtime
    // must keep legacy-dependent sends paused until every client has updated.
    await expect(page.getByText(/Сначала нужно проверить импорт прежних изменений/)).toBeVisible();
    await expect(update).toBeVisible();
    await expect.poll(async () => (await saved(page)).operations[0]?.opId).toBe(pending.opId);
    expect(server.counts.put).toBe(0);
    await navigate(page, 'Настройки');
    const name = page.getByPlaceholder('Как к вам обращаться');
    await expect(name).toHaveValue(buildMockProfile().name);
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
    await Promise.all([expectCapturedAppDatabase(page), expectCapturedAppDatabase(oldPage)]);
    await expect(page.locator('script[type="module"][src]')).toHaveAttribute('src', candidateScript!);
    await expect(oldPage.locator('script[type="module"][src]')).toHaveAttribute('src', candidateScript!);
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).waiting === null)).toBe(true);
    await expect.poll(() => server.counts.put).toBeGreaterThan(0);
    const writerFence = await requestLegacyWriterFence(page) as {
      type?: string; complete?: boolean; clients?: Array<{ buildId: string }>;
    } | null;
    expect(writerFence).toMatchObject({ type: 'FITFOCUS_LEGACY_WRITER_FENCE_REPLY', complete: true });
    expect(writerFence?.clients?.length).toBeGreaterThanOrEqual(2);
    const currentBuildId = await localBuildId(page);
    expect(writerFence?.clients?.every(client => client.buildId === currentBuildId)).toBe(true);
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
    await expect(page).toHaveTitle(/FitFocus/);
    const expectedWebKitApiMeWarnings = errors.filter(error => error.includes('due to access control checks.') && error.includes('/api/me'));
    expect(expectedWebKitApiMeWarnings).toEqual([]);
    const currentPageIdbNavigationWarnings = errors.filter(isExpectedFirefoxIdbNavigationWarning);
    expect(currentPageIdbNavigationWarnings.length).toBeLessThanOrEqual(info.project.name === 'desktop-firefox' ? 2 : 0);
    // The retained v2 client may have no legacy state write to reject during this flow.
    // The dedicated legacy-outbox acceptance asserts the 426 barrier when such a write exists.
    expect(stateProtocolRejectionResponses).toHaveLength(server.counts.stateProtocolRejected);
    await healthy(page, errors.filter(error => !isExpectedStateProtocolRejection(error)
      && !expectedWebKitApiMeWarnings.includes(error)
      && !isExpectedFirefoxIdbNavigationWarning(error)));
    // The pinned previous release resolves IndexedDB reads on request success, then
    // clientsClaim reloads it before Firefox dispatches transaction.complete.
    // Its read is aborted by that expected navigation; durable writes are checked above.
    const previousBuildNavigationWarnings = oldErrors.filter(isExpectedFirefoxIdbNavigationWarning);
    expect(previousBuildNavigationWarnings.length).toBeLessThanOrEqual(info.project.name === 'desktop-firefox' ? 2 : 0);
    await healthy(oldPage, oldErrors.filter(error => !isExpectedStateProtocolRejection(error)
      && !(info.project.name === 'desktop-firefox' && isExpectedFirefoxIdbNavigationWarning(error))));
    await page.getByPlaceholder('Как к вам обращаться').evaluate(element => element.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: info.outputPath('pwa-updated-preserved-profile.png') });
    await info.attach('pwa-runtime-diagnostics', { body: JSON.stringify({ diagnostics, unexpectedApi: server.unexpectedApi,
      counts: server.counts, legacyIdentityLoads, currentIdentityRequests, candidateScript,
      idbVersion: (await saved(page)).version, preservedFamilyOpId: pending.opId,
      previousBuildNavigationWarnings: previousBuildNavigationWarnings.length,
      currentPageIdbNavigationWarnings: currentPageIdbNavigationWarnings.length,
      expectedWebKitApiMeWarnings: expectedWebKitApiMeWarnings.length, meResponses, failedApiRequests }), contentType: 'application/json' });
  } catch (error) {
    const oldPageState = await oldPage.evaluate(() => ({ href: location.href, title: document.title,
      buildId: localStorage.getItem('fitfocus.build.id'), legacySourcePresent: localStorage.getItem('fitfocus.remote-kv-outbox.v1') !== null,
      localStorageKeys: Object.keys(localStorage), sessionStorageKeys: Object.keys(sessionStorage), bodyText: document.body.innerText.slice(0, 500) })).catch(() => null);
    const currentPageState = await stateDebug(page).catch(error => ({ error: error instanceof Error ? error.message : String(error) }));
    console.error('PWA failure snapshot:', JSON.stringify({ failedApiRequests, meResponses, familyPutResponses, unexpectedApi: server.unexpectedApi,
      counters: server.counts, oldPageState, currentPageState, currentBody: await page.locator('body').innerText().catch(() => '') }));
    await info.attach('pwa-runtime-diagnostics', { body: JSON.stringify({ diagnostics, unexpectedApi: server.unexpectedApi,
      apiRequests, failedApiRequests, meResponses, familyPutResponses, oldPageState, currentPageState }), contentType: 'application/json' });
    await Promise.allSettled([
      oldPage.screenshot({ path: info.outputPath('pwa-old-failed.png'), timeout: 3000 }),
      page.screenshot({ path: info.outputPath('pwa-current-failed.png'), timeout: 3000 }),
    ]);
    throw error;
  } finally { await Promise.allSettled([oldPage.close(), page.close()]); await server.close(); }
});

async function localBuildId(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('fitfocus.build.id'));
}
