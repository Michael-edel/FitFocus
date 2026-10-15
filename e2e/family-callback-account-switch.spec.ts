import { expect, type BrowserContext, type Page } from '@playwright/test';
import { test } from './support/mockTest';
import { buildMockProfile, mockApp, openApp } from './support/appHarness';

const accountA = { id: 'family-callback-account-a', sid: 'a'.repeat(64), name: 'Семья A' };
const accountB = { id: 'family-callback-account-b', sid: 'b'.repeat(64), name: 'Семья B' };
type Account = typeof accountA;
type FixtureState = {
  current: Account;
  familyId?: string;
  inviteRequests: number;
  inviteTargetIds: string[];
  releasedInvites: number;
  shoppingCheckRequests: number;
  shoppingCheckAccounts: string[];
  releasedShoppingChecks: number;
  personalShoppingListRequests: number;
  personalShoppingListAccounts: string[];
  releasedPersonalShoppingLists: number;
  rejectedPersonalShoppingLists: number;
  personalShoppingCheckRequests: number;
  personalShoppingCheckAccounts: string[];
  rejectedPersonalShoppingChecks: number;
  shoppingAchievements: string[];
  memberRequests: number;
  memberTargetIds: string[];
  releasedMembers: number;
  noFamilyForA?: boolean;
  joinRequests?: number;
  releasedJoins?: number;
  createRequests?: number;
  releasedCreates?: number;
  familyJoinAchievements?: string[];
  familyLoadAccounts?: string[];
  releasedFamilyContexts?: number;
  familyShoppingListRequests?: number;
  familyShoppingListAccounts?: string[];
  releasedFamilyShoppingLists?: number;
  supportListAccounts?: string[];
  releasedSupportLists?: number;
  mobileTokenAccounts?: string[];
  releasedMobileTokens?: number;
};

function profileFor(account: Account, includePersonalShopping = false) {
  const profile = buildMockProfile();
  return {
    ...profile,
    id: account.id,
    googleSub: account.id,
    name: account.name,
    email: `${account.id}@example.test`,
    plan: 'family',
    ...(includePersonalShopping ? {
      aiPlan: {
        ...profile.aiPlan,
        weeklyMenu: {
          weekStart: '2026-10-12',
          days: Array.from({ length: 7 }, (_, index) => ({
            day: `День ${index + 1}`, breakfast: 'Овсянка', lunch: 'Курица', dinner: 'Рыба', snack: 'Йогурт',
          })),
          shoppingList: [`Меню ${account.id}`],
          shoppingListItems: [{ name: `Меню ${account.id}`, grams: 700 }],
        },
      },
    } : {}),
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
    'X-FitFocus-Support-Protocol': '1',
    'X-FitFocus-Support-Guard': '1',
    'X-FitFocus-Mobile-Token-Protocol': '1',
    'X-FitFocus-Mobile-Token-Guard': '1',
  };
}

