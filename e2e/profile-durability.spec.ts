import { expect, type Page } from '@playwright/test';
import { test } from './support/mockTest';
import { mockApp, openApp, buildMockProfile } from './support/appHarness';
const account = 'google-e2e-sub'; const sid = 'a'.repeat(64);
const key = `fitfocus_data_${account}_profile`;
const profile = { ...buildMockProfile(), id: account, version: 2 };
const scope = { 'X-FitFocus-Profile-Protocol': '1', 'X-FitFocus-Profile-Guard': '1',
  'X-FitFocus-Bootstrap-Protocol': '1', 'X-FitFocus-Bootstrap-Guard': '1',
  'X-FitFocus-State-Protocol': '2', 'X-FitFocus-State-Guard': '1',
  'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid };
async function saved(page: Page) {
  return page.evaluate(async key => {
    const opening = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error); });
    const read = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const tx = db.transaction(['values', 'outbox', 'outbox_meta'], 'readonly');
      const [value, operations, active] = await Promise.all([read(tx.objectStore('values').get(key)), read(tx.objectStore('outbox').getAll()),
        read(tx.objectStore('outbox_meta').get('active-session'))]);
      return { value: value?.value as string | undefined,
        pause: active?.pause as string | undefined,
        stateOperationCount: operations.filter(op => op.resource !== 'profile').length,
      operations: operations.filter(op => op.key === key) as Array<{ opId: string; status: string; resource: string; baseVersion: number; value: string; attempt?: { sessionEpoch: string; attemptId: string; startedAtMs: number }; serverSnapshot?: { version: number } }> };
    } finally { db.close(); }
  }, key);
}
async function setup(page: Page, mode: 'auth' | 'conflict' | 'refresh' | 'normal', stateGate?: { started: () => void; wait: Promise<void> },
  profileGates: Array<{ started: () => void; wait: Promise<void> }> = []) {
  let conflict = mode === 'conflict';
  let expectedProfileBaseVersion = mode === 'refresh' ? 9 : 2;
  let currentSid = sid;
  let expired = false;
  let rejectedProofs = 0;
  // A new document can start with a restored server login; focus within the old document cannot.
  page.on('request', request => {
    if (request.isNavigationRequest() && request.resourceType() === 'document' && request.frame() === page.mainFrame()) expired = false;
  });
  const errors: string[] = []; const mutations: string[] = []; const profileBases: number[] = []; const routeErrors: string[] = [];
  const expectedHttpErrors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    const injectedStatus = conflict ? 409 : 401;
    const source = message.location().url;
    const path = source.startsWith('http') ? new URL(source).pathname : source;
    if ((path === '/api/profile' || rejectedProofs > 0 && path === '/api/me')
      && message.text().startsWith('Failed to load resource:') && message.text().includes(`status of ${injectedStatus}`)) {
      expectedHttpErrors.push(message.text());
    } else errors.push(message.text());
  });
  await mockApp(page, { session: 'app' });
  await page.route('**/api/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200, headers = { ...scope, 'X-FitFocus-State-Session': currentSid }) => route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
    if (path === '/api/me' && expired) { rejectedProofs += 1; return json({ error: 'UNAUTH' }, 401); }
    if (path === '/api/me') return json({ user: { sub: account, roles: ['user'] }, hasAccess: true,
      stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: currentSid }, profileSync: { protocol: 1, guard: 1, weeklyMenuProjection: 1 }, bootstrapSync: { protocol: 1, guard: 1 }, aiSync: { protocol: 1, guard: 1 }, weeklyMenuSync: { protocol: 1, guard: 1 } });
    if (path === '/api/bootstrap') return json({ user: { sub: account }, profile, items: [] });
    if (path === '/api/profile' && request.method() === 'PUT') {
      const writeIndex = mutations.length;
      const responseScope = { ...scope, 'X-FitFocus-State-Session': currentSid };
      mutations.push(request.method());
      const body = request.postDataJSON() as { baseVersion: number };
      profileBases.push(body.baseVersion);
      expect(request.headers()['x-fitfocus-state-account']).toBe(account);
      expect(request.headers()['x-fitfocus-state-session']).toBe(currentSid);
      expect(body.baseVersion).toBe(expectedProfileBaseVersion);
      const gate = profileGates[writeIndex];
      const respond = () => {
        if (mode === 'refresh') return json({ profile: { ...body, id: account, version: 10 }, version: 10 }, 200, responseScope);
        if (mode === 'auth') { expired = true; return json({ error: 'UNAUTH' }, 401, responseScope); }
        if (conflict) return json({ error: 'PROFILE_CONFLICT', profile: { ...profile, name: 'Cloud name', version: 8 }, version: 8 }, 409, responseScope);
        return json({ profile: { ...body, id: account, version: body.baseVersion + 1 }, version: body.baseVersion + 1 }, 200, responseScope);
      };
      if (gate) {
        gate.started(); await gate.wait;
        try { return await respond(); }
        catch (error) { routeErrors.push(String(error)); return; }
      }
      return respond();
    }
    if (path === '/api/profile') return json({ profile: mode === 'refresh' ? { ...profile, name: 'Cloud refreshed', version: 9 } : profile });
    if (path === '/api/state' && request.method() === 'GET') return json({ items: [] });
    if (path === '/api/state' && request.method() === 'PUT') {
      const body = request.postDataJSON() as { items: Array<{ key: string; baseVersion: number }> };
      stateGate?.started();
      if (stateGate) await stateGate.wait;
      return json({ ok: true, items: body.items.map(item => ({ key: item.key, exists: true, version: item.baseVersion + 1 })) });
    }
    return route.fallback();
  });
  return { errors, mutations, profileBases, expectedHttpErrors, routeErrors,
    setSession: (sessionId: string) => { currentSid = sessionId; },
    resolveConflict: () => { conflict = false; expectedProfileBaseVersion = 8; } };
}
test('profile edits survive reload and a different bootstrap snapshot during an auth pause', async ({ page }, testInfo) => {
  const { errors, mutations } = await setup(page, 'auth');
  await openApp(page, '/#settings');
  const name = page.getByPlaceholder('Как к вам обращаться');
  await expect(name).toHaveValue(profile.name);
  expect((await saved(page)).operations).toEqual([]);
  await name.fill('Локальное имя'); await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
  await expect.poll(async () => (await saved(page)).value).toContain('Локальное имя');
  await expect.poll(async () => {
    const snapshot = await saved(page);
    return { pause: snapshot.pause, status: snapshot.operations[0]?.status };
  }).toEqual({ pause: 'auth', status: 'pending' });
  expect(mutations).toEqual(['PUT']);
  const operationId = (await saved(page)).operations[0].opId;
  const proofRejected = page.waitForResponse(response => new URL(response.url()).pathname === '/api/me' && response.status() === 401);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await proofRejected;
  await expect.poll(async () => ({ pause: (await saved(page)).pause, mutations: [...mutations] }))
    .toEqual({ pause: 'auth', mutations: ['PUT'] });
  await page.reload(); await expect(name).toHaveValue('Локальное имя');
  await expect.poll(() => mutations).toEqual(['PUT', 'PUT']);
  await expect.poll(async () => (await saved(page)).pause).toBe('auth');
  expect((await saved(page)).operations).toHaveLength(1);
  expect((await saved(page)).operations[0].opId).toBe(operationId);
  await expect(page).toHaveTitle(/FitFocus/); await expect(page).toHaveURL(/#settings$/);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([]);
  // The mobile settings form places the profile field below the initial viewport.
  // Verify it is rendered and restored without imposing a desktop viewport layout.
  await expect(name).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('profile-local-reload.png') });
});

