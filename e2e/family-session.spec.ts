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

async function setup(page: Page, mode: 'normal' | 'no-capability' | 'held-context' | 'held-invite' | 'check-refusal' = 'normal') {
  await mockApp(page, { session: 'app' });
  const errors: string[] = [], counts = { context: 0, invites: 0, checks: 0, released: 0 };
  let active = true, cookieSid = sid, profile = buildMockProfile();
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
      profileSync: { protocol: 1, guard: 1, weeklyMenuProjection: 1 }, achievementSync: { protocol: 1, guard: 1 },
      ...(mode === 'no-capability' ? {} : { familySync: { protocol: 1, guard: 1 } }) } : { user: null });
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
      if (mode === 'held-context') { await held; counts.released += 1; }
      return json({ family: { id: 'family-e2e', name: 'Семья с проверенной сессией', owner_user_id: account },
        members: [{ user_id: account, name: 'E2E User', role: 'owner', goal: 'MAINTAIN' }] });
    }
    if (path === '/api/family/menu') return json({ weekStart: new URL(request.url()).searchParams.get('week'), shared: null, portions: null });
    if (path === '/api/family/invite') {
      counts.invites += 1;
      if (mode === 'held-invite' && counts.invites === 1) { await held; counts.released += 1; return json({ code: 'OBSOLETE-CODE' }); }
      return json({ code: 'CURRENT-CODE' });
    }
    if (path === '/api/shopping/list') return json({ family_id: 'family-e2e', week_start: new URL(request.url()).searchParams.get('week'), items: [{ name: 'Рис', grams: 400, checked: false }] });
    if (path === '/api/shopping/check') {
      counts.checks += 1;
      if (mode === 'check-refusal') return route.fulfill({ status: 401, contentType: 'application/json', headers, body: '{"error":"STATE_SESSION_CHANGED"}' });
      return json({ ok: true });
    }
    return route.fallback();
  });
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/); await expect(page).toHaveURL(/#family$/);
  await expect(page.getByRole('heading', { name: 'Семья', exact: true })).toBeVisible();
  return { errors, counts, release, changeCookie: () => { cookieSid = 'b'.repeat(64); } };
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
