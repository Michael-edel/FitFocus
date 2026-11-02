import { expect } from '@playwright/test';
import { test } from './support/mockTest';
import { mockApp, openApp } from './support/appHarness';
import { textContrast } from './support/textContrast';

test('successful manual sync notice is readable in every theme', async ({ page }) => {
  await mockApp(page, { session: 'app' });
  await openApp(page, '/#settings');
  for (const theme of ['Светлая', 'Тёмная', 'Violet AI', 'Calm', 'Premium']) {
    await page.getByRole('button', { name: new RegExp(`^${theme}`) }).click();
    await page.getByRole('button', { name: /^Синхронизировать сейчас/ }).click();
    const notice = page.locator('.ff-sync-note-success').filter({ hasText: 'Синхронизировано с облаком.' });
    await expect(notice).toBeVisible();
    await expect.poll(async () => (await textContrast(notice)).ratio).toBeGreaterThanOrEqual(4.5);
    expect((await textContrast(notice)).opacity).toBe('1');
  }
});
