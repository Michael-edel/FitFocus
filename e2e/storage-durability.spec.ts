import { expect, test, type Page } from '@playwright/test';
import { mockApp, openApp } from './support/appHarness';

async function storedSettings(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction(['values', 'outbox'], 'readonly');
    const read = <T,>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const [values, operations] = await Promise.all([read(tx.objectStore('values').getAll()), read(tx.objectStore('outbox').getAll())]);
    db.close();
    const value = values.find((entry) => entry.key.endsWith('_settings'));
    return { value: value?.value ?? null, operations: operations.filter((entry) => entry.key.endsWith('_settings')) };
  });
}

test('settings edit survives reload in IndexedDB with its outgoing intent', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await mockApp(page, { session: 'app' });
  await openApp(page, '/#settings');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page).toHaveURL(/#settings$/);
  const light = page.getByRole('button', { name: /^Светлая/ });
  await light.click();
  await expect.poll(async () => (await storedSettings(page)).value).toContain('"theme":"light"');
  const saved = await storedSettings(page);
  expect(saved.operations).toHaveLength(1);
  expect(saved.operations[0]).toMatchObject({ type: 'put', status: 'pending' });
  expect(await page.evaluate(() => localStorage.getItem('fitfocus.remote-kv-outbox.v1') ?? '')).not.toContain('_settings');
  await page.reload();
  await expect(light).toBeVisible();
  await expect(light).toHaveClass(/border-indigo-500\/40/);
  expect((await storedSettings(page)).value).toContain('"theme":"light"');
  expect((await storedSettings(page)).operations).toHaveLength(1);
  await expect(page.getByRole('status').filter({ hasText: 'ожидают синхронизации' })).toBeVisible();
  await expect(page.getByText('Cloud: pending', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Cloud: saved', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('quota fault rolls back settings and displays a visible storage error', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await mockApp(page, { session: 'app' });
  await openApp(page, '/#settings');
  await page.getByRole('button', { name: /^Светлая/ }).click();
  await expect.poll(async () => (await storedSettings(page)).value).toContain('"theme":"light"');
  const previous = await storedSettings(page);
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value, key) {
      if (this.name === 'outbox' && typeof value?.key === 'string' && value.key.endsWith('_settings')) {
        throw new DOMException('Injected quota fault', 'QuotaExceededError');
      }
      return add.call(this, value, key);
    };
  });
  await page.getByRole('button', { name: /^Violet AI/ }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'Не удалось сохранить изменения' });
  await alert.scrollIntoViewIfNeeded();
  await expect(alert).toBeVisible();
  await expect(page.getByText('Cloud: error', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Cloud: saved', { exact: true })).toHaveCount(0);
  expect(await storedSettings(page)).toEqual(previous);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('storage-error.png'), fullPage: false });
});
