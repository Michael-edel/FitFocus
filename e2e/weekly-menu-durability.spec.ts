import { expect, type Page } from '@playwright/test';
import { test } from './support/mockTest';
import { mockApp, openApp, buildMockProfile } from './support/appHarness';
import type { WeeklyMenu } from '../types';
import { WEEKLY_MENU_GENERATION_ERROR, WEEKLY_MENU_PROFILE_CHANGED, WEEKLY_MENU_SAVE_ERROR } from '../features/ai/useWeeklyMenuGeneration';

const account = 'google-e2e-sub', sid = 'a'.repeat(64), key = `fitfocus_data_${account}_profile`;
const scope = {
  'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid,
  'X-FitFocus-State-Protocol': '2', 'X-FitFocus-State-Guard': '1',
  'X-FitFocus-Profile-Protocol': '1', 'X-FitFocus-Profile-Guard': '1',
  'X-FitFocus-Bootstrap-Protocol': '1', 'X-FitFocus-Bootstrap-Guard': '1',
  'X-FitFocus-AI-Protocol': '1', 'X-FitFocus-AI-Guard': '1',
  'X-FitFocus-Weekly-Menu-Protocol': '1', 'X-FitFocus-Weekly-Menu-Guard': '1',
  'X-FitFocus-Achievements-Protocol': '1', 'X-FitFocus-Achievements-Guard': '1',
};
async function saved(page: Page) {
  return page.evaluate(async key => {
    const opening = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error); });
    try {
      const tx = db.transaction(['values', 'outbox'], 'readonly');
      const transactionComplete = new Promise<void>((resolve, reject) => {
        tx.addEventListener('complete', () => resolve(), { once: true });
        tx.addEventListener('abort', () => reject(tx.error), { once: true });
      });
      const read = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const [value, operations] = await Promise.all([read(tx.objectStore('values').get(key)), read(tx.objectStore('outbox').getAll())]);
      await transactionComplete;
      return { profile: value ? JSON.parse(value.value) as { name: string; aiPlan?: { weeklyMenu?: { days: Array<{ breakfast: string }> } } } : null,
        operations: operations.filter(op => op.key === key && op.type === 'put' && op.value.includes('"weeklyMenu"'))
          .map(op => ({ opId: op.opId as string, status: op.status as string, retryCount: op.retryCount as number })),
        generated: operations.filter(op => op.key === key && op.type === 'put' && op.value.includes('"weeklyMenu"')).length };
    } finally { db.close(); }
  }, key);
}
function gate() { let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; }); return { wait, release: () => release() }; }
async function setup(page: Page, mode: 'normal' | 'held' | 'quota' | 'profile-offline' | 'old-profile-server' = 'normal') {
  const errors: string[] = []; const counts = { ai: 0, items: 0, fulfilled: 0, profileAttempts: 0, profileFailures: 0, profileSuccesses: 0, recovered: 0 };
  const held = gate(), recoveredProfile = gate(); let active = true, cloudAvailable = mode !== 'profile-offline';
  let profile: ReturnType<typeof buildMockProfile> & { version: number; aiPlan: { weeklyMenu?: WeeklyMenu } } = { ...buildMockProfile(), version: 2 };
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', async message => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    if (mode === 'profile-offline' && counts.profileFailures > 0 && new URL(message.location().url, 'http://127.0.0.1').pathname === '/api/profile'
      && message.text().startsWith('Failed to load resource:') && message.text().includes('503')) return;
    if (message.text().startsWith('Weekly AI reporting failed')) {
      const details = await message.args()[1]?.evaluate(value => JSON.stringify(value, (_key, nested) =>
        nested instanceof Error ? { name: nested.name, message: nested.message, stack: nested.stack,
          ...(nested.cause === undefined ? {} : { cause: nested.cause }) } : nested)).catch(() => null);
      errors.push(`${message.text()} ${details ?? ''}`);
      return;
    }
    errors.push(message.text());
  });
  await mockApp(page, { session: 'app' });
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: scope, body: JSON.stringify(body) });
    if (path === '/api/me') return json(active ? { user: { sub: account, roles: ['user'] }, hasAccess: true,
      stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: sid },
      profileSync: { protocol: 1, guard: 1, ...(mode === 'old-profile-server' ? {} : { weeklyMenuProjection: 1 }) },
      bootstrapSync: { protocol: 1, guard: 1 }, aiSync: { protocol: 1, guard: 1 }, weeklyMenuSync: { protocol: 1, guard: 1 },
      achievementSync: { protocol: 1, guard: 1 } } : { user: null });
    if (path === '/api/bootstrap') return json({ user: { sub: account }, profile, items: [] });
    if (path === '/api/logout') { active = false; return json({ ok: true }); }
    if (path === '/api/profile') {
      if (request.method() === 'PUT') {
        counts.profileAttempts += 1;
        expect(request.headers()['x-fitfocus-state-account']).toBe(account);
        expect(request.headers()['x-fitfocus-state-session']).toBe(sid);
        const body = request.postDataJSON();
        if (body.aiPlan?.weeklyMenu) {
          expect((await saved(page)).profile?.aiPlan?.weeklyMenu?.days[0].breakfast).toBe('Проверенная овсянка 200 г');
        }
        if (!cloudAvailable) { counts.profileFailures += 1; return json({ error: 'INJECTED_PROFILE_UNAVAILABLE' }, 503); }
        if (mode === 'profile-offline') { counts.recovered += 1; await recoveredProfile.wait; }
        profile = { ...body, version: body.baseVersion + 1 }; counts.profileSuccesses += 1;
        return json({ profile, version: profile.version });
      }
      return json({ profile });
    }
    if (path === '/api/state' && request.method() === 'GET') return json({ items: [] });
    if (path === '/api/state' && request.method() === 'PUT') return json({ ok: true,
      items: request.postDataJSON().items.map((item: { key: string; baseVersion: number }) => ({ key: item.key, version: item.baseVersion + 1, exists: true })) });
    if (path === '/api/ai' && request.postDataJSON()?.feature === 'weekly_menu') {
      counts.ai += 1;
      expect(request.headers()['x-fitfocus-state-account']).toBe(account);
      expect(request.headers()['x-fitfocus-state-session']).toBe(sid);
      if (mode === 'held') await held.wait;
      await json({ text: JSON.stringify({ days: Array.from({ length: 7 }, () => ({ breakfast: 'Проверенная овсянка 200 г',
        lunch: 'Курица 180 г', dinner: 'Рыба 180 г', snack: 'Йогурт 200 г' })), shoppingListItems: [{ name: 'Овсянка', grams: 1400 }] }) });
      counts.fulfilled += 1; return;
    }
    if (path === '/api/ai' && request.postDataJSON()?.feature === 'wis_text') {
      return json({ text: 'E2E: питание и прогресс остаются в пределах персонального плана.' });
    }
    if (path === '/api/weekly_menu/items') {
      counts.items += 1;
      return json({ error: 'PERSONAL_MENU_PROFILE_REQUIRED' }, 409);
    }
    return route.fallback();
  });
  if (mode === 'quota') await page.addInitScript(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(value: unknown, key?: IDBValidKey) {
      if (this.name === 'outbox' && typeof value === 'object' && value !== null && 'resource' in value && value.resource === 'profile') {
        throw new DOMException('Injected menu quota', 'QuotaExceededError');
      }
      return key === undefined ? add.call(this, value) : add.call(this, value, key);
    };
  });
  await openApp(page, '/#plan'); await expect(page).toHaveTitle(/FitFocus/); await expect(page).toHaveURL(/#plan$/);
  await expect(page.getByRole('button', { name: 'Обновить план', exact: true })).toBeEnabled();
  return { errors, counts, release: held.release, close: () => { active = false; },
    restoreCloud: () => { cloudAvailable = true; }, releaseProfile: recoveredProfile.release, cloudProfile: () => profile };
}
async function generate(page: Page) {
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Обновить план', exact: true }).click();
}
async function settings(page: Page) {
  const button = page.getByRole('button', { name: 'Настройки', exact: true });
  if (!await button.isVisible()) await page.getByRole('button', { name: 'Ещё', exact: true }).click();
  await button.scrollIntoViewIfNeeded(); await expect(button).toBeInViewport();
  await button.click();
  await expect(page.getByPlaceholder('Как к вам обращаться')).toBeVisible();
}
async function healthy(page: Page, errors: string[]) {
  await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([]);
}

