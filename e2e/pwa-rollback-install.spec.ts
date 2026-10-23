import { setPurchasedCheckbox } from './support/shoppingInteractions';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rollbackPwaDist } from './support/preparePwaFixture';
import { startPwaReleaseServer } from './support/pwaReleaseServer';
import { mockApp, openApp } from './support/appHarness';
import { saved, healthy, isExpectedStateProtocolRejection, confirmPreview, navigate } from './support/familyHarness';

test('fresh rollback installation can explicitly update to the candidate and preserve its family intent', async ({ context }, info) => {
  test.setTimeout(90_000);
  const server = await startPwaReleaseServer(rollbackPwaDist, resolve('dist'), { familyPlanning: true, retryFamilyPutDelayMs: 5_000 });
  const page = await context.newPage(), errors: string[] = [], googleRequests: string[] = [];
  let stateProtocolRejectionResponses = 0;
  let navigations = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (new URL(response.url()).pathname === '/api/state' && response.status() === 426) {
      stateProtocolRejectionResponses += 1;
    }
  });
  await page.addInitScript(() => {
    const key = '__fitfocusPwaRollbackLifecycle';
    const record = (type: string, detail: Record<string, unknown> = {}) => {
      try {
        const events = JSON.parse(sessionStorage.getItem(key) ?? '[]') as unknown[];
        events.push({ type, time: performance.now(), url: location.href, detail });
        sessionStorage.setItem(key, JSON.stringify(events.slice(-40)));
      } catch { /* Diagnostics must not change the app's storage behavior. */ }
    };
    window.addEventListener('pagehide', event => record('pagehide', { persisted: event.persisted }));
    window.addEventListener('unhandledrejection', event => {
      const reason = event.reason;
      record('unhandledrejection', { name: reason instanceof Error ? reason.name : null,
        message: reason instanceof Error ? reason.message : String(reason), stack: reason instanceof Error ? reason.stack : null });
    });
    window.addEventListener('error', event => record('error', {
      message: event.message, filename: event.filename, line: event.lineno, column: event.colno,
    }));
  });
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
    await confirmPreview(page);
    // Let the rollback client receive an offline response, then hold its retry so
    // activation exercises pagehide while the old sender is issuing that retry.
    await expect.poll(() => server.counts.put).toBeGreaterThan(0);
    await expect.poll(async () => (await saved(page)).operations[0]?.retryCount).toBeGreaterThan(0);
    await expect.poll(() => server.counts.put).toBeGreaterThan(1);
    await expect.poll(async () => (await saved(page)).operations[0]?.status).toBe('sending');
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
    await expect.poll(() => server.counts.familyPutAborted).toBeGreaterThan(0);
    expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(125);
    expect(server.familyWrites.length).toBeGreaterThan(1);
    expect(server.familyWrites.every(write => write.account === 'google-e2e-sub' && write.session === 'a'.repeat(64)
      && write.familyId === 'family-durable-e2e' && write.mutationKind === 'planning' && write.baseVersion === 1)).toBe(true);
    server.recover();
    await page.getByRole('button', { name: 'Проверить синхронизацию', exact: true }).click();
    // An interrupted native attempt retains the production 30s lease. Do not erase it for the test.
    await expect.poll(() => server.counts.accepted, { timeout: 40_000 }).toBe(1);
    await expect.poll(async () => (await saved(page)).operations.length).toBe(0);
    await navigate(page, 'Покупки');
    await setPurchasedCheckbox(page.getByRole('checkbox', { name: 'Яблоко', exact: true }), true);
    await expect.poll(() => server.counts.accepted, { timeout: 15_000 }).toBe(2);
    await expect.poll(async () => (await saved(page)).operations.length).toBe(0);
    expect(server.familyWrites.at(-1)).toMatchObject({ mutationKind: 'purchases', baseVersion: 2,
      account: 'google-e2e-sub', session: 'a'.repeat(64), familyId: 'family-durable-e2e' });
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Яблоко', exact: true })).toBeChecked();
    expect((await saved(page)).menus[0].menu.planningV1.purchasedQuantities.find((item: { ingredientId: string }) => item.ingredientId === 'apple').quantity).toBe(125);
    expect(server.counts.structuredOldWriterRejected).toBe(0);
    const lifecycle = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__fitfocusPwaRollbackLifecycle') ?? '[]') as Array<{ type?: string }>);
    expect(lifecycle.filter(event => event.type === 'unhandledrejection')).toEqual([]);
    expect(lifecycle.filter(event => event.type === 'error')).toEqual([]);
    // B is protocol-2/0022 aware. Legacy writer rejection remains in the separate pinned v2 forward/import gates.
    expect(server.counts.stateProtocolRejected).toBe(0);
    expect(stateProtocolRejectionResponses).toBe(server.counts.stateProtocolRejected);
    await healthy(page, errors.filter(error => !isExpectedStateProtocolRejection(error)));
    expect(server.unexpectedApi).toEqual([]); expect(googleRequests).toEqual([]);
    await page.screenshot({ path: info.outputPath('fresh-rollback-updated.png') });
    await info.attach('fresh-rollback-proof', { body: JSON.stringify({ installedScript, candidateScript, navigations, operation,
      counts: server.counts, writes: server.familyWrites, googleRequests, lifecycle }), contentType: 'application/json' });
  } catch (error) {
    const lifecycle = await page.evaluate(() => sessionStorage.getItem('__fitfocusPwaRollbackLifecycle')).catch(() => null);
    console.error('Fresh rollback diagnostics:', JSON.stringify({ navigations, errors, googleRequests,
      unexpectedApi: server.unexpectedApi, lifecycle }));
    await info.attach('fresh-rollback-browser-lifecycle', { body: lifecycle ?? '[]', contentType: 'application/json' });
    await page.screenshot({ path: info.outputPath('fresh-rollback-failed.png'), timeout: 3000 }).catch(() => {}); throw error;
  } finally { await page.close(); await server.close(); }
});
