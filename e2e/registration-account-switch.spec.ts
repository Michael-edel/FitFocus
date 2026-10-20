import { expect, type Page } from '@playwright/test';
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

async function installIdentityApi(page: Page, account: typeof accountA, existingProfile = false) {
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
    if (url.pathname === '/api/logout') return json({ ok: true });
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
