import { expect, type Page } from '@playwright/test';
import { test } from './support/mockTest';
import { saved, setup, navigate, healthy, preview, confirmPreview } from './support/familyHarness';
import { buildMockProfile, mockApp, openApp } from './support/appHarness';

const switchAccount = { id: 'family-menu-switch-account-b', sid: 'b'.repeat(64) };

function filterReloadAccessControlAborts(errors: string[], projectName: string): string[] {
  const isWebKit = ['desktop-webkit', 'iphone-safari', 'iphone-pwa'].includes(projectName);
  if (!isWebKit) return errors;
  const staleReadAbort = /^\/127\.0\.0\.1:\d+\/api\/(?:family(?:\/menu(?:\/state)?)?|shopping\/list|me)(?:\?.*)? due to access control checks\.$/;
  const expectedAborts = errors.filter(error => staleReadAbort.test(error));
  expect(expectedAborts).toEqual([]);
  return errors;
}

async function openSwitchAccount(page: Page, identity = switchAccount) {
  const profile = { ...buildMockProfile(), id: identity.id, googleSub: identity.id,
    email: `${identity.id}@example.test`, plan: 'family' };
  const headers = {
    'X-FitFocus-State-Account': identity.id,
    'X-FitFocus-State-Session': identity.sid,
    'X-FitFocus-State-Protocol': '2', 'X-FitFocus-State-Guard': '1',
    'X-FitFocus-Profile-Protocol': '1', 'X-FitFocus-Profile-Guard': '1',
    'X-FitFocus-Bootstrap-Protocol': '1', 'X-FitFocus-Bootstrap-Guard': '1',
    'X-FitFocus-AI-Protocol': '1', 'X-FitFocus-AI-Guard': '1',
    'X-FitFocus-Weekly-Menu-Protocol': '1', 'X-FitFocus-Weekly-Menu-Guard': '1',
    'X-FitFocus-Achievements-Protocol': '1', 'X-FitFocus-Achievements-Guard': '1',
    'X-FitFocus-Push-Protocol': '1', 'X-FitFocus-Push-Guard': '1',
    'X-FitFocus-Family-Protocol': '1', 'X-FitFocus-Family-Guard': '1',
    'X-FitFocus-Family-Menu-Protocol': '1', 'X-FitFocus-Family-Menu-Guard': '1',
  };
  await mockApp(page, { session: 'app' });
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const json = (body: unknown) => route.fulfill({ contentType: 'application/json', headers, body: JSON.stringify(body) });
    if (path === '/api/env') return json({ requireInvite: false });
    if (path === '/api/me') return json({ user: { sub: identity.id, roles: ['user'] }, hasAccess: true,
      stateSync: { protocol: 2, guard: 1, accountId: identity.id, sessionId: identity.sid },
      bootstrapSync: { protocol: 1, guard: 1 }, profileSync: { protocol: 1, guard: 1, weeklyMenuProjection: 1 },
      aiSync: { protocol: 1, guard: 1 }, weeklyMenuSync: { protocol: 1, guard: 1 },
      achievementSync: { protocol: 1, guard: 1 }, huaweiSync: { protocol: 1, guard: 1 }, pushSync: { protocol: 1, guard: 1 }, familySync: { protocol: 1, guard: 1, target: 1 },
      familyMenuSync: { protocol: 1, guard: 1, cas: 1 }, familyPlanning: { version: 1 }, profile });
    if (path === '/api/bootstrap') return json({ user: { sub: identity.id }, profile, items: [] });
    if (path === '/api/state') {
      if (request.method() === 'GET') return json({ items: [] });
      const items = (request.postDataJSON()?.items ?? []) as Array<{ key: string; baseVersion: number }>;
      return json({ ok: true, items: items.map(item => ({ key: item.key, version: item.baseVersion + 1, exists: true })) });
    }
    if (path === '/api/profile') return json({ profile, version: profile.version });
    if (path === '/api/achievements' || path === '/api/achievements/check') {
      return json({ enabled: false, catalog: [], unlocked: [], newlyUnlocked: [] });
    }
    if (path === '/api/ai') return json({ text: 'Тестовая интерпретация недели.' });
    if (path === '/api/family') return json({ family: null, members: [] });
    if (path === '/api/family/menu') return json({ weekStart: url.searchParams.get('week'), shared: null, portions: null });
    if (path === '/api/logout') return json({ ok: true });
    return route.fallback();
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  return errors;
}