test('profile outbox resumes the same operation after BFCache with a newly verified session', async ({ page }) => {
  let releaseOldResponse!: () => void;
  let oldWriteStarted!: () => void;
  let releaseFreshResponse!: () => void;
  let freshWriteStarted!: () => void;
  const oldResponseGate = new Promise<void>(resolve => { releaseOldResponse = resolve; });
  const freshResponseGate = new Promise<void>(resolve => { releaseFreshResponse = resolve; });
  const oldWrite = new Promise<void>(resolve => { oldWriteStarted = resolve; });
  const freshWrite = new Promise<void>(resolve => { freshWriteStarted = resolve; });
  const nextSid = 'c'.repeat(64);
  const { errors, mutations, setSession, routeErrors } = await setup(page, 'normal', undefined, [
    { started: oldWriteStarted, wait: oldResponseGate },
    { started: freshWriteStarted, wait: freshResponseGate },
  ]);

  try {
    await openApp(page, '/#settings');
    const name = page.getByPlaceholder('Как к вам обращаться');
    await name.fill('Профиль после возврата из BFCache');
    await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
    await oldWrite;

    const beforeHide = await saved(page);
    const original = beforeHide.operations[0];
    expect(original).toMatchObject({ status: 'sending', resource: 'profile', value: expect.stringContaining('Профиль после возврата из BFCache') });
    expect(original?.attempt?.sessionEpoch).toBeTruthy();

    const oldRequestFailed = page.waitForEvent('requestfailed', request =>
      new URL(request.url()).pathname === '/api/profile' && request.method() === 'PUT');
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    await oldRequestFailed;
    setSession(nextSid);

    const freshResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/api/profile' && response.request().method() === 'PUT'
      && response.request().headers()['x-fitfocus-state-session'] === nextSid);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await freshWrite;

    const resumed = (await saved(page)).operations[0];
    expect(resumed).toMatchObject({ opId: original?.opId, status: 'sending', resource: 'profile', value: original?.value });
    expect(resumed?.attempt?.sessionEpoch).toBeTruthy();
    expect(resumed?.attempt?.sessionEpoch).not.toBe(original?.attempt?.sessionEpoch);
    expect(mutations).toEqual(['PUT', 'PUT']);

    releaseFreshResponse();
    expect((await freshResponse).status()).toBe(200);
    await expect.poll(async () => (await saved(page)).operations).toEqual([]);

    // The old server request may complete after the new attempt; it must not restore or settle the outbox item.
    releaseOldResponse();
    await expect.poll(async () => (await saved(page)).operations).toEqual([]);
    expect((await saved(page)).value).toContain('Профиль после возврата из BFCache');
    expect(errors).toEqual([]);
    expect(routeErrors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    releaseOldResponse();
    releaseFreshResponse();
  }
});
test('a profile conflict retains the local name and never retries against the cloud version', async ({ page }, testInfo) => {
  const { errors, mutations } = await setup(page, 'conflict');
  await openApp(page, '/#settings'); const name = page.getByPlaceholder('Как к вам обращаться');
  await expect(name).toHaveValue(profile.name);
  await name.fill('Моё конфликтующее имя'); await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
  await expect.poll(async () => (await saved(page)).operations[0]?.status).toBe('conflicted');
  expect((await saved(page)).operations[0]?.serverSnapshot?.version).toBe(8);
  await page.reload(); await expect(name).toHaveValue('Моё конфликтующее имя');
  expect(mutations).toEqual(['PUT']); expect((await saved(page)).operations).toHaveLength(1);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('profile-conflict.png') });
});

