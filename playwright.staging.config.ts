import { defineConfig, devices } from '@playwright/test';

const configuredOrigin = process.env.FITFOCUS_STAGING_ORIGIN;

if (!configuredOrigin) {
  throw new Error(
    'FITFOCUS_STAGING_ORIGIN is required for staging checks; set it to the HTTPS origin of the isolated staging environment.',
  );
}

let stagingUrl: URL;

try {
  stagingUrl = new URL(configuredOrigin);
} catch {
  throw new Error('FITFOCUS_STAGING_ORIGIN must be an absolute HTTPS origin.');
}

if (
  stagingUrl.protocol !== 'https:' ||
  stagingUrl.username !== '' ||
  stagingUrl.password !== '' ||
  !['', '/'].includes(stagingUrl.pathname) ||
  stagingUrl.search !== '' ||
  stagingUrl.hash !== ''
) {
  throw new Error(
    'FITFOCUS_STAGING_ORIGIN must contain only an HTTPS origin, without credentials, path, query, or fragment.',
  );
}

if (stagingUrl.hostname.toLowerCase() === 'fitfocus.pages.dev') {
  throw new Error(
    'FITFOCUS_STAGING_ORIGIN points to the production Pages hostname; use an isolated staging origin.',
  );
}

const stagingOrigin = stagingUrl.origin;

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
