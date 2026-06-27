import { expect, test } from '@playwright/test';
import { mockApp, openApp } from './support/appHarness';

const supportedProjects = new Set(['desktop-chromium', 'android-chrome', 'android-pwa-chrome', 'iphone-pwa']);

test.describe('onboarding activation', () => {
  test('creates AI plan and lands in app plan screen', async ({ page }, testInfo) => {
    test.skip(!supportedProjects.has(testInfo.project.name), 'This onboarding smoke run targets desktop and mobile production-like profiles.');

    await mockApp(page, {
      session: 'register',
      push: {
        supported: true,
        standalone: testInfo.project.name.includes('pwa'),
        preSubscribed: false,
      },
    });

    await openApp(page, '/');

    await expect(page.getByRole('button', { name: 'Рассчитать мой план' })).toBeVisible();
    await page.getByRole('button', { name: 'Рассчитать мой план' }).click();
    await page.getByRole('button', { name: 'Создать AI-план' }).click();

    await expect(page.getByText('AI Инициализация')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Ваш AI/ })).toBeVisible({ timeout: 12_000 });
    await expect(page.getByRole('button', { name: 'Создать AI-план' })).toHaveCount(0);
  });
});
