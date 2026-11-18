import { expect } from '@playwright/test';
import { test } from './support/mockTest';
import { mockApp, openApp } from './support/appHarness';

const supportedProjects = new Set(['desktop-chromium', 'android-chrome', 'android-pwa-chrome', 'iphone-pwa']);

test.describe('onboarding activation', () => {
  test('blocks a profile below the supported age before activation', async ({ page }) => {
    await mockApp(page, { session: 'register' });
    await openApp(page, '/');

    const age = page.getByRole('spinbutton', { name: 'Возраст', exact: true });
    const weight = page.getByRole('spinbutton', { name: 'Вес (кг)', exact: true });
    const height = page.getByRole('spinbutton', { name: 'Рост (см)', exact: true });
    const createPlan = page.getByRole('button', { name: 'Создать AI-план' });
    await expect(age).toHaveValue('');
    await expect(weight).toHaveValue('');
    await expect(height).toHaveValue('');
    await expect(createPlan).toBeInViewport({ ratio: 1 });
    await expect(createPlan).toBeDisabled();
    await age.fill('18');
    await expect(age).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Укажите возраст целым числом от 19 до 78 лет.', { exact: true })).toBeVisible();
    await expect(createPlan).toBeDisabled();
    await age.fill('19');
    await expect(createPlan).toBeDisabled();
    await weight.fill('72');
    await height.fill('170');
    await expect(createPlan).toBeEnabled();
  });

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

    const createPlanButton = page.getByRole('button', { name: 'Создать AI-план' });
    await page.getByRole('spinbutton', { name: 'Вес (кг)', exact: true }).fill('72');
    await page.getByRole('spinbutton', { name: 'Рост (см)', exact: true }).fill('170');
    await page.getByRole('spinbutton', { name: 'Возраст', exact: true }).fill('25');
    await expect(createPlanButton).toBeVisible();
    await createPlanButton.click();

    await expect(page.getByText('AI Инициализация')).toBeVisible();
    await expect(page.getByText(/Ваш AI/)).toBeVisible({ timeout: 12_000 });
    await expect(createPlanButton).toHaveCount(0);
  });
});
