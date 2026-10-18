import { expect, test } from '@playwright/test';

const configuredOrigin = process.env.FITFOCUS_STAGING_ORIGIN;
if (!configuredOrigin) {
  throw new Error('FITFOCUS_STAGING_ORIGIN is required by the staging smoke suite.');
}
const stagingOrigin = new URL(configuredOrigin).origin;

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
  await expect(page).toHaveTitle(/FitFocus/i);
  expect(violations).toEqual([]);
  expect(pageErrors).toEqual([]);
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