async function activeAccountId(page: Page) {
  return page.evaluate(async () => {
    const opening = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const request = db.transaction('outbox_meta', 'readonly').objectStore('outbox_meta').get('active-session');
      const active = await new Promise<{ accountId?: string } | undefined>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return active?.accountId ?? null;
    } finally { db.close(); }
  });
}

async function activeSessionIdentity(page: Page) {
  return page.evaluate(async () => {
    const opening = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const request = db.transaction('outbox_meta', 'readonly').objectStore('outbox_meta').get('active-session');
      const active = await new Promise<{ accountId?: string; serverSessionId?: string; sessionEpoch?: string } | undefined>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return active ? {
        accountId: active.accountId ?? null,
        serverSessionId: active.serverSessionId ?? null,
        sessionEpoch: active.sessionEpoch ?? null,
      } : null;
    } finally { db.close(); }
  });
}

test('day participation includes loaded members and preserves an explicit owner-only draft after reload', async ({ page }) => {
  const member = { user_id: 'family-member-2', role: 'member', status: 'active', name: 'Member Two',
    sex: 'FEMALE', age: 30, height_cm: 165, weight_kg: 65, activity: 1.375, goal: 'MAINTAIN' };
  const { errors } = await setup(page, 'normal', { familyMembers: [member] });
  const summary = page.getByText('Кто ест и какие порции', { exact: true });
  await summary.click();
  const breakfast = page.getByRole('group', { name: 'Завтрак', exact: true });
  const memberChoice = breakfast.getByRole('checkbox', { name: 'Member Two', exact: true });
  await expect(memberChoice).toBeChecked();
  await expect(breakfast.getByRole('checkbox', { name: 'E2E User', exact: true })).toBeChecked();
  await memberChoice.uncheck();
  await page.reload();
  await page.getByText('Кто ест и какие порции', { exact: true }).click();
  await expect(page.getByRole('group', { name: 'Завтрак', exact: true }).getByRole('checkbox', { name: 'Member Two', exact: true })).not.toBeChecked();
  await expect(page.getByRole('group', { name: 'Завтрак', exact: true }).getByRole('checkbox', { name: 'E2E User', exact: true })).toBeChecked();
  await healthy(page, errors);
});

test('server preview becomes one durable family menu and purchases operation', async ({ page }, info) => {
  const { counts, errors } = await setup(page);
  await confirmPreview(page);
  await expect.poll(() => counts.accepted).toBe(1); expect(counts.preview).toBe(1); expect(counts.oldWriter).toBe(0);
  await expect.poll(async () => (await saved(page)).operations.length).toBe(0);
  expect((await saved(page)).version).toBe(3); expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(125);
  await navigate(page, 'Покупки');
  const purchases = page.getByText('Осталось купить 125 г', { exact: true });
  await purchases.scrollIntoViewIfNeeded(); await expect(purchases).toBeInViewport();
  await page.getByRole('checkbox', { name: 'Яблоко', exact: true }).check();
  await expect.poll(() => counts.accepted).toBe(2);
  await expect.poll(async () => (await saved(page)).operations.length).toBe(0);
  expect((await saved(page)).menus[0].menu.planningV1.purchasedQuantities.find((item: { ingredientId: string }) => item.ingredientId === 'apple').quantity).toBe(125);
  expect(counts.oldWriter).toBe(0);
  await healthy(page, errors);
  await page.screenshot({ path: info.outputPath('family-menu-delivered.png') });
});
test('family conflict survives reload with its original menu and remote snapshot', async ({ page }, info) => {
  const { counts, errors } = await setup(page, 'conflict');
  await confirmPreview(page);
  await expect.poll(async () => (await saved(page)).operations[0]?.status).toBe('conflicted');
  const operation = (await saved(page)).operations[0]; await page.reload();
  await expect.poll(async () => (await saved(page)).menus[0]?.menu.shoppingListItems[0].grams).toBe(125);
  expect((await saved(page)).operations[0]).toMatchObject({ opId: operation.opId, status: 'conflicted', serverSnapshot: { version: 8 } });
  await navigate(page, 'Покупки');
  const purchases = page.getByText('Осталось купить 125 г', { exact: true });
  await purchases.scrollIntoViewIfNeeded(); await expect(purchases).toBeInViewport(); expect(counts.accepted).toBe(0); expect(counts.oldWriter).toBe(0);
  await healthy(page, errors); await page.screenshot({ path: info.outputPath('family-menu-conflict.png') });
});
test('family recovery keeps the last local menu and sends it against the checked family version', async ({ page }) => {
  const { counts, errors, resolveConflict } = await setup(page, 'conflict');
  await confirmPreview(page);
  await expect.poll(async () => (await saved(page)).operations[0]?.status).toBe('conflicted');
  await page.locator('[data-state-notice-region] details summary').click();
  const group = page.getByRole('region', { name: 'Семейное меню' });
  const keepLocal = group.getByRole('button', { name: 'Оставить последнюю локальную версию' });
  await expect(keepLocal).toBeVisible();
  resolveConflict();
  await keepLocal.click();

  await expect.poll(() => counts.accepted).toBe(1);
  await expect.poll(async () => (await saved(page)).operations).toHaveLength(0);
  expect(counts.bases).toEqual([1, 8]);
  expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(125);
  expect(counts.oldWriter).toBe(0);
  await healthy(page, errors);
});

