import { expect, type Page, type Route } from '@playwright/test';
import { test } from './support/mockTest';
import { buildMockProfile, mockApp, openApp } from './support/appHarness';

const accountA = { id: 'registration-account-a', sid: 'a'.repeat(64) };
const accountB = { id: 'registration-account-b', sid: 'b'.repeat(64) };

function headers(account: typeof accountA) {
  return {
    'X-FitFocus-State-Account': account.id,
    'X-FitFocus-State-Session': account.sid,
    'X-FitFocus-State-Protocol': '2',
    'X-FitFocus-State-Guard': '1',
    'X-FitFocus-Bootstrap-Protocol': '1',
    'X-FitFocus-Bootstrap-Guard': '1',
    'X-FitFocus-AI-Protocol': '1',
    'X-FitFocus-AI-Guard': '1',
    'X-FitFocus-Profile-Protocol': '1',
    'X-FitFocus-Profile-Guard': '1',
    'X-FitFocus-Achievements-Protocol': '1',
    'X-FitFocus-Achievements-Guard': '1',
  };
}

async function installIdentityApi(
  page: Page,
  account: typeof accountA,
  existingProfile = false,
  options: { onAccountDelete?: (route: Route) => Promise<void>; logoutCalls?: string[] } = {},
) {
  await mockApp(page, { session: 'app' });
  const profile = existingProfile
    ? { ...buildMockProfile(), id: account.id, googleSub: account.id, name: 'Профиль B', version: 1 }
    : null;
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      headers: headers(account),
      body: JSON.stringify(body),
    });
    if (url.pathname === '/api/env') return json({ requireInvite: false });
    if (url.pathname === '/api/me' && method === 'GET') return json({
      user: { sub: account.id, name: account.id === accountA.id ? 'Аккаунт A' : 'Аккаунт B', email: `${account.id}@example.test` },
      hasAccess: true,
      stateSync: { protocol: 2, guard: 1, accountId: account.id, sessionId: account.sid },
      bootstrapSync: { protocol: 1, guard: 1 },
      profileSync: { protocol: 1, guard: 1, weeklyMenuProjection: 1 },
      aiSync: { protocol: 1, guard: 1 },
      weeklyMenuSync: { protocol: 1, guard: 1 },
      achievementSync: { protocol: 1, guard: 1 },
    });
    if (url.pathname === '/api/bootstrap' && method === 'GET') return json({
      user: { sub: account.id }, profile, items: [],
    });
    if (url.pathname === '/api/profile' && method === 'GET') return json({ profile, version: profile?.version ?? 0 });
    if (url.pathname === '/api/profile' && method === 'PUT') {
      const body = request.postDataJSON() as Record<string, unknown>;
      return json({ profile: { ...profile, ...body, id: account.id, version: Number(body.baseVersion ?? 0) + 1 } });
    }
    if (url.pathname === '/api/state' && method === 'GET') return json({ items: [] });
    if (url.pathname === '/api/state' && method === 'PUT') {
      const body = request.postDataJSON() as { items?: Array<{ key: string; baseVersion: number }> };
      return json({ ok: true, items: (body.items ?? []).map(item => ({
        key: item.key, version: item.baseVersion + 1, exists: true,
      })) });
    }
    if (url.pathname === '/api/achievements' || url.pathname === '/api/achievements/check') {
      return json({ enabled: false, catalog: [], unlocked: [], newlyUnlocked: [] });
    }
    if (url.pathname === '/api/logout') {
      options.logoutCalls?.push(account.id);
      return json({ ok: true });
    }
    if (url.pathname === '/api/account/delete' && method === 'POST') {
      if (options.onAccountDelete) return options.onAccountDelete(route);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          ...headers(account),
          'X-FitFocus-Account-Delete-Protocol': '1',
          'X-FitFocus-Account-Delete-Guard': '1',
        },
        body: JSON.stringify({ ok: true }),
      });
    }
    return route.fallback();
  });
}

async function activeAccount(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const opening = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const tx = db.transaction('outbox_meta', 'readonly');
      const active = await new Promise<{ accountId?: string } | undefined>((resolve, reject) => {
        const request = tx.objectStore('outbox_meta').get('active-session');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return active?.accountId ?? null;
    } finally {
      db.close();
    }
  });
}

