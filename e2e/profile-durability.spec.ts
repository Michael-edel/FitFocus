import { expect, type Page } from '@playwright/test';
import { test } from './support/mockTest';
import { mockApp, openApp, buildMockProfile } from './support/appHarness';
const account = 'google-e2e-sub'; const sid = 'a'.repeat(64);
const key = `fitfocus_data_${account}_profile`;
const profile = { ...buildMockProfile(), id: account, version: 2 };
type ProfileSnapshot = Omit<typeof profile, 'aiPlan'> & { aiPlan?: typeof profile.aiPlan; wearableProvider?: string; wearableEnabled?: boolean };
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
        activeSession: active ? { accountId: active.accountId as string | undefined,
          serverSessionId: active.serverSessionId as string | undefined, sessionEpoch: active.sessionEpoch as string | undefined } : null,
        stateOperationCount: operations.filter(op => op.resource !== 'profile').length,
      operations: operations.filter(op => op.key === key) as Array<{ opId: string; status: string; resource: string; baseVersion: number; value: string; attempt?: { sessionEpoch: string; attemptId: string; startedAtMs: number }; serverSnapshot?: { version: number } }> };
    } finally { db.close(); }
  }, key);
}
async function setup(page: Page, mode: 'auth' | 'conflict' | 'refresh' | 'normal', stateGate?: { started: () => void; wait: Promise<void> },
  profileGates: Array<{ started: () => void; wait: Promise<void> }> = [], profileSnapshot: ProfileSnapshot = profile) {
  let conflict = mode === 'conflict';
  let expectedProfileBaseVersion = mode === 'refresh' ? 9 : 2;
  let currentSid = sid;
  let huaweiConnected = profileSnapshot.wearableProvider === 'huawei_health' && profileSnapshot.wearableEnabled !== false;
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
  // This suite drives profile and AI flows; background state writes are incidental.
  // Acknowledge them in the shared harness so a future DELETE writer cannot fall
  // through to the Vite preview server and surface as a browser access-control error.
  await mockApp(page, { session: 'app', acknowledgeStateWrites: true });
  await page.route('**/api/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200, headers?: Record<string, string>) => {
      const responseHeaders = { ...scope, 'X-FitFocus-State-Session': currentSid, ...headers };
      if (path === '/api/ai' && request.method() === 'POST' && request.headers()['x-fitfocus-state-account']) {
        Object.assign(responseHeaders, {
          'X-FitFocus-AI-Protocol': '1', 'X-FitFocus-AI-Guard': '1',
          'X-FitFocus-State-Account': request.headers()['x-fitfocus-state-account'],
          'X-FitFocus-State-Session': currentSid,
        });
      }
      if (path.startsWith('/api/wearable/huawei/')) Object.assign(responseHeaders, {
        'X-FitFocus-Huawei-Protocol': '1', 'X-FitFocus-Huawei-Guard': '1',
        'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': currentSid,
      });
      return route.fulfill({ status, contentType: 'application/json', headers: responseHeaders, body: JSON.stringify(body) });
    };
    if (path === '/api/me' && expired) { rejectedProofs += 1; return json({ error: 'UNAUTH' }, 401); }
    if (path === '/api/me') return json({ user: { sub: account, roles: ['user'] }, hasAccess: true,
      stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: currentSid }, profileSync: { protocol: 1, guard: 1, weeklyMenuProjection: 1 }, bootstrapSync: { protocol: 1, guard: 1 }, aiSync: { protocol: 1, guard: 1 }, weeklyMenuSync: { protocol: 1, guard: 1 },
      ...(profileSnapshot.wearableProvider === 'huawei_health' ? { huaweiSync: { protocol: 1, guard: 1 } } : {}) });
    if (path === '/api/bootstrap') return json({ user: { sub: account }, profile: profileSnapshot, items: [] });
    if (path === '/api/ai' && request.method() === 'POST' && request.postDataJSON()?.feature === 'wis_text') {
      return json({ text: 'E2E: недельный отчёт обработан тестовой фикстурой.' });
    }
    if (path === '/api/wearable/huawei/status' && request.method() === 'GET') return json({
      configured: true, connected: huaweiConnected, status: huaweiConnected ? 'connected' : 'disconnected', scope: 'health.read', expiresAt: null, lastSyncAt: null,
    });
    if (path === '/api/wearable/huawei/disconnect' && request.method() === 'POST') {
      huaweiConnected = false;
      return json({ disconnected: true, profile: { ...profileSnapshot, wearableProvider: 'manual', wearableEnabled: false, version: (profileSnapshot.version ?? 2) + 1 } });
    }
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
        expectedProfileBaseVersion = body.baseVersion + 1;
        return json({ profile: { ...body, id: account, version: body.baseVersion + 1 }, version: body.baseVersion + 1 }, 200, responseScope);
      };
      if (gate) {
        gate.started(); await gate.wait;
        try { return await respond(); }
        catch (error) { routeErrors.push(String(error)); return; }
      }
      return respond();
    }
    if (path === '/api/profile') return json({ profile: mode === 'refresh' ? { ...profileSnapshot, name: 'Cloud refreshed', version: 9 } : profileSnapshot });
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