test('family recovery accepts only the checked remote menu after explicit confirmation', async ({ page }) => {
  const { counts, errors } = await setup(page, 'conflict');
  await confirmPreview(page);
  await expect.poll(async () => (await saved(page)).operations[0]?.status).toBe('conflicted');
  await page.locator('[data-state-notice-region] details summary').click();
  const group = page.getByRole('region', { name: 'Семейное меню' });
  const dialogHandled = page.waitForEvent('dialog').then(async (dialog) => {
    const message = dialog.message();
    await dialog.accept();
    return message;
  });
  const reload = page.waitForNavigation({ waitUntil: 'load' });
  await group.getByRole('button', { name: 'Принять серверную версию' }).click();
  expect(await dialogHandled).toContain('Локальные изменения этого раздела будут удалены');
  await reload;

  await expect(page.getByRole('heading', { name: 'Меню семьи', exact: true })).toBeVisible();
  await expect.poll(async () => (await saved(page)).operations).toHaveLength(0);
  expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(100);
  expect(counts.accepted).toBe(0);
  expect(counts.oldWriter).toBe(0);
  await healthy(page, errors);
});
test('family local storage failure preserves the previous menu and sends no menu mutation', async ({ page }, info) => {
  const { counts, errors } = await setup(page, 'quota');
  await confirmPreview(page);
  await expect(page.getByText(/STATE_STORAGE_QUOTA/)).toBeVisible();
  expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(75);
  expect(counts.put).toBe(0); expect(counts.accepted).toBe(0); expect(counts.oldWriter).toBe(0); expect(counts.achievements).toBe(0);
  await healthy(page, errors); await page.screenshot({ path: info.outputPath('family-menu-quota.png') });
});
test('day preview commits once through the family queue after explicit confirmation', async ({ page }, info) => {
  const { counts, errors } = await setup(page); await navigate(page, 'Меню семьи');
  const update = page.getByRole('button', { name: 'Посмотреть меню на день', exact: true }); await preview(page);
  await expect(page.getByRole('heading', { name: 'Предпросмотр — ещё не сохранено' })).toBeVisible();
  expect(counts.accepted).toBe(0);
  await page.getByRole('button', { name: 'Подтвердить меню', exact: true }).click();
  await expect.poll(() => counts.accepted).toBe(1); expect(counts.preview).toBe(1); expect(counts.oldWriter).toBe(0);
  await expect(update).toBeEnabled(); expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(125);
  await healthy(page, errors); await page.screenshot({ path: info.outputPath('family-menu-ai.png') });
});
test('day preview hides technical stale-session errors and leaves confirmation unavailable', async ({ page }) => {
  const { counts, errors } = await setup(page, 'session-expired-ai'); await navigate(page, 'Меню семьи');
  const update = page.getByRole('button', { name: 'Посмотреть меню на день', exact: true }); await preview(page);
  await expect.poll(() => counts.ai).toBe(1);
  await expect(page.getByText('SESSION_READ_AUTH', { exact: true })).toHaveCount(0);
  await expect(update).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Подтвердить меню', exact: true })).toHaveCount(0);
  expect(counts.put).toBe(0);
  const injectedUnauthorized = 'Failed to load resource: the server responded with a status of 401 (Unauthorized)';
  expect(errors.filter(error => error === injectedUnauthorized).length).toBeLessThanOrEqual(1);
  await healthy(page, errors.filter(error => error !== injectedUnauthorized));
});

