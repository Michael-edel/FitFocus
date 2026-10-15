import { expect, test, type Page, type Worker } from '@playwright/test';
import { resolve } from 'node:path';
import { mockApp, openApp } from './support/appHarness';
import { startPwaReleaseServer } from './support/pwaReleaseServer';

const accountId = 'google-e2e-sub';
const serverSessionId = 'a'.repeat(64);

async function activeSession(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const read = db.transaction('outbox_meta').objectStore('outbox_meta').get('active-session');
      return await new Promise<{ accountId: string; serverSessionId?: string } | null>((resolve, reject) => {
        read.onsuccess = () => resolve(read.result ?? null);
        read.onerror = () => reject(read.error);
      });
    } finally {
      db.close();
    }
  });
}

async function dispatchSubscriptionChange(worker: Worker): Promise<void> {
  await worker.evaluate(async () => {
    const pending: { promise?: Promise<unknown> } = {};
    const event = new Event('pushsubscriptionchange');
    Object.defineProperties(event, {
      newSubscription: {
        value: {
          toJSON: () => ({
            endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-subscription',
            expirationTime: null,
            keys: { p256dh: 'cHVi', auth: 'YXV0aA' },
          }),
        },
      },
      waitUntil: {
        value: (promise: Promise<unknown>) => { pending.promise = Promise.resolve(promise); },
      },
    });
    (globalThis as unknown as { dispatchEvent(value: Event): boolean }).dispatchEvent(event);
    if (!pending.promise) throw new Error('Service Worker did not retain pushsubscriptionchange work');
    await pending.promise;
  });
}

test('native Service Worker push recovery uses the active session and stops after logout', async ({ context, page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'Service Worker event injection is run in the native Chromium project.');
  test.setTimeout(60_000);

  const dist = resolve('dist');
  const server = await startPwaReleaseServer(dist, dist);
  try {
    await mockApp(page, { session: 'app', realServiceWorker: true, nativeApi: true, push: { standalone: true } });
    await openApp(page, `${server.origin}/#settings`);
    await expect(page).toHaveTitle(/FitFocus/);
    await expect.poll(async () => (await activeSession(page))?.serverSessionId).toBe(serverSessionId);
    await expect.poll(() => context.serviceWorkers().some(worker => new URL(worker.url()).pathname === '/sw.js')).toBe(true);

    const worker = context.serviceWorkers().find(candidate => new URL(candidate.url()).pathname === '/sw.js');
    expect(worker).toBeTruthy();
    await dispatchSubscriptionChange(worker!);
    expect(server.counts.pushSubscribe).toBe(1);
    expect(server.pushRequests).toEqual([{
      path: '/api/push/subscribe',
      method: 'POST',
      account: accountId,
      session: serverSessionId,
    }]);

    const logout = page.getByRole('button', { name: 'Выйти из аккаунта', exact: true });
    await logout.scrollIntoViewIfNeeded();
    await logout.click();
    await expect(page.getByRole('link', { name: /Google профиль/ })).toBeVisible();
    await expect.poll(async () => activeSession(page)).toBeNull();
    await expect.poll(() => server.counts.logout).toBe(1);

    const meRequestsAfterLogout = server.counts.me;
    await dispatchSubscriptionChange(worker!);
    expect(server.counts.me).toBe(meRequestsAfterLogout);
    expect(server.counts.pushSubscribe).toBe(1);
    expect(server.pushRequests).toHaveLength(1);

    const nextSessionId = 'b'.repeat(64);
    server.setActiveSessionId(nextSessionId);
    await page.reload();
    await expect(page).toHaveTitle(/FitFocus/);
    await expect.poll(async () => (await activeSession(page))?.serverSessionId).toBe(nextSessionId);
    const reboundWorker = context.serviceWorkers().find(candidate => new URL(candidate.url()).pathname === '/sw.js');
    expect(reboundWorker).toBeTruthy();
    await dispatchSubscriptionChange(reboundWorker!);
    expect(server.counts.me).toBeGreaterThan(meRequestsAfterLogout);
    expect(server.counts.pushSubscribe).toBe(2);
    expect(server.pushRequests).toEqual([
      { path: '/api/push/subscribe', method: 'POST', account: accountId, session: serverSessionId },
      { path: '/api/push/subscribe', method: 'POST', account: accountId, session: nextSessionId },
    ]);
    expect(server.unexpectedApi).toEqual([]);
  } finally {
    await page.close().catch(() => {});
    await server.close();
  }
});