test('profile recovery rebases the local profile onto the verified server version', async ({ page }) => {
  const { errors, mutations, profileBases, resolveConflict } = await setup(page, 'conflict');
  await openApp(page, '/#settings');
  const name = page.getByPlaceholder('Как к вам обращаться');
  await name.fill('Профиль после разрешения конфликта');
  await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
  await expect.poll(async () => (await saved(page)).operations[0]?.status).toBe('conflicted');
  await page.locator('[data-state-notice-region] details summary').click();
  const group = page.getByRole('region', { name: 'Профиль' });
  const keepLocal = group.getByRole('button', { name: 'Оставить последнюю локальную версию' });
  await expect(keepLocal).toBeVisible();
  resolveConflict();
  await keepLocal.click();

  await expect.poll(async () => (await saved(page)).operations).toHaveLength(0);
  expect(profileBases).toEqual([2, 8]);
  expect(mutations).toEqual(['PUT', 'PUT']);
  expect((await saved(page)).value).toContain('Профиль после разрешения конфликта');
  await expect(name).toHaveValue('Профиль после разрешения конфликта');
  expect(errors).toEqual([]);
});

test('profile recovery can accept a checked server snapshot after explicit confirmation', async ({ page }) => {
  const { errors } = await setup(page, 'conflict');
  await openApp(page, '/#settings');
  const name = page.getByPlaceholder('Как к вам обращаться');
  await name.fill('Локальный профиль, который будет отклонён');
  await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
  await expect.poll(async () => (await saved(page)).operations[0]?.status).toBe('conflicted');
  await page.locator('[data-state-notice-region] details summary').click();
  const group = page.getByRole('region', { name: 'Профиль' });
  const dialogHandled = page.waitForEvent('dialog').then(async (dialog) => {
    const message = dialog.message();
    await dialog.accept();
    return message;
  });
  const reload = page.waitForNavigation({ waitUntil: 'load' });
  await group.getByRole('button', { name: 'Принять серверную версию' }).click();
  expect(await dialogHandled).toContain('Локальные изменения этого раздела будут удалены');
  await reload;

  await expect.poll(async () => (await saved(page)).operations).toHaveLength(0);
  expect((await saved(page)).value).toContain('Cloud name');
  expect(errors).toEqual([]);
});

