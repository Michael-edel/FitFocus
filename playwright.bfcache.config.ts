import { defineConfig, devices } from '@playwright/test';

const npmCommand = process.env.npm_execpath
  ? `${JSON.stringify(process.execPath)} ${JSON.stringify(process.env.npm_execpath)}`
  : 'npm';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['http-client-lifecycle.spec.ts'],
  testIgnore: ['staging/**'],
  globalSetup: './e2e/support/preparePwaFixture.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['github']] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `${npmCommand} run build && ${npmCommand} run preview -- --host 127.0.0.1 --port 4173`,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [{
    name: 'desktop-chromium-bfcache',
    use: {
      ...devices['Desktop Chrome'],
      channel: 'chrome',
      launchOptions: {
        ignoreDefaultArgs: ['--disable-back-forward-cache'],
        args: ['--enable-features=BackForwardCache'],
      },
    },
  }],
});
