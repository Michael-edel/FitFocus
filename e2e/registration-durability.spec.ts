import { expect, test, type Page } from '@playwright/test';
import { buildMockProfile, mockApp, openApp } from './support/appHarness';
const account = 'google-e2e-sub'; const sid = 'a'.repeat(64); const key = `fitfocus_data_${account}_profile`;
const scope = { 'X-FitFocus-State-Protocol': '2', 'X-FitFocus-State-Guard': '1',
  'X-FitFocus-Bootstrap-Protocol': '1', 'X-FitFocus-Bootstrap-Guard': '1',
  'X-FitFocus-Profile-Protocol': '1', 'X-FitFocus-Profile-Guard': '1',
  'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid };
async function saved(page: Page) {
  return page.evaluate(async key => {
    const opening = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error); });
    const read = <T,>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try {
      const tx = db.transaction(['values', 'outbox', 'outbox_meta'], 'readonly');
      const [value, operations, session] = await Promise.all([read(tx.objectStore('values').get(key)),
        read(tx.objectStore('outbox').getAll()), read(tx.objectStore('outbox_meta').get('active-session'))]);
      return { value: value ? JSON.parse(value.value) as { id: string; aiPlan?: { title: string } } : null,
        pause: (session as { pause?: string } | undefined)?.pause,
        operations: operations.filter(op => op.key === key) as Array<{ resource: string; status: string; baseVersion: number }> };
    } finally { db.close(); }
  }, key);
}
async function setup(page: Page) {
  const errors: string[] = []; const requests = { ai: 0, profile: 0 };
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    if (message.location().url.endsWith('/api/profile') && message.text().startsWith('Failed to load resource:') && message.text().includes('status of 401')) return;
    errors.push(message.text());
  });
  await mockApp(page, { session: 'app' });
  await page.route('**/api/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: scope, body: JSON.stringify(body) });
    if (path === '/api/me') return json({ user: { sub: account, name: 'Registration owner', email: 'e2e@example.com' }, hasAccess: true,
      stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: sid }, profileSync: { protocol: 1, guard: 1, weeklyMenuProjection: 1 }, bootstrapSync: { protocol: 1, guard: 1 } });
    if (path === '/api/bootstrap' || path === '/api/profile' && request.method() === 'GET') return json({ user: { sub: account }, profile: null, items: [] });
    if (path === '/api/ai' && request.postDataJSON()?.feature === 'personal_plan') {
      requests.ai += 1;
      expect((await saved(page)).value?.id).toBe(account); expect(requests.profile).toBe(0);
      return json({ text: JSON.stringify(buildMockProfile().aiPlan) });
    }
    if (path === '/api/profile' && request.method() === 'PUT') {
      requests.profile += 1;
      expect(request.headers()['x-fitfocus-state-account']).toBe(account); expect(request.headers()['x-fitfocus-state-session']).toBe(sid);
      expect(request.postDataJSON().baseVersion).toBe(0); expect(request.postDataJSON().id).toBe(account);
      return json({ error: 'UNAUTH' }, 401);
    }
    if (path === '/api/state' && request.method() === 'GET') return json({ items: [] });
    return route.fallback();
  });
  return { errors, requests };
}

test('registration is durable before AI and reload restores it without an OAuth marker during auth pause', async ({ page }, info) => {
  const { errors, requests } = await setup(page);
  await openApp(page, '/?auth=google#plan'); await expect(page).toHaveTitle(/FitFocus/);
  const create = page.getByRole('button', { name: 'Создать AI-план' }); await expect(create).toBeVisible(); await create.click();
  await expect(page.getByText(/Ваш AI/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('AI Инициализация')).toHaveCount(0);
  // Auto-sync may obtain a new proof after the first 401; wait for the durable pause, not a timed request count.
  await expect.poll(async () => (await saved(page)).pause).toBe('auth');
  expect(requests.profile).toBeGreaterThanOrEqual(1); expect(requests.ai).toBe(1);
  expect((await saved(page)).operations).toHaveLength(2);
  expect(await page.evaluate(() => sessionStorage.getItem('fitfocus.auth.pending-oauth.v1'))).toBeNull();
  await page.reload(); await expect(page).toHaveURL(/#plan$/); await expect(create).toHaveCount(0);
  await expect(page.getByText(/Ваш AI/)).toBeVisible();
  await expect.poll(async () => (await saved(page)).pause).toBe('auth');
  expect((await saved(page)).value).toMatchObject({ id: account, aiPlan: { title: 'E2E plan' } });
  expect((await saved(page)).operations).toHaveLength(2); expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('registration-reload.png') });
});

test('registration remains on the form and sends no AI or profile request after a failed initial commit', async ({ page }, info) => {
  const { errors, requests } = await setup(page);
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value: unknown, key?: IDBValidKey) {
      if (this.name === 'outbox' && typeof value === 'object' && value !== null && 'resource' in value && value.resource === 'profile') throw new DOMException('Injected profile quota', 'QuotaExceededError');
      return key === undefined ? original.call(this, value) : original.call(this, value, key);
    };
  });
  await openApp(page, '/?auth=google'); await expect(page).toHaveTitle(/FitFocus/);
  const create = page.getByRole('button', { name: 'Создать AI-план' }); await expect(create).toBeVisible(); await create.click();
  await expect(page.getByText('Не удалось сохранить профиль на устройстве. Освободите место и повторите сохранение.')).toBeVisible();
  await expect(page.getByText('AI Инициализация')).toHaveCount(0); await expect(create).toBeEnabled();
  expect(await saved(page)).toEqual({ value: null, pause: undefined, operations: [] }); expect(requests).toEqual({ ai: 0, profile: 0 }); expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('registration-quota.png') });
});
