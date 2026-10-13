import { expect, type BrowserContext, type Page } from '@playwright/test';
import { test } from './support/mockTest';
import { buildMockProfile, mockApp, openApp } from './support/appHarness';

const accountA = { id: 'family-callback-account-a', sid: 'a'.repeat(64), name: 'Семья A' };
const accountB = { id: 'family-callback-account-b', sid: 'b'.repeat(64), name: 'Семья B' };
type Account = typeof accountA;
type FixtureState = { current: Account; inviteRequests: number; releasedInvites: number };

function profileFor(account: Account) {
  const profile = buildMockProfile();
  return {
    ...profile,
    id: account.id,
    googleSub: account.id,
    name: account.name,
    email: `${account.id}@example.test`,
    plan: 'family',
  };
}

function scopedHeaders(account: Account) {
  return {
    'X-FitFocus-State-Account': account.id,
    'X-FitFocus-State-Session': account.sid,
    'X-FitFocus-State-Protocol': '2',
    'X-FitFocus-State-Guard': '1',
    'X-FitFocus-Profile-Protocol': '1',
    'X-FitFocus-Profile-Guard': '1',
    'X-FitFocus-Bootstrap-Protocol': '1',
    'X-FitFocus-Bootstrap-Guard': '1',
    'X-FitFocus-Achievements-Protocol': '1',
    'X-FitFocus-Achievements-Guard': '1',
    'X-FitFocus-AI-Protocol': '1',
    'X-FitFocus-AI-Guard': '1',
    'X-FitFocus-Weekly-Menu-Protocol': '1',
    'X-FitFocus-Weekly-Menu-Guard': '1',
    'X-FitFocus-Family-Protocol': '1',
    'X-FitFocus-Family-Guard': '1',
    'X-FitFocus-Family-Menu-Protocol': '1',
    'X-FitFocus-Family-Menu-Guard': '1',
  };
}

function apiBody(account: Account) {
  return {
    user: { sub: account.id, roles: ['user'] },
    hasAccess: true,
    stateSync: { protocol: 2, guard: 1, accountId: account.id, sessionId: account.sid },
    bootstrapSync: { protocol: 1, guard: 1 },
    profileSync: { protocol: 1, guard: 1, weeklyMenuProjection: 1 },
    aiSync: { protocol: 1, guard: 1 },
    weeklyMenuSync: { protocol: 1, guard: 1 },
    achievementSync: { protocol: 1, guard: 1 },
    familySync: { protocol: 1, guard: 1 },
    familyMenuSync: { protocol: 1, guard: 1, cas: 1 },
    profile: profileFor(account),
  };
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function installAccountApi(page: Page, state: FixtureState, holdInvite: boolean, errors: string[]) {
  await mockApp(page, { session: 'app' });
  const held = deferred();
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const requestedAccount = request.headers()['x-fitfocus-state-account'];
    const requestedSession = request.headers()['x-fitfocus-state-session'];
    const scopedAccount = [accountA, accountB].find(account => account.id === requestedAccount
      && account.sid === requestedSession) ?? state.current;
    const json = (body: unknown, account = scopedAccount, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      headers: scopedHeaders(account),
      body: JSON.stringify(body),
    });

    if (path === '/api/env') return json({ requireInvite: false }, state.current);
    if (path === '/api/me') return json(apiBody(state.current), state.current);
    if (path === '/api/bootstrap') return json({ user: { sub: state.current.id }, profile: profileFor(state.current), items: [] }, state.current);
    if (path === '/api/profile') return json({ profile: profileFor(scopedAccount), version: 1 });
    if (path === '/api/state') {
      if (request.method() === 'GET') return json({ items: [] });
      const items = (request.postDataJSON()?.items ?? []) as Array<{ key: string; baseVersion: number }>;
      return json({ ok: true, items: items.map(item => ({ key: item.key, version: item.baseVersion + 1, exists: true })) });
    }
    if (path === '/api/achievements' || path === '/api/achievements/check') {
      return json({ enabled: false, catalog: [], unlocked: [], newlyUnlocked: [] });
    }
    if (path === '/api/ai') return json({ text: 'Тестовая интерпретация.' });
    if (path === '/api/logout') return json({ ok: true });
    if (path.startsWith('/api/family') || path.startsWith('/api/shopping')) {
      expect(requestedAccount).toBe(scopedAccount.id);
      expect(requestedSession).toBe(scopedAccount.sid);
    }
    if (path === '/api/family') return json({
      family: { id: `family-${scopedAccount.id}`, name: scopedAccount.name, owner_user_id: scopedAccount.id },
      members: [{ user_id: scopedAccount.id, name: scopedAccount.name, role: 'owner', goal: 'MAINTAIN' }],
    });
    if (path === '/api/family/menu') return json({ weekStart: url.searchParams.get('week'), shared: null, portions: null });
    if (path === '/api/family/invite') {
      state.inviteRequests += 1;
      if (holdInvite && scopedAccount.id === accountA.id) {
        await held.promise;
        state.releasedInvites += 1;
        return json({ code: 'OBSOLETE-CODE-FROM-A' }, accountA);
      }
      return json({ code: 'CURRENT-CODE' });
    }
    if (path === '/api/shopping/list') return json({ family_id: `family-${scopedAccount.id}`, week_start: url.searchParams.get('week'), items: [] });
    return route.fallback();
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`);
  });
  return { release: held.release };
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
      const request = tx.objectStore('outbox_meta').get('active-session');
      const value = await new Promise<{ accountId?: string } | undefined>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return value?.accountId ?? null;
    } finally {
      db.close();
    }
  });
}

async function openAccountB(context: BrowserContext, state: FixtureState, errors: string[]) {
  state.current = accountB;
  const page = await context.newPage();
  await installAccountApi(page, state, false, errors);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByRole('heading', { name: accountB.name, exact: true })).toBeVisible();
  await expect.poll(() => activeAccount(page)).toBe(accountB.id);
  return page;
}

test('a delayed family callback from account A is ignored after another tab signs in as account B', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The two-tab family callback acceptance runs in desktop browser profiles.');
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = { current: accountA, inviteRequests: 0, releasedInvites: 0 };
  const fixtureA = await installAccountApi(page, state, true, errorsA);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByRole('heading', { name: accountA.name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Создать приглашение', exact: true }).click();
  await expect.poll(() => state.inviteRequests).toBe(1);

  try {
    const accountBPage = await openAccountB(context, state, errorsB);
    expect(await activeAccount(page)).toBe(accountB.id);
    fixtureA.release();
    await expect.poll(() => state.releasedInvites).toBe(1);
    await expect(page.getByText('OBSOLETE-CODE-FROM-A', { exact: true })).toHaveCount(0);
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('family-callback-account-b.png') });
  } finally {
    fixtureA.release();
  }
});
