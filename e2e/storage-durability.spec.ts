import { expect, test, type Page } from '@playwright/test';
import { mockApp, openApp } from './support/appHarness';

async function storedSettings(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction(['values', 'outbox', 'outbox_meta'], 'readonly');
    const read = <T,>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const [values, operations, metadata] = await Promise.all([read(tx.objectStore('values').getAll()), read(tx.objectStore('outbox').getAll()), read(tx.objectStore('outbox_meta').getAll())]);
    db.close();
    const value = values.find((entry) => entry.key.endsWith('_settings'));
    return { value: value?.value ?? null, operations: operations.filter((entry) => entry.key.endsWith('_settings')),
      confirmedVersion: metadata.find((entry) => entry.key?.endsWith('_settings') && entry.confirmedVersion !== undefined)?.confirmedVersion ?? 0 };
  });
}

test('settings edit survives reload in IndexedDB with its outgoing intent', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await mockApp(page, { session: 'app' });
  await openApp(page, '/#settings');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page).toHaveURL(/#settings$/);
  const light = page.getByRole('button', { name: /^Светлая/ });
  await light.click();
  await expect.poll(async () => (await storedSettings(page)).value).toContain('"theme":"light"');
  const saved = await storedSettings(page);
  expect(saved.operations).toHaveLength(1);
  expect(saved.operations[0]).toMatchObject({ type: 'put', status: 'pending' });
  expect(await page.evaluate(() => localStorage.getItem('fitfocus.remote-kv-outbox.v1') ?? '')).not.toContain('_settings');
  await page.reload();
  await expect(light).toBeVisible();
  await expect(light).toHaveClass(/border-indigo-500\/40/);
  expect((await storedSettings(page)).value).toContain('"theme":"light"');
  expect((await storedSettings(page)).operations).toHaveLength(1);
  await expect(page.getByRole('status').filter({ hasText: 'ожидают синхронизации' })).toBeVisible();
  await expect(page.getByText('Cloud: pending', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Cloud: saved', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

type ServerStateItem = { version: number; value: string };
async function verifiedServer(page: Page, server: Map<string, ServerStateItem>, options: { conflict?: boolean; settingsRequests?: number[] } = {}) {
  await page.route('**/api/me*', async (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    user: { sub: 'google-e2e-sub', name: 'E2E User', email: 'e2e@example.com', roles: ['user'] }, hasAccess: true,
    stateSync: { protocol: 2, guard: 1, accountId: 'google-e2e-sub', sessionId: 'a'.repeat(64) },
  }) }));
  await page.route('**/api/state*', async (route) => {
    const request = route.request(); const headers = request.headers();
    if (request.method() !== 'PUT' || !headers['x-fitfocus-state-account']) { await route.fallback(); return; }
    const items = request.postDataJSON().items as { key: string; value: string; baseVersion: number }[];
    const scope = { 'X-FitFocus-State-Protocol': '2', 'X-FitFocus-State-Guard': '1',
      'X-FitFocus-State-Account': headers['x-fitfocus-state-account'], 'X-FitFocus-State-Session': headers['x-fitfocus-state-session'] };
    for (const item of items) if (item.key.endsWith('_settings')) options.settingsRequests?.push(item.baseVersion);
    if (options.conflict && items[0].key.endsWith('_settings')) {
      await route.fulfill({ status: 409, contentType: 'application/json', headers: scope,
        body: JSON.stringify({ error: 'KV_CONFLICT', key: items[0].key, value: '{"theme":"dark"}', exists: true, version: 9 }) }); return;
    }
    // A lost response or competing writer can legitimately resend an old base: the real API returns 409.
    const stale = items.find((item) => item.baseVersion !== (server.get(item.key)?.version ?? 0));
    if (stale) {
      const current = server.get(stale.key);
      await route.fulfill({ status: 409, contentType: 'application/json', headers: scope,
        body: JSON.stringify({ error: 'KV_CONFLICT', key: stale.key, value: current?.value ?? '', exists: !!current, version: current?.version ?? 0 }) }); return;
    }
    for (const item of items) server.set(item.key, { version: item.baseVersion + 1, value: item.value });
    await route.fulfill({ contentType: 'application/json', headers: scope,
      body: JSON.stringify({ ok: true, items: items.map((item) => ({ key: item.key, version: server.get(item.key)!.version, exists: true })) }) });
  });
}

