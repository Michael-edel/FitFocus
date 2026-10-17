import { expect, test, type Page, type Request } from '@playwright/test';
import { resolve } from 'node:path';
import { mockApp, openApp } from './support/appHarness';
import { startPwaReleaseServer } from './support/pwaReleaseServer';

async function storedSettings(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('fitfocus-user-state-v1');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = database.transaction(['values', 'outbox', 'outbox_meta'], 'readonly');
      const read = <T,>(query: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
        query.onsuccess = () => resolve(query.result);
        query.onerror = () => reject(query.error);
      });
      const [values, operations, metadata] = await Promise.all([
        read(transaction.objectStore('values').getAll()),
        read(transaction.objectStore('outbox').getAll()),
        read(transaction.objectStore('outbox_meta').getAll()),
      ]);
      await new Promise<void>((resolve, reject) => {
        transaction.addEventListener('complete', () => resolve(), { once: true });
        transaction.addEventListener('abort', () => reject(transaction.error), { once: true });
      });
      return {
        value: values.find((entry) => entry.key.endsWith('_settings'))?.value ?? null,
        operations: operations.filter((entry) => entry.key.endsWith('_settings')),
        allOperations: operations,
        confirmedVersion: metadata.find((entry) => entry.key?.endsWith('_settings')
          && entry.confirmedVersion !== undefined)?.confirmedVersion ?? 0,
      };
    } finally {
      database.close();
    }
  });
}

async function failureStateDebug(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('fitfocus-user-state-v1');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = database.transaction(['outbox_meta'], 'readonly');
      const rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const query = transaction.objectStore('outbox_meta').getAll();
        query.onsuccess = () => resolve(query.result);
        query.onerror = () => reject(query.error);
      });
      await new Promise<void>((resolve, reject) => {
        transaction.addEventListener('complete', () => resolve(), { once: true });
        transaction.addEventListener('abort', () => reject(transaction.error), { once: true });
      });
      return {
        activeSession: rows.find((row) => row.id === 'active-session') ?? null,
        migration: rows.find((row) => row.id === 'legacy-migration:v1') ?? null,
        buildId: localStorage.getItem('fitfocus.build.id'),
        legacyQueue: localStorage.getItem('fitfocus.remote-kv-outbox.v1'),
        controller: navigator.serviceWorker.controller?.scriptURL ?? null,
        controllerState: navigator.serviceWorker.controller?.state ?? null,
      };
    } finally {
      database.close();
    }
  });
}

