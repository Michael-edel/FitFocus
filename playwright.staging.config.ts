import { defineConfig, devices } from '@playwright/test';
import { parseStagingOrigin } from './e2e/staging/stagingOrigin';

const stagingOrigin = parseStagingOrigin(process.env.FITFOCUS_STAGING_ORIGIN);

export default defineConfig({
  testDir: './e2e/staging',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['github']] : [['list']],
  use: {
    baseURL: stagingOrigin,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'staging-chromium', use: { ...devices['Desktop Chrome'] } }],
});