function apiBody(account: Account, includePersonalShopping = false) {
  return {
    user: { sub: account.id, roles: ['user'] },
    hasAccess: true,
    stateSync: { protocol: 2, guard: 1, accountId: account.id, sessionId: account.sid },
    bootstrapSync: { protocol: 1, guard: 1 },
    profileSync: { protocol: 1, guard: 1, weeklyMenuProjection: 1 },
    aiSync: { protocol: 1, guard: 1 },
    weeklyMenuSync: { protocol: 1, guard: 1 },
    achievementSync: { protocol: 1, guard: 1 },
    huaweiSync: { protocol: 1, guard: 1 },
    familySync: { protocol: 1, guard: 1, target: 1 },
    familyMenuSync: { protocol: 1, guard: 1, cas: 1 },
    profile: profileFor(account, includePersonalShopping),
  };
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function installAccountApi(
  page: Page,
  state: FixtureState,
  holdInvite: boolean,
  errors: string[],
  holdShoppingCheck = false,
  holdMemberUpdate = false,
  includePersonalShopping = false,
  holdPersonalShoppingList = false,
  holdJoin = false,
  holdCreate = false,
  holdFamilyContext = false,
  holdFamilyShoppingList = false,
  holdSupportList = false,
  holdMobileToken = false,
) {
  await mockApp(page, { session: 'app' });
  if (holdMobileToken) {
    await page.addInitScript(() => {
      const target = window as typeof window & { __fitfocusClipboardWrites?: string[] };
      target.__fitfocusClipboardWrites = [];
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (value: string) => { target.__fitfocusClipboardWrites?.push(value); } },
      });
    });
  }
  const heldInvite = deferred();
  const heldShoppingCheckResponse = deferred();
  const heldPersonalShoppingListResponse = deferred();
  const heldMemberResponse = deferred();
  const heldJoinResponse = deferred();
  const heldCreateResponse = deferred();
  const heldFamilyContextResponse = deferred();
  const heldFamilyShoppingListResponse = deferred();
  const heldSupportListResponse = deferred();
  const heldMobileTokenResponse = deferred();
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
    if (path === '/api/me') return json(apiBody(state.current, includePersonalShopping), state.current);
    if (path === '/api/bootstrap') return json({ user: { sub: state.current.id }, profile: profileFor(state.current, includePersonalShopping), items: [] }, state.current);
    if (path === '/api/profile') return json({ profile: profileFor(scopedAccount), version: 1 });
    if (path === '/api/state') {
      if (request.method() === 'GET') return json({ items: [] });
      const items = (request.postDataJSON()?.items ?? []) as Array<{ key: string; baseVersion: number }>;
      return json({ ok: true, items: items.map(item => ({ key: item.key, version: item.baseVersion + 1, exists: true })) });
    }
    if (path === '/api/achievements/check') {
      const body = request.postDataJSON() as { context?: { source?: unknown } } | null;
      if (body?.context?.source === 'shopping_item_checked') state.shoppingAchievements.push(scopedAccount.id);
      if (body?.context?.source === 'family_join_or_create') (state.familyJoinAchievements ??= []).push(scopedAccount.id);
      return json({ enabled: true, catalog: [], unlocked: [], newlyUnlocked: [] });
    }
    if (path === '/api/achievements') return json({ enabled: true, catalog: [], unlocked: [], newlyUnlocked: [] });
    if (path === '/api/ai') return json({ text: 'Тестовая интерпретация.' });
    if (path === '/api/logout') return json({ ok: true });
    if (path === '/api/mobile/token' && request.method() === 'POST') {
      (state.mobileTokenAccounts ??= []).push(scopedAccount.id);
      if (holdMobileToken && scopedAccount.id === accountA.id) {
        await heldMobileTokenResponse.promise;
        state.releasedMobileTokens = (state.releasedMobileTokens ?? 0) + 1;
        return json({ token: 'account-a-mobile-token-secret', expiresAt: Date.now() + 60_000 }, accountA);
      }
      return json({ token: `mobile-token-${scopedAccount.id}`, expiresAt: Date.now() + 60_000 });
    }
    if (path === '/api/support/feedback/my') {
      expect(requestedAccount).toBe(scopedAccount.id);
      expect(requestedSession).toBe(scopedAccount.sid);
      const ticket = {
        id: `ticket-${scopedAccount.id}`,
        created_at: 1,
        updated_at: 1,
        category: 'Ошибка',
        section: 'Обзор',
        subject: `Обращение ${scopedAccount.id === accountA.id ? 'A' : 'B'}`,
        message: `Секретное обращение ${scopedAccount.id}`,
        status: 'new',
        priority: 'normal',
        attachment_count: 0,
        messages: [],
      };
      if (request.method() === 'GET' && !url.searchParams.has('id')) {
        (state.supportListAccounts ??= []).push(scopedAccount.id);
        if (holdSupportList && scopedAccount.id === accountA.id) {
          await heldSupportListResponse.promise;
          state.releasedSupportLists = (state.releasedSupportLists ?? 0) + 1;
          return json({ tickets: [ticket] }, accountA);
        }
        return json({ tickets: [ticket] });
      }
      if (request.method() === 'GET') return json({ ticket });
      return json({ ticket, ok: true });
    }
    if (path === '/api/support/feedback' && request.method() === 'POST') {
      return json({ ok: true, id: `ticket-${scopedAccount.id}` });
    }
    if (path.startsWith('/api/family') || path.startsWith('/api/shopping')) {
      expect(requestedAccount).toBe(scopedAccount.id);
      expect(requestedSession).toBe(scopedAccount.sid);
    }
    if (path === '/api/family') {
      if (request.method() === 'POST') {
        state.createRequests = (state.createRequests ?? 0) + 1;
        if (holdCreate && scopedAccount.id === accountA.id) {
          await heldCreateResponse.promise;
          state.releasedCreates = (state.releasedCreates ?? 0) + 1;
          return json({ ok: true }, accountA);
        }
        return json({ ok: true });
      }
      if (request.method() === 'GET') {
        (state.familyLoadAccounts ??= []).push(scopedAccount.id);
        if (holdFamilyContext && scopedAccount.id === accountA.id) {
          await heldFamilyContextResponse.promise;
          state.releasedFamilyContexts = (state.releasedFamilyContexts ?? 0) + 1;
          return json({ family: { id: `family-${accountA.id}`, name: accountA.name, owner_user_id: accountA.id },
            members: [{ user_id: accountA.id, name: accountA.name, role: 'owner', goal: 'MAINTAIN' }] }, accountA);
        }
        if (state.noFamilyForA && scopedAccount.id === accountA.id) return json({ family: null, members: [] }, accountA);
      }
      const familyId = state.familyId ?? `family-${scopedAccount.id}`;
      const familyName = state.familyId ? `Семья ${state.familyId}` : scopedAccount.name;
      return json({
      family: { id: familyId, name: familyName, owner_user_id: scopedAccount.id },
      members: [{ user_id: scopedAccount.id, name: scopedAccount.name, role: 'owner', goal: 'MAINTAIN' }],
    });
    }
    if (path === '/api/family/menu') return json({ weekStart: url.searchParams.get('week'), shared: null, portions: null });
    if (path === '/api/family/invite') {
      state.inviteRequests += 1;
      const body = request.postDataJSON() as { familyId?: unknown } | null;
      state.inviteTargetIds.push(typeof body?.familyId === 'string' ? body.familyId : '');
      if (holdInvite && scopedAccount.id === accountA.id) {
        await heldInvite.promise;
        state.releasedInvites += 1;
        return json({ code: 'OBSOLETE-CODE-FROM-A' }, accountA);
      }
      return json({ code: 'CURRENT-CODE' });
    }
    if (path === '/api/family/join') {
      state.joinRequests = (state.joinRequests ?? 0) + 1;
      if (holdJoin && scopedAccount.id === accountA.id) {
        await heldJoinResponse.promise;
        state.releasedJoins = (state.releasedJoins ?? 0) + 1;
        return json({ ok: true }, accountA);
      }
      return json({ ok: true });
    }
    if (path === '/api/family/member') {
      const body = request.postDataJSON() as { familyId?: unknown } | null;
      state.memberRequests += 1;
      state.memberTargetIds.push(typeof body?.familyId === 'string' ? body.familyId : '');
      if (holdMemberUpdate && scopedAccount.id === accountA.id) {
        await heldMemberResponse.promise;
        await json({ ok: true }, accountA);
        state.releasedMembers += 1;
        return;
      }
      return json({ ok: true });
    }
    if (path === '/api/shopping/list') {
      const weekStart = url.searchParams.get('week');
      if (!url.searchParams.has('family_id')) {
        state.personalShoppingListRequests += 1;
        state.personalShoppingListAccounts.push(scopedAccount.id);
        if (holdPersonalShoppingList && scopedAccount.id === accountA.id) {
          await heldPersonalShoppingListResponse.promise;
          state.releasedPersonalShoppingLists += 1;
        }
        if (requestedAccount !== state.current.id || requestedSession !== state.current.sid) {
          state.rejectedPersonalShoppingLists += 1;
          return json({ error: 'STATE_SESSION_CHANGED' }, state.current, 401);
        }
        return json({
          week_start: weekStart,
          items: [{ name: `Список ${scopedAccount.id === accountA.id ? 'A' : 'B'}`, grams: 400, checked: false }],
        });
      }
      state.familyShoppingListRequests = (state.familyShoppingListRequests ?? 0) + 1;
      (state.familyShoppingListAccounts ??= []).push(scopedAccount.id);
      if (holdFamilyShoppingList && scopedAccount.id === accountA.id) {
        await heldFamilyShoppingListResponse.promise;
        state.releasedFamilyShoppingLists = (state.releasedFamilyShoppingLists ?? 0) + 1;
        return json({ family_id: `family-${accountA.id}`, week_start: weekStart,
          items: [{ name: 'Семейный список A', grams: 400, checked: false }] }, accountA);
      }
      return json({
        family_id: state.familyId && scopedAccount.id === state.current.id ? state.familyId : `family-${scopedAccount.id}`,
        week_start: weekStart,
        items: [{ name: `Семейный список ${scopedAccount.id === accountA.id ? 'A' : 'B'}`, grams: 400, checked: false }],
      });
    }
    if (path === '/api/shopping/check') {
      state.shoppingCheckRequests += 1;
      state.shoppingCheckAccounts.push(scopedAccount.id);
      const body = request.postDataJSON() as { family_id?: unknown } | null;
      const personal = !body?.family_id;
      if (personal) {
        state.personalShoppingCheckRequests += 1;
        state.personalShoppingCheckAccounts.push(scopedAccount.id);
      }
      if (holdShoppingCheck && scopedAccount.id === accountA.id) {
        await heldShoppingCheckResponse.promise;
        state.releasedShoppingChecks += 1;
        if (personal && (requestedAccount !== state.current.id || requestedSession !== state.current.sid)) {
          state.rejectedPersonalShoppingChecks += 1;
          return json({ error: 'STATE_SESSION_CHANGED' }, state.current, 401);
        }
        await json({ ok: true }, accountA);
        return;
      }
      if (personal && (requestedAccount !== state.current.id || requestedSession !== state.current.sid)) {
        state.rejectedPersonalShoppingChecks += 1;
        return json({ error: 'STATE_SESSION_CHANGED' }, state.current, 401);
      }
      return json({ ok: true });
    }
    return route.fallback();
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /\/api\/shopping\/(list|check)/.test(message.location().url)
      && /\b401\b/.test(message.text())) return;
    if (['error', 'warning'].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`);
  });
  return {
    releaseInvite: heldInvite.release,
    releaseShoppingCheck: heldShoppingCheckResponse.release,
    releasePersonalShoppingList: heldPersonalShoppingListResponse.release,
    releaseMemberUpdate: heldMemberResponse.release,
    releaseJoin: heldJoinResponse.release,
    releaseCreate: heldCreateResponse.release,
    releaseFamilyContext: heldFamilyContextResponse.release,
    releaseFamilyShoppingList: heldFamilyShoppingListResponse.release,
    releaseSupportList: heldSupportListResponse.release,
    releaseMobileToken: heldMobileTokenResponse.release,
  };
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

async function openAccountB(context: BrowserContext, state: FixtureState, errors: string[], includePersonalShopping = false,
  targetTab: 'family' | 'plan' | 'support' | 'settings' = includePersonalShopping ? 'plan' : 'family') {
  state.current = accountB;
  const page = await context.newPage();
  await installAccountApi(page, state, false, errors, false, false, includePersonalShopping);
  await openApp(page, `/#${targetTab}`);
  await expect(page).toHaveTitle(/FitFocus/);
  if (targetTab === 'support') {
    await expect(page.getByRole('heading', { name: 'Мои обращения', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Обращение B', exact: true })).toBeVisible();
  } else if (targetTab === 'settings') {
    await expect(page.getByRole('button', { name: 'Сгенерировать token' })).toBeVisible();
  } else if (includePersonalShopping) {
    await expect(page.locator('#shopping-list')).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { name: accountB.name, exact: true })).toBeVisible();
  }
  await expect.poll(() => activeAccount(page)).toBe(accountB.id);
  return page;
}

test('a delayed family callback from account A is ignored after another tab signs in as account B', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The two-tab family callback acceptance runs in desktop browser profiles.');
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [],
    memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
  };
  const fixtureA = await installAccountApi(page, state, true, errorsA);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByRole('heading', { name: 'Семья', exact: true })).toBeVisible();
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  await page.getByRole('button', { name: 'Создать приглашение', exact: true }).click();
  await expect.poll(() => state.inviteRequests).toBe(1);
  expect(state.inviteTargetIds).toEqual([`family-${accountA.id}`]);

  try {
    const accountBPage = await openAccountB(context, state, errorsB);
    expect(await activeAccount(page)).toBe(accountB.id);
    fixtureA.releaseInvite();
    await expect.poll(() => state.releasedInvites).toBe(1);
    await expect(page.getByText('OBSOLETE-CODE-FROM-A', { exact: true })).toHaveCount(0);
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('family-callback-account-b.png') });
  } finally {
    fixtureA.releaseInvite();
  }
});

