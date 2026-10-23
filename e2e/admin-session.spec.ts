import { navigate } from './support/navigation';
import { expect } from '@playwright/test';
import { test } from './support/mockTest';
import { buildMockProfile, mockApp, openApp } from './support/appHarness';

const account = 'google-e2e-sub';
const sid = 'a'.repeat(64);
const marker = '__e2e_admin_unload__';

async function activeSessionIdentity(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const opening = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const request = db.transaction('outbox_meta', 'readonly').objectStore('outbox_meta').get('active-session');
      const active = await new Promise<{ accountId?: string; serverSessionId?: string; sessionEpoch?: string } | undefined>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return active ? {
        accountId: active.accountId,
        serverSessionId: active.serverSessionId,
        sessionEpoch: active.sessionEpoch,
      } : null;
    } finally {
      db.close();
    }
  });
}

function sessionHeaders(serverSessionId: string, protocol: 'state' | 'bootstrap') {
  const marker = protocol === 'state' ? 'State' : 'Bootstrap';
  return {
    [`X-FitFocus-${marker}-Protocol`]: protocol === 'state' ? '2' : '1',
    [`X-FitFocus-${marker}-Guard`]: '1',
    'X-FitFocus-State-Account': account,
    'X-FitFocus-State-Session': serverSessionId,
  };
}

function adminStatsBody(users: number, day: string) {
  return {
    stats: {
      totals: {
        users, active_sessions: 2, pro_active: 1, family_active: 0, deleted_users: 0,
        inactive_users: 0, family_members_active: 0, profiles_with_measurements: 0,
        profiles_with_glucose: 0, profiles_with_wearable: 0, profiles_with_progress_photos: 0,
        profiles_with_family_members: 0,
      },
      today: { day, ai_calls: 1, meals_logged: 1 },
      alerts: [],
    },
  };
}

test('navigation aborts a held admin response before unload without losing its captured scope', async ({ page }) => {
  await page.addInitScript(markerKey => {
    const mark = (suffix: string, value: string) => {
      try { localStorage.setItem(`${markerKey}:${suffix}`, value); } catch { /* The document may be unloading. */ }
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof Request ? input.url : String(input), location.href);
      if (url.pathname === '/api/admin/stats') {
        const count = Number(localStorage.getItem(`${markerKey}:stats`)) || 0;
        mark('stats', String(count + 1));
        const headers = new Headers(init?.headers);
        mark('scope', `${headers.get('X-FitFocus-State-Account')}:${headers.get('X-FitFocus-State-Session')}`);
        init?.signal?.addEventListener('abort', () => mark('signal', 'aborted'), { once: true });
      }
      return originalFetch(input, init);
    };
    window.addEventListener('beforeunload', () => mark('beforeunload', 'fired'));
  }, marker);

  let statsCount = 0;
  let signalFirstStats!: () => void;
  let releaseFirstStats!: () => void;
  const firstStatsStarted = new Promise<void>(resolve => { signalFirstStats = resolve; });
  const firstStatsGate = new Promise<void>(resolve => { releaseFirstStats = resolve; });
  await mockApp(page, {
    session: 'app',
    admin: true,
    acknowledgeStateWrites: true,
    beforeAdminStats: async () => {
      statsCount += 1;
      if (statsCount === 1) {
        signalFirstStats();
        await firstStatsGate;
      }
    },
  });
  await page.route('**/__e2e_admin_unload_probe__', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><title>Unload probe</title></head><body>Unload probe</body></html>',
  }));

  await openApp(page, '/');
  await navigate(page, 'Админ');
  await firstStatsStarted;
  await expect.poll(() => page.evaluate(key => localStorage.getItem(`${key}:stats`), marker)).toBe('1');

  const appOrigin = await page.evaluate(() => location.origin);
  try {
    await page.goto(`${appOrigin}/__e2e_admin_unload_probe__`);
  } finally {
    releaseFirstStats();
  }
  await expect(page).toHaveTitle('Unload probe');
  expect(await page.evaluate(key => ({
    signal: localStorage.getItem(`${key}:signal`),
    beforeunload: localStorage.getItem(`${key}:beforeunload`),
    scope: localStorage.getItem(`${key}:scope`),
  }), marker)).toEqual({ signal: 'aborted', beforeunload: 'fired', scope: `${account}:${sid}` });
});

