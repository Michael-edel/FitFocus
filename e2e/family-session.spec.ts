import { expect, type Page } from '@playwright/test';
import { test } from './support/mockTest';
import { mockApp, openApp, buildMockProfile } from './support/appHarness';
import { healthy, saved } from './support/familyHarness';
import { navigate } from './support/navigation';
import { planningDay, planningRoster, confirmedConfiguration } from './support/familyPlanningFixture';
import { isFamilyPlanningMenu } from '../domain/familyPlanning';

const account = 'google-e2e-sub', sid = 'a'.repeat(64), familyId = 'family-e2e';
const headers = { 'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid,
  ...Object.fromEntries(['State', 'Profile', 'Bootstrap', 'AI', 'Weekly-Menu', 'Achievements', 'Huawei', 'Push', 'Family', 'Family-Menu'].flatMap(resource =>
    [[`X-FitFocus-${resource}-Protocol`, resource === 'State' ? '2' : '1'], [`X-FitFocus-${resource}-Guard`, '1']])) };
type Mode = 'normal' | 'no-capability' | 'no-target-capability' | 'held-context' | 'held-day-context' | 'held-day-shopping' | 'held-day-purchase' | 'held-invite' | 'purchase-refusal' | 'refresh-on-pageshow';

async function setup(page: Page, mode: Mode = 'normal') {
  await mockApp(page, { session: 'app' });
  const errors: string[] = [], counts = { context: 0, snapshots: 0, invites: 0, profileReads: 0, profiles: 0, purchases: 0, accepted: 0, released: 0, oldWriter: 0 };
  const dates: string[] = [], purchaseDates: string[] = [];
  let active = true, cookieSid = sid, profile = { ...buildMockProfile(), plan: 'family' as const }, refreshed = false, planningAvailable = true;
  let firstDate = '', currentDate = '', configuration = { ...confirmedConfiguration };
  const roster = planningRoster(familyId, account);
  const menus = new Map<string, ReturnType<typeof planningDay>>(), versions = new Map<string, number>();
  const makeDay = (date: string) => planningDay(account, date, 1, refreshed || (currentDate && date === currentDate) ? undefined
    : [{ slot: 'lunch', recipeId: 'chicken-rice-v1', participantShares: { [account]: 1 } }]);
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (mode === 'purchase-refusal' && message.location().url.includes('/api/family/menu/state') && /\b401\b/.test(message.text())) return;
    if (['error', 'warning'].includes(message.type())) errors.push(message.text());
  });
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
    if (path === '/api/me') return json(active ? { user: { sub: account, roles: ['user'] }, hasAccess: true,
      stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: cookieSid },
      ...Object.fromEntries(['bootstrapSync', 'profileSync', 'aiSync', 'weeklyMenuSync', 'achievementSync', 'huaweiSync', 'pushSync'].map(name =>
        [name, { protocol: 1, guard: 1, ...(name === 'profileSync' ? { weeklyMenuProjection: 1 } : {}) }])),
      familyMenuSync: { protocol: 1, guard: 1, cas: 1 }, ...(planningAvailable ? { familyPlanning: { version: 1 } } : {}),
      ...(mode === 'no-capability' ? {} : { familySync: { protocol: 1, guard: 1, ...(mode === 'no-target-capability' ? {} : { target: 1 }) } }) } : { user: null });
    if (path === '/api/bootstrap') return json({ user: { sub: account }, profile, items: [] });
    if (path === '/api/profile') {
      if (request.method() === 'PUT') { const body = request.postDataJSON(); profile = { ...body, version: body.baseVersion + 1 }; }
      return json({ profile, version: profile.version });
    }
    if (path === '/api/state') {
      if (request.method() !== 'GET') expect(request.postDataJSON().items.every((item: { key: string }) => !item.key.includes('_family_menu:'))).toBe(true);
      return json(request.method() === 'GET' ? { items: [] } : { ok: true,
        items: request.postDataJSON().items.map((item: { key: string; baseVersion: number }) => ({ key: item.key, version: item.baseVersion + 1, exists: true })) });
    }
    if (path === '/api/logout') { active = false; return json({ ok: true }); }
    if (path.startsWith('/api/family') || path.startsWith('/api/shopping')) {
      expect(request.headers()['x-fitfocus-state-account']).toBe(account); expect(request.headers()['x-fitfocus-state-session']).toBe(sid);
    }
    if (path === '/api/family') {
      counts.context += 1;
      const name = mode === 'refresh-on-pageshow' && refreshed ? 'Обновлённая семья' : 'Семья с проверенной сессией';
      if (mode === 'held-context' || mode === 'held-day-context') { await held; counts.released += 1; }
      return json({ family: { id: familyId, name, owner_user_id: account }, members: [{ user_id: account, name: 'E2E User', role: 'owner' }] });
    }
    if (path === '/api/family/dining-profiles') { expect(request.method()).toBe('GET'); expect(url.searchParams.get('familyId')).toBe(familyId); return json({ roster }); }
    if (path === '/api/family/dining-profile') {
      if (request.method() === 'PATCH') {
        const body = request.postDataJSON(); expect(body).toMatchObject({ familyId, profileId: account, baseVersion: roster.profiles[0].version, baseRosterVersion: roster.rosterVersion });
        counts.profiles += 1; configuration = body.profile; roster.profiles[0].version += 1; roster.rosterVersion += 1;
        return json({ ok: true, rosterVersion: roster.rosterVersion, profile: { ...roster.profiles[0], configuration } });
      }
      expect(request.method()).toBe('GET'); expect(url.searchParams.get('familyId')).toBe(familyId); expect(url.searchParams.get('profileId')).toBe(account);
      counts.profileReads += 1;
      return json({ profile: { ...roster.profiles[0], configuration } });
    }
    if (path === '/api/family/invite') {
      expect(request.postDataJSON()).toMatchObject({ familyId }); counts.invites += 1;
      if (mode === 'held-invite' && counts.invites === 1) { await held; counts.released += 1; return json({ code: 'OBSOLETE-CODE' }); }
      return json({ code: 'CURRENT-CODE' });
    }
    if (path === '/api/family/menu/state') {
      if (request.method() === 'GET') {
        const date = url.searchParams.get('week')!; expect(url.searchParams.get('familyId')).toBe(familyId);
        dates.push(date); counts.snapshots += 1; if (!firstDate) firstDate = date;
        const menu = refreshed ? makeDay(date) : menus.get(date) ?? makeDay(date), version = refreshed ? 2 : versions.get(date) ?? 1;
        // Capture before holding: callback data cannot borrow a later date or refreshed menu.
        if (mode === 'held-day-shopping' && counts.snapshots === 1) { await held; counts.released += 1; }
        menus.set(date, menu); versions.set(date, version);
        return json({ snapshot: { familyId, weekStart: date, version, menu } });
      }
      expect(request.method()).toBe('PUT'); const body = request.postDataJSON(); counts.purchases += 1; purchaseDates.push(body.weekStart);
      expect(body.familyId).toBe(familyId); expect(body.mutationKind).toBe('purchases');
      expect(isFamilyPlanningMenu(body.menu, body.weekStart)).toBe(true); expect(body.baseVersion).toBe(versions.get(body.weekStart));
      if (mode === 'held-day-purchase') { await held; counts.released += 1; }
      if (mode === 'purchase-refusal') return json({ error: 'STATE_SESSION_CHANGED' }, 401);
      const version = body.baseVersion + 1; menus.set(body.weekStart, body.menu); versions.set(body.weekStart, version); counts.accepted += 1;
      return json({ ok: true, snapshot: { familyId, weekStart: body.weekStart, version, menu: body.menu } });
    }
    if (path === '/api/family/member' || path === '/api/family/menu' || path.startsWith('/api/shopping') || path === '/api/weekly_menu/items') {
      counts.oldWriter += 1; return json({ error: 'OBSOLETE_FAMILY_PATH' }, 409);
    }
    if (path.startsWith('/api/family/') && request.method() !== 'GET') throw new Error(`Unexpected family mutation in session-only scenario: ${path}`);
    return route.fallback();
  });
  await openApp(page, '/#family'); await expect(page).toHaveTitle(/FitFocus/); await expect(page).toHaveURL(/#family$/);
  await expect(page.getByRole('heading', { name: 'Меню семьи', exact: true })).toBeVisible();
  return { errors, counts, release, dates, purchaseDates, menus, versions, firstDate: () => firstDate,
    setCurrentDate: (date: string) => { currentDate = date; }, changeCookie: () => { cookieSid = 'b'.repeat(64); },
    removePlanningCapability: () => { planningAvailable = false; }, refresh: () => { refreshed = true; } };
}
const familyName = (page: Page) => page.getByText('Семья с проверенной сессией', { exact: true });
const invite = (page: Page) => page.getByRole('button', { name: 'Пригласить по коду', exact: true });
const rice = (page: Page) => page.getByRole('checkbox', { name: 'Рис сухой', exact: true });
const oats = (page: Page) => page.getByRole('checkbox', { name: 'Овсяные хлопья', exact: true });
async function ready(page: Page) {
  await expect(familyName(page)).toBeVisible(); await expect(page.getByLabel('Дата меню', { exact: true })).toBeEnabled();
}
function noOldWrites(counts: { oldWriter: number }) { expect(counts.oldWriter).toBe(0); }
async function rollover(page: Page) { await page.clock.setFixedTime(new Date('2026-10-26T12:00:00.000Z')); }

