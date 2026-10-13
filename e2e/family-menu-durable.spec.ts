import { expect } from '@playwright/test';
import { test } from './support/mockTest';
import { saved, setup, navigate, healthy } from './support/familyHarness';

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
test('family recovery keeps the last local menu and sends it against the checked family version', async ({ page }) => {
  const { counts, errors, resolveConflict } = await setup(page, 'conflict');
  await page.getByRole('button', { name: 'Сгенерировать семейное меню', exact: true }).click();
  await expect.poll(async () => (await saved(page)).operations[0]?.status).toBe('conflicted');
  await page.locator('[data-state-notice-region] details summary').click();
  const group = page.getByRole('region', { name: 'Семейное меню' });
  const keepLocal = group.getByRole('button', { name: 'Оставить последнюю локальную версию' });
  await expect(keepLocal).toBeVisible();
  resolveConflict();
  await keepLocal.click();

  await expect.poll(() => counts.accepted).toBe(1);
  await expect.poll(async () => (await saved(page)).operations).toHaveLength(0);
  expect(counts.bases).toEqual([1, 8]);
  expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(700);
  expect(counts.oldWriter).toBe(0);
  await healthy(page, errors);
});

test('family recovery accepts only the checked remote menu after explicit confirmation', async ({ page }) => {
  const { counts, errors } = await setup(page, 'conflict');
  await page.getByRole('button', { name: 'Сгенерировать семейное меню', exact: true }).click();
  await expect.poll(async () => (await saved(page)).operations[0]?.status).toBe('conflicted');
  await page.locator('[data-state-notice-region] details summary').click();
  const group = page.getByRole('region', { name: 'Семейное меню' });
  const dialogHandled = page.waitForEvent('dialog').then(async (dialog) => {
    const message = dialog.message();
    await dialog.accept();
    return message;
  });
  const reload = page.waitForNavigation({ waitUntil: 'load' });
  await group.getByRole('button', { name: 'Принять серверную версию' }).click();
  expect(await dialogHandled).toContain('Локальные изменения этого раздела будут удалены');
  await reload;

  await expect(page.getByRole('heading', { name: 'Семья', exact: true })).toBeVisible();
  await expect.poll(async () => (await saved(page)).operations).toHaveLength(0);
  expect((await saved(page)).menus[0].menu.shoppingListItems[0].grams).toBe(999);
  expect(counts.accepted).toBe(0);
  expect(counts.oldWriter).toBe(0);
  await healthy(page, errors);
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
