import { expect, test, type Page } from '@playwright/test';
import { mockApp, openApp, buildMockProfile } from './support/appHarness';
import { familyTestMenu } from '../tests/_helpers/familyMenu';

const account = 'google-e2e-sub', sid = 'a'.repeat(64), familyId = 'family-durable-e2e';
const headers = { 'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid,
  ...Object.fromEntries(['State', 'Profile', 'Bootstrap', 'AI', 'Weekly-Menu', 'Achievements', 'Family', 'Family-Menu'].flatMap(resource =>
    [[`X-FitFocus-${resource}-Protocol`, resource === 'State' ? '2' : '1'], [`X-FitFocus-${resource}-Guard`, '1']])) };

async function saved(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const tx = db.transaction(['values', 'outbox'], 'readonly');
      const get = <T,>(read: IDBRequest<T>) => new Promise<T>((resolve, reject) => { read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); });
      const [values, operations] = await Promise.all([get(tx.objectStore('values').getAll()), get(tx.objectStore('outbox').getAll())]);
      return { version: db.version, menus: values.filter(value => value.key.includes('_family_menu:')).map(value => JSON.parse(value.value)),
        operations: operations.filter(op => op.resource === 'familyMenu').map(op => ({ opId: op.opId, status: op.status, value: op.value, serverSnapshot: op.serverSnapshot })) };
    } finally { db.close(); }
  });
}

async function setup(page: Page, mode: 'normal' | 'offline' | 'conflict' | 'held-ai' | 'quota' = 'normal') {
  await mockApp(page, { session: 'app' });
  let active = true, available = mode !== 'offline', version = 1, week = '';
  let cloud = familyTestMenu(account), profile = buildMockProfile();
  const errors: string[] = [], counts = { preview: 0, put: 0, accepted: 0, ai: 0, fulfilled: 0, oldWriter: 0, achievements: 0 };
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (!['error', 'warning'].includes(message.type())) return;
    if (message.location().url.includes('/api/family/menu/state') && /\b(409|503)\b/.test(message.text()) && ['offline', 'conflict'].includes(mode)) return;
    errors.push(message.text());
  });
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
    if (path === '/api/me') return json(active ? { user: { sub: account, roles: ['user'] }, hasAccess: true,
      stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: sid },
      ...Object.fromEntries(['bootstrapSync', 'profileSync', 'aiSync', 'weeklyMenuSync', 'achievementSync', 'familySync'].map(name =>
        [name, { protocol: 1, guard: 1, ...(name === 'profileSync' ? { weeklyMenuProjection: 1 } : {}) }])),
      familyMenuSync: { protocol: 1, guard: 1, cas: 1 } } : { user: null });
    if (path === '/api/bootstrap') return json({ user: { sub: account }, profile, items: [] });
    if (path === '/api/profile') {
      if (request.method() === 'PUT') profile = { ...request.postDataJSON(), version: request.postDataJSON().baseVersion + 1 };
      return json({ profile, version: profile.version });
    }
    if (path === '/api/state') {
      if (request.method() !== 'GET') expect(request.postDataJSON().items.every((item: { key: string }) => !item.key.includes('_family_menu:'))).toBe(true);
      return json(request.method() === 'GET' ? { items: [] } : { ok: true, items: request.postDataJSON().items.map((item: { key: string; baseVersion: number }) => ({ key: item.key, version: item.baseVersion + 1, exists: true })) });
    }
    if (path === '/api/logout') { active = false; return json({ ok: true }); }
    if (path === '/api/achievements' && request.method() === 'POST') { counts.achievements += 1; return json({ ok: true, unlocked: [] }); }
    if (path === '/api/family') return json({ family: { id: familyId, name: 'Семья с постоянным меню', owner_user_id: account },
      members: [{ user_id: account, role: 'owner', status: 'active' }] });
    if (path === '/api/family/menu') {
      if (request.method() !== 'GET') { counts.oldWriter += 1; return json({ error: 'OLD_WRITER' }, 409); }
      week = url.searchParams.get('week')!; cloud = { ...cloud, weekStart: week };
      return json({ weekStart: week, shared: { familyId, version, menu: cloud }, portions: null });
    }
    if (path === '/api/family/menu/state') {
      expect(request.headers()['x-fitfocus-state-account']).toBe(account); expect(request.headers()['x-fitfocus-state-session']).toBe(sid);
      if (request.method() === 'PUT') {
        counts.put += 1; const body = request.postDataJSON();
        expect(body.familyId).toBe(familyId); expect(body.weekStart).toBe(week);
        if (!available) return json({ error: 'INJECTED_OFFLINE' }, 503);
        if (mode === 'conflict') { version = 8; cloud = { ...familyTestMenu(account, 999, week) }; return json({ error: 'VERSION_CONFLICT', snapshot: { familyId, weekStart: week, version, menu: cloud } }, 409); }
        expect(body.baseVersion).toBe(version); cloud = body.menu; version += 1; counts.accepted += 1;
      }
      return json({ ok: true, snapshot: { familyId, weekStart: week, version, menu: cloud } });
    }
    if (path === '/api/family/menu/generate') {
      counts.preview += 1; expect(request.postDataJSON()).toEqual({ preview: true, familyId });
      return json({ preview: true, shared: { familyId, weekStart: week, menu: familyTestMenu(account, 700, week) } });
    }
    if (path === '/api/ai' && String(request.postDataJSON()?.feature).startsWith('family_menu')) {
      counts.ai += 1; expect(request.headers()['x-fitfocus-state-session']).toBe(sid);
      if (mode === 'held-ai') await held;
      await json({ text: JSON.stringify(familyTestMenu(account, 700, week)) }); counts.fulfilled += 1; return;
    }
    if (path === '/api/weekly_menu/items' && request.method() === 'POST') { counts.oldWriter += 1; return json({ error: 'OLD_WRITER' }, 409); }
    if (path === '/api/shopping/list') return json({ family_id: familyId, week_start: week, items: cloud.shoppingListItems?.map(item => ({ ...item, checked: false })) });
    return route.fallback();
  });
  if (mode === 'quota') await page.addInitScript(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(value: unknown, key?: IDBValidKey) {
      if (this.name === 'outbox' && typeof value === 'object' && value && 'resource' in value && value.resource === 'familyMenu') throw new DOMException('Injected family quota', 'QuotaExceededError');
      return key === undefined ? add.call(this, value) : add.call(this, value, key);
    };
  });
  await openApp(page, '/#family'); await expect(page).toHaveTitle(/FitFocus/); await expect(page).toHaveURL(/#family$/);
  await expect(page.getByText('Семья с постоянным меню', { exact: true })).toBeVisible();
  await expect.poll(async () => (await saved(page)).menus.length).toBe(1);
  return { errors, counts, restore: () => { available = true; }, release, close: () => { active = false; } };
}
async function navigate(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true });
  if (!await button.isVisible()) await page.getByRole('button', { name: 'Ещё', exact: true }).click();
  await button.scrollIntoViewIfNeeded(); await button.click();
}
async function healthy(page: Page, errors: string[]) { await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([]); }