test('family reads, invitation, private profile and purchase CAS use the originating session', async ({ page }, info) => {
  const { errors, counts } = await setup(page); await ready(page);
  await invite(page).click(); await expect(page.getByText('CURRENT-CODE', { exact: true })).toBeVisible(); expect(counts.invites).toBe(1);
  await page.getByRole('button', { name: 'Настроить профиль', exact: true }).click();
  await page.getByLabel('Имя', { exact: true }).fill('Участник с проверенной сессией');
  await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
  await expect.poll(() => counts.profiles).toBe(1); await expect(page.getByText('Профиль сохранён на сервере.', { exact: true })).toBeVisible();
  await navigate(page, 'Покупки'); await expect(rice(page)).toBeVisible();
  // Controlled purchase state changes only after the durable IDB commit, not synchronously in onChange.
  await expect(rice(page)).not.toBeChecked(); await rice(page).click(); await expect(rice(page)).toBeChecked();
  await expect.poll(() => counts.accepted).toBe(1); await expect(rice(page)).toBeChecked();
  noOldWrites(counts); await healthy(page, errors); await page.screenshot({ path: info.outputPath('family-scoped.png') });
});

test('missing family capability prevents family requests and displays a usable error', async ({ page }, info) => {
  const { errors, counts } = await setup(page, 'no-capability');
  await expect(page.getByText('Сервер пока не поддерживает безопасную работу с семьёй. Повторите позже.', { exact: true })).toBeVisible();
  expect(counts.context).toBe(0); expect(counts.invites).toBe(0); expect(counts.profiles).toBe(0); expect(counts.purchases).toBe(0); expect(counts.snapshots).toBe(0);
  noOldWrites(counts); await healthy(page, errors); await page.screenshot({ path: info.outputPath('family-protocol-required.png') });
});

