import { expect, type Page } from '@playwright/test';
import { test } from './support/mockTest';
import { mockApp, openApp } from './support/appHarness';

const account = 'google-e2e-sub';
const sourceKey = 'fitfocus.remote-kv-outbox.v1';
const source = JSON.stringify([{ type: 'put', key: 'fitfocus_data_unknown_refeed', value: '2026-10-12' }]);
const historyKey = `fitfocus_data_${account}_council_history`;
const oldMessage = { id: 'old-message', role: 'user', text: 'Сохранённый вопрос', createdAt: '2026-10-11T08:00:00Z' };

async function state(page: Page, suffix: string) {
  return page.evaluate(async ({ key, sourceKey }) => {
    const opening = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error); });
    const tx = db.transaction(['values', 'outbox', 'outbox_meta'], 'readonly');
    const read = <T,>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const [value, operations, active] = await Promise.all([read(tx.objectStore('values').get(key)), read(tx.objectStore('outbox').getAll()),
      read(tx.objectStore('outbox_meta').get('active-session'))]);
    db.close();
    return { value: value?.value ?? null, operations: operations.filter((operation) => operation.key === key),
      source: localStorage.getItem(sourceKey), pause: active?.pause };
  }, { key: `fitfocus_data_${account}_${suffix}`, sourceKey });
}

async function setup(page: Page, history = false) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await mockApp(page, { session: 'app' });
  await page.addInitScript(({ sourceKey, source, historyKey, oldMessage, history }) => {
    // Seed once: reload must not manufacture new history or queue items.
    if (localStorage.getItem('owned-state-seeded')) return;
    localStorage.setItem('owned-state-seeded', '1');
    localStorage.setItem(sourceKey, source);
    if (history) localStorage.setItem(historyKey, JSON.stringify([oldMessage]));
  }, { sourceKey, source, historyKey, oldMessage, history });
  return errors;
}

test('plan task changes survive reload without repopulating the old queue', async ({ page }, testInfo) => {
  const errors = await setup(page);
  await openApp(page, '/#plan');
  await expect(page).toHaveURL(/#plan$/); await expect(page).toHaveTitle(/FitFocus/);
  const task = page.getByRole('button', { name: 'Записать первый завтрак', exact: true });
  await expect(task).toBeVisible();
  await expect(page.getByText('0/3 выполнено', { exact: true })).toBeVisible();
  expect((await state(page, 'plan_task_done')).operations).toEqual([]);
  await task.click();
  await expect.poll(async () => (await state(page, 'plan_task_done')).value).toContain('"0:Записать первый завтрак":true');
  expect((await state(page, 'plan_task_done')).operations).toHaveLength(1);
  await page.reload();
  await expect(page.getByText('1/3 выполнено', { exact: true })).toBeVisible();
  await expect(task).toHaveClass(/border-emerald-500/);
  let saved = await state(page, 'plan_task_done');
  await expect.poll(async () => {
    saved = await state(page, 'plan_task_done');
    return { pause: saved.pause, status: saved.operations[0]?.status };
  }).toEqual({ pause: 'legacy', status: 'pending' });
  expect(saved.source).toBe(source); expect(saved.operations).toHaveLength(1);
  expect(saved.operations[0]).toMatchObject({ type: 'put', accountId: account, status: 'pending' });
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('plan-task-reloaded.png') });
});

test('cleared council history stays deleted despite a stale localStorage copy', async ({ page }, testInfo) => {
  const errors = await setup(page, true);
  await openApp(page, '/#council');
  await expect(page).toHaveURL(/#council$/); await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByText(oldMessage.text, { exact: true })).toBeVisible();
  expect((await state(page, 'council_history')).operations).toEqual([]);
  await page.getByRole('button', { name: 'Очистить', exact: true }).click();
  await expect.poll(async () => (await state(page, 'council_history')).operations[0]?.type).toBe('delete');
  await expect(page.getByText(oldMessage.text, { exact: true })).toHaveCount(0);
  await page.evaluate(({ key, message }) => localStorage.setItem(key, JSON.stringify([message])), { key: historyKey, message: oldMessage });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Очистить', exact: true })).toBeVisible();
  await expect(page.getByText(oldMessage.text, { exact: true })).toHaveCount(0);
  let saved = await state(page, 'council_history');
  await expect.poll(async () => {
    saved = await state(page, 'council_history');
    return { pause: saved.pause, status: saved.operations[0]?.status };
  }).toEqual({ pause: 'legacy', status: 'pending' });
  expect(saved.value).toBeNull(); expect(saved.operations).toHaveLength(1);
  expect(saved.operations[0]).toMatchObject({ type: 'delete', accountId: account, status: 'pending' });
  expect(saved.source).toBe(source);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('council-cleared.png') });
});

test('failed council deletion keeps the visible history and reports a storage error', async ({ page }) => {
  const errors = await setup(page, true);
  await openApp(page, '/#council');
  await expect(page.getByText(oldMessage.text, { exact: true })).toBeVisible();
  await page.evaluate((historyKey) => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      const record = args[0] as { key?: unknown } | null;
      if (this.name === 'outbox' && record?.key === historyKey) throw new DOMException('Injected quota failure', 'QuotaExceededError');
      return add.apply(this, args);
    };
  }, historyKey);
  await page.getByRole('button', { name: 'Очистить', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить' })).toBeVisible();
  await expect(page.getByText(oldMessage.text, { exact: true })).toBeVisible();
  expect((await state(page, 'council_history')).operations).toEqual([]);
  expect((await state(page, 'council_history')).source).toBe(source);
  await page.reload();
  await expect(page.getByText(oldMessage.text, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