test('same-server re-verification refreshes the UI guard after a temporary pause', async ({ page }) => {
  const { errors, mutations } = await setup(page, 'normal');
  let holdProof = false;
  let releaseHeldProof!: () => void;
  let signalProofStarted!: () => void;
  const heldProof = new Promise<void>(resolve => { releaseHeldProof = resolve; });
  const proofStarted = new Promise<void>(resolve => { signalProofStarted = resolve; });
  await page.route('**/api/me*', async route => {
    if (!holdProof) return route.fallback();
    signalProofStarted();
    await heldProof;
    return route.fallback();
  });
  await openApp(page, '/#settings');
  const name = page.getByPlaceholder('Как к вам обращаться');
  await expect(name).toHaveValue(profile.name);
  const original = await saved(page);
  expect(original.activeSession?.sessionEpoch).toBeTruthy();

  const pausedEpoch = 'paused-session-epoch';
  holdProof = true;
  try {
    await page.evaluate(async epoch => {
      const opening = indexedDB.open('fitfocus-user-state-v1');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        opening.onsuccess = () => resolve(opening.result);
        opening.onerror = () => reject(opening.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('outbox_meta', 'readwrite');
        const store = tx.objectStore('outbox_meta');
        const activeRequest = store.get('active-session');
        activeRequest.onsuccess = () => store.put({ ...activeRequest.result, sessionEpoch: epoch, pause: 'auth' });
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error('Could not pause active session'));
      });
      db.close();
      const channel = new BroadcastChannel('fitfocus-active-session-v1');
      channel.postMessage({ type: 'active-session-changed' });
      channel.close();
    }, pausedEpoch);

    const sessionFence = page.getByText('Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.', { exact: true });
    await expect.poll(async () => (await saved(page)).activeSession?.sessionEpoch).toBe(pausedEpoch);
    await expect(sessionFence).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await proofStarted;
    await expect(sessionFence).toBeVisible();

    releaseHeldProof();
    await expect.poll(async () => (await saved(page)).activeSession?.sessionEpoch).not.toBe(pausedEpoch);
    await expect.poll(async () => (await saved(page)).pause).toBeUndefined();
    await expect(sessionFence).toHaveCount(0);
    await name.fill('Профиль после повторной проверки сессии');
    await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
    await expect.poll(() => mutations).toEqual(['PUT']);
    await expect.poll(async () => (await saved(page)).value).toContain('Профиль после повторной проверки сессии');
    expect(errors).toEqual([]);
  } finally {
    releaseHeldProof();
  }
});

