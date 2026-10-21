import { expect, type Page } from '@playwright/test';
import { test } from './support/mockTest';
import { mockApp, openApp } from './support/appHarness';

const account = 'google-e2e-sub';
const sourceKey = 'fitfocus.remote-kv-outbox.v1';
const source = JSON.stringify([{ type: 'put', key: 'fitfocus_data_unknown_refeed', value: '2026-10-12' }]);
const historyKey = `fitfocus_data_${account}_council_history`;
const oldMessage = { id: 'old-message', role: 'user', text: 'Сохранённый вопрос', createdAt: '2026-10-11T08:00:00Z' };

async function state(page: Page, suffix: string) {
  return page.evaluate(async ({ account, key, sourceKey }) => {
    const opening = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error); });
    const tx = db.transaction(['values', 'outbox', 'outbox_meta'], 'readonly');
    const read = <T,>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const [value, operations, keyState, activeSession] = await Promise.all([
      read(tx.objectStore('values').get(key)),
      read(tx.objectStore('outbox').getAll()),
      read(tx.objectStore('outbox_meta').get(`key:${JSON.stringify([account, key])}`)),
      read(tx.objectStore('outbox_meta').get('active-session')),
    ]);
    db.close();
    return { value: value?.value ?? null, operations: operations.filter((operation) => operation.key === key),
      confirmedVersion: keyState?.confirmedVersion, activeSession, source: localStorage.getItem(sourceKey) };
  }, { account, key: `fitfocus_data_${account}_${suffix}`, sourceKey });
}

async function setup(page: Page, history = false, stateDeleteConflict?: { version: number; exists: boolean; value: string }, acknowledgeStateWrites = false) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await mockApp(page, { session: 'app', acknowledgeStateWrites, ...(stateDeleteConflict ? { stateDeleteConflict } : {}) });
  await page.addInitScript(({ sourceKey, source, historyKey, oldMessage, history }) => {
    // Seed once: reload must not manufacture new history or queue items.
    if (localStorage.getItem('owned-state-seeded')) return;
    localStorage.setItem('owned-state-seeded', '1');
    localStorage.setItem(sourceKey, source);
    if (history) localStorage.setItem(historyKey, JSON.stringify([oldMessage]));
  }, { sourceKey, source, historyKey, oldMessage, history });
  return errors;
}

test('plan task changes survive reload without repopulating the old queue', async ({ page }, testInfo) => {
  const errors = await setup(page);
  await openApp(page, '/#plan');
  await expect(page).toHaveURL(/#plan$/); await expect(page).toHaveTitle(/FitFocus/);
  const task = page.getByRole('button', { name: 'Записать первый завтрак', exact: true });
  await expect(task).toBeVisible();
  await expect(page.getByText('0/3 выполнено', { exact: true })).toBeVisible();
  expect((await state(page, 'plan_task_done')).operations).toEqual([]);
  await task.click();
  await expect.poll(async () => (await state(page, 'plan_task_done')).value).toContain('"0:Записать первый завтрак":true');
  expect((await state(page, 'plan_task_done')).operations).toHaveLength(1);
  await page.reload();
  await expect(page.getByText('1/3 выполнено', { exact: true })).toBeVisible();
  await expect(task).toHaveClass(/border-emerald-500/);
  let saved = await state(page, 'plan_task_done');
  // A Safari reload can observe an active claim lease before it expires. Keep
  // the assertion on the durable intent; the transport response may settle later.
  await expect.poll(async () => {
    saved = await state(page, 'plan_task_done');
    return saved.operations[0]?.status;
  }).toMatch(/^(pending|sending)$/);
  expect(['pending', 'sending']).toContain(saved.operations[0]?.status);
  expect(saved.source).toBe(source); expect(saved.operations).toHaveLength(1);
  expect(saved.operations[0]).toMatchObject({ type: 'put', accountId: account });
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('plan-task-reloaded.png') });
});