test('a delayed family callback stays bound to its captured family when the same login reloads another family', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The same-login family target acceptance runs in desktop browser profiles.');
  const errors: string[] = [];
  const state: FixtureState = {
    current: accountA,
    familyId: 'family-a-original',
    inviteRequests: 0,
    inviteTargetIds: [],
    releasedInvites: 0,
    shoppingCheckRequests: 0,
    shoppingCheckAccounts: [],
    releasedShoppingChecks: 0,
    personalShoppingListRequests: 0,
    personalShoppingListAccounts: [],
    releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0,
    personalShoppingCheckRequests: 0,
    personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0,
    shoppingAchievements: [],
    memberRequests: 0,
    memberTargetIds: [],
    releasedMembers: 0,
  };
  const fixture = await installAccountApi(page, state, true, errors);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByRole('heading', { name: 'Семья', exact: true })).toBeVisible();
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  await expect(page.getByRole('heading', { name: 'Семья family-a-original', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Создать приглашение', exact: true }).click();
  await expect.poll(() => state.inviteRequests).toBe(1);
  expect(state.inviteTargetIds).toEqual(['family-a-original']);

  state.familyId = 'family-a-next';
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Семья family-a-next', exact: true })).toBeVisible();

  fixture.releaseInvite();
  await expect.poll(() => state.releasedInvites).toBe(1);
  await expect(page.getByText('OBSOLETE-CODE-FROM-A', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Сессия изменилась. Войдите снова и повторите действие.', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
});

test('a delayed family-join response from account A cannot publish success after account B signs in', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The two-tab family-join account-switch acceptance runs in desktop browser profiles.');
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, noFamilyForA: true, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    familyJoinAchievements: [], familyLoadAccounts: [],
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, false, false, false, false, true);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  const joinCode = page.getByPlaceholder('Код приглашения');
  await expect(joinCode).toBeVisible();
  await joinCode.fill('JOIN-CODE-A');
  const accountAFamilyLoads = state.familyLoadAccounts.filter(id => id === accountA.id).length;
  await page.getByRole('button', { name: 'Войти в семью', exact: true }).click();
  await expect.poll(() => state.joinRequests).toBe(1);

  try {
    const accountBPage = await openAccountB(context, state, errorsB);
    expect(await activeAccount(page)).toBe(accountB.id);
    fixtureA.releaseJoin();
    await expect.poll(() => state.releasedJoins).toBe(1);
    await expect(joinCode).toHaveValue('JOIN-CODE-A');
    await expect(accountBPage.getByRole('heading', { name: accountB.name, exact: true })).toBeVisible();
    await page.waitForTimeout(100);
    expect(state.familyLoadAccounts.filter(id => id === accountA.id)).toHaveLength(accountAFamilyLoads);
    expect(state.familyJoinAchievements).toEqual([]);
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('family-join-account-b.png') });
  } finally {
    fixtureA.releaseJoin();
  }
});

