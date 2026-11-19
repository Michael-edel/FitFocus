import { expect } from '@playwright/test';
import { test } from './support/mockTest';
import { mockApp, openApp } from './support/appHarness';

test('preserves keyboard focus in Windows forced-colors mode', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Windows forced-colors regression is exercised in desktop Chromium.');
  await page.emulateMedia({ forcedColors: 'active' });
  await mockApp(page, { session: 'register' });
  await openApp(page, '/');
  const input = page.getByRole('spinbutton', { name: 'Рост (см)', exact: true });
  const previous = page.getByRole('spinbutton', { name: 'Вес (кг)', exact: true });
  await expect(input).toBeVisible();
  await input.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(previous).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  const outline = await input.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor };
  });
  expect(outline.style).toBe('solid');
  expect(outline.width).toBeGreaterThanOrEqual(2);
  expect(outline.color).not.toBe('rgba(0, 0, 0, 0)');
});