test('verified sender confirms settings and preserves them after reload', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await mockApp(page, { session: 'app' }); await verifiedServer(page, new Map());
  await openApp(page, '/#settings'); await expect(page).toHaveTitle(/FitFocus/);
  await page.getByRole('button', { name: /^Светлая/ }).click();
  await expect.poll(async () => (await storedSettings(page)).confirmedVersion).toBe(1);
  expect((await storedSettings(page)).operations).toHaveLength(0);
  await page.reload(); await expect(page.getByRole('button', { name: /^Светлая/ })).toHaveClass(/border-indigo-500\/40/);
  expect((await storedSettings(page)).value).toContain('"theme":"light"');
  await expect(page.getByText('Cloud: pending', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]); await page.screenshot({ path: testInfo.outputPath('state-synced.png') });
});

test('server conflict keeps the local settings intent and displays the conflict', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !/409/.test(message.text())) errors.push(message.text()); });
  await mockApp(page, { session: 'app' }); await verifiedServer(page, new Map(), { conflict: true });
  await openApp(page, '/#settings'); await page.getByRole('button', { name: /^Светлая/ }).click();
  await expect.poll(async () => (await storedSettings(page)).operations[0]?.status).toBe('conflicted');
  await page.reload(); const notice = page.getByRole('alert').filter({ hasText: 'Обнаружен конфликт' });
  await notice.scrollIntoViewIfNeeded(); await expect(notice).toBeVisible();
  const contrast = await notice.evaluate((element) => {
    const style = getComputedStyle(element);
    const luminance = (color: string) => {
      const channels = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((value) => {
        const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const fg = luminance(style.color); const bg = luminance(style.backgroundColor);
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  const saved = await storedSettings(page); expect(saved.value).toContain('"theme":"light"');
  expect(saved.operations[0]).toMatchObject({ type: 'put', status: 'conflicted', serverSnapshot: { version: 9 } });
  await expect(page.getByText('Cloud: saved', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]); await page.screenshot({ path: testInfo.outputPath('state-conflict.png') });
});

test('two tabs without Web Locks retain an independent edit as a conflict', async ({ page, context }) => {
  test.setTimeout(60_000);
  const server = new Map<string, ServerStateItem>();
  const settingsRequests: number[] = [];
  const errors: string[] = [];
  const watch = (tab: Page) => { tab.on('pageerror', (error) => errors.push(error.message));
    tab.on('console', (message) => { if (message.type() === 'error' && !/409/.test(message.text())) errors.push(message.text()); }); };
  watch(page);
  await context.addInitScript(() => { Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true }); });
  await mockApp(page, { session: 'app' }); await verifiedServer(page, server, { settingsRequests }); await openApp(page, '/#settings');
  const second = await context.newPage(); watch(second); await mockApp(second, { session: 'app' }); await verifiedServer(second, server, { settingsRequests });
  await openApp(second, '/#settings'); await expect(second.getByRole('button', { name: /^Тёмная/ })).toHaveClass(/border-indigo-500\/40/);
  await page.getByRole('button', { name: /^Светлая/ }).click();
  await expect.poll(async () => (await storedSettings(page)).confirmedVersion).toBe(1);
  await second.getByRole('button', { name: /^Violet AI/ }).click();
  await expect.poll(async () => (await storedSettings(page)).operations[0]?.status).toBe('conflicted');
  const stored = await storedSettings(second); expect(stored.value).toContain('"theme":"light"');
  expect(stored.operations[0].value).toContain('"theme":"violet"'); expect(stored.confirmedVersion).toBe(1);
  expect(server.get('fitfocus_data_google-e2e-sub_settings')?.version).toBe(1);
  expect(settingsRequests).toEqual([0]); // The independent stale edit stays local; no duplicate settings claim is hidden.
  expect(errors).toEqual([]);
  await second.close();
});

test('quota fault rolls back settings and displays a visible storage error', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await mockApp(page, { session: 'app' });
  await openApp(page, '/#settings');
  await page.getByRole('button', { name: /^Светлая/ }).click();
  await expect.poll(async () => (await storedSettings(page)).value).toContain('"theme":"light"');
  const previous = await storedSettings(page);
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value, key) {
      if (this.name === 'outbox' && typeof value?.key === 'string' && value.key.endsWith('_settings')) {
        throw new DOMException('Injected quota fault', 'QuotaExceededError');
      }
      return add.call(this, value, key);
    };
  });
  await page.getByRole('button', { name: /^Violet AI/ }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'Не удалось сохранить изменения' });
  await alert.scrollIntoViewIfNeeded();
  await expect(alert).toBeVisible();
  await expect(page.getByText('Cloud: error', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Cloud: saved', { exact: true })).toHaveCount(0);
  expect(await storedSettings(page)).toEqual(previous);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('storage-error.png'), fullPage: false });
});
