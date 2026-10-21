import { expect, test } from '@playwright/test';
import { parseStagingOrigin } from './stagingOrigin';

const stagingOrigin = parseStagingOrigin(process.env.FITFOCUS_STAGING_ORIGIN);

const protectedReadRoutes = [
  '/api/bootstrap',
  '/api/profile',
  '/api/state?prefix=fitfocus_data_staging_probe_',
  '/api/push/status',
];

test('staging serves FitFocus on the configured origin using GET requests only', async ({ page }) => {
  const violations: string[] = [];
  const pageErrors: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/*', async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());

    if (requestUrl.origin !== stagingOrigin || request.method() !== 'GET') {
      violations.push(`${request.method()} ${request.url()}`);
      await route.abort('blockedbyclient');
      return;
    }

    await route.continue();
  });

  const envResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === stagingOrigin && url.pathname === '/api/env';
  });
  const meResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === stagingOrigin && url.pathname === '/api/me';
  });

  const documentResponse = await page.goto('/', { waitUntil: 'domcontentloaded' });
  await Promise.all([envResponse, meResponse]);

  expect(documentResponse?.status()).toBe(200);
  expect(page.url()).toBe(`${stagingOrigin}/`);
  const documentHeaders = documentResponse?.headers() ?? {};
  expect(documentHeaders).not.toHaveProperty('location');
  expect(documentHeaders).not.toHaveProperty('set-cookie');
  await expect(page).toHaveTitle(/FitFocus/i);
  expect(violations).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('staging activates its same-origin Service Worker using GET requests only', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const violations: string[] = [];
  const pageErrors: string[] = [];
  const unexpectedConsoleMessages: string[] = [];
  const knownAmbientLightPolicyWarnings: string[] = [];

  await context.route('**/*', async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());

    if (requestUrl.origin !== stagingOrigin || request.method() !== 'GET') {
      violations.push(`${request.method()} ${request.url()}`);
      await route.abort('blockedbyclient');
      return;
    }

    await route.continue();
  });

  try {
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() !== 'error' && message.type() !== 'warning') return;

      const text = message.text();
      if (
        message.type() === 'warning' &&
        text === "Error with Permissions-Policy header: Unrecognized feature: 'ambient-light-sensor'."
      ) {
        knownAmbientLightPolicyWarnings.push(text);
        return;
      }

      unexpectedConsoleMessages.push(`${message.type()}: ${text}`);
    });

    const documentResponse = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(documentResponse?.headers()['permissions-policy']).toContain('ambient-light-sensor=()');
    await expect(page).toHaveTitle(/FitFocus/i);
    await page.evaluate(async () => await navigator.serviceWorker.ready);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    const worker = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return {
        origin: location.origin,
        controller: navigator.serviceWorker.controller?.scriptURL ?? null,
        scope: registration.scope,
        activeScript: registration.active?.scriptURL ?? null,
        activeState: registration.active?.state ?? null,
      };
    });

    expect(worker).toEqual({
      origin: stagingOrigin,
      controller: `${stagingOrigin}/sw.js`,
      scope: `${stagingOrigin}/`,
      activeScript: `${stagingOrigin}/sw.js`,
      activeState: 'activated',
    });
    expect(violations).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(unexpectedConsoleMessages).toEqual([]);
    if (knownAmbientLightPolicyWarnings.length > 0) {
      test.info().annotations.push({
        type: 'known browser warning',
        description: `Chromium does not implement ambient-light-sensor without a flag; the policy remains in the response header for browsers that support it (${knownAmbientLightPolicyWarnings.length} warning(s)).`,
      });
    }
  } finally {
    await context.close();
  }
});

test('GET /api/env is served as JSON on staging', async ({ request }) => {
  const response = await request.get('/api/env', { maxRedirects: 0 });

  expect(response.status()).toBe(200);
  expect(response.url()).toBe(`${stagingOrigin}/api/env`);
  expect(response.headers()['content-type']).toContain('application/json');
  expect(response.headers()).not.toHaveProperty('location');
  expect(response.headers()).not.toHaveProperty('set-cookie');
});

test('anonymous GET /api/me remains on staging and returns no user', async ({ request }) => {
  const response = await request.get('/api/me', { maxRedirects: 0 });
  const body = await response.json();

  expect(response.status()).toBe(200);
  expect(response.url()).toBe(`${stagingOrigin}/api/me`);
  expect(body.user).toBeNull();
  expect(response.headers()).not.toHaveProperty('location');
  expect(response.headers()).not.toHaveProperty('set-cookie');
});

for (const route of protectedReadRoutes) {
  test(`anonymous GET ${route} is rejected without redirect or cookie`, async ({ request }) => {
    const response = await request.get(route, { maxRedirects: 0 });

    expect(response.status()).toBe(401);
    expect(new URL(response.url()).origin).toBe(stagingOrigin);
    expect(response.headers()).not.toHaveProperty('location');
    expect(response.headers()).not.toHaveProperty('set-cookie');
  });
}
