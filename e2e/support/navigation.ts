import { expect, type Page } from '@playwright/test';

/** Navigate through the same visible controls on desktop and phone layouts. */
export async function navigate(page: Page, requestedName: string) {
  const name = ({ 'Обзор': 'Личный обзор', 'План': 'Личный план', 'Семья': 'Меню семьи' } as Record<string, string>)[requestedName] ?? requestedName;
  const button = page.getByRole('button', { name, exact: true });
  if (!await button.isVisible()) {
    const more = page.getByRole('button', { name: 'Ещё', exact: true });
    await expect(more).toBeVisible();
    await more.click();
  }
  await expect(button).toBeVisible();
  await button.scrollIntoViewIfNeeded();
  await button.click();
}
