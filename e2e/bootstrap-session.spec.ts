import { expect, type Page } from '@playwright/test';
import { test } from './support/mockTest';
import { mockApp, openApp, buildMockProfile } from './support/appHarness';
const account = 'google-e2e-sub'; const sid = 'a'.repeat(64);
const scope = { 'X-FitFocus-Bootstrap-Protocol': '1', 'X-FitFocus-Bootstrap-Guard': '1',
  'X-FitFocus-State-Protocol': '2', 'X-FitFocus-State-Guard': '1',
  'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid };
async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const read = <T,>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try {
      const tx = db.transaction(['values', 'outbox', 'outbox_meta'], 'readonly');
      const [values, operations, active] = await Promise.all([read(tx.objectStore('values').getAll()), read(tx.objectStore('outbox').getAll()), read(tx.objectStore('outbox_meta').get('active-session'))]);
      return { values, operations, active };
    } finally { db.close(); }
  });
}
test('restores the open food diary and its entries after OAuth and reload', async ({ page }) => {
  await mockApp(page, { session: 'app' });
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  const mealName = 'Овсянка для проверки дневника';
  const items = [{
    key: `fitfocus_data_${account}_diary`,
    version: 1,
    exists: true,
    value: JSON.stringify([{
      id: 'diary-reload-entry', name: mealName, mealType: 'breakfast', timestamp: date.toISOString(),
      calories: 300, protein: 12, fat: 8, carbs: 42,
    }]),
  }];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET' || !['/api/bootstrap', '/api/state'].includes(path)) return route.fallback();
    const isBootstrap = path === '/api/bootstrap';
    expect(request.headers()['x-fitfocus-state-account']).toBe(account);
    expect(request.headers()['x-fitfocus-state-session']).toBe(sid);
    await route.fulfill({
      headers: scope,
      json: isBootstrap ? { user: { sub: account }, profile: buildMockProfile(), items } : { items },
    });
  });

  await openApp(page, '/?auth=google');
  await expect(page).toHaveTitle(/FitFocus/);
  await page.getByRole('button', { name: 'Питание', exact: true }).click();
  const meal = page.getByText(mealName, { exact: true });
  await expect(meal).toBeVisible();
  await expect(page).toHaveURL(/\/#nutrition$/);
  expect(await page.evaluate(() => history.state?.fitfocusOAuthCallback)).toBeUndefined();

  await page.reload();
  await expect(page).toHaveURL(/\/#nutrition$/);
  await expect(meal).toBeVisible();
  await page.getByRole('button', { name: 'Обзор', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});

for (const mode of ['bootstrap-scope', 'state-scope', 'late-bootstrap', 'state-me-logout'] as const) {
  test(`rejects ${mode} before activating an unverified login`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await mockApp(page, { session: 'app' });
    await page.route('**/api/**', async route => {
      const request = route.request(); const path = new URL(request.url()).pathname;
      const headers = request.headers();
      if (mode === 'state-me-logout' && path === '/api/me'
        && (await snapshot(page)).values.some(value => value.key.endsWith('_profile'))) {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user: null, hasAccess: true }) });
      }
      if (path === '/api/bootstrap' || path === '/api/state' && request.method() === 'GET') {
        expect(mode === 'state-me-logout' && path === '/api/state').toBe(false);
        expect(headers['x-fitfocus-state-account']).toBe(account);
        expect(headers['x-fitfocus-state-session']).toBe(sid);
        const wrongScope = path === '/api/bootstrap' && mode === 'bootstrap-scope' || path === '/api/state' && mode === 'state-scope';
        if (mode === 'late-bootstrap' && path === '/api/bootstrap') {
          await page.evaluate(async () => {
            const opening = indexedDB.open('fitfocus-user-state-v1');
            const db = await new Promise<IDBDatabase>((resolve, reject) => { opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error); });
            try {
              const tx = db.transaction(['outbox_meta'], 'readwrite'); const store = tx.objectStore('outbox_meta');
              const done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
              const request = store.get('auth-fence');
              request.onsuccess = () => {
                store.put({ id: 'auth-fence', revision: (request.result?.revision ?? 0) + 1 });
                store.put({ id: 'active-session', accountId: 'account-b', serverSessionId: 'b'.repeat(64), sessionEpoch: crypto.randomUUID() });
              };
              await done;
            } finally { db.close(); }
          });
        }
        return route.fulfill({ contentType: 'application/json', headers: { ...scope, ...(wrongScope ? { 'X-FitFocus-State-Session': 'b'.repeat(64) } : {}) },
          body: JSON.stringify(path === '/api/bootstrap' ? { user: { sub: account }, profile: buildMockProfile(), items: [] }
            : { items: [{ key: `fitfocus_data_${account}_diary`, value: '["unverified"]', exists: true, version: 9 }] }) });
      }
      return route.fallback();
    });
    await openApp(page, '/#plan');
    await expect(page.getByText(mode === 'late-bootstrap' ? 'Сессия изменилась во время загрузки. Повторите вход.'
      : 'Сессия, доступ или протокол загрузки изменились. Повторите вход.')).toBeVisible();
    await expect(page.getByText(/Ваш AI/)).toHaveCount(0); await expect(page).toHaveTitle(/FitFocus/); await expect(page).toHaveURL(/#plan$/);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    const stored = await snapshot(page);
    expect(stored.values.find(value => value.key.endsWith('_diary'))).toBeUndefined(); expect(stored.operations).toEqual([]);
    if (mode === 'bootstrap-scope' || mode === 'late-bootstrap') expect(stored.values.find(value => value.key.endsWith('_profile'))).toBeUndefined();
    if (mode === 'late-bootstrap') expect(stored.active.accountId).toBe('account-b');
    expect(errors).toEqual([]);
    await page.screenshot({ path: info.outputPath(`bootstrap-${mode}.png`) });
  });
}
