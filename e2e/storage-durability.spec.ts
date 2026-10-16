import { expect, type Page } from '@playwright/test';
import { test } from './support/mockTest';
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

async function storedWeeklyReportCount(page: Page) {
  return page.evaluate(async () => {
    const opening = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const tx = db.transaction('values', 'readonly');
      const value = await new Promise<{ value?: string } | undefined>((resolve, reject) => {
        const request = tx.objectStore('values').get('fitfocus_data_google-e2e-sub_weekly_reports');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return value?.value ? JSON.parse(value.value).length as number : 0;
    } finally {
      db.close();
    }
  });
}

test('settings edit survives reload in IndexedDB with its outgoing intent', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !/\b503\b/.test(message.text())) errors.push(message.text()); });
  await mockApp(page, { session: 'app' });
  // Keep the intent pending with a valid scoped offline response. The generic
  // mock intentionally omits writer headers, which pauses auth and obscures the
  // reload-durability behavior this test is meant to cover.
  await page.route('**/api/state*', async route => {
    const request = route.request();
    if (!['PUT', 'DELETE'].includes(request.method())) return route.fallback();
    const headers = request.headers();
    await route.fulfill({ status: 503, contentType: 'application/json', headers: {
      'X-FitFocus-State-Protocol': '2',
      'X-FitFocus-State-Guard': '1',
      'X-FitFocus-State-Account': headers['x-fitfocus-state-account'] ?? 'google-e2e-sub',
      'X-FitFocus-State-Session': headers['x-fitfocus-state-session'] ?? 'a'.repeat(64),
    }, body: JSON.stringify({ error: 'INJECTED_OFFLINE' }) });
  });
  await openApp(page, '/#settings');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page).toHaveURL(/#settings$/);
  const light = page.getByRole('button', { name: /^Светлая/ });
  await light.click();
  await expect.poll(async () => (await storedSettings(page)).value).toContain('"theme":"light"');
  const saved = await storedSettings(page);
  expect(saved.operations).toHaveLength(1);
  expect(saved.operations[0]).toMatchObject({ type: 'put' });
  expect(['pending', 'sending']).toContain(saved.operations[0].status);
  expect(await page.evaluate(() => localStorage.getItem('fitfocus.remote-kv-outbox.v1') ?? '')).not.toContain('_settings');
  await page.reload();
  await expect(light).toBeVisible();
  await expect(light).toHaveClass(/border-indigo-500\/40/);
  expect((await storedSettings(page)).value).toContain('"theme":"light"');
  const reloaded = await storedSettings(page);
  expect(reloaded.operations).toHaveLength(1);
  expect(reloaded.operations[0]).toMatchObject({ type: 'put' });
  expect(['pending', 'sending']).toContain(reloaded.operations[0].status);
  await expect(page.getByRole('status').filter({ hasText: 'ожидают синхронизации' })).toBeVisible();
  await expect(page.getByText('Cloud: pending', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Cloud: saved', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

type ServerStateItem = { version: number; value: string };
async function verifiedServer(page: Page, server: Map<string, ServerStateItem>, options: {
  conflict?: boolean; settingsFailure?: boolean; settingsRequests?: number[];
  settingsConflictGate?: { started: () => void; wait: Promise<void> };
  settingsSuccessGate?: { started: () => void; wait: Promise<void> };
  settingsPayloads?: Array<{ baseVersion: number; value: string }>;
  loseFirstSettingsResponse?: boolean;
  unscopedStateWrites?: Array<{ method: string; url: string; body: string | null }>;
} = {}) {
  await page.route('**/api/me*', async (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    user: { sub: 'google-e2e-sub', name: 'E2E User', email: 'e2e@example.com', roles: ['user'] }, hasAccess: true,
    stateSync: { protocol: 2, guard: 1, accountId: 'google-e2e-sub', sessionId: 'a'.repeat(64) },
    bootstrapSync: { protocol: 1, guard: 1 }, aiSync: { protocol: 1, guard: 1 }, weeklyMenuSync: { protocol: 1, guard: 1 },
  }) }));
  await page.route('**/api/state*', async (route) => {
    const request = route.request(); const headers = request.headers();
    if (!headers['x-fitfocus-state-account']) {
      if (request.method() === 'PUT' || request.method() === 'DELETE') {
        options.unscopedStateWrites?.push({ method: request.method(), url: request.url(), body: request.postData() });
      }
      await route.fallback(); return;
    }
    const scope = { 'X-FitFocus-State-Protocol': '2', 'X-FitFocus-State-Guard': '1',
      'X-FitFocus-State-Account': headers['x-fitfocus-state-account'], 'X-FitFocus-State-Session': headers['x-fitfocus-state-session'] };
    if (request.method() === 'GET') {
      const prefix = new URL(request.url()).searchParams.get('prefix') ?? '';
      await route.fulfill({ contentType: 'application/json', headers: scope, body: JSON.stringify({
        items: [...server].filter(([key]) => key.startsWith(prefix)).map(([key, item]) => ({ key, ...item, exists: true })),
      }) }); return;
    }
    if (request.method() !== 'PUT') { await route.fallback(); return; }
    const items = request.postDataJSON().items as { key: string; value: string; baseVersion: number }[];
    const settingsItems = items.filter((item) => item.key.endsWith('_settings'));
    for (const item of settingsItems) {
      options.settingsRequests?.push(item.baseVersion);
      options.settingsPayloads?.push({ baseVersion: item.baseVersion, value: item.value });
    }
    if (options.conflict && items[0].key.endsWith('_settings')) {
      options.settingsConflictGate?.started();
      if (options.settingsConflictGate) await options.settingsConflictGate.wait;
      await route.fulfill({ status: 409, contentType: 'application/json', headers: scope,
        body: JSON.stringify({ error: 'KV_CONFLICT', key: items[0].key, value: '{"theme":"dark"}', exists: true, version: 9 }) }); return;
    }
    if (options.settingsFailure && items[0].key.endsWith('_settings')) {
      await route.fulfill({ status: 403, contentType: 'application/json', headers: scope,
        body: JSON.stringify({ error: 'FORBIDDEN_KEYSPACE' }) }); return;
    }
    if (options.settingsSuccessGate && items.some((item) => item.key.endsWith('_settings'))) {
      options.settingsSuccessGate.started();
      await options.settingsSuccessGate.wait;
      if (page.isClosed() || page.url() === 'about:blank') {
        await route.abort('failed').catch(() => {});
        return;
      }
    }
    if (options.loseFirstSettingsResponse && settingsItems.length === 1) {
      const item = settingsItems[0];
      const current = server.get(item.key);
      if (item.baseVersion === (current?.version ?? 0)) {
        options.loseFirstSettingsResponse = false;
        server.set(item.key, { version: item.baseVersion + 1, value: item.value });
        await route.abort('failed');
        return;
      }
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

test('keeps an unacknowledged intent conflicted when the server committed but the response was lost', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/409|net::ERR_FAILED/.test(message.text())) errors.push(message.text());
  });
  const key = 'fitfocus_data_google-e2e-sub_settings';
  const server = new Map<string, ServerStateItem>();
  let releaseFirstWrite: () => void = () => {};
  let markFirstWriteStarted: () => void = () => {};
  const firstWriteResponse = new Promise<void>((resolve) => { releaseFirstWrite = resolve; });
  const firstWriteStarted = new Promise<void>((resolve) => { markFirstWriteStarted = resolve; });
  const settingsPayloads: Array<{ baseVersion: number; value: string }> = [];
  const options = {
    settingsRequests: [] as number[],
    settingsPayloads,
    loseFirstSettingsResponse: true,
    settingsSuccessGate: { started: markFirstWriteStarted, wait: firstWriteResponse },
  };

  await mockApp(page, { session: 'app' });
  await verifiedServer(page, server, options);
  await openApp(page, '/#settings');
  try {
    await page.getByRole('button', { name: /^Светлая/ }).click();
    await firstWriteStarted;
    const sending = await storedSettings(page);
    expect(sending.operations).toHaveLength(1);
    expect(sending.operations[0].status).toBe('sending');
    const originalOpId = sending.operations[0].opId;
    const originalPayload = sending.operations[0].value;
    expect(originalPayload).toContain('"theme":"light"');

    releaseFirstWrite();
    await expect.poll(async () => (await storedSettings(page)).operations[0]?.status, { timeout: 15_000 })
      .toBe('conflicted');

    const saved = await storedSettings(page);
    const operation = saved.operations[0];
    expect(saved.operations).toHaveLength(1);
    expect(operation).toMatchObject({ opId: originalOpId, type: 'put', status: 'conflicted', reason: 'server-version-conflict' });
    expect(operation.value).toBe(originalPayload);
    expect(saved.value).toBe(originalPayload);
    expect(saved.confirmedVersion).toBe(0);
    expect(operation.serverSnapshot).toEqual({ value: originalPayload, version: 1, exists: true });
    expect(settingsPayloads).toHaveLength(2);
    expect(settingsPayloads[0]).toEqual({ baseVersion: 0, value: originalPayload });
    expect(settingsPayloads[1]).toEqual(settingsPayloads[0]);
    expect(server.get(key)).toEqual({ version: 1, value: originalPayload });
    await expect(page.getByRole('alert').filter({ hasText: 'Обнаружен конфликт' })).toBeVisible();
    await expect(page.getByText('Cloud: saved', { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    releaseFirstWrite();
  }
});

test('reclaims a durable settings send after its tab closes and the lease expires', async ({ page, context }) => {
  test.setTimeout(60_000);
  const server = new Map<string, ServerStateItem>();
  const settingsRequests: number[] = [];
  const settingsPayloads: Array<{ baseVersion: number; value: string }> = [];
  const unscopedStateWrites: Array<{ method: string; url: string; body: string | null }> = [];
  let releaseFirstWrite!: () => void;
  let markFirstWriteStarted!: () => void;
  const firstWriteWait = new Promise<void>((resolve) => { releaseFirstWrite = resolve; });
  const firstWriteStarted = new Promise<void>((resolve) => { markFirstWriteStarted = resolve; });
  const options = {
    settingsRequests,
    settingsPayloads,
    unscopedStateWrites,
    settingsSuccessGate: { started: markFirstWriteStarted, wait: firstWriteWait },
  };
  let releaseRetry!: () => void;
  let markRetryStarted!: () => void;
  const retryWait = new Promise<void>((resolve) => { releaseRetry = resolve; });
  const retryStarted = new Promise<void>((resolve) => { markRetryStarted = resolve; });
  let retryTab: Page | undefined;

  await mockApp(page, { session: 'app' });
  await verifiedServer(page, server, options);
  await openApp(page, '/#settings');
  await page.clock.setFixedTime(await page.evaluate(() => Date.now()));

  try {
    await page.getByRole('button', { name: /^Светлая/ }).click();
    await firstWriteStarted;
    const initial = await storedSettings(page);
    expect(initial.operations).toHaveLength(1);
    expect(initial.operations[0]).toMatchObject({ status: 'sending', type: 'put' });
    const original = initial.operations[0];
    expect(original.attempt?.attemptId).toBeTruthy();

    await page.goto('about:blank', { waitUntil: 'load', timeout: 10_000 });
    await page.close();
    options.settingsSuccessGate = { started: markRetryStarted, wait: retryWait };

    retryTab = await context.newPage();
    await mockApp(retryTab, { session: 'app' });
    await verifiedServer(retryTab, server, options);
    await retryTab.clock.setFixedTime((original.attempt?.startedAtMs ?? 0) + 30_001);
    await openApp(retryTab, '/#settings');
    await retryStarted;

    const reclaimed = await storedSettings(retryTab);
    expect(reclaimed.operations).toHaveLength(1);
    expect(reclaimed.operations[0]).toMatchObject({ opId: original.opId, status: 'sending', type: 'put' });
    expect(reclaimed.operations[0].value).toBe(original.value);
    expect(reclaimed.operations[0].attempt?.attemptId).not.toBe(original.attempt?.attemptId);
    expect(reclaimed.operations[0].attempt?.owner).not.toBe(original.attempt?.owner);
    expect(settingsRequests).toEqual([0, 0]);
    expect(settingsPayloads).toEqual([
      { baseVersion: original.baseVersion, value: original.value },
      { baseVersion: original.baseVersion, value: original.value },
    ]);
    expect(unscopedStateWrites).toEqual([]);

    releaseRetry();
    await expect.poll(async () => (await storedSettings(retryTab!)).confirmedVersion).toBe(1);
    expect((await storedSettings(retryTab)).operations).toHaveLength(0);
    expect(server.get('fitfocus_data_google-e2e-sub_settings')).toEqual({ version: 1, value: original.value });
  } finally {
    releaseFirstWrite();
    releaseRetry();
    if (retryTab && !retryTab.isClosed()) await retryTab.close();
  }
});

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
    const luminance = (color: string) => {
      const channels = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((value) => {
        const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    let background: string | undefined;
    for (let node: HTMLElement | null = element as HTMLElement; node; node = node.parentElement) {
      const color = getComputedStyle(node).backgroundColor;
      const channels = color.match(/[\d.]+/g)?.map(Number) ?? [];
      if (channels.length < 4 || channels[3] > 0) { background = color; break; }
    }
    const fg = luminance(getComputedStyle(element).color);
    const bg = luminance(background ?? 'rgb(255 255 255)');
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  const saved = await storedSettings(page); expect(saved.value).toContain('"theme":"light"');
  expect(saved.operations[0]).toMatchObject({ type: 'put', status: 'conflicted', serverSnapshot: { version: 9 } });
  await expect(page.getByText('Cloud: saved', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]); await page.screenshot({ path: testInfo.outputPath('state-conflict.png') });
});

test('resolves a checked server conflict by sending the latest local settings version', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !/409/.test(message.text())) errors.push(message.text()); });
  const key = 'fitfocus_data_google-e2e-sub_settings';
  const server = new Map<string, ServerStateItem>([[key, { version: 9, value: '{"theme":"dark"}' }]]);
  const options = { conflict: true, settingsRequests: [] as number[] };
  await mockApp(page, { session: 'app' }); await verifiedServer(page, server, options); await openApp(page, '/#settings');
  await page.getByRole('button', { name: /^Светлая/ }).click();
  await expect.poll(async () => (await storedSettings(page)).operations[0]?.status).toBe('conflicted');
  await page.locator('[data-state-notice-region] details summary').click();
  const action = page.getByRole('button', { name: 'Оставить последнюю локальную версию' });
  await expect(action).toBeVisible();
  options.conflict = false;
  await action.click();

  await expect.poll(async () => (await storedSettings(page)).operations).toHaveLength(0);
  expect(await storedSettings(page)).toMatchObject({ confirmedVersion: 10 });
  expect((await storedSettings(page)).value).toContain('"theme":"light"');
  expect(options.settingsRequests.at(-1)).toBe(9);
  expect(server.get(key)?.version).toBe(10);
  expect(JSON.parse(server.get(key)!.value)).toMatchObject({ theme: 'light' });
  expect(errors).toEqual([]);
});