test('navigation aborts a held family-menu server preview before pagehide', async ({ page }) => {
  const marker = '__e2e_family_menu_unload__';
  await page.addInitScript(markerKey => {
    const mark = (suffix: string, value: string) => {
      try { localStorage.setItem(`${markerKey}:${suffix}`, value); } catch { /* The document may be unloading. */ }
    };
    const recordLifecycle = (event: string) => {
      try {
        const key = `${markerKey}:lifecycle`;
        const events = JSON.parse(localStorage.getItem(key) ?? '[]') as string[];
        events.push(event);
        localStorage.setItem(key, JSON.stringify(events));
      } catch { /* The document may be unloading. */ }
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof Request ? input.url : String(input), location.href);
      if (url.pathname === '/api/family/menu/generate' && init?.signal) {
        let body: { preview?: unknown } | null = null;
        try { body = typeof init.body === 'string' ? JSON.parse(init.body) as { preview?: unknown } : null; } catch { /* Ignore other payload formats. */ }
        if (body && 'preview' in body) {
          mark('request', 'started');
          init.signal.addEventListener('abort', () => { mark('signal', 'aborted'); recordLifecycle('abort'); }, { once: true });
        }
      }
      return originalFetch(input, init);
    };
    window.addEventListener('beforeunload', () => { mark('beforeunload', 'fired'); recordLifecycle('beforeunload'); });
    window.addEventListener('pagehide', () => { mark('pagehide', 'fired'); recordLifecycle('pagehide'); });
  }, marker);

  const { counts, errors, release } = await setup(page, 'held-ai');
  const appOrigin = await page.evaluate(() => location.origin);
  const before = await saved(page);
  try {
    await navigate(page, 'Меню семьи');
    const update = page.getByRole('button', { name: 'Посмотреть меню на день', exact: true });
    await preview(page);
    await expect.poll(() => counts.ai).toBe(1);
    await expect.poll(() => page.evaluate(key => localStorage.getItem(`${key}:request`), marker)).toBe('started');

    await page.goto('about:blank');
    release();
    await expect.poll(() => counts.fulfilled).toBe(1);
    await page.goto(appOrigin);
    await expect(page).toHaveTitle(/FitFocus/);

    expect(await page.evaluate(key => ({
      request: localStorage.getItem(`${key}:request`),
      signal: localStorage.getItem(`${key}:signal`),
      beforeunload: localStorage.getItem(`${key}:beforeunload`),
      pagehide: localStorage.getItem(`${key}:pagehide`),
      lifecycle: JSON.parse(localStorage.getItem(`${key}:lifecycle`) ?? '[]'),
    }), marker)).toEqual({ request: 'started', signal: 'aborted', beforeunload: 'fired', pagehide: 'fired', lifecycle: ['beforeunload', 'abort', 'pagehide'] });
    expect(counts.ai).toBe(1);
    expect(counts.put).toBe(0);
    expect(counts.accepted).toBe(0);
    expect(counts.oldWriter).toBe(0);
    expect(counts.achievements).toBe(0);
    expect(await saved(page)).toEqual(before);
    await healthy(page, errors);
  } finally { release(); }
});

test('held day preview response after logout cannot create a menu or achievements', async ({ page }) => {
  const { counts, errors, release } = await setup(page, 'held-ai');
  try {
    await navigate(page, 'Меню семьи'); const update = page.getByRole('button', { name: 'Посмотреть меню на день', exact: true }); await preview(page);
    await expect.poll(() => counts.ai).toBe(1); await navigate(page, 'Настройки');
    await page.getByRole('button', { name: 'Выйти из аккаунта', exact: true }).click();
    await expect.poll(() => counts.logout).toBe(1);
    await expect(page.getByRole('heading', { name: 'FitFocus', exact: true })).toBeVisible();
    release();
    await expect.poll(() => counts.fulfilled).toBe(1);
    expect(counts.put).toBe(0); expect(counts.oldWriter).toBe(0); expect(counts.achievements).toBe(0);
    expect((await saved(page)).operations).toEqual([]); await healthy(page, errors);
  } finally { release(); }
});