test('server preview becomes one durable family menu and purchases operation', async ({ page }, info) => {
  const { counts, errors } = await setup(page);
  await page.getByRole('button', { name: 'Сгенерировать семейное меню', exact: true }).click();
  await expect.poll(() => counts.accepted).toBe(1); expect(counts.preview).toBe(1); expect(counts.oldWriter).toBe(0);
  await expect.poll(async () => (await saved(page)).operations.length).toBe(0);
  expect((await saved(page)).version).toBe(3); expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(700);
  const purchases = page.getByText('700 г', { exact: true });
  await purchases.scrollIntoViewIfNeeded(); await expect(purchases).toBeInViewport(); await healthy(page, errors);
  await page.screenshot({ path: info.outputPath('family-menu-delivered.png') });
});
test('family conflict survives reload with its original menu and remote snapshot', async ({ page }, info) => {
  const { counts, errors } = await setup(page, 'conflict');
  await page.getByRole('button', { name: 'Сгенерировать семейное меню', exact: true }).click();
  await expect.poll(async () => (await saved(page)).operations[0]?.status).toBe('conflicted');
  const operation = (await saved(page)).operations[0]; await page.reload();
  await expect.poll(async () => (await saved(page)).menus[0]?.menu.shoppingListItems[0].grams).toBe(700);
  expect((await saved(page)).operations[0]).toMatchObject({ opId: operation.opId, status: 'conflicted', serverSnapshot: { version: 8 } });
  const purchases = page.getByText('700 г', { exact: true });
  await purchases.scrollIntoViewIfNeeded(); await expect(purchases).toBeInViewport(); expect(counts.accepted).toBe(0); expect(counts.oldWriter).toBe(0);
  await healthy(page, errors); await page.screenshot({ path: info.outputPath('family-menu-conflict.png') });
});
test('family local storage failure preserves the previous menu and sends no menu mutation', async ({ page }, info) => {
  const { counts, errors } = await setup(page, 'quota');
  await page.getByRole('button', { name: 'Сгенерировать семейное меню', exact: true }).click();
  await expect(page.getByText(/STATE_STORAGE_QUOTA/)).toBeVisible();
  expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(400);
  expect(counts.put).toBe(0); expect(counts.accepted).toBe(0); expect(counts.oldWriter).toBe(0); expect(counts.achievements).toBe(0);
  await healthy(page, errors); await page.screenshot({ path: info.outputPath('family-menu-quota.png') });
});
test('AI family generation commits once through the family queue', async ({ page }, info) => {
  const { counts, errors } = await setup(page); await navigate(page, 'План');
  const update = page.getByRole('button', { name: 'Обновить', exact: true }); await update.scrollIntoViewIfNeeded(); await update.click();
  await expect.poll(() => counts.accepted).toBe(1); expect(counts.ai).toBe(1); expect(counts.oldWriter).toBe(0);
  await expect(update).toBeEnabled(); expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(700);
  await healthy(page, errors); await page.screenshot({ path: info.outputPath('family-menu-ai.png') });
});
test('AI family response after logout cannot create a menu or achievements', async ({ page }) => {
  const { counts, errors, release, close } = await setup(page, 'held-ai');
  try {
    await navigate(page, 'План'); const update = page.getByRole('button', { name: 'Обновить', exact: true }); await update.scrollIntoViewIfNeeded(); await update.click();
    await expect.poll(() => counts.ai).toBe(1); await navigate(page, 'Настройки'); close();
    await page.getByRole('button', { name: 'Выйти из аккаунта', exact: true }).click(); release();
    await expect(page.getByRole('heading', { name: 'FitFocus', exact: true })).toBeVisible();
    await expect.poll(() => counts.fulfilled).toBe(1);
    expect(counts.put).toBe(0); expect(counts.oldWriter).toBe(0); expect(counts.achievements).toBe(0);
    expect((await saved(page)).operations).toEqual([]); await healthy(page, errors);
  } finally { release(); }
});