test('a delayed family-create response from account A cannot publish success after account B signs in', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The two-tab family-create account-switch acceptance runs in desktop browser profiles.');
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, noFamilyForA: true, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    familyJoinAchievements: [], familyLoadAccounts: [],
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, false, false, false, false, false, true);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  const familyName = page.getByPlaceholder('Название семьи');
  await expect(familyName).toBeVisible();
  await familyName.fill('Семья A');
  const accountAFamilyLoads = state.familyLoadAccounts.filter(id => id === accountA.id).length;
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect.poll(() => state.createRequests).toBe(1);

  try {
    const accountBPage = await openAccountB(context, state, errorsB);
    expect(await activeAccount(page)).toBe(accountB.id);
    fixtureA.releaseCreate();
    await expect.poll(() => state.releasedCreates).toBe(1);
    await expect(familyName).toHaveValue('Семья A');
    await expect(accountBPage.getByRole('heading', { name: accountB.name, exact: true })).toBeVisible();
    await page.waitForTimeout(100);
    expect(state.familyLoadAccounts.filter(id => id === accountA.id)).toHaveLength(accountAFamilyLoads);
    expect(state.familyJoinAchievements).toEqual([]);
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('family-create-account-b.png') });
  } finally {
    fixtureA.releaseCreate();
  }
});