test('multi-edit recovery warns before replacing earlier operations and sends only the latest settings', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !/\b409\b/.test(message.text())) errors.push(message.text()); });
  const key = 'fitfocus_data_google-e2e-sub_settings';
  const server = new Map<string, ServerStateItem>();
  let releaseConflict!: () => void; let markConflictStarted!: () => void;
  const conflictWait = new Promise<void>((resolve) => { releaseConflict = resolve; });
  const conflictStarted = new Promise<void>((resolve) => { markConflictStarted = resolve; });
  const options = { conflict: true, settingsRequests: [] as number[], settingsConflictGate: { started: markConflictStarted, wait: conflictWait } };
  await mockApp(page, { session: 'app' }); await verifiedServer(page, server, options);
  await openApp(page, '/#settings');
  await page.getByRole('button', { name: /^Светлая/ }).click();
  await conflictStarted;
  await page.getByRole('button', { name: /^Violet AI/ }).click();
  const queued = await storedSettings(page);
  expect(queued.operations).toHaveLength(2);
  expect(queued.operations.map((operation) => operation.status).sort()).toEqual(['pending', 'sending']);
  const latestValue = queued.value!;

  releaseConflict();
  await expect.poll(async () => (await storedSettings(page)).operations.some((operation) => operation.status === 'conflicted')).toBe(true);
  expect((await storedSettings(page)).operations).toHaveLength(2);
  server.set(key, { version: 9, value: '{"theme":"dark"}' });
  await page.locator('[data-state-notice-region] details summary').click();
  const group = page.getByRole('region', { name: 'Настройки' });
  const dialogHandled = page.waitForEvent('dialog').then(async (dialog) => {
    const message = dialog.message();
    await dialog.accept();
    return message;
  });
  options.conflict = false;
  await group.getByRole('button', { name: 'Оставить последнюю локальную версию' }).click();
  expect(await dialogHandled).toContain('Она заменит остальные 1 несинхронизированные операции этого раздела');

  await expect.poll(async () => (await storedSettings(page)).operations).toHaveLength(0);
  expect((await storedSettings(page)).value).toBe(latestValue);
  expect((await storedSettings(page)).confirmedVersion).toBe(10);
  expect(options.settingsRequests).toEqual([0, 9]);
  expect(JSON.parse(server.get(key)!.value)).toEqual(JSON.parse(latestValue));
  expect(errors).toEqual([]);
});