test('a delayed admin stats response from a previous same-account session is discarded after reauthentication', async ({ page, context }) => {
  const nextSid = 'b'.repeat(64);
  let releaseOldStats!: () => void;
  let signalOldStats!: () => void;
  const oldStatsGate = new Promise<void>(resolve => { releaseOldStats = resolve; });
  const oldStatsStarted = new Promise<void>(resolve => { signalOldStats = resolve; });
  let oldStatsRequests = 0;
  let releasedOldStats = 0;

  await mockApp(page, { session: 'app', admin: true, acknowledgeStateWrites: true });
  await page.route('**/api/admin/stats', async route => {
    oldStatsRequests += 1;
    const request = route.request();
    if (oldStatsRequests > 1) return route.fallback();
    expect(request.headers()['x-fitfocus-state-account']).toBe(account);
    expect(request.headers()['x-fitfocus-state-session']).toBe(sid);
    signalOldStats();
    await oldStatsGate;
    releasedOldStats += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'X-FitFocus-Admin-Protocol': '1',
        'X-FitFocus-Admin-Guard': '1',
        'X-FitFocus-State-Account': account,
        'X-FitFocus-State-Session': sid,
      },
      body: JSON.stringify(adminStatsBody(91, 'OLD_ADMIN_SESSION_ONLY')),
    });
  });

  await openApp(page, '/');
  await expect.poll(() => activeSessionIdentity(page)).toMatchObject({
    accountId: account,
    serverSessionId: sid,
  });
  const previousSession = await activeSessionIdentity(page);
  await navigate(page, 'Админ');
  await oldStatsStarted;

  const reauthenticatedPage = await context.newPage();
  try {
    await mockApp(reauthenticatedPage, { session: 'app', admin: true, acknowledgeStateWrites: true });
    await reauthenticatedPage.route('**/api/me*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { sub: account, email: 'e2e@example.com', name: 'E2E User', roles: ['user', 'admin'] },
        hasAccess: true,
        stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: nextSid },
        bootstrapSync: { protocol: 1, guard: 1 },
        profileSync: { protocol: 1, guard: 1, weeklyMenuProjection: 1 },
        aiSync: { protocol: 1, guard: 1 }, weeklyMenuSync: { protocol: 1, guard: 1 },
        achievementSync: { protocol: 1, guard: 1 }, huaweiSync: { protocol: 1, guard: 1 },
        pushSync: { protocol: 1, guard: 1 },
      }),
    }));
    await reauthenticatedPage.route('**/api/bootstrap*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: sessionHeaders(nextSid, 'bootstrap'),
      body: JSON.stringify({ user: { sub: account }, profile: buildMockProfile(), items: [] }),
    }));
    await reauthenticatedPage.route('**/api/state*', route => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: sessionHeaders(nextSid, 'state'),
        body: JSON.stringify({ items: [] }),
      });
    });
    await reauthenticatedPage.route('**/api/admin/stats', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'X-FitFocus-Admin-Protocol': '1',
        'X-FitFocus-Admin-Guard': '1',
        'X-FitFocus-State-Account': account,
        'X-FitFocus-State-Session': nextSid,
      },
      body: JSON.stringify(adminStatsBody(12, 'NEW_ADMIN_SESSION_ONLY')),
    }));

    await openApp(reauthenticatedPage, '/');
    await expect.poll(() => activeSessionIdentity(reauthenticatedPage)).toMatchObject({
      accountId: account,
      serverSessionId: nextSid,
    });
    const nextSession = await activeSessionIdentity(reauthenticatedPage);
    expect(nextSession?.sessionEpoch).toBeTruthy();
    expect(nextSession?.sessionEpoch).not.toBe(previousSession?.sessionEpoch);
    await navigate(reauthenticatedPage, 'Админ');
    await expect(reauthenticatedPage.getByText('NEW_ADMIN_SESSION_ONLY', { exact: true })).toBeVisible();

    releaseOldStats();
    await expect.poll(() => releasedOldStats).toBe(1);
    await expect(reauthenticatedPage.getByText('NEW_ADMIN_SESSION_ONLY', { exact: true })).toBeVisible();
    await expect(page.getByText('OLD_ADMIN_SESSION_ONLY', { exact: true })).toHaveCount(0);
    await expect(reauthenticatedPage.getByText('OLD_ADMIN_SESSION_ONLY', { exact: true })).toHaveCount(0);
    expect(await activeSessionIdentity(page)).toMatchObject({
      accountId: account,
      serverSessionId: nextSid,
    });
  } finally {
    releaseOldStats();
  }
});