test('a delayed family-context read from account A cannot appear after account B signs in', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The two-tab family-context account-switch acceptance runs in desktop browser profiles.');
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    familyJoinAchievements: [], familyLoadAccounts: [],
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, false, false, false, false, false, false, true);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => state.familyLoadAccounts.filter(id => id === accountA.id).length).toBe(1);

  try {
    const accountBPage = await openAccountB(context, state, errorsB);
    expect(await activeAccount(page)).toBe(accountB.id);
    fixtureA.releaseFamilyContext();
    await expect.poll(() => state.releasedFamilyContexts).toBe(1);
    await page.waitForTimeout(100);
    await expect(page.getByRole('heading', { name: accountA.name, exact: true })).toHaveCount(0);
    await expect(accountBPage.getByRole('heading', { name: accountB.name, exact: true })).toBeVisible();
    expect(state.familyLoadAccounts.filter(id => id === accountA.id)).toHaveLength(1);
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('family-context-account-b.png') });
  } finally {
    fixtureA.releaseFamilyContext();
  }
});

test('a delayed family shopping-list read from account A cannot appear after account B signs in', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The two-tab family-shopping account-switch acceptance runs in desktop browser profiles.');
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    familyJoinAchievements: [], familyLoadAccounts: [], familyShoppingListAccounts: [],
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, false, false, false, false, false, false, false, true);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByRole('heading', { name: accountA.name, exact: true })).toBeVisible();
  await expect.poll(() => state.familyShoppingListAccounts.filter(id => id === accountA.id).length).toBeGreaterThan(0);
  const accountAFamilyShoppingRequests = state.familyShoppingListAccounts.filter(id => id === accountA.id).length;

  try {
    const accountBPage = await openAccountB(context, state, errorsB);
    expect(await activeAccount(page)).toBe(accountB.id);
    fixtureA.releaseFamilyShoppingList();
    await expect.poll(() => state.releasedFamilyShoppingLists).toBeGreaterThanOrEqual(accountAFamilyShoppingRequests);
    await page.waitForTimeout(100);
    await expect(page.getByText('Семейный список A', { exact: false })).toHaveCount(0);
    const refreshB = accountBPage.getByRole('button', { name: 'Обновить список', exact: true });
    await refreshB.click();
    await expect(accountBPage.getByText('Семейный список B', { exact: false })).toBeVisible();
    expect(state.familyShoppingListAccounts.filter(id => id === accountA.id)).toHaveLength(accountAFamilyShoppingRequests);
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('family-shopping-account-b.png') });
  } finally {
    fixtureA.releaseFamilyShoppingList();
  }
});