test('missing explicit-family capability blocks invitation; missing planning capability blocks the replacement private-profile path', async ({ page }) => {
  const { errors, counts, removePlanningCapability } = await setup(page, 'no-target-capability'); await ready(page);
  const protocolError = page.getByText('Сервер пока не поддерживает безопасную работу с семьёй. Повторите позже.', { exact: true });
  await invite(page).click(); await expect(protocolError).toBeVisible(); expect(counts.invites).toBe(0);
  // Dining private profiles require familyPlanning, rather than the removed member writer's target flag.
  removePlanningCapability(); await page.getByRole('button', { name: 'Настроить профиль', exact: true }).click();
  await expect(protocolError).toBeVisible(); expect(counts.profileReads).toBe(0); expect(counts.profiles).toBe(0); expect(counts.purchases).toBe(0);
  await expect(page.getByRole('button', { name: 'Сохранить профиль', exact: true })).toHaveCount(0);
  noOldWrites(counts); await healthy(page, errors);
});

test('a purchase refusal preserves the durable local checkbox, pauses delivery and leaves accepted server quantities unchanged', async ({ page }) => {
  const { errors, counts, menus, firstDate } = await setup(page, 'purchase-refusal'); await ready(page); await navigate(page, 'Покупки');
  await expect(rice(page)).toBeVisible(); await expect(rice(page)).not.toBeChecked();
  await rice(page).click(); await expect(rice(page)).toBeChecked(); await expect.poll(() => counts.purchases).toBe(1);
  await expect(rice(page)).toBeChecked(); expect(counts.accepted).toBe(0);
  await expect(page.getByText('Изменения сохранены на устройстве. Войдите в свой аккаунт, чтобы продолжить синхронизацию.', { exact: true })).toBeVisible();
  expect(menus.get(firstDate())!.planningV1.purchasedQuantities.find(item => item.ingredientId === 'rice')!.quantity).toBe(0);
  await expect.poll(async () => (await saved(page)).operations.length).toBe(1);
  expect((await saved(page)).menus[0].menu.planningV1.purchasedQuantities.find((item: { ingredientId: string }) => item.ingredientId === 'rice').quantity).toBeGreaterThan(0);
  noOldWrites(counts); await healthy(page, errors);
});

