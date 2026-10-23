import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rollbackPwaDist, rollbackPwaRoot, rollbackPwaCommit } from './support/preparePwaFixture';
import { verifyReleaseArtifact } from '../scripts/release-artifact.mjs';
import { startPwaReleaseServer } from './support/pwaReleaseServer';
import { mockApp, openApp } from './support/appHarness';
import { healthy, navigate, saved, confirmPreview } from './support/familyHarness';

async function markers(page: Page, seed = false) {
  return page.evaluate(async seed => {
    const open = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    try {
      const tx = db.transaction(['outbox_migration_items', 'outbox_migration_unknown', 'outbox_meta'], seed ? 'readwrite' : 'readonly');
      if (seed) {
        // Sentinels test store retention, not runtime migration ownership/import.
        tx.objectStore('outbox_migration_items').put({ id: 'rollback-ledger', marker: 'keep-import-receipt' });
        tx.objectStore('outbox_migration_unknown').put({ id: 'rollback-quarantine', rawRecord: null, reason: 'not-an-object' });
      }
      const read = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const [ledger, quarantine, fence] = await Promise.all([
        read(tx.objectStore('outbox_migration_items').get('rollback-ledger')),
        read(tx.objectStore('outbox_migration_unknown').get('rollback-quarantine')),
        read(tx.objectStore('outbox_meta').get('auth-fence')),
      ]);
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
      return { version: db.version, stores: Array.from(db.objectStoreNames), ledger, quarantine, fence };
    } finally { db.close(); }
  }, seed);
}

async function retryTiming(page: Page) {
  return page.evaluate(async () => {
    const open = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    try {
      const rows = await new Promise<Array<{ resource: string; opId: string; status: string; retryCount: number; nextAttemptAtMs: number;
        attempt?: { startedAtMs: number } }>>((resolve, reject) => {
        const get = db.transaction('outbox').objectStore('outbox').getAll(); get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error);
      });
      return { nowMs: Date.now(), rows: rows.filter(row => row.resource === 'familyMenu').map(({ opId, status, retryCount, nextAttemptAtMs, attempt }) =>
        ({ opId, status, retryCount, nextAttemptAtMs, startedAtMs: attempt?.startedAtMs })) };
    } finally { db.close(); }
  });
}

async function selectionCache(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(sessionStorage).find(key => key.startsWith('fitfocus.family-planning.draft.v1:'));
    return key ? { key, value: JSON.parse(sessionStorage.getItem(key)!) } : null;
  });
}
async function openParticipation(page: Page) {
  if (!await page.getByRole('checkbox', { name: 'Готовим завтрак', exact: true }).isVisible()) {
    await page.getByText('Кто ест и какие порции', { exact: true }).click();
  }
}

function isExpectedFirefoxIdbNavigationWarning(message: string): boolean {
  return message.includes('An IndexedDB transaction that was not yet complete has been aborted due to page navigation.')
    && message.includes('/assets/ai-');
}