test('a delayed family shopping response cannot trigger an achievement after another tab signs in as account B', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The two-tab family shopping callback acceptance runs in desktop browser profiles.');
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [],
    memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, true);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByRole('heading', { name: 'Семья', exact: true })).toBeVisible();
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  const accountACheckbox = page.getByRole('checkbox').first();
  await expect(accountACheckbox).toBeVisible();
  await accountACheckbox.check();
  await expect.poll(() => state.shoppingCheckRequests).toBe(1);
  expect(state.shoppingCheckAccounts).toEqual([accountA.id]);

  try {
    const accountBPage = await openAccountB(context, state, errorsB);
    const accountBCheckbox = accountBPage.getByRole('checkbox').first();
    await expect(accountBCheckbox).toBeVisible();
    await expect(accountBCheckbox).not.toBeChecked();
    expect(await activeAccount(page)).toBe(accountB.id);

    fixtureA.releaseShoppingCheck();
    await expect.poll(() => state.releasedShoppingChecks).toBe(1);
    // AchievementClient may coalesce checks for up to 500ms; allow that window before asserting absence.
    await page.waitForTimeout(700);
    expect(state.shoppingAchievements).toEqual([]);
    await expect(accountBCheckbox).not.toBeChecked();
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('family-shopping-account-b.png') });
  } finally {
    fixtureA.releaseShoppingCheck();
  }
});