test('retries a failed settings operation from the recovery panel without changing its payload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !/\b403\b/.test(message.text())) errors.push(message.text()); });
  const key = 'fitfocus_data_google-e2e-sub_settings';
  const server = new Map<string, ServerStateItem>();
  const options = { settingsFailure: true, settingsRequests: [] as number[] };
  await mockApp(page, { session: 'app' }); await verifiedServer(page, server, options); await openApp(page, '/#settings');
  await page.getByRole('button', { name: /^Светлая/ }).click();
  await expect.poll(async () => (await storedSettings(page)).operations[0]?.status).toBe('failed');
  const original = (await storedSettings(page)).operations[0];
  expect(original.value).toContain('"theme":"light"');

  await page.reload();
  await page.locator('[data-state-notice-region] details summary').click();
  const group = page.getByRole('region', { name: 'Настройки' });
  await expect(group.getByText(/Сервер запретил запись/)).toBeVisible();
  const retry = group.getByRole('button', { name: 'Повторить отправку' });
  await expect(retry).toBeVisible();
  options.settingsFailure = false;
  await retry.click();

  await expect.poll(async () => (await storedSettings(page)).operations).toHaveLength(0);
  expect(await storedSettings(page)).toMatchObject({ confirmedVersion: 1 });
  expect((await storedSettings(page)).value).toContain('"theme":"light"');
  expect(options.settingsRequests).toEqual([0, 0]);
  expect(server.get(key)).toMatchObject({ version: 1 });
  expect(JSON.parse(server.get(key)!.value)).toMatchObject({ theme: 'light' });
  expect(errors).toEqual([]);
});