test('a delayed family server preview response after another account signs in cannot write its menu', async ({ page, context }) => {
  const { counts, errors, release } = await setup(page, 'held-ai');
  try {
    await navigate(page, 'Меню семьи');
    const update = page.getByRole('button', { name: 'Посмотреть меню на день', exact: true });
    await preview(page);
    await expect.poll(() => counts.ai).toBe(1);
    const before = await saved(page);

    const accountBPage = await context.newPage();
    const errorsB = await openSwitchAccount(accountBPage);
    await expect.poll(() => activeAccountId(accountBPage)).toBe(switchAccount.id);
    expect(await activeAccountId(page)).toBe(switchAccount.id);

    release();
    await expect.poll(() => counts.fulfilled).toBe(1);
    await expect.poll(() => activeAccountId(page)).toBe(switchAccount.id);
    expect(await saved(page)).toEqual(before);
    expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(75);
    expect(counts.put).toBe(0);
    expect(counts.achievements).toBe(0);
    await healthy(page, errors);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    expect(errorsB).toEqual([]);
  } finally { release(); }
});

test('a delayed family server preview response after same-account reauthentication cannot create a menu or achievements', async ({ page, context }) => {
  const { counts, errors, release } = await setup(page, 'held-ai');
  const before = await saved(page);
  const previousSession = await activeSessionIdentity(page);
  expect(previousSession).toMatchObject({ accountId: 'google-e2e-sub', serverSessionId: 'a'.repeat(64) });

  try {
    await navigate(page, 'Меню семьи');
    const update = page.getByRole('button', { name: 'Посмотреть меню на день', exact: true });
    await preview(page);
    await expect.poll(() => counts.ai).toBe(1);

    const reauthenticatedPage = await context.newPage();
    const reauthenticatedSession = { id: 'google-e2e-sub', sid: 'c'.repeat(64) };
    const errorsReauthenticated = await openSwitchAccount(reauthenticatedPage, reauthenticatedSession);
    const currentSession = await activeSessionIdentity(reauthenticatedPage);
    expect(currentSession).toMatchObject({
      accountId: reauthenticatedSession.id,
      serverSessionId: reauthenticatedSession.sid,
    });
    expect(previousSession?.sessionEpoch).not.toBe(currentSession?.sessionEpoch);
    await expect.poll(() => activeSessionIdentity(page)).toMatchObject({
      accountId: reauthenticatedSession.id,
      serverSessionId: reauthenticatedSession.sid,
    });

    release();
    await expect.poll(() => counts.fulfilled).toBe(1);
    await expect.poll(() => activeSessionIdentity(page)).toMatchObject({
      accountId: reauthenticatedSession.id,
      serverSessionId: reauthenticatedSession.sid,
    });
    expect(await saved(page)).toEqual(before);
    expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(75);
    expect(counts.put).toBe(0);
    expect(counts.accepted).toBe(0);
    expect(counts.oldWriter).toBe(0);
    expect(counts.achievements).toBe(0);
    await expect(page.getByText('LOGIN_SESSION_CHANGED', { exact: true })).toHaveCount(0);
    await healthy(page, errors);
    await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
    expect(errorsReauthenticated).toEqual([]);
  } finally { release(); }
});

test('a delayed family server preview after another account signs in cannot write its menu', async ({ page, context }) => {
  const { counts, errors, releasePreview } = await setup(page, 'held-preview');
  try {
    await preview(page);
    await expect.poll(() => counts.preview).toBe(1);
    const before = await saved(page);

    const accountBPage = await context.newPage();
    const errorsB = await openSwitchAccount(accountBPage);
    await expect.poll(() => activeAccountId(accountBPage)).toBe(switchAccount.id);
    await expect.poll(() => activeAccountId(page)).toBe(switchAccount.id);

    releasePreview();
    await expect.poll(() => counts.previewFulfilled).toBe(1);
    await expect.poll(() => activeAccountId(page)).toBe(switchAccount.id);
    expect(await saved(page)).toEqual(before);
    expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(75);
    expect(counts.put).toBe(0);
    expect(counts.accepted).toBe(0);
    expect(counts.oldWriter).toBe(0);
    await healthy(page, errors);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    expect(errorsB).toEqual([]);
  } finally { releasePreview(); }
});