test('family pending operation survives reload and delivers after recovery with the same opId', async ({ page }, info) => {
  const { counts, errors, restore } = await setup(page, 'offline');
  await page.getByRole('button', { name: 'Сгенерировать семейное меню', exact: true }).click();
  await expect.poll(() => counts.put).toBeGreaterThan(0);
  await expect.poll(async () => (await saved(page)).operations[0]?.status).toBe('pending');
  const operation = (await saved(page)).operations[0]; await page.reload();
  await expect(page.getByText('Семья с постоянным меню', { exact: true })).toBeVisible();
  await expect.poll(async () => (await saved(page)).operations[0]?.opId).toBe(operation.opId);
  await expect(page.getByText('700 г', { exact: true })).toBeVisible();
  restore(); await navigate(page, 'Настройки');
  await page.getByRole('button', { name: /Синхронизировать сейчас/ }).click();
  await expect.poll(() => counts.accepted).toBe(1);
  await expect.poll(async () => (await saved(page)).operations.length).toBe(0);
  expect(counts.oldWriter).toBe(0); await healthy(page, errors); await page.screenshot({ path: info.outputPath('family-menu-recovered.png') });
});

test('pagehide invalidates an old AI attempt and pageshow restores the generation control', async ({ page }) => {
  const { counts, errors, release } = await setup(page, 'held-ai');
  try {
    await navigate(page, 'План'); const update = page.getByRole('button', { name: 'Обновить', exact: true }); await update.scrollIntoViewIfNeeded(); await update.click();
    await expect.poll(() => counts.ai).toBe(1);
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    await expect(update).toBeEnabled(); release(); await expect.poll(() => counts.fulfilled).toBe(1);
    expect(counts.put).toBe(0); expect(counts.achievements).toBe(0); expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(400);
    expect((await saved(page)).operations).toEqual([]); await healthy(page, errors);
  } finally { release(); }
});

test('editing the profile while family AI is pending preserves the prior menu', async ({ page }) => {
  const { counts, errors, release } = await setup(page, 'held-ai');
  try {
    await navigate(page, 'План'); const update = page.getByRole('button', { name: 'Обновить', exact: true }); await update.scrollIntoViewIfNeeded(); await update.click();
    await expect.poll(() => counts.ai).toBe(1); await navigate(page, 'Настройки');
    await page.getByPlaceholder('Как к вам обращаться').fill('Новая правка во время генерации'); release();
    await expect.poll(() => counts.fulfilled).toBe(1); await navigate(page, 'План');
    await expect(page.getByText('Данные семьи изменились. Повторите генерацию.', { exact: true })).toBeVisible();
    expect(counts.put).toBe(0); expect(counts.achievements).toBe(0); expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(400);
    await healthy(page, errors);
  } finally { release(); }
});