test('a delayed personal shopping-list read cannot cross the account boundary', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The two-tab personal shopping account-switch acceptance runs in desktop browser profiles.');
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [],
    memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, false, false, true, true);
  await openApp(page, '/#plan');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  await expect(page.locator('#shopping-list')).toBeVisible();
  await expect.poll(() => state.personalShoppingListRequests).toBe(1);
  expect(state.personalShoppingListAccounts).toEqual([accountA.id]);

  try {
    const accountBPage = await openAccountB(context, state, errorsB, true);
    await expect.poll(() => state.personalShoppingListRequests).toBe(2);
    const accountBItem = accountBPage.getByText('Список B', { exact: true });
    await expect(accountBItem).toBeVisible();
    expect(state.personalShoppingListAccounts).toEqual([accountA.id, accountB.id]);

    fixtureA.releasePersonalShoppingList();
    await expect.poll(() => state.releasedPersonalShoppingLists).toBe(1);
    await expect.poll(() => state.rejectedPersonalShoppingLists).toBe(1);
    await expect(accountBItem).toBeVisible();
    await expect(accountBPage.getByText('Список A', { exact: true })).toHaveCount(0);
    await accountBItem.scrollIntoViewIfNeeded();
    await expect(accountBItem).toBeInViewport();
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('personal-shopping-list-account-b.png') });
  } finally {
    fixtureA.releasePersonalShoppingList();
  }
});

test('a delayed personal shopping check from account A is rejected after account B signs in', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The two-tab personal shopping account-switch acceptance runs in desktop browser profiles.');
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [],
    memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, true, false, true);
  await openApp(page, '/#plan');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  const accountACheckbox = page.getByLabel('Список A');
  await expect(accountACheckbox).toBeVisible();
  await accountACheckbox.check();
  await expect.poll(() => state.personalShoppingCheckRequests).toBe(1);
  expect(state.personalShoppingCheckAccounts).toEqual([accountA.id]);

  try {
    const accountBPage = await openAccountB(context, state, errorsB, true);
    const accountBCheckbox = accountBPage.getByLabel('Список B');
    await expect(accountBCheckbox).toBeVisible();
    await expect(accountBCheckbox).not.toBeChecked();
    expect(await activeAccount(page)).toBe(accountB.id);

    fixtureA.releaseShoppingCheck();
    await expect.poll(() => state.releasedShoppingChecks).toBe(1);
    await expect.poll(() => state.rejectedPersonalShoppingChecks).toBe(1);
    await expect(accountBCheckbox).not.toBeChecked();
    await accountBCheckbox.scrollIntoViewIfNeeded();
    await expect(accountBCheckbox).toBeInViewport();
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    expect(state.shoppingAchievements).toEqual([]);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('personal-shopping-check-account-b.png') });
  } finally {
    fixtureA.releaseShoppingCheck();
  }
});

test('a delayed support ticket list from account A cannot appear in account B', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The two-tab support account-switch acceptance runs in desktop browser profiles.');
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    supportListAccounts: [], releasedSupportLists: 0,
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, false, false, false, false, false, false, false, false, true);
  await openApp(page, '/#support');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByRole('heading', { name: 'Мои обращения', exact: true })).toBeVisible();
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  await expect.poll(() => state.supportListAccounts?.length).toBe(1);
  expect(state.supportListAccounts).toEqual([accountA.id]);

  try {
    const accountBPage = await openAccountB(context, state, errorsB, false, 'support');
    expect(state.supportListAccounts).toEqual([accountA.id, accountB.id]);
    const accountBTicket = accountBPage.getByRole('heading', { name: 'Обращение B', exact: true });
    await expect(accountBTicket).toBeVisible();

    fixtureA.releaseSupportList();
    await expect.poll(() => state.releasedSupportLists).toBe(1);
    await expect(accountBTicket).toBeVisible();
    await expect(accountBPage.getByRole('heading', { name: 'Обращение A', exact: true })).toHaveCount(0);
    await accountBTicket.scrollIntoViewIfNeeded();
    await expect(accountBTicket).toBeInViewport();
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('support-account-switch-b.png') });
  } finally {
    fixtureA.releaseSupportList();
  }
});