test('weekly menu and shopping intent are delivered by one durable scoped profile operation', async ({ page }, info) => {
  const { errors, counts } = await setup(page); await generate(page);
  try {
    await expect.poll(() => counts.profileSuccesses).toBe(1);
  } catch (error) {
    const pageText = (await page.locator('body').innerText()).slice(0, 1_000);
    const local = await saved(page);
    throw new Error(`${error instanceof Error ? error.message : String(error)}\ncounts=${JSON.stringify(counts)}\nerrors=${JSON.stringify(errors)}\nlocal=${JSON.stringify(local)}\npage=${pageText}`);
  }
  await expect.poll(async () => (await saved(page)).generated).toBe(0); expect(counts.items).toBe(0);
  expect((await saved(page)).profile?.aiPlan?.weeklyMenu?.days[0].breakfast).toBe('Проверенная овсянка 200 г');
  expect(counts.ai).toBe(1); await expect(page.getByRole('button', { name: 'Обновить план', exact: true })).toBeEnabled();
  await page.getByText('Меню на неделю', { exact: true }).scrollIntoViewIfNeeded();
  const breakfast = page.getByText(/Проверенная овсянка/).first();
  await breakfast.scrollIntoViewIfNeeded(); await expect(breakfast).toBeInViewport(); await healthy(page, errors);
  await page.screenshot({ path: info.outputPath('weekly-menu-committed.png') });
});
test('weekly menu keeps the original profile after a failed local commit and sends no items', async ({ page }, info) => {
  const { errors, counts } = await setup(page, 'quota'); await generate(page);
  const warning = page.getByText(WEEKLY_MENU_SAVE_ERROR, { exact: true }); await expect(warning).toBeVisible();
  expect((await saved(page)).profile?.aiPlan?.weeklyMenu).toBeUndefined(); expect((await saved(page)).generated).toBe(0);
  expect(counts.ai).toBe(1); expect(counts.items).toBe(0); await healthy(page, errors);
  await warning.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('weekly-menu-quota.png') });
});
test('weekly menu ignores a response after logout without a late profile or items write', async ({ page }, info) => {
  const { errors, counts, release, close } = await setup(page, 'held');
  try {
    await generate(page); await expect.poll(() => counts.ai).toBe(1); await settings(page);
    close(); await page.getByRole('button', { name: 'Выйти из аккаунта', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'FitFocus' })).toBeVisible(); release();
    await expect.poll(() => counts.fulfilled).toBe(1);
    expect((await saved(page)).profile?.aiPlan?.weeklyMenu).toBeUndefined(); expect((await saved(page)).generated).toBe(0);
    expect(counts.items).toBe(0); await healthy(page, errors);
    await page.screenshot({ path: info.outputPath('weekly-menu-logout.png') });
  } finally { release(); }
});
test('weekly menu preserves an independent profile edit made while AI is pending', async ({ page }, info) => {
  const { errors, counts, release } = await setup(page, 'held');
  try {
    await generate(page); await expect.poll(() => counts.ai).toBe(1); await settings(page);
    await page.screenshot({ path: info.outputPath('weekly-menu-settings.png') });
    await page.getByPlaceholder('Как к вам обращаться').fill('Edited while AI');
    await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
    await expect.poll(async () => (await saved(page)).profile?.name).toBe('Edited while AI'); release();
    await expect.poll(() => counts.fulfilled).toBe(1);
    await page.getByRole('button', { name: 'План', exact: true }).click();
    await expect(page.getByText(WEEKLY_MENU_PROFILE_CHANGED, { exact: true })).toBeVisible();
    expect((await saved(page)).profile?.name).toBe('Edited while AI'); expect((await saved(page)).profile?.aiPlan?.weeklyMenu).toBeUndefined();
    expect(counts.items).toBe(0); await healthy(page, errors);
  } finally { release(); }
});
test('weekly menu resumes the same durable profile operation after a cloud failure and reload', async ({ page }, info) => {
  const { errors, counts, restoreCloud, releaseProfile, cloudProfile } = await setup(page, 'profile-offline');
  const failedProfileResponse = page.waitForResponse(response => {
    const request = response.request();
    return new URL(response.url()).pathname === '/api/profile'
      && request.method() === 'PUT'
      && response.status() === 503;
  });
  try {
    await generate(page); await expect.poll(() => counts.profileFailures).toBeGreaterThanOrEqual(1);
    const before = await saved(page); expect(before.profile?.aiPlan?.weeklyMenu?.days).toHaveLength(7);
    expect(before.operations).toHaveLength(1); const opId = before.operations[0].opId;
    expect(cloudProfile().aiPlan?.weeklyMenu).toBeUndefined();
    const response = await failedProfileResponse;
    await response.finished();
    await page.reload();
    await expect.poll(async () => (await saved(page)).profile?.aiPlan?.weeklyMenu?.days.length).toBe(7);
    expect((await saved(page)).operations.map(op => op.opId)).toEqual([opId]);
    restoreCloud(); await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => counts.recovered, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
    expect((await saved(page)).operations.map(op => op.opId)).toEqual([opId]); releaseProfile();
    await expect.poll(() => counts.profileSuccesses).toBe(1);
    await expect.poll(async () => (await saved(page)).generated).toBe(0);
    expect(cloudProfile().aiPlan?.weeklyMenu?.days).toHaveLength(7); expect(counts.items).toBe(0);
    const breakfast = page.getByText(/Проверенная овсянка/).first();
    await breakfast.scrollIntoViewIfNeeded(); await expect(breakfast).toBeInViewport(); await healthy(page, errors);
    await page.screenshot({ path: info.outputPath('weekly-menu-recovered.png') });
  } finally { releaseProfile(); }
});