async function activeSession(page: Page): Promise<{ accountId: string; serverSessionId: string } | null> {
  return page.evaluate(async () => {
    const opening = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const tx = db.transaction('outbox_meta', 'readonly');
      const active = await new Promise<{ accountId?: string; serverSessionId?: string } | undefined>((resolve, reject) => {
        const request = tx.objectStore('outbox_meta').get('active-session');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return active?.accountId && active.serverSessionId
        ? { accountId: active.accountId, serverSessionId: active.serverSessionId }
        : null;
    } finally {
      db.close();
    }
  });
}

test('a registration draft is hidden when another tab activates a different Google account', async ({ page, context }, info) => {
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errorsA.push(message.text()); });
  await installIdentityApi(page, accountA);
  await openApp(page, '/?auth=google');
  await expect(page).toHaveTitle(/FitFocus/);
  const createPlan = page.getByRole('button', { name: 'Создать AI-план', exact: true });
  await expect(createPlan).toBeVisible();
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);

  const weight = page.locator('input[type="number"]').nth(0);
  const height = page.locator('input[type="number"]').nth(1);
  const age = page.locator('input[type="number"]').nth(2);
  await weight.fill('98.5');
  await height.fill('176');
  await age.fill('35');
  await expect(weight).toHaveValue('98.5');
  await expect(height).toHaveValue('176');
  await expect(age).toHaveValue('35');

  const accountBPage = await context.newPage();
  const errorsB: string[] = [];
  accountBPage.on('pageerror', error => errorsB.push(error.message));
  accountBPage.on('console', message => { if (message.type() === 'error') errorsB.push(message.text()); });
  await installIdentityApi(accountBPage, accountB, true);
  await openApp(accountBPage, '/#dashboard');
  await expect(accountBPage).toHaveTitle(/FitFocus/);
  await expect.poll(() => activeAccount(accountBPage)).toBe(accountB.id);

  await expect.poll(() => activeAccount(page)).toBe(accountB.id);
  await expect(page.getByText('Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Создать AI-план', exact: true })).toHaveCount(0);
  await expect(page.locator('input[type="number"]')).toHaveCount(0);
  expect(errorsA).toEqual([]);
  expect(errorsB).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
  await accountBPage.screenshot({ path: info.outputPath('registration-draft-hidden-after-account-switch.png') });
});

test('a delayed account deletion response clears its owner without logging out the new account', async ({ page, context }) => {
  let releaseDeleteResponse: () => void = () => {};
  let markDeleteStarted: () => void = () => {};
  const deleteStarted = new Promise<void>(resolve => { markDeleteStarted = resolve; });
  const waitForDeleteResponse = new Promise<void>(resolve => { releaseDeleteResponse = resolve; });
  let deleteScope: { account?: string; session?: string } = {};
  const logoutCalls: string[] = [];

  await installIdentityApi(page, accountA, true, {
    logoutCalls,
    onAccountDelete: async route => {
      const requestHeaders = route.request().headers();
      deleteScope = {
        account: requestHeaders['x-fitfocus-state-account'],
        session: requestHeaders['x-fitfocus-state-session'],
      };
      markDeleteStarted();
      await waitForDeleteResponse;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          ...headers(accountA),
          'X-FitFocus-Account-Delete-Protocol': '1',
          'X-FitFocus-Account-Delete-Guard': '1',
        },
        body: JSON.stringify({ ok: true }),
      });
    },
  });

  await openApp(page, '/#settings');
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  const deleteButton = page.getByRole('button', { name: /Удалить аккаунт/ });
  await expect(deleteButton).toBeVisible();
  page.on('dialog', async dialog => { await dialog.accept('DELETE'); });
  await deleteButton.click();
  await deleteStarted;

  const accountBPage = await context.newPage();
  await installIdentityApi(accountBPage, accountB, true);
  await openApp(accountBPage, '/#dashboard');
  await expect.poll(() => activeAccount(accountBPage)).toBe(accountB.id);

  releaseDeleteResponse();

  await expect.poll(() => activeAccount(page)).toBe(accountB.id);
  await expect.poll(() => activeAccount(accountBPage)).toBe(accountB.id);
  expect(deleteScope).toEqual({ account: accountA.id, session: accountA.sid });
  expect(logoutCalls).toEqual([]);
});