test('fallback AI plan stays hidden when its durable profile commit fails, then recovers after reload', async ({ page }) => {
  const failKey = '__fitfocus_e2e_fail_fallback_profile_write';
  const profileWithoutPlan: ProfileSnapshot = { ...profile, aiPlan: undefined };
  const { errors, mutations } = await setup(page, 'normal', undefined, [], profileWithoutPlan);
  await page.addInitScript(({ failureKey, profileKey }) => {
    if (localStorage.getItem(failureKey) === null) localStorage.setItem(failureKey, '1');
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      const operation = args[0] as { key?: string; resource?: string };
      if (localStorage.getItem(failureKey) === '1' && this.name === 'outbox'
        && operation?.key === profileKey && operation.resource === 'profile') {
        throw new DOMException('Injected fallback profile quota failure', 'QuotaExceededError');
      }
      return add.apply(this, args);
    };
  }, { failureKey: failKey, profileKey: key });

  // Opening the plan also produces a weekly report. Capture its separate state
  // write so the profile retry reload cannot interrupt that background request.
  const weeklyAiResponse = page.waitForResponse(response => {
    const request = response.request();
    return new URL(response.url()).pathname === '/api/ai' && request.method() === 'POST'
      && request.postDataJSON()?.feature === 'wis_text';
  });
  const weeklyReportStateResponse = page.waitForResponse(response => {
    const request = response.request();
    if (new URL(response.url()).pathname !== '/api/state' || request.method() !== 'PUT') return false;
    const body = request.postDataJSON() as { items?: Array<{ key?: unknown }> } | null;
    return body?.items?.some(item => item.key === `fitfocus_data_${account}_weekly_reports`) ?? false;
  });

  await openApp(page, '/#plan');
  await expect(page.getByText('План ещё подготавливается', { exact: true })).toBeVisible();
  const initialSnapshot = await saved(page);
  const initialProfile = initialSnapshot.value ? JSON.parse(initialSnapshot.value) as { aiPlan?: unknown } : null;
  expect(initialProfile?.aiPlan).toBeUndefined();
  expect(initialSnapshot.operations).toEqual([]);
  await expect.poll(async () => {
    const snapshot = await saved(page);
    const value = snapshot.value ? JSON.parse(snapshot.value) as { aiPlan?: unknown } : null;
    return { aiPlan: value?.aiPlan ?? null, operations: snapshot.operations.length };
  }).toEqual({ aiPlan: null, operations: 0 });
  expect(mutations).toEqual([]);

  await page.evaluate(failureKey => localStorage.setItem(failureKey, '0'), failKey);
  await weeklyAiResponse;
  expect((await weeklyReportStateResponse).status()).toBe(200);
  // Wait for the background report outbox entry to be acknowledged as well.
  await expect.poll(async () => (await saved(page)).stateOperationCount, {
    message: 'the weekly report state operation must settle before the profile recovery reload',
  }).toBe(0);
  await page.reload();
  await expect(page.getByText('План ещё подготавливается', { exact: true })).toHaveCount(0);
  await expect.poll(async () => {
    const snapshot = await saved(page);
    const value = snapshot.value ? JSON.parse(snapshot.value) as { aiPlan?: { model?: string } } : null;
    return value?.aiPlan?.model ?? null;
  }).toBe('local-fallback');
  await expect.poll(() => mutations.length).toBe(1);
  expect(errors).toEqual([]);
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
  await expect(name).toHaveValue(profile.name);
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
  const { errors, routeErrors } = await setup(page, 'conflict');
  page.on('requestfailed', request => {
    if (new URL(request.url()).pathname === '/api/state') {
      routeErrors.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'request failed'}`);
    }
  });
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
  expect(routeErrors).toEqual([]);
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
  const activeSession = (await saved(page)).activeSession;
  expect(activeSession).toMatchObject({ accountId: account, serverSessionId: sid });
  await page.bringToFront();
  await page.evaluate(() => {
    if (document.visibilityState !== 'visible') throw new Error(`Expected a visible page, got ${document.visibilityState}`);
    document.dispatchEvent(new Event('visibilitychange'));
  });
  try {
    await expect(name).toHaveValue('Cloud refreshed');
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nactiveSession=${JSON.stringify((await saved(page)).activeSession)}`);
  }
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

test('a failed progress photo commit keeps the selected image and reports the storage error', async ({ page }) => {
  const { errors, mutations } = await setup(page, 'normal');
  await openApp(page, '/#settings');
  await expect(page.getByText('История визуальных замеров')).toBeVisible();
  const before = await saved(page);

  await page.evaluate(key => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      const operation = args[0] as { key?: string };
      if (this.name === 'outbox' && operation?.key === key) {
        throw new DOMException('Injected progress photo quota failure', 'QuotaExceededError');
      }
      return add.apply(this, args);
    };
  }, key);

  const photoInput = page.locator('input[type="file"][accept="image/*"]');
  await photoInput.setInputFiles({
    name: 'progress.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>'),
  });

  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить фото прогресса.' }))
    .toBeVisible();
  await expect(photoInput).toHaveValue(/progress\.svg$/);
  expect((await saved(page)).value).toBe(before.value);
  expect(mutations).toEqual([]);
  expect(errors).toEqual([]);
});