test('a newer login of the same account cannot receive the old invitation action', async ({ page }) => {
  const { errors, counts, changeCookie } = await setup(page); await ready(page); changeCookie(); await invite(page).click();
  await expect(page.getByText('Сессия изменилась. Войдите снова и повторите действие.', { exact: true })).toBeVisible();
  expect(counts.invites).toBe(0); expect(counts.profiles).toBe(0); expect(counts.purchases).toBe(0); noOldWrites(counts); await healthy(page, errors);
});

test('a held family read cannot restore family UI after logout', async ({ page }) => {
  const { errors, counts, release } = await setup(page, 'held-context');
  try {
    await expect.poll(() => counts.context).toBe(1); await navigate(page, 'Настройки');
    await page.getByRole('button', { name: 'Выйти из аккаунта', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'FitFocus' })).toBeVisible(); release(); await expect.poll(() => counts.released).toBe(1);
    await expect(familyName(page)).toHaveCount(0); expect(counts.snapshots).toBe(0); expect(counts.purchases).toBe(0);
    noOldWrites(counts); await healthy(page, errors);
  } finally { release(); }
});

test('held family context preserves the explicit selected day across a calendar-week rollover', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-19T12:00:00.000Z'));
  const { errors, counts, release, dates } = await setup(page, 'held-day-context');
  try {
    await expect.poll(() => counts.context).toBe(1);
    const initializedDate = () => page.evaluate(() => {
      const key = Object.keys(sessionStorage).find(key => key.startsWith('fitfocus.family-planning.draft.v1:'));
      return key ? JSON.parse(sessionStorage.getItem(key)!).drafts.date as string : null;
    });
    await expect.poll(initializedDate).not.toBeNull(); const selectedDate = await initializedDate();
    await rollover(page); release(); await expect.poll(() => counts.released).toBe(1); await ready(page);
    await expect(page.getByLabel('Дата меню', { exact: true })).toHaveValue(selectedDate!);
    expect(dates.length).toBeGreaterThan(0); expect(dates.every(date => date === selectedDate)).toBe(true); expect(counts.purchases).toBe(0);
    noOldWrites(counts); await healthy(page, errors);
  } finally { release(); }
});

test('held shopping snapshot stays on its selected day and explicit date change loads a separate projection', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-19T12:00:00.000Z'));
  const { errors, counts, release, dates, setCurrentDate } = await setup(page, 'held-day-shopping');
  try {
    await expect.poll(() => counts.snapshots).toBe(1); const selectedDate = await page.getByLabel('Дата меню', { exact: true }).inputValue();
    await rollover(page); release(); await expect.poll(() => counts.released).toBe(1); await ready(page);
    await expect(page.getByLabel('Дата меню', { exact: true })).toHaveValue(selectedDate); expect(dates).toEqual([selectedDate]);
    await navigate(page, 'Покупки'); await expect(rice(page)).toBeVisible();
    const nextDate = '2026-10-26'; expect(nextDate).not.toBe(selectedDate); setCurrentDate(nextDate);
    await navigate(page, 'Меню семьи'); await page.getByLabel('Дата меню', { exact: true }).fill(nextDate);
    await expect.poll(() => dates.includes(nextDate)).toBe(true); await navigate(page, 'Покупки');
    await expect(oats(page)).toBeVisible(); await expect(rice(page)).toHaveCount(0);
    expect(counts.purchases).toBe(0); noOldWrites(counts); await healthy(page, errors);
  } finally { release(); }
});