test('a delayed family server preview after same-account reauthentication cannot write its menu', async ({ page, context }) => {
  const { counts, errors, releasePreview } = await setup(page, 'held-preview');
  const before = await saved(page);
  const previousSession = await activeSessionIdentity(page);
  expect(previousSession).toMatchObject({ accountId: 'google-e2e-sub', serverSessionId: 'a'.repeat(64) });

  try {
    await preview(page);
    await expect.poll(() => counts.preview).toBe(1);

    const reauthenticatedPage = await context.newPage();
    const reauthenticatedSession = { id: 'google-e2e-sub', sid: 'f'.repeat(64) };
    const errorsReauthenticated = await openSwitchAccount(reauthenticatedPage, reauthenticatedSession);
    await expect.poll(() => activeSessionIdentity(reauthenticatedPage)).toMatchObject({
      accountId: reauthenticatedSession.id,
      serverSessionId: reauthenticatedSession.sid,
    });
    const currentSession = await activeSessionIdentity(reauthenticatedPage);
    expect(currentSession).toMatchObject({
      accountId: reauthenticatedSession.id,
      serverSessionId: reauthenticatedSession.sid,
    });
    expect(previousSession?.sessionEpoch).not.toBe(currentSession?.sessionEpoch);
    await expect.poll(() => activeSessionIdentity(page)).toMatchObject({
      accountId: reauthenticatedSession.id,
      serverSessionId: reauthenticatedSession.sid,
    });

    releasePreview();
    await expect.poll(() => counts.previewFulfilled).toBe(1);
    await expect.poll(() => activeSessionIdentity(page)).toMatchObject({
      accountId: reauthenticatedSession.id,
      serverSessionId: reauthenticatedSession.sid,
    });
    expect(await saved(page)).toEqual(before);
    expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(75);
    expect(counts.put).toBe(0);
    expect(counts.accepted).toBe(0);
    expect(counts.oldWriter).toBe(0);
    expect(counts.achievements).toBe(0);
    await healthy(page, errors);
    await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
    expect(errorsReauthenticated).toEqual([]);
  } finally { releasePreview(); }
});

test('a delayed durable menu-state read after another account signs in cannot hydrate its menu', async ({ page, context }, testInfo) => {
  const { errors, counts, holdStateRead, releaseStateRead, stateReadHeld } = await setup(page);
  const before = await saved(page);

  try {
    const readsBefore = counts.stateReads;
    holdStateRead();
    const reload = page.reload();
    await expect.poll(() => stateReadHeld()).toBe(true);
    expect(counts.stateReads).toBeGreaterThan(readsBefore);
    const accountBPage = await context.newPage();
    const errorsB = await openSwitchAccount(accountBPage);
    await expect.poll(() => activeAccountId(accountBPage)).toBe(switchAccount.id);
    await expect.poll(() => activeAccountId(page)).toBe(switchAccount.id);

    releaseStateRead();
    await reload;
    await expect.poll(() => activeAccountId(page)).toBe(switchAccount.id);
    expect(await saved(page)).toEqual(before);
    expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(75);
    // Keep cancelled-read diagnostics separate; this helper still requires no errors.
    await healthy(page, filterReloadAccessControlAborts(errors, testInfo.project.name));
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    expect(errorsB).toEqual([]);
  } finally { releaseStateRead(); }
});

