import { expect, type Locator } from '@playwright/test';

/** Family purchase projection changes only after its durable IDB commit.
 * Locator.check/uncheck verifies the state immediately after clicking, before
 * that async commit. Wait for the committed projection without bypassing it.
 * Callers still assert their HTTP ACK, ownership and outbox/CAS boundaries.
 */
export async function setPurchasedCheckbox(checkbox: Locator, checked: boolean) {
  await expect(checkbox).toBeEnabled();
  if (checked) await expect(checkbox).not.toBeChecked();
  else await expect(checkbox).toBeChecked();
  await checkbox.click();
  if (checked) await expect(checkbox).toBeChecked();
  else await expect(checkbox).not.toBeChecked();
}