test('a failed wearable import commit keeps the pasted source and reports the storage error', async ({ page }) => {
  const { errors, mutations } = await setup(page, 'normal');
  await openApp(page, '/#progress');
  await expect(page.getByRole('heading', { name: 'Фото, замеры и смарт-часы в одном месте' })).toBeVisible();
  const before = await saved(page);

  await page.evaluate(key => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      const operation = args[0] as { key?: string };
      if (this.name === 'outbox' && operation?.key === key) {
        throw new DOMException('Injected wearable import quota failure', 'QuotaExceededError');
      }
      return add.apply(this, args);
    };
  }, key);

  const source = JSON.stringify({ provider: 'manual', stepsToday: 4200, activeMinutesToday: 30 });
  const importDraft = page.getByPlaceholder('Вставьте JSON/CSV сюда, например:');
  await importDraft.fill(source);
  await page.getByRole('button', { name: 'Импорт из текста', exact: true }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить импорт данных.' })).toBeVisible();
  await expect(importDraft).toHaveValue(source);
  expect((await saved(page)).value).toBe(before.value);
  expect((await saved(page)).operations).toEqual([]);
  expect(mutations).toEqual([]);
  expect(errors).toEqual([]);
});

test('a failed wearable file import can retry the same selected file after storage recovers', async ({ page }) => {
  const { errors, mutations } = await setup(page, 'normal');
  await openApp(page, '/#progress');
  await expect(page.getByRole('heading', { name: 'Фото, замеры и смарт-часы в одном месте' })).toBeVisible();
  const before = await saved(page);

  await page.evaluate(key => {
    const scopedWindow = window as Window & { failProfileWrite?: boolean };
    scopedWindow.failProfileWrite = true;
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      const operation = args[0] as { key?: string };
      if (scopedWindow.failProfileWrite && this.name === 'outbox' && operation?.key === key) {
        throw new DOMException('Injected wearable file quota failure', 'QuotaExceededError');
      }
      return add.apply(this, args);
    };
  }, key);

  const fileInput = page.locator('input[type="file"][accept=".json,.csv,application/json,text/csv"]');
  await fileInput.setInputFiles({
    name: 'wearable.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ provider: 'manual', stepsToday: 4200 })),
  });
  const error = page.getByRole('alert').filter({ hasText: 'Не удалось сохранить импорт данных.' });
  await expect(error).toBeVisible();
  await expect(fileInput).toHaveValue(/wearable\.json$/);
  expect((await saved(page)).value).toBe(before.value);
  expect((await saved(page)).operations).toEqual([]);
  expect(mutations).toEqual([]);

  await page.evaluate(() => { (window as Window & { failProfileWrite?: boolean }).failProfileWrite = false; });
  await page.getByRole('button', { name: 'Повторить импорт файла', exact: true }).click();
  await expect.poll(async () => JSON.parse((await saved(page)).value!).wearableStepsToday).toBe(4200);
  await expect(fileInput).toHaveValue('');
  await expect(error).toHaveCount(0);
  await expect.poll(() => mutations).toEqual(['PUT']);
  expect(errors).toEqual([]);
});

test('a failed manual measurement commit reports the error and keeps the entered value', async ({ page }) => {
  const { errors, mutations } = await setup(page, 'normal');
  await openApp(page, '/#progress');
  await expect(page.getByRole('heading', { name: 'Фото, замеры и смарт-часы в одном месте' })).toBeVisible();
  const before = await saved(page);

  await page.evaluate(key => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      const operation = args[0] as { key?: string };
      if (this.name === 'outbox' && operation?.key === key) {
        throw new DOMException('Injected measurement quota failure', 'QuotaExceededError');
      }
      return add.apply(this, args);
    };
  }, key);

  const weight = page.getByPlaceholder('90.0');
  await weight.fill('88.5');
  await page.getByRole('button', { name: 'Сохранить замер', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить замер.' })).toBeVisible();
  await expect(weight).toHaveValue('88.5');
  expect((await saved(page)).value).toBe(before.value);
  expect((await saved(page)).operations).toEqual([]);
  expect(mutations).toEqual([]);
  expect(errors).toEqual([]);
});