for (const status of ['pending', 'conflicted'] as const) test(`compatible artifact rollback preserves ${status} family intent and IDB v3`, async ({ context }, info) => {
  test.setTimeout(120_000);
  expect(verifyReleaseArtifact(rollbackPwaRoot).sourceSha).toBe(rollbackPwaCommit);
  const rollbackScript = readFileSync(resolve(rollbackPwaDist, 'index.html'), 'utf8').match(/src="([^"]*\/assets\/index-[^"]+\.js)"/)?.[1];
  expect(rollbackScript).toBeTruthy();
  const server = await startPwaReleaseServer(rollbackPwaDist, resolve('dist'), {
    familyPlanning: true,
    ...(status === 'pending' ? { retryAfterSeconds: 20 } : {}),
    ...(status === 'conflicted' ? { conflictFirstFamilyPut: true } : {}),
  }); server.release();
  const page = await context.newPage(), observer = await context.newPage(), errors: string[] = [], diagnostics: string[] = [], googleRequests: string[] = [];
  const failedApiRequests: Array<{ tab: string; path: string; errorText: string | null }> = [];
  const meResponses: Array<{ tab: string; status: number }> = [];
  const expectedWebKitApiMeWarnings: string[] = [], expectedFirefoxIdbNavigationWarnings: string[] = [];
  const isWebKit = ['desktop-webkit', 'iphone-safari', 'iphone-pwa'].includes(info.project.name);
  const isFirefox = info.project.name === 'desktop-firefox';
  let meResponseCountBeforeRollback = 0;
  let recoveryTiming: Awaited<ReturnType<typeof retryTiming>> | undefined;
  let recoveryTimeoutMs: number | undefined;
  for (const tab of [page, observer]) {
  const tabName = tab === page ? 'current' : 'observer';
  tab.on('request', request => {
    if (/(^|\.)google\.com$/.test(new URL(request.url()).hostname)) googleRequests.push(request.url());
  });
  tab.on('requestfailed', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/')) failedApiRequests.push({ tab: tabName, path, errorText: request.failure()?.errorText ?? null });
  });
  tab.on('response', response => {
    if (new URL(response.url()).pathname === '/api/me') meResponses.push({ tab: tabName, status: response.status() });
  });
  tab.on('pageerror', error => {
    if (isWebKit && error.message.includes('due to access control checks.') && error.message.includes('/api/me')) {
      expectedWebKitApiMeWarnings.push(error.message);
      return;
    }
    errors.push(error.message);
  });
  tab.on('console', message => {
    if (!['warning', 'error'].includes(message.type())) return;
    const text = message.text();
    diagnostics.push(text);
    if (isWebKit && text.includes('due to access control checks.') && text.includes('/api/me')) {
      expectedWebKitApiMeWarnings.push(text);
      return;
    }
    if (isFirefox && isExpectedFirefoxIdbNavigationWarning(text)) {
      expectedFirefoxIdbNavigationWarnings.push(text);
      return;
    }
    if (message.location().url.includes('/api/family/menu/state') && /\b(409|503)\b/.test(text)) return;
    errors.push(text);
  });
  }
  try {
    await mockApp(page, { session: 'app', realServiceWorker: true, nativeApi: true,
      push: { standalone: info.project.name.includes('-pwa') } });
    await openApp(page, server.origin + '/#family'); await expect(page).toHaveTitle(/FitFocus/);
    await expect(page.getByText('Семья с постоянным меню', { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toContain('/sw.js');
    await mockApp(observer, { session: 'app', realServiceWorker: true, nativeApi: true,
      push: { standalone: info.project.name.includes('-pwa') } });
    await openApp(observer, server.origin + '/#family');
    await expect(observer.getByText('Семья с постоянным меню', { exact: true })).toBeVisible();
    const candidateScript = await page.locator('script[type="module"][src]').getAttribute('src');
    expect(candidateScript).not.toBe(rollbackScript);
    await confirmPreview(page);
    await expect.poll(() => server.counts.put).toBeGreaterThan(0);
    await navigate(page, 'Настройки');
    const profileName = page.getByPlaceholder('Как к вам обращаться');
    await expect(profileName).toHaveValue('E2E User');
    await profileName.fill('Профиль перед откатом');
    await expect(profileName).toHaveValue('Профиль перед откатом');
    await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
    await expect.poll(async () => (await saved(page)).profiles[0]?.name).toBe('Профиль перед откатом');
    await expect.poll(async () => (await saved(page)).operations[0]?.status).toBe(status);
    const operation = (await saved(page)).operations[0];
    const beforeTiming = await retryTiming(page);
    const before = await markers(page, true); expect(before.fence?.revision).toBeGreaterThan(0);
    await navigate(page, 'Меню семьи');
    await openParticipation(page);
    await page.getByRole('checkbox', { name: 'Готовим завтрак', exact: true }).uncheck();
    await expect.poll(async () => (await selectionCache(page))?.value.selectionDraft).toBe(true);
    await expect.poll(async () => (await selectionCache(page))?.value.drafts.selections).toEqual([]);
    const selectedDate = (await selectionCache(page))!.value.drafts.date as string;
    const recovery = { familyId: 'family-durable-e2e', date: selectedDate,
      selections: [{ slot: 'lunch', recipeId: 'chicken-rice-v1', participantShares: { 'google-e2e-sub': 0.75 } }] };
    // Synthetic legacy recovery input tests metadata compatibility. Real empty draft above comes from UI intent.
    await page.evaluate(recovery => {
      const key = Object.keys(sessionStorage).find(key => key.startsWith('fitfocus.family-planning.draft.v1:'))!;
      const envelope = JSON.parse(sessionStorage.getItem(key)!);
      sessionStorage.setItem(key, JSON.stringify({ ...envelope, selectionRecovery: recovery }));
    }, recovery);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Восстановить прежний черновик', exact: true })).toBeVisible();
    const draftBeforeRollback = await selectionCache(page);
    expect(draftBeforeRollback?.value).toMatchObject({ selectionDraft: true, selectionRecovery: recovery, drafts: { selections: [] } });
    const previewsBeforeRoundTrip = server.counts.preview, putsBeforeRoundTrip = server.counts.put;
    meResponseCountBeforeRollback = meResponses.length;
    server.rollback();
    await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update(); });
    await expect(page.getByRole('button', { name: 'Обновить приложение', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).waiting?.state)).toBe('installed');
    await page.screenshot({ path: info.outputPath('rollback-ready.png') });
    const reloaded = [page, observer].map(tab => tab.waitForEvent('framenavigated', frame => frame === tab.mainFrame()));
    await page.getByRole('button', { name: 'Обновить приложение', exact: true }).click({ noWaitAfter: true });
    await Promise.all(reloaded);
    await Promise.all([page.waitForLoadState('load'), observer.waitForLoadState('load')]);
    await expect(page.locator('script[type="module"][src]')).toHaveAttribute('src', rollbackScript!);
    await expect(observer.locator('script[type="module"][src]')).toHaveAttribute('src', rollbackScript!);
    await expect(page.getByText('Семья с постоянным меню', { exact: true })).toBeVisible();
    await expect.poll(async () => (await saved(page)).operations[0]?.status).toBe(status);
    await openParticipation(page);
    for (const meal of ['завтрак', 'обед', 'ужин', 'перекус']) await expect(page.getByRole('checkbox', { name: `Готовим ${meal}`, exact: true })).not.toBeChecked();
    const draftOnBridge = await selectionCache(page);
    expect(draftOnBridge?.key).toBe(draftBeforeRollback?.key);
    expect(draftOnBridge?.value).toMatchObject({ selectionDraft: true, selectionRecovery: recovery, drafts: { selections: [] } });
    const restored = (await saved(page)).operations[0];
    expect(restored.opId).toBe(operation.opId); expect(restored.value).toBe(operation.value);
    expect(restored.serverSnapshot).toEqual(operation.serverSnapshot);
    const beforeRetry = beforeTiming.rows.find(row => row.opId === operation.opId)!;
    const restoredRetry = (await retryTiming(page)).rows.find(row => row.opId === operation.opId)!;
    expect(restoredRetry.retryCount).toBeGreaterThanOrEqual(beforeRetry.retryCount);
    expect(restoredRetry.nextAttemptAtMs).toBeGreaterThanOrEqual(beforeRetry.nextAttemptAtMs);
    expect(await markers(page)).toEqual(before);
    await expect.poll(async () => (await saved(observer)).operations[0]?.opId).toBe(operation.opId);
    expect(await markers(observer)).toEqual(before);
    expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(125);
    await navigate(page, 'Настройки');
    await expect(page.getByPlaceholder('Как к вам обращаться')).toHaveValue('Профиль перед откатом');
    server.release();
    await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update(); });
    await expect(page.getByRole('button', { name: 'Обновить приложение', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).waiting?.state)).toBe('installed');
    const forwardReloads = [page, observer].map(tab => tab.waitForEvent('framenavigated', frame => frame === tab.mainFrame()));
    await page.getByRole('button', { name: 'Обновить приложение', exact: true }).click({ noWaitAfter: true });
    await Promise.all(forwardReloads);
    await Promise.all([page.waitForLoadState('load'), observer.waitForLoadState('load')]);
    await expect(page.locator('script[type="module"][src]')).toHaveAttribute('src', candidateScript!);
    await expect(observer.locator('script[type="module"][src]')).toHaveAttribute('src', candidateScript!);
    await navigate(page, 'Меню семьи');
    await expect(page.getByRole('button', { name: 'Восстановить прежний черновик', exact: true })).toBeVisible();
    expect((await selectionCache(page))?.value).toMatchObject({ selectionDraft: true, selectionRecovery: recovery, drafts: { selections: [] } });
    await expect.poll(async () => (await saved(page)).operations[0]?.opId).toBe(operation.opId);
    expect((await saved(page)).operations[0].value).toBe(operation.value);
    expect((await saved(page)).operations[0].serverSnapshot).toEqual(operation.serverSnapshot);
    expect(await markers(page)).toEqual(before);
    await openParticipation(page);
    for (const meal of ['завтрак', 'обед', 'ужин', 'перекус']) await expect(page.getByRole('checkbox', { name: `Готовим ${meal}`, exact: true })).not.toBeChecked();
    await page.getByRole('button', { name: 'Восстановить прежний черновик', exact: true }).click();
    await expect.poll(async () => (await selectionCache(page))?.value.selectionRecovery).toBeNull();
    expect((await selectionCache(page))?.value).toMatchObject({ selectionDraft: true, drafts: { date: selectedDate, selections: recovery.selections } });
    await openParticipation(page);
    await expect(page.getByLabel('Порция: E2E User, Обед', { exact: true })).toHaveValue('0.75');
    expect(server.counts.preview).toBe(previewsBeforeRoundTrip);
    // Retries may occur, but restoring the cache must never manufacture another logical mutation.
    expect(server.familyWrites.every(write => write.mutationKind === 'planning' && write.weekStart === selectedDate)).toBe(true);
    expect(server.counts.put).toBeGreaterThanOrEqual(putsBeforeRoundTrip);
    await navigate(page, 'Настройки');
    if (status === 'pending') {
      server.recover(); await page.getByRole('button', { name: /Синхронизировать сейчас/ }).click();
      recoveryTiming = await retryTiming(page);
      // Manual sync refreshes proof; it must not erase persisted Retry-After or a live claim.
      const row = recoveryTiming.rows.find(row => row.opId === operation.opId);
      const eligibleAtMs = row?.status === 'sending' && row.startedAtMs !== undefined
        ? row.startedAtMs + 30_000 // Production sender lease, including recovery of an interrupted attempt.
        : row?.nextAttemptAtMs ?? recoveryTiming.nowMs;
      recoveryTimeoutMs = Math.max(10_000, eligibleAtMs - recoveryTiming.nowMs + 5_000);
      await expect.poll(() => server.counts.accepted, { timeout: recoveryTimeoutMs }).toBe(1);
      if (row?.status === 'pending') expect(server.counts.acceptedAtMs).toBeGreaterThanOrEqual(row.nextAttemptAtMs);
      await expect.poll(async () => (await saved(page)).operations.length).toBe(0);
      await page.reload(); await page.waitForLoadState('load');
      await expect(page.getByText('Семья с постоянным меню', { exact: true })).toBeVisible();
      expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(125);
      expect(await markers(page)).toEqual(before);
    } else { expect(server.counts.accepted).toBe(0); }
    expect(server.unexpectedApi).toEqual([]); expect(googleRequests).toEqual([]);
    const expectedNavigationCancellations = failedApiRequests.filter(entry => entry.path === '/api/me'
      && ((isWebKit && entry.errorText === 'Load request cancelled')
        || (isFirefox && entry.errorText === 'NS_BINDING_ABORTED')));
    expect(failedApiRequests.filter(entry => !expectedNavigationCancellations.includes(entry))).toEqual([]);
    expect(expectedWebKitApiMeWarnings).toEqual([]);
    expect(expectedNavigationCancellations.length).toBeLessThanOrEqual(isWebKit || isFirefox ? 2 : 0);
    expect(expectedFirefoxIdbNavigationWarnings.length).toBeLessThanOrEqual(isFirefox ? 2 : 0);
    if (expectedNavigationCancellations.length > 0) {
      const successfulMeTabs = new Set(meResponses.slice(meResponseCountBeforeRollback)
        .filter(entry => entry.status === 200).map(entry => entry.tab));
      expect(successfulMeTabs.has('current')).toBe(true);
      expect(successfulMeTabs.has('observer')).toBe(true);
    }
    await healthy(page, errors); await healthy(observer, errors);
    await page.screenshot({ path: info.outputPath('rollback-preserved.png') });
    await info.attach('rollback-proof', { body: JSON.stringify({ sourceSha: rollbackPwaCommit, rollbackScript,
      candidateScript, status, operation, draftBeforeRollback, draftOnBridge, recovery, before, beforeTiming, after: await markers(page), recoveryTiming, recoveryTimeoutMs,
      counts: server.counts, diagnostics, googleRequests, expectedWebKitApiMeWarnings: expectedWebKitApiMeWarnings.length,
      expectedFirefoxIdbNavigationWarnings: expectedFirefoxIdbNavigationWarnings.length, meResponses, failedApiRequests }), contentType: 'application/json' });
  } catch (error) {
    console.error('Rollback diagnostics:', JSON.stringify({ errors, diagnostics, googleRequests, meResponses, failedApiRequests, recoveryTiming, recoveryTimeoutMs,
      timing: await retryTiming(page).catch(() => null), unexpectedApi: server.unexpectedApi, counts: server.counts }));
    await page.screenshot({ path: info.outputPath('rollback-failed.png'), timeout: 3000 }).catch(() => {}); throw error;
  } finally { await Promise.allSettled([page.close(), observer.close()]); await server.close(); }
});