test('a delayed mobile token from account A is neither shown nor copied after account B signs in', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The two-tab mobile-token account-switch acceptance runs in desktop browser profiles.');
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    mobileTokenAccounts: [], releasedMobileTokens: 0,
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA,
    false, false, false, false, false, false, false, false, false, true);
  await openApp(page, '/#settings');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  const generateButton = page.getByRole('button', { name: 'Сгенерировать token' });
  await expect(generateButton).toBeVisible();
  await generateButton.click();
  await expect.poll(() => state.mobileTokenAccounts?.length).toBe(1);
  expect(state.mobileTokenAccounts).toEqual([accountA.id]);

  try {
    const accountBPage = await openAccountB(context, state, errorsB, false, 'settings');
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    fixtureA.releaseMobileToken();
    await expect.poll(() => state.releasedMobileTokens).toBe(1);

    await expect(page.getByText('account-a-mobile-token-secret', { exact: true })).toHaveCount(0);
    await expect(accountBPage.getByText('account-a-mobile-token-secret', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Mobile token', { exact: true })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() =>
      (window as typeof window & { __fitfocusClipboardWrites?: string[] }).__fitfocusClipboardWrites ?? [])).toEqual([]);
    expect(await activeAccount(page)).toBe(accountB.id);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('mobile-token-account-b.png') });
  } finally {
    fixtureA.releaseMobileToken();
  }
});

test('a delayed family member update stays bound to its captured family after the same login loads another family', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The same-login family target acceptance runs in desktop browser profiles.');
  const errors: string[] = [];
  const state: FixtureState = {
    current: accountA, familyId: 'family-a-original', inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [],
    memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
  };
  const fixture = await installAccountApi(page, state, false, errors, false, true);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByRole('heading', { name: 'Семья', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Семья family-a-original', exact: true })).toBeVisible();

  try {
    await page.getByRole('button', { name: 'Я: похудение', exact: true }).click();
    await expect.poll(() => state.memberRequests).toBe(1);
    expect(state.memberTargetIds).toEqual(['family-a-original']);

    state.familyId = 'family-a-next';
    await page.getByRole('button', { name: 'Обновить', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Семья family-a-next', exact: true })).toBeVisible();
    fixture.releaseMemberUpdate();
    await expect.poll(() => state.releasedMembers).toBe(1);
    await expect(page.getByRole('heading', { name: 'Семья family-a-next', exact: true })).toBeVisible();
    await expect(page.getByText('Сессия изменилась. Войдите снова и повторите действие.', { exact: true })).toHaveCount(0);
    expect(state.memberRequests).toBe(1);
    expect(errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixture.releaseMemberUpdate();
  }
});

test('a delayed family member update from account A cannot affect account B after sign-in', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The two-tab family member account-switch acceptance runs in desktop browser profiles.');
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    familyLoadAccounts: [],
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, false, true);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByRole('heading', { name: accountA.name, exact: true })).toBeVisible();
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  const accountAFamilyLoads = state.familyLoadAccounts.filter(id => id === accountA.id).length;

  await page.getByRole('button', { name: 'Я: похудение', exact: true }).click();
  await expect.poll(() => state.memberRequests).toBe(1);
  expect(state.memberTargetIds).toEqual([`family-${accountA.id}`]);

  try {
    const accountBPage = await openAccountB(context, state, errorsB);
    expect(await activeAccount(page)).toBe(accountB.id);
    const accountBFamilyLoads = state.familyLoadAccounts.filter(id => id === accountB.id).length;

    fixtureA.releaseMemberUpdate();
    await expect.poll(() => state.releasedMembers).toBe(1);
    await expect(accountBPage.getByRole('heading', { name: accountB.name, exact: true })).toBeVisible();
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    expect(state.memberRequests).toBe(1);
    expect(state.memberTargetIds).toEqual([`family-${accountA.id}`]);
    expect(state.familyLoadAccounts.filter(id => id === accountA.id)).toHaveLength(accountAFamilyLoads);
    expect(state.familyLoadAccounts.filter(id => id === accountB.id)).toHaveLength(accountBFamilyLoads);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('family-member-account-b.png') });
  } finally {
    fixtureA.releaseMemberUpdate();
  }
});
