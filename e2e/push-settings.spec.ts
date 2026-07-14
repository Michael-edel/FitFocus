import { expect, test } from '@playwright/test';
import { mockApp, openApp } from './support/appHarness';

test.describe('push settings across target platforms', () => {
  test('renders correct push behavior for desktop, Android, iPhone Safari and iPhone PWA', async ({ page }, testInfo) => {
    const projectName = testInfo.project.name;
    const isIphoneSafari = projectName === 'iphone-safari';
    const isIphonePwa = projectName === 'iphone-pwa';
    const isAndroid = projectName.startsWith('android-');
    const isStandalone = projectName.includes('pwa');

    await mockApp(page, {
      session: 'app',
      push: {
        supported: !isIphoneSafari,
        standalone: isStandalone,
        permission: 'granted',
        preSubscribed: !isIphoneSafari,
      },
    });

    await openApp(page, '/#settings');

    await expect(page.getByText('Персонализируйте интерфейс. Часть функций будет добавлена позже.')).toBeVisible();

    const pushSection = page.getByText('Push-уведомления', { exact: true });
    await pushSection.scrollIntoViewIfNeeded();
    await expect(pushSection).toBeVisible();
    const deviceCard = page.getByText('Это устройство', { exact: true }).locator('..');

    if (isIphoneSafari) {
      await expect(deviceCard).toContainText('iPhone');
      await expect(page.getByRole('button', { name: 'Включить push' })).toBeDisabled();
      return;
    }

    if (isIphonePwa) {
      await expect(deviceCard).toContainText('iPhone');
    } else if (isAndroid) {
      await expect(deviceCard).toContainText('Android');
    } else {
      await expect(deviceCard).toContainText(/Windows|Mac|Linux/);
    }

    await expect(page.getByRole('button', { name: 'Переподключить push' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Отправить тест' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Отключить на этом устройстве' })).toBeEnabled();

    await page.getByRole('button', { name: 'Отправить тест' }).click();
    await expect(page.getByText('Тест отправлен: 1 уведомлений.')).toBeVisible();
  });
});