test('cleared council history stays deleted despite a stale localStorage copy', async ({ page }, testInfo) => {
  const errors = await setup(page, true);
  await openApp(page, '/#council');
  await expect(page).toHaveURL(/#council$/); await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByText(oldMessage.text, { exact: true })).toBeVisible();
  expect((await state(page, 'council_history')).operations).toEqual([]);
  const clearHistory = page.getByRole('button', { name: 'Очистить', exact: true });
  await expect(clearHistory).toBeEnabled({ timeout: 20_000 });
  await clearHistory.click();
  await expect.poll(async () => (await state(page, 'council_history')).operations[0]?.type).toBe('delete');
  await expect(page.getByText(oldMessage.text, { exact: true })).toHaveCount(0);
  await page.evaluate(({ key, message }) => localStorage.setItem(key, JSON.stringify([message])), { key: historyKey, message: oldMessage });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Очистить', exact: true })).toBeVisible();
  await expect(page.getByText(oldMessage.text, { exact: true })).toHaveCount(0);
  let saved = await state(page, 'council_history');
  // On Safari the previous page's claim may still be sending until its lease
  // expires; the delete intent must remain durable either way.
  await expect.poll(async () => {
    saved = await state(page, 'council_history');
    return saved.operations[0]?.status;
  }).toMatch(/^(pending|sending)$/);
  expect(saved.value).toBeNull(); expect(saved.operations).toHaveLength(1);
  expect(saved.operations[0]).toMatchObject({ type: 'delete', accountId: account });
  expect(saved.source).toBe(source);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('council-cleared.png') });
});

test('council history delete conflict and server snapshot survive reload', async ({ page }) => {
  const serverMessage = { id: 'server-message', role: 'assistant', text: 'Снимок истории сервера', createdAt: '2026-10-12T08:00:00Z' };
  const serverValue = JSON.stringify([serverMessage]);
  const errors = await setup(page, true, { version: 9, exists: true, value: serverValue }, true);
  const deleteRequests: string[] = [];
  page.on('request', (request) => { if (request.method() === 'DELETE') deleteRequests.push(request.url()); });

  await openApp(page, '/#council');
  await expect(page.getByText(oldMessage.text, { exact: true })).toBeVisible();
  const clearHistory = page.getByRole('button', { name: 'Очистить', exact: true });
  await expect(clearHistory).toBeEnabled({ timeout: 20_000 });
  await clearHistory.click();
  await expect.poll(async () => (await state(page, 'council_history')).operations.length).toBe(1);
  await expect.poll(async () => deleteRequests.length).toBe(1);
  await expect.poll(async () => (await state(page, 'council_history')).operations[0]?.status).toBe('conflicted');

  const beforeReload = await state(page, 'council_history');
  const original = beforeReload.operations[0];
  expect(beforeReload.value).toBeNull();
  expect(original).toMatchObject({ type: 'delete', status: 'conflicted', reason: 'server-version-conflict',
    serverSnapshot: { version: 9, exists: true, value: serverValue } });
  expect(original).not.toHaveProperty('value');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Очистить', exact: true })).toBeVisible();
  await expect(page.getByText(oldMessage.text, { exact: true })).toHaveCount(0);
  const notice = page.getByRole('alert').filter({ hasText: 'Обнаружен конфликт' });
  await notice.scrollIntoViewIfNeeded();
  await expect(notice).toBeVisible();
  await page.locator('[data-state-notice-region] details')
    .filter({ hasText: 'Разрешить конфликт или повторить отправку' }).locator('summary').click();
  const recovery = page.getByRole('region', { name: 'История помощника' });
  await expect(recovery.getByText(/Конфликт: 1 локальных операций; версия сервера 9/)).toBeVisible();
  const acceptServer = recovery.getByRole('button', { name: 'Принять серверную версию' });
  await expect(acceptServer).toBeVisible();

  const afterReload = await state(page, 'council_history');
  expect(afterReload.value).toBeNull();
  expect(afterReload.operations).toHaveLength(1);
  expect(afterReload.operations[0]).toMatchObject({ opId: original.opId, type: 'delete', status: 'conflicted',
    serverSnapshot: { version: 9, exists: true, value: serverValue } });

  const dialogHandled = page.waitForEvent('dialog').then(async (dialog) => {
    const message = dialog.message();
    await dialog.accept();
    return message;
  });
  const reload = page.waitForNavigation({ waitUntil: 'load' });
  await acceptServer.click();
  expect(await dialogHandled).toContain('Локальные изменения этого раздела будут удалены');
  await reload;

  await expect.poll(async () => (await state(page, 'council_history')).value).toBe(serverValue);
  const accepted = await state(page, 'council_history');
  expect(accepted.operations).toHaveLength(0);
  expect(accepted.confirmedVersion).toBe(9);
  expect(deleteRequests).toHaveLength(1);
  await expect(page.getByText(serverMessage.text, { exact: true })).toBeVisible();
  await expect(page.getByText(oldMessage.text, { exact: true })).toHaveCount(0);
  expect(errors.filter((error) => !/\b409\b/.test(error))).toEqual([]);
});