test('dashboard weight stays available after a failed durable commit and survives reload for retry', async ({ page }) => {
  const { errors, mutations } = await setup(page, 'normal');
  await openApp(page, '/#dashboard');
  const weight = page.getByLabel('Вес сегодня');
  await expect(weight).toBeVisible();
  const before = await saved(page);

  await page.evaluate(key => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      const operation = args[0] as { key?: string; resource?: string };
      if (this.name === 'outbox' && operation?.key === key && operation.resource === 'profile') {
        throw new DOMException('Injected dashboard weight quota failure', 'QuotaExceededError');
      }
      return add.apply(this, args);
    };
  }, key);

  await weight.fill('88.5');
  await page.getByRole('button', { name: 'Сохранить вес' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить вес.' })).toBeVisible();
  await expect(weight).toHaveValue('88.5');
  expect((await saved(page)).value).toBe(before.value);
  expect((await saved(page)).operations).toEqual([]);
  expect(mutations).toEqual([]);

  await page.reload();
  await expect(page).toHaveURL(/#dashboard$/);
  await expect(weight).toHaveValue('88.5');
  await page.getByRole('button', { name: 'Сохранить вес' }).click();
  await expect.poll(async () => JSON.parse((await saved(page)).value!).weight).toBe(88.5);
  await expect(weight).toHaveValue('');
  await expect.poll(() => mutations.length).toBe(1);
  await expect.poll(async () => (await saved(page)).operations).toEqual([]);
  const committed = await saved(page);
  expect(JSON.parse(committed.value!).weight).toBe(88.5);
  expect(committed.operations).toEqual([]);
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить вес.' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('dashboard habit stays unchanged after a failed durable profile commit and can be retried after reload', async ({ page }) => {
  const { errors, mutations } = await setup(page, 'normal');
  await openApp(page, '/#dashboard');
  const water = page.getByRole('button', { name: 'Пить воду' });
  await expect(water).toBeVisible();
  await expect(water).toHaveAttribute('aria-pressed', 'false');
  const before = await saved(page);

  await page.evaluate(key => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      const operation = args[0] as { key?: string; resource?: string };
      if (this.name === 'outbox' && operation?.key === key && operation.resource === 'profile') {
        throw new DOMException('Injected dashboard habit quota failure', 'QuotaExceededError');
      }
      return add.apply(this, args);
    };
  }, key);

  await water.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить привычку.' })).toBeVisible();
  await expect(water).toHaveAttribute('aria-pressed', 'false');
  expect((await saved(page)).value).toBe(before.value);
  expect((await saved(page)).operations).toEqual([]);
  expect(mutations).toEqual([]);

  await page.reload();
  await expect(page).toHaveURL(/#dashboard$/);
  await expect(water).toHaveAttribute('aria-pressed', 'false');
  await water.click();
  await expect(water).toHaveAttribute('aria-pressed', 'true');
  const committed = await saved(page);
  const committedProfile = JSON.parse(committed.value!) as { dailyHabits?: Record<string, { water?: boolean }> };
  expect(Object.values(committedProfile.dailyHabits ?? {}).some((day) => day.water === true)).toBe(true);
  await expect.poll(() => mutations.length).toBe(1);
  await expect.poll(async () => (await saved(page)).operations).toEqual([]);
  expect((await saved(page)).operations).toEqual([]);
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить привычку.' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a failed wearable provider commit is visible and leaves the profile unchanged', async ({ page }) => {
  const { errors, mutations } = await setup(page, 'normal');
  await openApp(page, '/#settings');
  await expect(page.getByText('Смарт-часы', { exact: true })).toBeVisible();
  const before = await saved(page);

  await page.evaluate(key => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      const operation = args[0] as { key?: string };
      if (this.name === 'outbox' && operation?.key === key) {
        throw new DOMException('Injected wearable provider quota failure', 'QuotaExceededError');
      }
      return add.apply(this, args);
    };
  }, key);

  await page.getByRole('button', { name: /Google Fit/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить источник данных.' })).toBeVisible();
  expect((await saved(page)).value).toBe(before.value);
  expect((await saved(page)).operations).toEqual([]);
  expect(mutations).toEqual([]);
  expect(errors).toEqual([]);
});

test('Huawei disconnection is not reported saved until its returned profile is committed', async ({ page }) => {
  const huaweiProfile = { ...profile, wearableProvider: 'huawei_health' as const, wearableEnabled: true };
  const { errors } = await setup(page, 'normal', undefined, [], huaweiProfile);
  await openApp(page, '/#settings');
  await expect(page.getByText('Подключено', { exact: true })).toBeVisible();
  const before = await saved(page);

  await page.evaluate(key => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      const operation = args[0] as { key?: string };
      if (this.name === 'outbox' && operation?.key === key) {
        throw new DOMException('Injected Huawei profile quota failure', 'QuotaExceededError');
      }
      return add.apply(this, args);
    };
  }, key);

  const disconnect = page.getByRole('button', { name: 'Отключить часы', exact: true });
  await disconnect.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить профиль.' })).toBeVisible();
  await expect(page.getByText('Huawei Health отключён.', { exact: true })).toHaveCount(0);
  expect((await saved(page)).value).toBe(before.value);
  expect((await saved(page)).operations).toEqual([]);

  await page.reload();
  await expect(page).toHaveURL(/#settings$/);
  await disconnect.click();
  await expect(page.getByText('Huawei Health отключён.', { exact: true })).toBeVisible();
  await expect.poll(async () => JSON.parse((await saved(page)).value!).wearableEnabled).toBe(false);
  await expect.poll(async () => JSON.parse((await saved(page)).value!).wearableProvider).toBe('manual');
  expect(errors).toEqual([]);
});

