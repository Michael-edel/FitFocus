import { expect, test, type Page } from '@playwright/test';
import { mockApp, openApp, buildMockProfile } from './support/appHarness';
const account = 'google-e2e-sub'; const sid = 'a'.repeat(64);
const key = `fitfocus_data_${account}_profile`;
const profile = { ...buildMockProfile(), id: account, version: 2 };
const scope = { 'X-FitFocus-Profile-Protocol': '1', 'X-FitFocus-Profile-Guard': '1',
  'X-FitFocus-Bootstrap-Protocol': '1', 'X-FitFocus-Bootstrap-Guard': '1',
  'X-FitFocus-State-Protocol': '2', 'X-FitFocus-State-Guard': '1',
  'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid };
async function saved(page: Page) {
  return page.evaluate(async key => {
    const opening = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error); });
    const read = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const tx = db.transaction(['values', 'outbox'], 'readonly');
      const [value, operations] = await Promise.all([read(tx.objectStore('values').get(key)), read(tx.objectStore('outbox').getAll())]);
      return { value: value?.value as string | undefined, operations: operations.filter(op => op.key === key) as Array<{ status: string; resource: string; baseVersion: number; value: string; serverSnapshot?: { version: number } }> };
    } finally { db.close(); }
  }, key);
}
async function setup(page: Page, mode: 'auth' | 'conflict' | 'refresh') {
  const conflict = mode === 'conflict';
  const errors: string[] = []; const mutations: string[] = [];
  const expectedHttpErrors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const injectedStatus = conflict ? 409 : 401;
    if (message.location().url.endsWith('/api/profile')
      && message.text().startsWith('Failed to load resource:') && message.text().includes(`status of ${injectedStatus}`)) {
      expectedHttpErrors.push(message.text());
    } else errors.push(message.text());
  });
  await mockApp(page, { session: 'app' });
  await page.route('**/api/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: scope, body: JSON.stringify(body) });
    if (path === '/api/me') return json({ user: { sub: account, roles: ['user'] }, hasAccess: true,
      stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: sid }, profileSync: { protocol: 1, guard: 1 }, bootstrapSync: { protocol: 1, guard: 1 } });
    if (path === '/api/bootstrap') return json({ user: { sub: account }, profile, items: [] });
    if (path === '/api/profile' && request.method() === 'PUT') {
      mutations.push(request.method());
      const body = request.postDataJSON() as { baseVersion: number };
      expect(request.headers()['x-fitfocus-state-account']).toBe(account);
      expect(request.headers()['x-fitfocus-state-session']).toBe(sid);
      expect(body.baseVersion).toBe(mode === 'refresh' ? 9 : 2);
      if (mode === 'refresh') return json({ profile: { ...body, id: account, version: 10 }, version: 10 });
      return conflict ? json({ error: 'PROFILE_CONFLICT', profile: { ...profile, name: 'Cloud name', version: 8 }, version: 8 }, 409)
        : json({ error: 'UNAUTH' }, 401);
    }
    if (path === '/api/profile') return json({ profile: mode === 'refresh' ? { ...profile, name: 'Cloud refreshed', version: 9 } : profile });
    if (path === '/api/state' && request.method() === 'GET') return json({ items: [] });
    if (path === '/api/state' && request.method() === 'PUT') {
      const body = request.postDataJSON() as { items: Array<{ key: string; baseVersion: number }> };
      return json({ ok: true, items: body.items.map(item => ({ key: item.key, exists: true, version: item.baseVersion + 1 })) });
    }
    return route.fallback();
  });
  return { errors, mutations, expectedHttpErrors };
}
test('profile edits survive reload and a different bootstrap snapshot during an auth pause', async ({ page }, testInfo) => {
  const { errors } = await setup(page, 'auth');
  await openApp(page, '/#settings');
  const name = page.getByPlaceholder('Как к вам обращаться');
  await expect(name).toHaveValue(profile.name);
  expect((await saved(page)).operations).toEqual([]);
  await name.fill('Локальное имя'); await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
  await expect.poll(async () => (await saved(page)).value).toContain('Локальное имя');
  await expect.poll(async () => (await saved(page)).operations[0]?.status).toBe('pending');
  await page.reload(); await expect(name).toHaveValue('Локальное имя');
  expect((await saved(page)).operations).toHaveLength(1);
  await expect(page).toHaveTitle(/FitFocus/); await expect(page).toHaveURL(/#settings$/);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('profile-local-reload.png') });
});
test('a profile conflict retains the local name and never retries against the cloud version', async ({ page }, testInfo) => {
  const { errors, mutations } = await setup(page, 'conflict');
  await openApp(page, '/#settings'); const name = page.getByPlaceholder('Как к вам обращаться');
  await expect(name).toHaveValue(profile.name);
  await name.fill('Моё конфликтующее имя'); await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
  await expect.poll(async () => (await saved(page)).operations[0]?.status).toBe('conflicted');
  expect((await saved(page)).operations[0]?.serverSnapshot?.version).toBe(8);
  await page.reload(); await expect(name).toHaveValue('Моё конфликтующее имя');
  expect(mutations).toEqual(['PUT']); expect((await saved(page)).operations).toHaveLength(1);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('profile-conflict.png') });
});

test('a clean refresh replaces the profile editor and subsequent edits use its observed version', async ({ page }, testInfo) => {
  const { errors, mutations } = await setup(page, 'refresh');
  await openApp(page, '/#settings'); const name = page.getByPlaceholder('Как к вам обращаться');
  await expect(name).toHaveValue(profile.name);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(name).toHaveValue('Cloud refreshed');
  expect((await saved(page)).operations).toEqual([]);
  await name.fill('После обновления'); await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
  await expect.poll(async () => (await saved(page)).value).toContain('После обновления');
  await expect.poll(async () => (await saved(page)).operations).toEqual([]);
  expect(mutations).toEqual(['PUT']); expect(errors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('profile-refreshed.png') });
});

test('a failed profile commit keeps the form dirty and never reports a cloud save', async ({ page }, testInfo) => {
  const { errors, mutations } = await setup(page, 'auth');
  await openApp(page, '/#settings'); const name = page.getByPlaceholder('Как к вам обращаться');
  await expect(name).toHaveValue(profile.name);
  await page.evaluate(key => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      if (this.name === 'outbox' && (args[0] as { key?: string })?.key === key) throw new DOMException('Injected quota failure', 'QuotaExceededError');
      return add.apply(this, args);
    };
  }, key);
  await name.fill('Не потерять черновик');
  const save = page.getByRole('button', { name: 'Сохранить профиль', exact: true }); await save.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить' })).toBeVisible();
  await expect(save).toBeEnabled(); await expect(name).toHaveValue('Не потерять черновик');
  expect((await saved(page)).operations).toEqual([]); expect(JSON.parse((await saved(page)).value!).name).toBe(profile.name);
  expect(mutations).toEqual([]);
  await page.reload(); await expect(name).toHaveValue('Не потерять черновик'); await expect(save).toBeEnabled();
  expect((await saved(page)).operations).toEqual([]); expect(mutations).toEqual([]); expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('profile-quota-draft.png') });
});
