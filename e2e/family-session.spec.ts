import { expect, type Page } from '@playwright/test';
import { test } from './support/mockTest';
import { mockApp, openApp, buildMockProfile } from './support/appHarness';

const account = 'google-e2e-sub', sid = 'a'.repeat(64);
const headers = { 'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid,
  'X-FitFocus-State-Protocol': '2', 'X-FitFocus-State-Guard': '1',
  'X-FitFocus-Profile-Protocol': '1', 'X-FitFocus-Profile-Guard': '1',
  'X-FitFocus-Bootstrap-Protocol': '1', 'X-FitFocus-Bootstrap-Guard': '1',
  'X-FitFocus-Achievements-Protocol': '1', 'X-FitFocus-Achievements-Guard': '1',
  'X-FitFocus-Family-Protocol': '1', 'X-FitFocus-Family-Guard': '1' };

async function setup(page: Page, mode: 'normal' | 'no-capability' | 'no-target-capability' | 'held-context' | 'held-week-context' | 'held-week-shopping' | 'held-week-check' | 'held-invite' | 'check-refusal' | 'refresh-on-pageshow' = 'normal') {
  await mockApp(page, { session: 'app' });
  const errors: string[] = [], counts = { context: 0, shopping: 0, invites: 0, members: 0, checks: 0, released: 0 };
  const familyWeeks: string[] = [], shoppingWeeks: string[] = [], shoppingCheckWeeks: string[] = [];
  let currentWeekForMock = '';
  let active = true, cookieSid = sid, profile = buildMockProfile();
  let refreshed = false;
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (mode === 'check-refusal' && message.location().url.includes('/api/shopping/check') && /\b401\b/.test(message.text())) return;
    if (['error', 'warning'].includes(message.type())) errors.push(message.text());
  });
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const json = (body: unknown) => route.fulfill({ contentType: 'application/json', headers, body: JSON.stringify(body) });
    if (path === '/api/me') return json(active ? { user: { sub: account, roles: ['user'] }, hasAccess: true,
      stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: cookieSid }, bootstrapSync: { protocol: 1, guard: 1 },
      profileSync: { protocol: 1, guard: 1, weeklyMenuProjection: 1 }, aiSync: { protocol: 1, guard: 1 }, weeklyMenuSync: { protocol: 1, guard: 1 }, achievementSync: { protocol: 1, guard: 1 }, huaweiSync: { protocol: 1, guard: 1 }, pushSync: { protocol: 1, guard: 1 },
      ...(mode === 'no-capability' ? {} : { familySync: { protocol: 1, guard: 1, ...(mode === 'no-target-capability' ? {} : { target: 1 }) } }) } : { user: null });
    if (path === '/api/bootstrap') return json({ user: { sub: account }, profile, items: [] });
    if (path === '/api/profile') {
      if (request.method() === 'PUT') { const body = request.postDataJSON(); profile = { ...body, version: body.baseVersion + 1 }; }
      return json({ profile, version: profile.version });
    }
    if (path === '/api/state') return json(request.method() === 'GET' ? { items: [] } : { ok: true,
      items: request.postDataJSON().items.map((item: { key: string; baseVersion: number }) => ({ key: item.key, version: item.baseVersion + 1, exists: true })) });
    if (path === '/api/logout') { active = false; return json({ ok: true }); }
    if (path.startsWith('/api/family') || path.startsWith('/api/shopping')) {
      expect(request.headers()['x-fitfocus-state-account']).toBe(account);
      expect(request.headers()['x-fitfocus-state-session']).toBe(sid);
    }
    if (path === '/api/family') {
      counts.context += 1;
      const name = mode === 'held-week-context'
        ? currentWeekForMock ? 'Семья новой недели' : 'Семья старой недели'
        : mode === 'refresh-on-pageshow' && refreshed ? 'Обновлённая семья' : 'Семья с проверенной сессией';
      if (mode === 'held-context' || mode === 'held-week-context' && !currentWeekForMock) { await held; counts.released += 1; }
      return json({ family: { id: 'family-e2e', name, owner_user_id: account },
        members: [{ user_id: account, name: 'E2E User', role: 'owner', goal: 'MAINTAIN' }] });
    }
    if (path === '/api/family/menu') {
      const week = new URL(request.url()).searchParams.get('week') ?? '';
      familyWeeks.push(week);
      return json({ weekStart: week, shared: null, portions: null });
    }
    if (path === '/api/family/invite') {
      expect(request.postDataJSON()).toMatchObject({ familyId: 'family-e2e' });
      counts.invites += 1;
      if (mode === 'held-invite' && counts.invites === 1) { await held; counts.released += 1; return json({ code: 'OBSOLETE-CODE' }); }
      return json({ code: 'CURRENT-CODE' });
    }
    if (path === '/api/family/member') {
      expect(request.postDataJSON()).toMatchObject({ familyId: 'family-e2e' });
      counts.members += 1;
      return json({ ok: true });
    }
    if (path === '/api/shopping/list') {
      counts.shopping += 1;
      const week = new URL(request.url()).searchParams.get('week') ?? '';
      shoppingWeeks.push(week);
      const item = mode === 'held-week-shopping'
        ? week === currentWeekForMock ? 'Овсянка новой недели' : 'Рис старой недели'
        : mode === 'held-week-check'
          ? week === currentWeekForMock ? 'Овсянка новой недели' : 'Рис старой недели'
        : mode === 'refresh-on-pageshow' && refreshed ? 'Овсянка' : 'Рис';
      if (mode === 'held-week-shopping' && week !== currentWeekForMock) { await held; counts.released += 1; }
      return json({ family_id: 'family-e2e', week_start: week, items: [{ name: item, grams: 400, checked: false }] });
    }
    if (path === '/api/shopping/check') {
      counts.checks += 1;
      const body = request.postDataJSON() as { week_start?: string };
      shoppingCheckWeeks.push(body.week_start ?? '');
      if (mode === 'held-week-check') { await held; counts.released += 1; }
      if (mode === 'check-refusal') return route.fulfill({ status: 401, contentType: 'application/json', headers, body: '{"error":"STATE_SESSION_CHANGED"}' });
      return json({ ok: true });
    }
    return route.fallback();
  });
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/); await expect(page).toHaveURL(/#family$/);
  await expect(page.getByRole('heading', { name: 'Семья', exact: true })).toBeVisible();
  return { errors, counts, release, familyWeeks, shoppingWeeks, shoppingCheckWeeks,
    setCurrentWeekForMock: (week: string) => { currentWeekForMock = week; },
    changeCookie: () => { cookieSid = 'b'.repeat(64); }, refresh: () => { refreshed = true; } };
}
async function healthy(page: Page, errors: string[]) {
  await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([]);
}
async function navigate(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true });
  if (!await button.isVisible()) await page.getByRole('button', { name: 'Ещё', exact: true }).click();
  await button.scrollIntoViewIfNeeded(); await button.click();
}