test('failed council deletion keeps the visible history and reports a storage error', async ({ page }) => {
  const errors = await setup(page, true);
  const failureMarkerKey = 'owned-state-council-delete-failure-injected';
  await openApp(page, '/#council');
  await expect(page.getByText(oldMessage.text, { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const activeSession = (await state(page, 'council_history')).activeSession;
    return activeSession?.accountId === account && activeSession.serverSessionId === 'a'.repeat(64);
  }).toBe(true);
  await expect(page.locator('[data-state-notice-region]')).toBeVisible();
  await page.evaluate(({ historyKey, failureMarkerKey }) => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      const record = args[0] as { key?: unknown } | null;
      if (this.name === 'outbox' && record?.key === historyKey) {
        localStorage.setItem(failureMarkerKey, 'hit');
        throw new DOMException('Injected quota failure', 'QuotaExceededError');
      }
      return add.apply(this, args);
    };
  }, { historyKey, failureMarkerKey });
  const clearHistory = page.getByRole('button', { name: 'Очистить', exact: true });
  await expect(clearHistory).toBeEnabled({ timeout: 20_000 });
  await clearHistory.click();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), failureMarkerKey)).toBe('hit');
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить' })).toBeVisible();
  await expect(page.getByText(oldMessage.text, { exact: true })).toBeVisible();
  expect((await state(page, 'council_history')).operations).toEqual([]);
  expect((await state(page, 'council_history')).source).toBe(source);
  await page.reload();
  await expect(page.getByText(oldMessage.text, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('two same-origin tabs without Web Locks retain concurrent writes to different keys', async ({ page, context }) => {
  test.setTimeout(60_000);
  const stateWrites: Array<{ keys: string[]; account: string | undefined; session: string | undefined }> = [];
  let releaseStateWrites!: () => void;
  const stateWritesHeld = new Promise<void>(resolve => { releaseStateWrites = resolve; });
  // Keep scoped responses in flight until both tabs' durable writes are observed;
  // the generic mock deliberately returns an unscoped 200 and pauses the sender.
  const holdStateWrites = async (target: Page) => target.route('**/api/state', async route => {
    const request = route.request();
    if (!['PUT', 'DELETE'].includes(request.method())) return route.fallback();
    const body = request.postDataJSON() as { items?: Array<{ key?: unknown; baseVersion?: unknown }> } | null;
    const items = Array.isArray(body?.items) ? body.items : [];
    stateWrites.push({
      keys: items.map(item => String(item.key ?? '')),
      account: request.headers()['x-fitfocus-state-account'],
      session: request.headers()['x-fitfocus-state-session'],
    });
    await stateWritesHeld;
    const headers = {
      'X-FitFocus-State-Protocol': '2',
      'X-FitFocus-State-Guard': '1',
      'X-FitFocus-State-Account': request.headers()['x-fitfocus-state-account'] ?? account,
      'X-FitFocus-State-Session': request.headers()['x-fitfocus-state-session'] ?? 'a'.repeat(64),
    };
    if (request.method() === 'DELETE') {
      const item = items[0];
      return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({
        ok: true, key: String(item?.key ?? ''), version: Number(item?.baseVersion ?? 0) + 1, exists: false,
      }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ ok: true, items: items.map(item => ({
      key: String(item.key ?? ''), version: Number(item.baseVersion ?? 0) + 1, exists: true,
    })) }) });
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
  });

  const errorsA = await setup(page);
  await holdStateWrites(page);
  await openApp(page, '/#plan');
  await expect(page.getByRole('button', { name: 'Записать первый завтрак', exact: true })).toBeVisible();

  const second = await context.newPage();
  const errorsB = await setup(second);
  await holdStateWrites(second);
  try {
    await openApp(second, '/#settings');
    const light = second.getByRole('button', { name: /^Светлая/ });
    await expect(light).toBeVisible();

    const task = page.getByRole('button', { name: 'Записать первый завтрак', exact: true });
    await Promise.all([task.click(), light.click()]);

    await expect.poll(async () => {
      const [plan, settings] = await Promise.all([
        state(page, 'plan_task_done'),
        state(second, 'settings'),
      ]);
      return [plan.operations.length, settings.operations.length];
    }).toEqual([1, 1]);
    const [planFromA, settingsFromA, planFromB, settingsFromB] = await Promise.all([
      state(page, 'plan_task_done'), state(page, 'settings'),
      state(second, 'plan_task_done'), state(second, 'settings'),
    ]);
    expect(planFromA.value).toContain('"0:Записать первый завтрак":true');
    expect(planFromB.value).toBe(planFromA.value);
    expect(planFromB.operations).toEqual(planFromA.operations);
    expect(planFromA.operations[0]).toMatchObject({ type: 'put', accountId: account });
    expect(['pending', 'sending']).toContain(planFromA.operations[0].status);
    expect(settingsFromA.value).toContain('"theme":"light"');
    expect(settingsFromB.value).toBe(settingsFromA.value);
    expect(settingsFromB.operations).toEqual(settingsFromA.operations);
    expect(settingsFromA.operations[0]).toMatchObject({ type: 'put', accountId: account });
    expect(['pending', 'sending']).toContain(settingsFromA.operations[0].status);
    expect(await page.evaluate(() => navigator.locks)).toBeUndefined();
    expect(await second.evaluate(() => navigator.locks)).toBeUndefined();
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(second.locator('vite-error-overlay')).toHaveCount(0);
    expect(stateWrites.length).toBeGreaterThan(0);
    expect(stateWrites.every(write => write.account === account && write.session === 'a'.repeat(64))).toBe(true);
    releaseStateWrites();
    await expect.poll(async () => (await state(page, 'plan_task_done')).operations).toEqual([]);
    await expect.poll(async () => (await state(second, 'settings')).operations).toEqual([]);
  } finally {
    releaseStateWrites();
    if (!second.isClosed()) {
      await second.goto('about:blank', { waitUntil: 'load', timeout: 10_000 }).catch(() => undefined);
      await second.close();
    }
  }
});