test('held purchase CAS keeps its original selected day across rollover and never marks the next date bought', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-19T12:00:00.000Z'));
  const { errors, counts, release, purchaseDates, dates, setCurrentDate, menus } = await setup(page, 'held-day-purchase'); await ready(page);
  try {
    const selectedDate = await page.getByLabel('Дата меню', { exact: true }).inputValue(); await navigate(page, 'Покупки');
    await expect(rice(page)).not.toBeChecked(); await rice(page).click(); await expect(rice(page)).toBeChecked();
    await expect.poll(() => counts.purchases).toBe(1); await rollover(page); release(); await expect.poll(() => counts.accepted).toBe(1);
    expect(purchaseDates).toEqual([selectedDate]); await expect(rice(page)).toBeChecked();
    const nextDate = '2026-10-26'; expect(nextDate).not.toBe(selectedDate); setCurrentDate(nextDate);
    await navigate(page, 'Меню семьи'); await expect(page.getByLabel('Дата меню', { exact: true })).toBeEnabled(); await page.getByLabel('Дата меню', { exact: true }).fill(nextDate);
    await expect.poll(() => dates.includes(nextDate)).toBe(true); await navigate(page, 'Покупки');
    await expect(oats(page)).toBeVisible(); await expect(oats(page)).not.toBeChecked(); await expect(rice(page)).toHaveCount(0);
    expect(menus.get(nextDate)?.planningV1.purchasedQuantities.every(item => item.quantity === 0)).toBe(true); expect(purchaseDates).toEqual([selectedDate]);
    await expect(page.getByText('Сессия изменилась. Войдите снова и повторите действие.', { exact: true })).toHaveCount(0);
    noOldWrites(counts); await healthy(page, errors);
  } finally { release(); }
});

test('BFCache return refreshes family context and the canonical shopping snapshot', async ({ page }) => {
  const { errors, counts, refresh } = await setup(page, 'refresh-on-pageshow'); await ready(page); await navigate(page, 'Покупки'); await expect(rice(page)).toBeVisible();
  const beforeContext = counts.context, beforeSnapshots = counts.snapshots; refresh();
  await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
  // Polling unchanged IDB is not equivalent to this required fresh BFCache read.
  await expect.poll(() => counts.context).toBeGreaterThan(beforeContext); await expect.poll(() => counts.snapshots).toBeGreaterThan(beforeSnapshots);
  await expect(oats(page)).toBeVisible(); await expect(rice(page)).toHaveCount(0);
  await navigate(page, 'Меню семьи'); await expect(page.getByText('Обновлённая семья', { exact: true })).toBeVisible();
  expect(counts.purchases).toBe(0); noOldWrites(counts); await healthy(page, errors);
});

test('pagehide cancels the old invitation and pageshow permits a new attempt', async ({ page }) => {
  const { errors, counts, release } = await setup(page, 'held-invite'); await ready(page);
  try {
    await invite(page).click(); await expect.poll(() => counts.invites).toBe(1);
    await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
    release(); await expect.poll(() => counts.released).toBe(1); await expect(page.getByText('OBSOLETE-CODE', { exact: true })).toHaveCount(0);
    await expect(invite(page)).toBeEnabled(); await invite(page).click(); await expect(page.getByText('CURRENT-CODE', { exact: true })).toBeVisible(); expect(counts.invites).toBe(2);
    expect(counts.purchases).toBe(0); noOldWrites(counts); await healthy(page, errors);
  } finally { release(); }
});

test('navigation aborts a held family invitation before pagehide', async ({ page }) => {
  const marker = '__e2e_family_invite_unload__';
  await page.addInitScript(markerKey => {
    const mark = (suffix: string, value: string) => { try { localStorage.setItem(`${markerKey}:${suffix}`, value); } catch { /* Document may be unloading. */ } };
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof Request ? input.url : String(input), location.href);
      if (url.pathname === '/api/family/invite' && init?.signal) { mark('request', 'started'); init.signal.addEventListener('abort', () => mark('signal', 'aborted'), { once: true }); }
      return originalFetch(input, init);
    };
    window.addEventListener('beforeunload', () => mark('beforeunload', 'fired'));
  }, marker);
  const { errors, counts, release } = await setup(page, 'held-invite'); await ready(page);
  try {
    const appOrigin = await page.evaluate(() => location.origin); await invite(page).click(); await expect.poll(() => counts.invites).toBe(1);
    await expect.poll(() => page.evaluate(key => localStorage.getItem(`${key}:request`), marker)).toBe('started');
    await page.goto('about:blank'); release(); await expect.poll(() => counts.released).toBe(1); await page.goto(appOrigin); await expect(page).toHaveTitle(/FitFocus/);
    expect(await page.evaluate(key => ({ request: localStorage.getItem(`${key}:request`), signal: localStorage.getItem(`${key}:signal`), beforeunload: localStorage.getItem(`${key}:beforeunload`) }), marker))
      .toEqual({ request: 'started', signal: 'aborted', beforeunload: 'fired' });
    await expect(page.getByText('OBSOLETE-CODE', { exact: true })).toHaveCount(0); expect(counts.purchases).toBe(0);
    noOldWrites(counts); await healthy(page, errors);
  } finally { release(); }
});
