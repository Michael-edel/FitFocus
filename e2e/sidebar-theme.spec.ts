import { expect } from '@playwright/test';
import { test } from './support/mockTest';
import { mockApp, openApp } from './support/appHarness';

for (const mobile of [false, true]) {
  for (const theme of ['dark', 'light']) {
    test(`navigation stays readable and interactive in ${theme} on ${mobile ? 'mobile' : 'desktop'}`, async ({ page }, info) => {
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await mockApp(page, { session: 'app' });
      await openApp(page, '/#settings');
      await expect(page).toHaveTitle(/FitFocus/);
      await page.evaluate(theme => { document.documentElement.dataset.ffTheme = theme; }, theme);
      const nav = page.locator('nav.ff-navigation');
      await expect(nav).toBeVisible();
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      const active = nav.locator('button.ff-navigation-active:visible').first();
      await expect(active).toBeVisible();
      const surface = await nav.evaluate(element => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--ff-card)';
        element.append(probe);
        const expected = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return { actual: getComputedStyle(element).backgroundColor, expected };
      });
      expect(surface.actual).toBe(surface.expected);
      const expectedActiveColor = await active.evaluate((element, theme) => {
        const probe = document.createElement('span');
        probe.style.color = theme === 'light' ? '#4f46e5' : 'var(--color-indigo-400)';
        element.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      }, theme);
      await expect.poll(() => active.evaluate(element => getComputedStyle(element).color)).toBe(expectedActiveColor);
      const inactive = nav.locator('button:visible').locator('xpath=self::*[contains(@class,"text-[var(--ff-muted)]")]').first();
      await expect(inactive).toBeVisible();
      if (await page.evaluate(() => matchMedia('(hover: hover)').matches)) {
        const before = await inactive.evaluate(element => getComputedStyle(element).color);
        await inactive.hover();
        await expect.poll(() => inactive.evaluate(element => getComputedStyle(element).color)).not.toBe(before);
      }
      await page.mouse.move(mobile ? 380 : 1400, 10);
      await inactive.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(inactive).toBeFocused();
      const focus = await inactive.evaluate(element => ({ visible: element.matches(':focus-visible'), style: getComputedStyle(element).outlineStyle, width: getComputedStyle(element).outlineWidth }));
      expect(focus.visible).toBe(true);
      expect(focus.style).not.toBe('none');
      expect(parseFloat(focus.width)).toBeGreaterThan(0);
      await page.screenshot({ path: info.outputPath('navigation.png') });
      const label = await inactive.innerText();
      await inactive.click();
      await expect(nav.locator('button.ff-navigation-active:visible').filter({ hasText: label }).first()).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}