test('real PWA preserves settings through offline reopen and syncs after reconnection', async ({ context }, info) => {
  test.setTimeout(90_000);
  const server = await startPwaReleaseServer(resolve('dist'), resolve('dist'));
  let page = await context.newPage();
  const inFlightStateWrites = new Set<Request>();
  const failedStateWrites: Array<{ method: string; error: string | null }> = [];
  const navigationResponses: Array<{ url: string; status: number; fromServiceWorker: boolean }> = [];
  const pageErrors: string[] = [];
  const attachDiagnostics = (target: Page) => {
    target.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/state' && ['PUT', 'DELETE'].includes(request.method())) {
        inFlightStateWrites.add(request);
      }
    });
    target.on('requestfinished', (request) => inFlightStateWrites.delete(request));
    target.on('requestfailed', (request) => {
      inFlightStateWrites.delete(request);
      if (new URL(request.url()).pathname === '/api/state' && ['PUT', 'DELETE'].includes(request.method())) {
        failedStateWrites.push({ method: request.method(), error: request.failure()?.errorText ?? null });
      }
    });
    target.on('pageerror', (error) => pageErrors.push(error.message));
    target.on('response', (response) => {
      if (response.request().isNavigationRequest()) navigationResponses.push({ url: response.url(),
        status: response.status(), fromServiceWorker: response.fromServiceWorker() });
    });
  };
  attachDiagnostics(page);

  try {
    await mockApp(page, { session: 'app', realServiceWorker: true, nativeApi: true,
      push: { standalone: info.project.name.includes('-pwa') } });
    await openApp(page, server.origin + '/#settings');
    await expect(page).toHaveTitle(/FitFocus/);
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toContain('/sw.js');
    await expect(page.getByRole('button', { name: /^Светлая/ })).toBeVisible();
  // Do not reload across the startup report's active send. The server may
  // accept the request while navigation destroys the page before it commits
  // the IndexedDB acknowledgement, leaving a live lease in the fresh page.
  await expect.poll(() => server.stateWriteKeys)
    .toContain('fitfocus_data_google-e2e-sub_weekly_reports');
  await expect.poll(async () => (await storedSettings(page)).allOperations).toEqual([]);
  expect(inFlightStateWrites.size).toBe(0);
    // The installation page can load before the worker takes control. Warm one
    // controlled navigation online so the test models a previously used PWA.
    await page.reload();
    await expect(page).toHaveTitle(/FitFocus/);
    await expect(page.getByRole('button', { name: /^Светлая/ })).toBeVisible();
    expect(navigationResponses.at(-1)?.fromServiceWorker).toBe(true);
    await expect.poll(() => server.counts.me).toBeGreaterThan(0);
    // The app generates its first weekly AI report on startup. Let that
    // independent durable write finish before measuring offline behavior.
    await expect.poll(() => server.stateWriteKeys)
      .toContain('fitfocus_data_google-e2e-sub_weekly_reports');
    await expect.poll(async () => (await storedSettings(page)).allOperations).toEqual([]);
    expect(inFlightStateWrites.size).toBe(0);
    const initialStatePutAttempts = server.counts.currentStatePutAttempts;
    const initialStatePutAccepted = server.counts.currentStatePutAccepted;
    const initialStateWriteKeys = [...server.stateWriteKeys];
    expect(initialStateWriteKeys).not.toContain('fitfocus_data_google-e2e-sub_settings');

    server.setStateWriteDisconnected(true);
    await context.setOffline(true);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
    await page.getByRole('button', { name: /^Светлая/ }).click();
    await expect.poll(async () => (await storedSettings(page)).operations.length).toBe(1);
    await page.waitForTimeout(500);
    expect(server.counts.currentStatePutAttempts).toBe(initialStatePutAttempts);
    expect(server.counts.currentStatePutAccepted).toBe(initialStatePutAccepted);
    expect(server.stateWriteKeys).toEqual(initialStateWriteKeys);

    const beforeReload = await storedSettings(page);
    expect(beforeReload.operations).toHaveLength(1);
    const pending = beforeReload.operations[0];
    expect(pending.status).toBe('pending');
    expect(pending.value).toContain('"theme":"light"');
    expect(beforeReload.value).toContain('"theme":"light"');

    // Reopen the installed origin in a fresh tab while offline. This also
    // closes the original sender tab without losing its durable intent.
    await page.close();
    page = await context.newPage();
    attachDiagnostics(page);
    await mockApp(page, { session: 'app', realServiceWorker: true, nativeApi: true,
      push: { standalone: info.project.name.includes('-pwa') } });
    await page.goto(server.origin + '/#settings', { waitUntil: 'commit' });
    await expect(page.locator('#root')).toBeVisible();
    await expect(page).toHaveTitle(/FitFocus/);
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toContain('/sw.js');
    await expect(page.locator('#root')).toBeVisible();
    expect(navigationResponses.at(-1)?.fromServiceWorker).toBe(true);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    const afterReload = await storedSettings(page);
    expect(afterReload.value).toBe(beforeReload.value);
    expect(afterReload.operations).toHaveLength(1);
    expect(afterReload.operations[0]).toMatchObject({
      opId: pending.opId,
      value: pending.value,
      baseVersion: pending.baseVersion,
      status: 'pending',
    });
    expect(server.counts.currentStatePutAttempts).toBe(initialStatePutAttempts);
    expect(server.counts.currentStatePutAccepted).toBe(initialStatePutAccepted);
    expect(server.stateWriteKeys).toEqual(initialStateWriteKeys);

    server.setStateWriteDisconnected(false);
    await context.setOffline(false);
    await expect(page.getByRole('button', { name: /^Светлая/ })).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => server.stateWriteKeys, { timeout: 20_000 })
      .toContain('fitfocus_data_google-e2e-sub_settings');
    await expect.poll(async () => (await storedSettings(page)).operations.length, { timeout: 20_000 }).toBe(0);
    const acknowledged = await storedSettings(page);
    expect(acknowledged.value).toBe(beforeReload.value);
    expect(acknowledged.confirmedVersion).toBe(1);
    expect(server.stateWriteKeys).toContain('fitfocus_data_google-e2e-sub_settings');
    expect(server.unexpectedApi).toEqual([]);
    // WebKit can surface its canceled in-flight /api/me fetch as an
    // access-control page error while Playwright toggles the iPhone PWA offline.
    const expectedIphonePwaMeAborts = pageErrors.filter((error) => info.project.name === 'iphone-pwa'
      && /^\/127\.0\.0\.1:\d+\/api\/me\?t=\d+ due to access control checks\.$/.test(error));
    expect(expectedIphonePwaMeAborts.length).toBeLessThanOrEqual(info.project.name === 'iphone-pwa' ? 1 : 0);
    expect(pageErrors.filter((error) => !expectedIphonePwaMeAborts.includes(error))).toEqual([]);
  } catch (error) {
    console.error('PWA offline durability diagnostics:', JSON.stringify({
      failedStateWrites,
      inFlightStateWrites: inFlightStateWrites.size,
      navigationResponses,
      pageErrors,
      localState: await storedSettings(page).catch((error) => ({ error: error instanceof Error ? error.message : String(error) })),
      stateSync: await failureStateDebug(page).catch((error) => ({ error: error instanceof Error ? error.message : String(error) })),
      counts: server.counts,
      stateWriteKeys: server.stateWriteKeys,
      unexpectedApi: server.unexpectedApi,
      online: await page.evaluate(() => navigator.onLine).catch(() => null),
      title: await page.title().catch(() => null),
    }));
    await page.screenshot({ path: info.outputPath('pwa-offline-failure.png'), timeout: 3_000 }).catch(() => {});
    throw error;
  } finally {
    await context.setOffline(false).catch(() => {});
    await page.close().catch(() => {});
    await server.close();
  }
});