test('accepting a checked server conflict warns, reloads, and discards only the local variant', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !/\b409\b/.test(message.text())) errors.push(message.text()); });
  const key = 'fitfocus_data_google-e2e-sub_settings';
  const server = new Map<string, ServerStateItem>([[key, { version: 9, value: '{"theme":"dark"}' }]]);
  await mockApp(page, { session: 'app' }); await verifiedServer(page, server, { conflict: true }); await openApp(page, '/#settings');
  await page.getByRole('button', { name: /^Светлая/ }).click();
  await expect.poll(async () => (await storedSettings(page)).operations[0]?.status).toBe('conflicted');
  await page.locator('[data-state-notice-region] details summary').click();
  const group = page.getByRole('region', { name: 'Настройки' });
  const accept = group.getByRole('button', { name: 'Принять серверную версию' });
  await expect(accept).toBeVisible();
  const dialogHandled = page.waitForEvent('dialog').then(async (dialog) => {
    const message = dialog.message();
    await dialog.accept();
    return message;
  });
  const reload = page.waitForNavigation({ waitUntil: 'load' });
  await accept.click();
  expect(await dialogHandled).toContain('Локальные изменения этого раздела будут удалены');
  await reload;

  await expect.poll(async () => (await storedSettings(page)).operations).toHaveLength(0);
  expect(await storedSettings(page)).toMatchObject({ confirmedVersion: 9 });
  expect((await storedSettings(page)).value).toContain('"theme":"dark"');
  await expect(page.getByRole('button', { name: /^Тёмная/ })).toHaveClass(/border-indigo-500\/40/);
  await expect(page.getByText('Cloud: pending', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('canceling server acceptance keeps the checked conflict and the local settings', async ({ page }) => {
  const key = 'fitfocus_data_google-e2e-sub_settings';
  const server = new Map<string, ServerStateItem>([[key, { version: 9, value: '{"theme":"dark"}' }]]);
  await mockApp(page, { session: 'app' }); await verifiedServer(page, server, { conflict: true }); await openApp(page, '/#settings');
  await page.getByRole('button', { name: /^Светлая/ }).click();
  await expect.poll(async () => (await storedSettings(page)).operations[0]?.status).toBe('conflicted');
  await page.locator('[data-state-notice-region] details summary').click();
  const group = page.getByRole('region', { name: 'Настройки' });
  const dialogHandled = page.waitForEvent('dialog').then(async (dialog) => {
    const message = dialog.message();
    await dialog.dismiss();
    return message;
  });
  await group.getByRole('button', { name: 'Принять серверную версию' }).click();
  expect(await dialogHandled).toContain('Локальные изменения этого раздела будут удалены');

  const retained = await storedSettings(page);
  expect(retained.value).toContain('"theme":"light"');
  expect(retained.confirmedVersion).toBe(9);
  expect(retained.operations).toHaveLength(1);
  expect(retained.operations[0]).toMatchObject({ status: 'conflicted', serverSnapshot: { version: 9 } });
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
  // This observer closes before the shared fixture; unload it while its mocks remain active.
  await second.goto('about:blank', { waitUntil: 'load', timeout: 10_000 });
  await second.close();
});

test('two tabs without Web Locks retain a same-key edit made while its first write is in flight', async ({ page, context }) => {
  test.setTimeout(60_000);
  const server = new Map<string, ServerStateItem>();
  const settingsRequests: number[] = [];
  const errors: string[] = [];
  let releaseFirstWrite!: () => void;
  let markFirstWriteStarted!: () => void;
  const firstWriteStarted = new Promise<void>((resolve) => { markFirstWriteStarted = resolve; });
  const firstWriteResponse = new Promise<void>((resolve) => { releaseFirstWrite = resolve; });
  const options = { settingsRequests, settingsSuccessGate: { started: markFirstWriteStarted, wait: firstWriteResponse } };
  const watch = (tab: Page) => {
    tab.on('pageerror', (error) => errors.push(error.message));
    tab.on('console', (message) => { if (message.type() === 'error' && !/409/.test(message.text())) errors.push(message.text()); });
  };
  watch(page);
  await context.addInitScript(() => { Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true }); });
  await mockApp(page, { session: 'app' });
  await verifiedServer(page, server, options);
  await openApp(page, '/#settings');

  const second = await context.newPage();
  watch(second);
  await mockApp(second, { session: 'app' });
  await verifiedServer(second, server, options);
  await openApp(second, '/#settings');
  await expect(second.getByRole('button', { name: /^Тёмная/ })).toHaveClass(/border-indigo-500\/40/);

  try {
    await page.getByRole('button', { name: /^Светлая/ }).click();
    await firstWriteStarted;
    await expect.poll(async () => (await storedSettings(page)).value).toContain('"theme":"light"');

    await second.getByRole('button', { name: /^Violet AI/ }).click();
    await expect.poll(async () => (await storedSettings(second)).operations.some((operation) => operation.status === 'conflicted')).toBe(true);
    const conflicted = await storedSettings(second);
    expect(conflicted.value).toContain('"theme":"light"');
    expect(conflicted.operations).toHaveLength(2);
    const localConflict = conflicted.operations.find((operation) => operation.status === 'conflicted');
    const inFlight = conflicted.operations.find((operation) => operation.status === 'sending');
    expect(localConflict).toMatchObject({ status: 'conflicted', reason: 'local-revision-conflict', accountId: 'google-e2e-sub' });
    expect(localConflict?.value).toContain('"theme":"violet"');
    expect(inFlight?.value).toContain('"theme":"light"');
    expect(server.get('fitfocus_data_google-e2e-sub_settings')).toBeUndefined();
    expect(settingsRequests).toEqual([0]);

    releaseFirstWrite();
    await expect.poll(async () => (await storedSettings(page)).confirmedVersion).toBe(1);
    const afterAcknowledgement = await storedSettings(second);
    expect(afterAcknowledgement.value).toContain('"theme":"light"');
    expect(afterAcknowledgement.confirmedVersion).toBe(1);
    expect(afterAcknowledgement.operations).toHaveLength(1);
    expect(afterAcknowledgement.operations[0]).toMatchObject({ status: 'conflicted', reason: 'local-revision-conflict' });
    expect(afterAcknowledgement.operations[0].value).toContain('"theme":"violet"');
    expect(server.get('fitfocus_data_google-e2e-sub_settings')).toMatchObject({ version: 1 });
    expect(settingsRequests).toEqual([0]);
    expect(errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(second.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    releaseFirstWrite();
    await second.goto('about:blank', { waitUntil: 'load', timeout: 10_000 });
    await second.close();
  }
});

test('quota fault rolls back settings and displays a visible storage error', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const weeklyReportResponse = page.waitForResponse((response) => {
    const request = response.request();
    return new URL(response.url()).pathname === '/api/ai'
      && request.method() === 'POST'
      && request.postDataJSON()?.feature === 'wis_text';
  });
  await mockApp(page, { session: 'app', acknowledgeStateWrites: true });
  await openApp(page, '/#settings');
  const reportResponse = await weeklyReportResponse;
  await reportResponse.finished();
  await expect.poll(() => storedWeeklyReportCount(page)).toBeGreaterThan(0);
  await page.getByRole('button', { name: /^Светлая/ }).click();
  await expect.poll(async () => (await storedSettings(page)).value).toContain('"theme":"light"');
  await expect.poll(async () => (await storedSettings(page)).confirmedVersion).toBe(1);
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