test('weekly menu refuses generation before AI when the profile projection capability is missing', async ({ page }, info) => {
  const { errors, counts } = await setup(page, 'old-profile-server'); await generate(page);
  const warning = page.getByText(WEEKLY_MENU_GENERATION_ERROR, { exact: true }); await expect(warning).toBeVisible();
  expect(counts.ai).toBe(0); expect(counts.items).toBe(0); expect(counts.profileAttempts).toBe(0);
  expect((await saved(page)).profile?.aiPlan?.weeklyMenu).toBeUndefined(); expect((await saved(page)).generated).toBe(0);
  await expect(page.getByRole('button', { name: 'Обновить план', exact: true })).toBeEnabled(); await healthy(page, errors);
  await warning.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('weekly-menu-protocol-required.png') });
});

test('weekly menu starts a fresh attempt after pagehide/pageshow and ignores the previous response', async ({ page }) => {
  const { errors, counts, release } = await setup(page, 'held');
  try {
    await generate(page); await expect.poll(() => counts.ai).toBe(1);
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    await expect(page.getByRole('button', { name: 'Обновить план', exact: true })).toBeEnabled();
    await generate(page); await expect.poll(() => counts.ai).toBe(2); release();
    await expect.poll(() => counts.fulfilled).toBe(2); await expect.poll(() => counts.profileSuccesses).toBe(1); expect(counts.items).toBe(0);
    expect((await saved(page)).profile?.aiPlan?.weeklyMenu?.days).toHaveLength(7);
    await expect(page.getByRole('button', { name: 'Обновить план', exact: true })).toBeEnabled();
    await healthy(page, errors);
  } finally { release(); }
});

test('weekly menu clears loading after a timeout and lets the user generate again', async ({ page }, info) => {
  const { errors, counts, release } = await setup(page, 'held');
  try {
    await generate(page); await expect.poll(() => counts.ai).toBe(1);
    const warning = page.getByText(WEEKLY_MENU_GENERATION_ERROR, { exact: true });
    await expect(warning).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Обновить план', exact: true })).toBeEnabled();
    expect((await saved(page)).profile?.aiPlan?.weeklyMenu).toBeUndefined(); expect(counts.items).toBe(0);
    await warning.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('weekly-menu-timeout.png') });
    release(); await expect.poll(() => counts.fulfilled).toBe(1);
    await generate(page); await expect.poll(() => counts.profileSuccesses).toBe(1); expect(counts.items).toBe(0);
    expect(counts.ai).toBe(2); expect((await saved(page)).profile?.aiPlan?.weeklyMenu?.days).toHaveLength(7);
    await expect(warning).toHaveCount(0); await healthy(page, errors);
  } finally { release(); }
});
