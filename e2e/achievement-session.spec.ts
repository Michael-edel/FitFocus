import { navigate } from './support/navigation';
import { expect, type Page } from '@playwright/test';
import { test } from './support/mockTest';
import { mockApp, openApp, buildMockProfile } from './support/appHarness';

const account = 'google-e2e-sub', sid = 'a'.repeat(64);
const scope = {
  'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid,
  'X-FitFocus-State-Protocol': '2', 'X-FitFocus-State-Guard': '1',
  'X-FitFocus-Profile-Protocol': '1', 'X-FitFocus-Profile-Guard': '1',
  'X-FitFocus-Bootstrap-Protocol': '1', 'X-FitFocus-Bootstrap-Guard': '1',
  'X-FitFocus-AI-Protocol': '1', 'X-FitFocus-AI-Guard': '1',
  'X-FitFocus-Weekly-Menu-Protocol': '1', 'X-FitFocus-Weekly-Menu-Guard': '1',
  'X-FitFocus-Achievements-Protocol': '1', 'X-FitFocus-Achievements-Guard': '1',
};
const achievement = (key: string, title: string) => ({ key, title, description: 'Подтверждённое действие', tier: 'bronze', category: 'profile', unlocked_at: 123 });
const menuAchievement = achievement('weekly_menu', 'Проверенное меню');
const restoredAchievement = achievement('restored', 'Текущая сессия');

async function setup(page: Page, mode: 'normal' | 'held-read' | 'held-check') {
  const errors: string[] = []; const counts = { reads: 0, menuChecks: 0, released: 0 };
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  let active = true, restored = false, profile = buildMockProfile();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
  await mockApp(page, { session: 'app' });
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const json = (body: unknown) => route.fulfill({ contentType: 'application/json', headers: scope, body: JSON.stringify(body) });
    if (path === '/api/me') return json(active ? { user: { sub: account, roles: ['user'] }, hasAccess: true,
      stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: sid }, bootstrapSync: { protocol: 1, guard: 1 },
      profileSync: { protocol: 1, guard: 1, weeklyMenuProjection: 1 }, aiSync: { protocol: 1, guard: 1 }, weeklyMenuSync: { protocol: 1, guard: 1 },
      achievementSync: { protocol: 1, guard: 1 } } : { user: null });
    if (path === '/api/bootstrap') return json({ user: { sub: account }, profile, items: [] });
    if (path === '/api/state') return json(request.method() === 'GET' ? { items: [] } : { ok: true,
      items: request.postDataJSON().items.map((item: { key: string; baseVersion: number }) => ({ key: item.key, version: item.baseVersion + 1, exists: true })) });
    if (path === '/api/profile') {
      if (request.method() === 'PUT') { const body = request.postDataJSON(); profile = { ...body, version: body.baseVersion + 1 }; }
      return json({ profile, version: profile.version });
    }
    if (path === '/api/logout') { active = false; return json({ ok: true }); }
    if (path === '/api/achievements' || path === '/api/achievements/check') {
      expect(request.headers()['x-fitfocus-state-account']).toBe(account);
      expect(request.headers()['x-fitfocus-state-session']).toBe(sid);
      if (request.method() === 'GET') {
        counts.reads += 1;
        if (mode === 'held-read') { await held; counts.released += 1; }
        return json({ enabled: true, catalog: [restoredAchievement, menuAchievement], unlocked: restored ? [restoredAchievement] : [] });
      }
      const context = request.postDataJSON().context;
      if (context.source === 'weekly_menu_generated') {
        counts.menuChecks += 1; expect(context.hasWeeklyMenu).toBe(true);
        if (mode === 'held-check') { await held; counts.released += 1; }
        return json({ enabled: true, newlyUnlocked: [menuAchievement] });
      }
      return json({ enabled: true, newlyUnlocked: [] });
    }
    if (path === '/api/ai') return json({ text: JSON.stringify({ days: Array.from({ length: 7 }, () => ({ breakfast: 'Овсянка 200 г',
      lunch: 'Курица 180 г', dinner: 'Рыба 180 г', snack: 'Йогурт 200 г' })), shoppingListItems: [] }) });
    if (path === '/api/weekly_menu/items') return json({ ok: true });
    return route.fallback();
  });
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/); await expect(page).toHaveURL(/#dashboard$/);
  await expect(page.getByRole('heading', { name: 'Прогресс действий', exact: true })).toBeVisible();
  return { errors, counts, release, restore: () => { restored = true; } };
}

async function generate(page: Page) {
  await navigate(page, 'План'); page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Обновить план', exact: true }).click();
}
async function healthy(page: Page, errors: string[]) {
  await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([]);
}

test('achievement load and menu unlock use the original scoped session', async ({ page }, info) => {
  const { counts, errors } = await setup(page, 'normal');
  await expect(page.getByText('Открыто 0 из 2', { exact: true })).toBeVisible();
  await generate(page); await expect.poll(() => counts.menuChecks).toBe(1);
  await navigate(page, 'Обзор');
  await expect(page.getByText('Открыто 1 из 2', { exact: true })).toBeVisible();
  await expect(page.getByText('Новое достижение', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть уведомление', exact: true }).click();
  await expect(page.getByText('Новое достижение', { exact: true })).toHaveCount(0);
  const panel = page.getByRole('heading', { name: 'Прогресс действий', exact: true }); await panel.scrollIntoViewIfNeeded();
  await healthy(page, errors); await page.screenshot({ path: info.outputPath('achievement-unlocked.png') });
});

test('a held achievement read cannot restore old account UI after logout', async ({ page }, info) => {
  const { counts, errors, release } = await setup(page, 'held-read');
  try {
    await expect.poll(() => counts.reads).toBe(1); await navigate(page, 'Настройки');
    await page.getByRole('button', { name: 'Выйти из аккаунта', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'FitFocus' })).toBeVisible(); release();
    await expect.poll(() => counts.released).toBe(1);
    await expect(page.getByRole('heading', { name: 'Прогресс действий' })).toHaveCount(0);
    await healthy(page, errors); await page.screenshot({ path: info.outputPath('achievement-read-logout.png') });
  } finally { release(); }
});

test('pagehide drops a held unlock and pageshow starts a new achievement client', async ({ page }, info) => {
  const { counts, errors, release, restore } = await setup(page, 'held-check');
  try {
    await expect(page.getByText('Открыто 0 из 2', { exact: true })).toBeVisible();
    await generate(page); await expect.poll(() => counts.menuChecks).toBe(1);
    const reads = counts.reads; restore();
    await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
    await expect.poll(() => counts.reads).toBeGreaterThan(reads);
    release(); await expect.poll(() => counts.released).toBe(1);
    await navigate(page, 'Обзор');
    await expect(page.getByText('Открыто 1 из 2', { exact: true })).toBeVisible();
    await expect(page.getByText('Новое достижение', { exact: true })).toHaveCount(0);
    await healthy(page, errors); await page.screenshot({ path: info.outputPath('achievement-new-page-lifetime.png') });
  } finally { release(); }
});
