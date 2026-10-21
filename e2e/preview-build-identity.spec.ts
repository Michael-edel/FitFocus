import { expect } from '@playwright/test';
import { BUILD_SOURCE } from '../build-info.generated';
import { test } from './support/mockTest';
import { mockApp, openApp } from './support/appHarness';

test('preview changelog keeps its branch history without reading or fetching main history', async ({ page }) => {
  test.skip(String(BUILD_SOURCE.branch) === 'main', 'This scenario requires a preview build.');
  const mainRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await mockApp(page, { session: 'app' });
  await page.route('https://api.github.com/**', async route => {
    mainRequests.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.addInitScript(() => {
    const reads: string[] = [];
    Object.assign(window, { previewBuildHistoryReads: reads });
    for (const key of ['fitfocus.build-history.v4', 'fitfocus.build-history.v5']) {
      localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), entries: [{
        branch: 'main', sha: 'cached-main-sha', shortSha: 'cached-main-sha',
        committedAt: '2026-10-20T00:00:00Z', sequence: 9999,
        descriptionRu: 'Cached main history must not replace preview history', isCurrent: true,
      }] }));
    }
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith('fitfocus.build-history.')) reads.push(key);
      return getItem.call(this, key);
    };
  });

  await openApp(page, '/#updates');
  await expect(page.getByRole('heading', { name: 'Изменения по версиям', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { previewBuildHistoryReads: string[] }).previewBuildHistoryReads)).toEqual([]);
  expect(mainRequests).toEqual([]);
  const currentBuild = BUILD_SOURCE.recentBuilds[0];
  expect(currentBuild.sha).toBe(BUILD_SOURCE.sha);
  const expectedLabel = `Сборка ветки ${BUILD_SOURCE.branch} • ${currentBuild.shortSha}`;
  await expect(page.getByRole('heading', { name: expectedLabel, exact: true })).toBeVisible();
  await expect(page.getByText('Cached main history must not replace preview history', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Сборка main/ })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