test('a held profile Save survives the state notice disappearing before pointer release', async ({ page }, testInfo) => {
  let release!: () => void; let started!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const sending = new Promise<void>(resolve => { started = resolve; });
  const { errors, mutations } = await setup(page, 'conflict', { started, wait });
  await openApp(page, '/#settings');
  const name = page.getByPlaceholder('Как к вам обращаться');
  await expect(name).toHaveValue(profile.name);
  await name.fill('Один клик при синхронизации');
  await page.getByRole('button', { name: 'Светлая', exact: false }).click();
  await sending;
  await expect.poll(async () => (await saved(page)).stateOperationCount).toBeGreaterThan(0);
  const notice = page.getByRole('status').filter({ hasText: 'Изменения сохранены на устройстве' });
  await expect(notice).toBeVisible();
  await name.fill('Один клик при синхронизации');
  const save = page.getByRole('button', { name: 'Сохранить профиль', exact: true });
  await expect(save).toBeEnabled(); await save.scrollIntoViewIfNeeded();
  const before = (await save.boundingBox())!;
  const documentY = before.y + await page.evaluate(() => window.scrollY);
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  try {
    release();
    await expect.poll(async () => (await saved(page)).stateOperationCount).toBe(0);
    await expect(notice).toHaveCount(0);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.screenshot({ path: testInfo.outputPath('profile-held-save.png') });
    const after = (await save.boundingBox())!;
    expect(after.y + await page.evaluate(() => window.scrollY)).toBeCloseTo(documentY, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
  } finally { release(); await page.mouse.up(); }
  await expect.poll(async () => (await saved(page)).operations[0]?.status).toBe('conflicted');
  const snapshot = await saved(page);
  expect(snapshot.operations).toHaveLength(1);
  expect(snapshot.operations[0].serverSnapshot?.version).toBe(8);
  expect(JSON.parse(snapshot.value!).name).toBe('Один клик при синхронизации');
  expect(mutations).toEqual(['PUT']);
  const conflictNotice = page.getByRole('alert').filter({ hasText: 'Обнаружен конфликт данных' });
  await conflictNotice.scrollIntoViewIfNeeded();
  await expect(conflictNotice).toBeInViewport({ ratio: 1 });
  await expect(page).toHaveTitle(/FitFocus/); await expect(page).toHaveURL(/#settings$/);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('profile-held-save-conflict.png') });
});

test('a completed background save does not move the profile Save before pointerdown', async ({ page }, testInfo) => {
  let release!: () => void; let started!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const sending = new Promise<void>(resolve => { started = resolve; });
  const { errors } = await setup(page, 'conflict', { started, wait });
  try {
    await openApp(page, '/#settings');
    const name = page.getByPlaceholder('Как к вам обращаться'); await expect(name).toHaveValue(profile.name);
    await page.screenshot({ path: testInfo.outputPath('profile-stable-notice-idle.png') });
    await name.fill('Один клик после фонового сохранения');
    await page.getByRole('button', { name: 'Светлая', exact: false }).click(); await sending;
    const save = page.getByRole('button', { name: 'Сохранить профиль', exact: true });
    await save.scrollIntoViewIfNeeded();
    const position = () => save.evaluate(button => button.getBoundingClientRect().top + window.scrollY);
    const before = await position();
    release(); await expect.poll(async () => (await saved(page)).stateOperationCount).toBe(0);
    await expect(page.getByText('Изменения сохранены на устройстве и ожидают синхронизации.', { exact: true })).toHaveCount(0);
    expect(await position()).toBeCloseTo(before, 1);
    await save.click();
    await expect.poll(async () => (await saved(page)).operations[0]?.status).toBe('conflicted');
    const notice = page.getByRole('alert').filter({ hasText: 'Обнаружен конфликт данных' });
    await notice.scrollIntoViewIfNeeded(); await expect(notice).toBeInViewport({ ratio: 1 });
    await expect(page).toHaveTitle(/FitFocus/); await expect(page).toHaveURL(/#settings$/);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('profile-stable-notice-conflict.png') });
    expect(errors).toEqual([]);
  } finally { release(); }
});

test('a clean refresh replaces the profile editor and subsequent edits use its observed version', async ({ page }, testInfo) => {
  const { errors, mutations } = await setup(page, 'refresh');
  await openApp(page, '/#settings'); const name = page.getByPlaceholder('Как к вам обращаться');
  await expect(name).toHaveValue(profile.name);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(name).toHaveValue('Cloud refreshed');
  expect((await saved(page)).operations).toEqual([]);
  await name.fill('После обновления'); await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
  await expect.poll(async () => (await saved(page)).value).toContain('После обновления');
  await expect.poll(async () => (await saved(page)).operations).toEqual([]);
  expect(mutations).toEqual(['PUT']); expect(errors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('profile-refreshed.png') });
});

test('a failed profile commit keeps the form dirty and never reports a cloud save', async ({ page }, testInfo) => {
  const { errors, mutations } = await setup(page, 'auth');
  await openApp(page, '/#settings'); const name = page.getByPlaceholder('Как к вам обращаться');
  await expect(name).toHaveValue(profile.name);
  await page.evaluate(key => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      if (this.name === 'outbox' && (args[0] as { key?: string })?.key === key) throw new DOMException('Injected quota failure', 'QuotaExceededError');
      return add.apply(this, args);
    };
  }, key);
  await name.fill('Не потерять черновик');
  const save = page.getByRole('button', { name: 'Сохранить профиль', exact: true }); await save.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить' })).toBeVisible();
  await expect(save).toBeEnabled(); await expect(name).toHaveValue('Не потерять черновик');
  expect((await saved(page)).operations).toEqual([]); expect(JSON.parse((await saved(page)).value!).name).toBe(profile.name);
  expect(mutations).toEqual([]);
  await page.reload(); await expect(name).toHaveValue('Не потерять черновик'); await expect(save).toBeEnabled();
  expect((await saved(page)).operations).toEqual([]); expect(mutations).toEqual([]); expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('profile-quota-draft.png') });
});