test('a delayed account deletion error is not shown after another account becomes active', async ({ page, context }) => {
  let releaseDeleteResponse: () => void = () => {};
  let markDeleteStarted: () => void = () => {};
  const deleteStarted = new Promise<void>(resolve => { markDeleteStarted = resolve; });
  const waitForDeleteResponse = new Promise<void>(resolve => { releaseDeleteResponse = resolve; });
  const staleDialogs: string[] = [];

  await installIdentityApi(page, accountA, true, {
    onAccountDelete: async route => {
      markDeleteStarted();
      await waitForDeleteResponse;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'ACCOUNT_DELETE_FAILED' }),
      });
    },
  });

  await openApp(page, '/#settings');
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  await expect(page.getByRole('button', { name: /Удалить аккаунт/ })).toBeVisible();
  page.on('dialog', async dialog => {
    if (dialog.type() === 'prompt') {
      await dialog.accept('DELETE');
      return;
    }
    staleDialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: /Удалить аккаунт/ }).click();
  await deleteStarted;

  const accountBPage = await context.newPage();
  await installIdentityApi(accountBPage, accountB, true);
  await openApp(accountBPage, '/#dashboard');
  await expect.poll(() => activeAccount(accountBPage)).toBe(accountB.id);
  await expect.poll(() => activeAccount(page)).toBe(accountB.id);

  const deleteResponse = page.waitForResponse(response =>
    response.url().includes('/api/account/delete') && response.status() === 500,
  );
  const unexpectedDialog = page.waitForEvent('dialog', { timeout: 1000 })
    .then(async dialog => {
      const message = dialog.message();
      await dialog.dismiss();
      return message;
    })
    .catch(() => null);
  releaseDeleteResponse();
  await deleteResponse;

  expect(await unexpectedDialog).toBeNull();
  expect(staleDialogs).toEqual([]);
  await expect.poll(() => activeAccount(page)).toBe(accountB.id);
  await expect.poll(() => activeAccount(accountBPage)).toBe(accountB.id);
});

test('a delayed account deletion error is not shown after same-account reauthentication', async ({ page, context }) => {
  const accountAReauthenticated = { ...accountA, sid: 'c'.repeat(64) };
  let releaseDeleteResponse: () => void = () => {};
  let markDeleteStarted: () => void = () => {};
  const deleteStarted = new Promise<void>(resolve => { markDeleteStarted = resolve; });
  const waitForDeleteResponse = new Promise<void>(resolve => { releaseDeleteResponse = resolve; });
  const staleDialogs: string[] = [];

  await installIdentityApi(page, accountA, true, {
    onAccountDelete: async route => {
      markDeleteStarted();
      await waitForDeleteResponse;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'ACCOUNT_DELETE_FAILED' }),
      });
    },
  });

  await openApp(page, '/#settings');
  await expect.poll(() => activeSession(page)).toEqual({ accountId: accountA.id, serverSessionId: accountA.sid });
  await expect(page.getByRole('button', { name: /Удалить аккаунт/ })).toBeVisible();
  page.on('dialog', async dialog => {
    if (dialog.type() === 'prompt') {
      await dialog.accept('DELETE');
      return;
    }
    staleDialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: /Удалить аккаунт/ }).click();
  await deleteStarted;

  const reauthenticatedPage = await context.newPage();
  await installIdentityApi(reauthenticatedPage, accountAReauthenticated, true);
  await openApp(reauthenticatedPage, '/#dashboard');
  const newSession = { accountId: accountA.id, serverSessionId: accountAReauthenticated.sid };
  await expect.poll(() => activeSession(reauthenticatedPage)).toEqual(newSession);
  await expect.poll(() => activeSession(page)).toEqual(newSession);

  const deleteResponse = page.waitForResponse(response =>
    response.url().includes('/api/account/delete') && response.status() === 500,
  );
  const unexpectedDialog = page.waitForEvent('dialog', { timeout: 1000 })
    .then(async dialog => {
      const message = dialog.message();
      await dialog.dismiss();
      return message;
    })
    .catch(() => null);
  releaseDeleteResponse();
  await deleteResponse;

  expect(await unexpectedDialog).toBeNull();
  expect(staleDialogs).toEqual([]);
  await expect.poll(() => activeSession(reauthenticatedPage)).toEqual(newSession);
});
