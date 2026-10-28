import { navigate } from './support/navigation';
import { expect, type Page } from '@playwright/test';
import { test } from './support/mockTest';
import { buildMockProfile, mockApp, openApp } from './support/appHarness';

const account = 'google-e2e-sub';
const sid = 'a'.repeat(64);
const reportKey = `fitfocus_data_${account}_weekly_reports`;
const stateHeaders = {
  'X-FitFocus-State-Account': account,
  'X-FitFocus-State-Session': sid,
  'X-FitFocus-State-Protocol': '2',
  'X-FitFocus-State-Guard': '1',
};
const responseHeaders = {
  ...stateHeaders,
  'X-FitFocus-Bootstrap-Protocol': '1',
  'X-FitFocus-Bootstrap-Guard': '1',
  'X-FitFocus-AI-Protocol': '1',
  'X-FitFocus-AI-Guard': '1',
  'X-FitFocus-Weekly-Menu-Protocol': '1',
  'X-FitFocus-Weekly-Menu-Guard': '1',
  'X-FitFocus-Profile-Protocol': '1',
  'X-FitFocus-Profile-Guard': '1',
};

function gate() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  return { wait, release };
}

async function readSavedReport(page: Page) {
  return page.evaluate(async key => {
    const opening = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const tx = db.transaction(['values', 'outbox'], 'readonly');
      const complete = new Promise<void>((resolve, reject) => {
        tx.addEventListener('complete', () => resolve(), { once: true });
        tx.addEventListener('abort', () => reject(tx.error), { once: true });
      });
      const read = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const [value, operations] = await Promise.all([
        read(tx.objectStore('values').get(key)),
        read(tx.objectStore('outbox').getAll()),
      ]);
      await complete;
      return {
        report: value ? JSON.parse(value.value) as Array<{ aiText?: string }> : null,
        operations: operations.filter(operation => operation.key === key),
      };
    } finally {
      db.close();
    }
  }, reportKey);
}

async function setup(page: Page, holdAI: boolean, expectAbortOnUnload = false) {
  const errors: string[] = [];
  const counts = { reportRequests: 0, reportResponses: 0, reportWrites: 0, released: 0, abortedRequests: 0 };
  const held = gate();
  let active = true;
  let profile = buildMockProfile();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
  });
  await mockApp(page, { session: 'app' });
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, headers: Record<string, string> = responseHeaders) => route.fulfill({
      contentType: 'application/json', headers, body: JSON.stringify(body),
    });

    if (path === '/api/me') return json(active ? {
      user: { sub: account, roles: ['user'] }, hasAccess: true,
      stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: sid },
      bootstrapSync: { protocol: 1, guard: 1 }, profileSync: { protocol: 1, guard: 1 },
      aiSync: { protocol: 1, guard: 1 }, weeklyMenuSync: { protocol: 1, guard: 1 },
    } : { user: null });
    if (path === '/api/bootstrap') return json({ user: { sub: account }, profile, items: [] });
    if (path === '/api/state' && request.method() === 'GET') return json({ items: [] });
    if (path === '/api/state' && request.method() === 'PUT') {
      const items = request.postDataJSON().items as Array<{ key: string; baseVersion: number }>;
      if (items.some(item => item.key === reportKey)) counts.reportWrites += 1;
      return json({ ok: true, items: items.map(item => ({ key: item.key, version: item.baseVersion + 1, exists: true })) }, stateHeaders);
    }
    if (path === '/api/profile') {
      if (request.method() === 'PUT') {
        const body = request.postDataJSON();
        profile = { ...body, version: body.baseVersion + 1 };
      }
      return json({ profile, version: profile.version });
    }
    if (path === '/api/logout') {
      active = false;
      return json({ ok: true });
    }
    if (path === '/api/ai' && request.method() === 'POST' && request.postDataJSON()?.feature === 'wis_text') {
      counts.reportRequests += 1;
      expect(request.headers()['x-fitfocus-state-account']).toBe(account);
      expect(request.headers()['x-fitfocus-state-session']).toBe(sid);
      if (holdAI) {
        await held.wait;
        counts.released += 1;
        if (expectAbortOnUnload && request.failure()) {
          counts.abortedRequests += 1;
          return;
        }
      }
      await json({ text: 'Отчёт недели сохранён после проверки сессии.' });
      counts.reportResponses += 1;
      return;
    }
    if (path === '/api/achievements' || path === '/api/achievements/check') {
      return json({ enabled: false, catalog: [], unlocked: [], newlyUnlocked: [] });
    }
    return route.fallback();
  });
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  return { errors, counts, release: held.release, closeSession: () => { active = false; } };
}

async function openSettings(page: Page) {
  await navigate(page, 'Настройки');
  await expect(page.getByPlaceholder('Как к вам обращаться')).toBeVisible();
}

test('weekly report uses the checked AI session and saves through the durable outbox', async ({ page }) => {
  const { counts, errors } = await setup(page, false);
  await expect.poll(() => counts.reportRequests).toBe(1);
  await expect.poll(() => counts.reportWrites).toBe(1);
  await expect.poll(async () => (await readSavedReport(page)).report?.[0]?.aiText)
    .toBe('Отчёт недели сохранён после проверки сессии.');
  expect(errors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
});

test('weekly report ignores a held AI response after logout', async ({ page }) => {
  const { counts, errors, release, closeSession } = await setup(page, true);
  try {
    await expect.poll(() => counts.reportRequests).toBe(1);
    await openSettings(page);
    closeSession();
    await page.getByRole('button', { name: 'Выйти из аккаунта', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'FitFocus' })).toBeVisible();
    release();
    await expect.poll(() => counts.released).toBe(1);
    await expect.poll(() => counts.reportResponses).toBe(1);
    const saved = await readSavedReport(page);
    expect(saved.report).toBeNull();
    expect(saved.operations).toEqual([]);
    expect(counts.reportWrites).toBe(0);
    expect(errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    release();
  }
});

test('weekly report aborts a held AI request before navigation unload', async ({ page }) => {
  const { counts, release, errors } = await setup(page, true, true);
  try {
    await expect.poll(() => counts.reportRequests).toBe(1);
    expect((await readSavedReport(page)).report).toBeNull();

    await page.goto('/api/env');
    await expect(page).toHaveURL('http://127.0.0.1:4173/api/env');
    release();
    await expect.poll(() => counts.abortedRequests).toBe(1);

    expect(counts.reportResponses).toBe(0);
    expect(counts.reportWrites).toBe(0);
    const saved = await readSavedReport(page);
    expect(saved.report).toBeNull();
    expect(saved.operations).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});