test('family reads, invitation and shopping check use the originating session', async ({ page }, info) => {
  const { errors, counts } = await setup(page);
  await expect(page.getByText('Семья с проверенной сессией', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Создать приглашение', exact: true }).click();
  await expect(page.getByText('CURRENT-CODE', { exact: true })).toBeVisible(); expect(counts.invites).toBe(1);
  await page.getByRole('button', { name: 'Я: похудение', exact: true }).click();
  await expect.poll(() => counts.members).toBe(1);
  const checkbox = page.getByRole('checkbox'); await expect(checkbox).toBeVisible(); await checkbox.check();
  await expect.poll(() => counts.checks).toBe(1); await expect(checkbox).toBeChecked();
  await healthy(page, errors); await page.screenshot({ path: info.outputPath('family-scoped.png') });
});
test('missing family capability prevents family requests and displays a usable error', async ({ page }, info) => {
  const { errors, counts } = await setup(page, 'no-capability');
  await expect(page.getByText('Сервер пока не поддерживает безопасную работу с семьёй. Повторите позже.', { exact: true })).toBeVisible();
  expect(counts.context).toBe(0); expect(counts.invites).toBe(0);
  await healthy(page, errors); await page.screenshot({ path: info.outputPath('family-protocol-required.png') });
});
test('missing explicit-family capability prevents invite and member mutations', async ({ page }) => {
  const { errors, counts } = await setup(page, 'no-target-capability');
  await expect(page.getByText('Семья с проверенной сессией', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Создать приглашение', exact: true }).click();
  await expect(page.getByText('Сервер пока не поддерживает безопасную работу с семьёй. Повторите позже.', { exact: true })).toBeVisible();
  expect(counts.invites).toBe(0);
  await page.getByRole('button', { name: 'Я: похудение', exact: true }).click();
  await expect(page.getByText('Сервер пока не поддерживает безопасную работу с семьёй. Повторите позже.', { exact: true })).toBeVisible();
  expect(counts.members).toBe(0);
  await healthy(page, errors);
});
test('a shopping refusal restores the previous checkbox and displays an error', async ({ page }) => {
  const { errors, counts } = await setup(page, 'check-refusal');
  const checkbox = page.getByRole('checkbox'); await expect(checkbox).toBeVisible(); await checkbox.check();
  await expect.poll(() => counts.checks).toBe(1); await expect(checkbox).not.toBeChecked();
  await expect(page.getByText('Сессия изменилась. Войдите снова и повторите действие.', { exact: true })).toBeVisible();
  await healthy(page, errors);
});
test('a newer login of the same account cannot receive the old invitation action', async ({ page }) => {
  const { errors, counts, changeCookie } = await setup(page);
  await expect(page.getByText('Семья с проверенной сессией', { exact: true })).toBeVisible(); changeCookie();
  await page.getByRole('button', { name: 'Создать приглашение', exact: true }).click();
  await expect(page.getByText('Сессия изменилась. Войдите снова и повторите действие.', { exact: true })).toBeVisible();
  expect(counts.invites).toBe(0); await healthy(page, errors);
});
test('a held family read cannot restore family UI after logout', async ({ page }) => {
  const { errors, counts, release } = await setup(page, 'held-context');
  try {
    await expect.poll(() => counts.context).toBe(1); await navigate(page, 'Настройки');
    await page.getByRole('button', { name: 'Выйти из аккаунта', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'FitFocus' })).toBeVisible(); release();
    await expect.poll(() => counts.released).toBe(1);
    await expect(page.getByText('Семья с проверенной сессией', { exact: true })).toHaveCount(0); await healthy(page, errors);
  } finally { release(); }
});
test('a family context response from the previous week is discarded and reloaded', async ({ page }) => {
  const initialTime = new Date('2026-10-19T12:00:00.000Z');
  await page.clock.setFixedTime(initialTime);
  const { errors, counts, release, familyWeeks, setCurrentWeekForMock } = await setup(page, 'held-week-context');
  try {
    await expect.poll(() => counts.context).toBeGreaterThan(0);
    const previousWeek = await page.evaluate(() => {
      const date = new Date(); date.setHours(0, 0, 0, 0);
      const day = date.getDay(); date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    });
    await page.clock.setFixedTime(new Date(initialTime.getTime() + 7 * 24 * 60 * 60 * 1000));
    const currentWeek = await page.evaluate(() => {
      const date = new Date(); date.setHours(0, 0, 0, 0);
      const day = date.getDay(); date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    });
    expect(currentWeek).not.toBe(previousWeek);
    setCurrentWeekForMock(currentWeek);
    release();
    await expect(page.getByText('Семья новой недели', { exact: true })).toBeVisible();
    await expect(page.getByText('Семья старой недели', { exact: true })).toHaveCount(0);
    expect(familyWeeks).toContain(previousWeek);
    expect(familyWeeks).toContain(currentWeek);
    await healthy(page, errors);
  } finally { release(); }
});
test('a family shopping response from the previous week is discarded and reloaded', async ({ page }) => {
  const initialTime = new Date('2026-10-19T12:00:00.000Z');
  await page.clock.setFixedTime(initialTime);
  const { errors, counts, release, shoppingWeeks, setCurrentWeekForMock } = await setup(page, 'held-week-shopping');
  try {
    await expect.poll(() => counts.shopping).toBeGreaterThan(0);
    const previousWeek = await page.evaluate(() => {
      const date = new Date(); date.setHours(0, 0, 0, 0);
      const day = date.getDay(); date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    });
    await page.clock.setFixedTime(new Date(initialTime.getTime() + 7 * 24 * 60 * 60 * 1000));
    const currentWeek = await page.evaluate(() => {
      const date = new Date(); date.setHours(0, 0, 0, 0);
      const day = date.getDay(); date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    });
    expect(currentWeek).not.toBe(previousWeek);
    setCurrentWeekForMock(currentWeek);
    release();
    await expect(page.getByRole('checkbox', { name: /Овсянка новой недели/ })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Рис старой недели/ })).toHaveCount(0);
    expect(shoppingWeeks).toContain(previousWeek);
    expect(shoppingWeeks).toContain(currentWeek);
    await healthy(page, errors);
  } finally { release(); }
});
test('a family shopping check stays on its original week and refreshes the current list', async ({ page }) => {
  const initialTime = new Date('2026-10-19T12:00:00.000Z');
  await page.clock.setFixedTime(initialTime);
  const { errors, counts, release, shoppingWeeks, shoppingCheckWeeks, setCurrentWeekForMock } = await setup(page, 'held-week-check');
  try {
    const oldItem = page.getByRole('checkbox', { name: /Рис старой недели/ });
    await expect(oldItem).toBeVisible();
    await oldItem.check();
    await expect.poll(() => counts.checks).toBe(1);
    const previousWeek = await page.evaluate(() => {
      const date = new Date(); date.setHours(0, 0, 0, 0);
      const day = date.getDay(); date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    });
    await page.clock.setFixedTime(new Date(initialTime.getTime() + 7 * 24 * 60 * 60 * 1000));
    const currentWeek = await page.evaluate(() => {
      const date = new Date(); date.setHours(0, 0, 0, 0);
      const day = date.getDay(); date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    });
    expect(currentWeek).not.toBe(previousWeek);
    setCurrentWeekForMock(currentWeek);
    release();
    await expect(page.getByRole('checkbox', { name: /Овсянка новой недели/ })).toBeVisible();
    await expect(oldItem).toHaveCount(0);
    expect(shoppingCheckWeeks).toEqual([previousWeek]);
    expect(shoppingWeeks).toContain(currentWeek);
    await expect(page.getByText('Сессия изменилась. Войдите снова и повторите действие.', { exact: true })).toHaveCount(0);
    await healthy(page, errors);
  } finally { release(); }
});
test('BFCache return refreshes the family and shopping snapshots', async ({ page }) => {
  const { errors, counts, refresh } = await setup(page, 'refresh-on-pageshow');
  await expect(page.getByText('Семья с проверенной сессией', { exact: true })).toBeVisible();
  await expect.poll(() => counts.shopping).toBeGreaterThan(0);
  await expect(page.getByRole('checkbox', { name: /Рис/ })).toBeVisible();
  const initialContextRequests = counts.context;
  const initialShoppingRequests = counts.shopping;
  refresh();

  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });

  await expect.poll(() => counts.context).toBeGreaterThan(initialContextRequests);
  await expect.poll(() => counts.shopping).toBeGreaterThan(initialShoppingRequests);
  await expect(page.getByText('Обновлённая семья', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Овсянка/ })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Рис/ })).toHaveCount(0);
  await healthy(page, errors);
});
test('pagehide cancels the old invitation and pageshow permits a new attempt', async ({ page }) => {
  const { errors, counts, release } = await setup(page, 'held-invite');
  try {
    await expect(page.getByText('Семья с проверенной сессией', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Создать приглашение', exact: true }).click(); await expect.poll(() => counts.invites).toBe(1);
    await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
    release(); await expect.poll(() => counts.released).toBe(1); await expect(page.getByText('OBSOLETE-CODE', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Создать приглашение', exact: true }).click();
    await expect(page.getByText('CURRENT-CODE', { exact: true })).toBeVisible(); expect(counts.invites).toBe(2); await healthy(page, errors);
  } finally { release(); }
});