test('two same-origin tabs retain a losing full JSON snapshot while the first PUT is in flight', async ({ page, context }) => {
  test.setTimeout(60_000);
  const settingsKey = `fitfocus_data_${account}_settings`;
  const initialSettings = { theme: 'dark', language: 'ru', soundEnabled: false, musicEnabled: false };
  const firstSettings = JSON.stringify({ ...initialSettings, theme: 'light' });
  const secondSettings = JSON.stringify({ ...initialSettings, theme: 'premium' });
  let releaseFirstPut!: () => void;
  const firstPutMayFinish = new Promise<void>(resolve => { releaseFirstPut = resolve; });
  let signalFirstPut!: () => void;
  const firstSettingsPutStarted = new Promise<void>(resolve => { signalFirstPut = resolve; });
  let firstPutCount = 0;
  let firstSettingsPutItems: Array<{ key?: unknown; value?: unknown; baseVersion?: unknown }> = [];
  const settingsPutValues: string[] = [];
  const errorsA = await setup(page, false, undefined, true);
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
  });
  const observeSettingsRead = async (target: Page) => target.addInitScript(key => {
    const originalGet = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (this: IDBObjectStore, ...args: Parameters<typeof originalGet>) {
      const request = originalGet.apply(this, args);
      if (this.name === 'values' && args[0] === key) {
        request.addEventListener('success', () => {
          (window as Window & { __fitfocusSettingsRead?: boolean }).__fitfocusSettingsRead = true;
        }, { once: true });
      }
      return request;
    };
  }, settingsKey);
  await observeSettingsRead(page);
  const holdFirstSettingsPut = async (target: Page) => target.route('**/api/state', async route => {
    const request = route.request();
    if (request.method() !== 'PUT') return route.fallback();
    const body = request.postDataJSON() as { items?: Array<{ key?: unknown; value?: unknown; baseVersion?: unknown }> } | null;
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.some(item => item.key === settingsKey)) return route.fallback();

    firstPutCount += 1;
    if (firstPutCount === 1) firstSettingsPutItems = items;
    signalFirstPut();
    await firstPutMayFinish;
    const headers = {
      'X-FitFocus-State-Protocol': '2',
      'X-FitFocus-State-Guard': '1',
      'X-FitFocus-State-Account': request.headers()['x-fitfocus-state-account'] ?? account,
      'X-FitFocus-State-Session': request.headers()['x-fitfocus-state-session'] ?? 'a'.repeat(64),
    };
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ ok: true,
      items: items.map(item => ({ key: String(item.key ?? ''), version: Number(item.baseVersion ?? 0) + 1, exists: true })) }) });
  });
  const observeSettingsPuts = (target: Page) => target.on('request', request => {
    if (request.method() !== 'PUT' || new URL(request.url()).pathname !== '/api/state') return;
    const body = request.postDataJSON() as { items?: Array<{ key?: unknown; value?: unknown }> } | null;
    for (const item of body?.items ?? []) {
      if (item.key === settingsKey && typeof item.value === 'string') settingsPutValues.push(item.value);
    }
  });

  let second: Page | undefined;
  try {
    await openApp(page, '/#settings');
    await expect(page.getByRole('button', { name: /Тёмная/ })).toHaveClass(/bg-indigo-500\/10/);

    second = await context.newPage();
    const errorsB = await setup(second, false, undefined, true);
    await observeSettingsRead(second);
    await openApp(second, '/#settings');
    await expect(second.getByRole('button', { name: /Тёмная/ })).toHaveClass(/bg-indigo-500\/10/);
    await expect.poll(() => page.evaluate(() =>
      (window as Window & { __fitfocusSettingsRead?: boolean }).__fitfocusSettingsRead === true,
    )).toBe(true);
    await expect.poll(() => second!.evaluate(() =>
      (window as Window & { __fitfocusSettingsRead?: boolean }).__fitfocusSettingsRead === true,
    )).toBe(true);
    await page.evaluate(async ({ account, key, value }) => {
      const opening = indexedDB.open('fitfocus-user-state-v1');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        opening.onsuccess = () => resolve(opening.result);
        opening.onerror = () => reject(opening.error);
      });
      const tx = db.transaction(['values'], 'readwrite');
      const complete = new Promise<void>((resolve, reject) => {
        tx.addEventListener('complete', () => resolve(), { once: true });
        tx.addEventListener('abort', () => reject(tx.error ?? new Error('SETTINGS_SEED_ABORTED')), { once: true });
      });
      tx.objectStore('values').put({ key, accountId: account, value, updatedAt: Date.now() });
      await complete;
      db.close();
    }, { account, key: settingsKey, value: JSON.stringify(initialSettings) });
    expect(await state(page, 'settings')).toMatchObject({ value: JSON.stringify(initialSettings), operations: [] });
    expect(await state(second, 'settings')).toMatchObject({ value: JSON.stringify(initialSettings), operations: [] });
    // Settings updates can reach the sibling tab first through same-origin
    // coordination, so gate the request on both pages after their baseline is ready.
    await holdFirstSettingsPut(page);
    await holdFirstSettingsPut(second);
    observeSettingsPuts(page);
    observeSettingsPuts(second);

    await page.getByRole('button', { name: /Светлая/ }).click();
    await firstSettingsPutStarted;
    expect(firstSettingsPutItems).toContainEqual({ key: settingsKey, value: firstSettings, baseVersion: 0 });
    const sending = await state(page, 'settings');
    expect(sending.value).toBe(firstSettings);
    const firstOperation = sending.operations.find(operation => operation.type === 'put' && operation.status === 'sending'
      && operation.value === firstSettings);
    expect(firstOperation).toBeTruthy();

    await second.getByRole('button', { name: /Premium/ }).click();
    let duringConflict = await state(page, 'settings');
    await expect.poll(async () => {
      duringConflict = await state(page, 'settings');
      return {
        value: duringConflict.value,
        firstStillSending: duringConflict.operations.some(operation => operation.status === 'sending' && operation.value === firstSettings),
        secondConflicted: duringConflict.operations.some(operation => operation.status === 'conflicted'
          && operation.reason === 'local-revision-conflict' && operation.value === secondSettings),
      };
    }).toEqual({ value: firstSettings, firstStillSending: true, secondConflicted: true });
    const conflict = duringConflict.operations.find(operation => operation.type === 'put' && operation.status === 'conflicted'
      && operation.reason === 'local-revision-conflict' && operation.value === secondSettings)!;
    expect(JSON.parse(conflict.value!)).toEqual({ ...initialSettings, theme: 'premium' });
    expect(firstPutCount).toBe(1);
    // A sibling tab may carry the first operation. Assert on its payload so
    // the losing snapshot is rejected regardless of which tab sends the PUT.
    expect(settingsPutValues).toEqual([firstSettings]);

    releaseFirstPut();
    await expect.poll(async () => {
      const current = await state(page, 'settings');
      const retained = current.operations.find(operation => operation.opId === conflict.opId);
      return {
        value: current.value,
        confirmedVersion: current.confirmedVersion,
        operationCount: current.operations.length,
        firstOperationRemoved: !current.operations.some(operation => operation.opId === firstOperation!.opId),
        conflict: retained && { opId: retained.opId, status: retained.status, reason: retained.reason, value: retained.value },
      };
    }).toEqual({
      value: firstSettings,
      confirmedVersion: 1,
      operationCount: 1,
      firstOperationRemoved: true,
      conflict: { opId: conflict.opId, status: 'conflicted', reason: 'local-revision-conflict', value: secondSettings },
    });
    expect(firstPutCount).toBe(1);
    expect(settingsPutValues).toEqual([firstSettings]);
    expect(await page.evaluate(() => navigator.locks)).toBeUndefined();
    expect(await second.evaluate(() => navigator.locks)).toBeUndefined();
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(second.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    releaseFirstPut();
    if (second && !second.isClosed()) {
      await second.goto('about:blank', { waitUntil: 'load', timeout: 10_000 }).catch(() => undefined);
      await second.close();
    }
  }
});