test('a delayed durable menu-state read from the previous same-account session cannot hydrate after reauthentication', async ({ page, context }, testInfo) => {
  const { errors, counts, holdStateRead, releaseStateRead, stateReadHeld } = await setup(page);
  const before = await saved(page);
  const previousSession = await activeSessionIdentity(page);
  expect(previousSession?.accountId).toBe('google-e2e-sub');
  expect(previousSession?.serverSessionId).toBe('a'.repeat(64));

  try {
    const readsBefore = counts.stateReads;
    holdStateRead();
    const reload = page.reload();
    await expect.poll(() => stateReadHeld()).toBe(true);
    expect(counts.stateReads).toBeGreaterThan(readsBefore);

    const reauthenticatedPage = await context.newPage();
    const reauthenticatedSession = { id: 'google-e2e-sub', sid: 'f'.repeat(64) };
    const errorsReauthenticated = await openSwitchAccount(reauthenticatedPage, reauthenticatedSession);
    await expect.poll(() => activeSessionIdentity(reauthenticatedPage)).toMatchObject({
      accountId: reauthenticatedSession.id,
      serverSessionId: reauthenticatedSession.sid,
    });
    await expect.poll(() => activeSessionIdentity(page)).toMatchObject({
      accountId: reauthenticatedSession.id,
      serverSessionId: reauthenticatedSession.sid,
    });
    expect(previousSession?.sessionEpoch).not.toBe((await activeSessionIdentity(reauthenticatedPage))?.sessionEpoch);

    releaseStateRead();
    await reload;
    await expect.poll(() => activeSessionIdentity(page)).toMatchObject({
      accountId: reauthenticatedSession.id,
      serverSessionId: reauthenticatedSession.sid,
    });
    expect(await saved(page)).toEqual(before);
    expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(75);
    expect(errorsReauthenticated).toEqual([]);
    await healthy(page, filterReloadAccessControlAborts(errors, testInfo.project.name));
    await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally { releaseStateRead(); }
});

test('family pending operation survives reload and delivers after recovery with the same opId', async ({ page }, info) => {
  const { counts, errors, restore } = await setup(page, 'offline');
  await confirmPreview(page);
  await expect.poll(() => counts.put).toBeGreaterThan(0);
  await expect.poll(async () => (await saved(page)).operations[0]?.status).toBe('pending');
  const operation = (await saved(page)).operations[0]; await page.reload();
  await expect(page.getByText('Семья с постоянным меню', { exact: true })).toBeVisible();
  await expect.poll(async () => (await saved(page)).operations[0]?.opId).toBe(operation.opId);
  await navigate(page, 'Покупки');
  await expect(page.getByText('Осталось купить 125 г', { exact: true })).toBeVisible();
  restore(); await navigate(page, 'Настройки');
  await page.getByRole('button', { name: /Синхронизировать сейчас/ }).click();
  await expect.poll(() => counts.accepted).toBe(1);
  await expect.poll(async () => (await saved(page)).operations.length).toBe(0);
  expect(counts.oldWriter).toBe(0); await healthy(page, errors); await page.screenshot({ path: info.outputPath('family-menu-recovered.png') });
});

test('pagehide invalidates an old server preview attempt and pageshow restores the generation control', async ({ page }) => {
  const { counts, errors, release } = await setup(page, 'held-ai');
  try {
    await navigate(page, 'Меню семьи'); const update = page.getByRole('button', { name: 'Посмотреть меню на день', exact: true }); await preview(page);
    await expect.poll(() => counts.ai).toBe(1);
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    await expect(update).toBeEnabled(); release(); await expect.poll(() => counts.fulfilled).toBe(1);
    expect(counts.put).toBe(0); expect(counts.achievements).toBe(0); expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(75);
    expect((await saved(page)).operations).toEqual([]); await healthy(page, errors);
  } finally { release(); }
});

test('editing day selections while preview is pending preserves the prior menu', async ({ page }) => {
  const { counts, errors, release } = await setup(page, 'held-ai');
  try {
    await navigate(page, 'Меню семьи'); await preview(page);
    await expect.poll(() => counts.ai).toBe(1);
    await page.getByLabel('Порция: E2E User, Завтрак', { exact: true }).selectOption('1'); release();
    await expect.poll(() => counts.fulfilled).toBe(1); await navigate(page, 'Меню семьи');
    await expect(page.getByText('Вы изменили выбор во время подготовки. Ваш ввод сохранён; запросите предпросмотр ещё раз.', { exact: true })).toBeVisible();
    expect(counts.put).toBe(0); expect(counts.achievements).toBe(0); expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(75);
    await healthy(page, errors);
  } finally { release(); }
});