test('goal intensity remains unchanged after a failed durable profile commit and can be retried after reload', async ({ page }) => {
  const { errors } = await setup(page, 'normal');
  await openApp(page, '/#settings');
  const intensity = page.getByText('Интенсивность цели', { exact: true });
  await expect(intensity).toBeVisible();
  const before = await saved(page);

  await page.evaluate(key => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      const operation = args[0] as { key?: string };
      if (this.name === 'outbox' && operation?.key === key) {
        throw new DOMException('Injected goal intensity quota failure', 'QuotaExceededError');
      }
      return add.apply(this, args);
    };
  }, key);

  await page.getByRole('button', { name: '−650', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить профиль.' })).toBeVisible();
  expect((await saved(page)).value).toBe(before.value);
  expect((await saved(page)).operations).toEqual([]);

  await page.reload();
  await expect(page).toHaveURL(/#settings$/);
  await page.getByRole('button', { name: '−650', exact: true }).click();
  await expect.poll(async () => JSON.parse((await saved(page)).value!).lossDeficit).toBe(650);
  expect(errors).toEqual([]);
});

test('course completion and quiz stay open on a failed durable profile commit and can be retried', async ({ page }) => {
  const { errors } = await setup(page, 'normal');
  await openApp(page, '/#course');
  await expect(page.getByRole('heading', { name: 'Обучение', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Голод vs Аппетит: как не путать\?/ }).click();

  await page.evaluate(key => {
    const add = IDBObjectStore.prototype.add;
    let fail = true;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      const record = args[0] as { key?: string; resource?: string };
      if (fail && this.name === 'outbox' && record?.key === key && record.resource === 'profile') {
        throw new DOMException('Injected course profile quota failure', 'QuotaExceededError');
      }
      return add.apply(this, args);
    };
    (window as Window & { __setCourseProfileWriteFailure?: (value: boolean) => void })
      .__setCourseProfileWriteFailure = value => { fail = value; };
  }, key);

  const initial = await saved(page);
  const readButton = page.getByRole('button', { name: 'Прочитано', exact: true });
  await readButton.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить прогресс урока.' })).toBeVisible();
  await expect(readButton).toBeVisible();
  expect((await saved(page)).value).toBe(initial.value);
  expect((await saved(page)).operations).toEqual([]);

  await page.evaluate(() => (window as Window & { __setCourseProfileWriteFailure?: (value: boolean) => void })
    .__setCourseProfileWriteFailure?.(false));
  await readButton.click();
  await expect(readButton).toHaveCount(0);
  await expect.poll(async () => JSON.parse((await saved(page)).value ?? '{}').courseProgress?.completedLessonIds)
    .toContain('l2_hunger');

  await page.getByRole('button', { name: /Голод vs Аппетит: как не путать\?/ }).click();
  await page.getByRole('button', { name: 'Пройти тест', exact: true }).click();
  const answer = page.getByRole('button', { name: 'Сфокусируюсь на воде и шагах', exact: true });
  await answer.click();
  const beforeQuiz = await saved(page);
  await page.evaluate(() => (window as Window & { __setCourseProfileWriteFailure?: (value: boolean) => void })
    .__setCourseProfileWriteFailure?.(true));
  const submit = page.getByRole('button', { name: 'Завершить урок', exact: true });
  await submit.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить прогресс урока.' })).toBeVisible();
  await expect(submit).toBeVisible();
  await expect(answer).toHaveClass(/border-indigo-500/);
  expect((await saved(page)).value).toBe(beforeQuiz.value);
  expect((await saved(page)).operations).toEqual([]);

  await page.evaluate(() => (window as Window & { __setCourseProfileWriteFailure?: (value: boolean) => void })
    .__setCourseProfileWriteFailure?.(false));
  await submit.click();
  await expect(submit).toHaveCount(0);
  await expect.poll(async () => JSON.parse((await saved(page)).value ?? '{}').lessonQuizAnswers)
    .toContainEqual(expect.objectContaining({ lessonId: 'l2_hunger', optionId: 'opt_habits' }));
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
});
