import { expect, type Page } from '@playwright/test';

/** Navigate through the same visible controls on desktop and phone layouts. */
export async function navigate(page: Page, requestedName: string) {
  const name = ({ 'Обзор': 'Личный обзор', 'План': 'Личный план', 'Семья': 'Меню семьи' } as Record<string, string>)[requestedName] ?? requestedName;
  const button = page.getByRole('button', { name, exact: true });
  const dialog = page.getByRole('dialog', { name: 'Личные разделы и настройки', exact: true });
  if (!await button.isVisible()) {
    const more = page.getByRole('button', { name: 'Ещё', exact: true });
    await expect(more).toBeVisible();
    await more.click();
    await expect(dialog).toBeVisible();
  }
  // A primary destination can become visible after More was opened during reload.
  // Close the modal through its UI before clicking navigation outside its top layer.
  if (await dialog.isVisible() && await dialog.getByRole('button', { name, exact: true }).count() === 0) {
    await dialog.getByRole('button', { name: 'Закрыть меню', exact: true }).click();
    await expect(dialog).not.toBeVisible();
  }
  await expect(button).toBeVisible();
  await button.scrollIntoViewIfNeeded();
  await button.click();
}
