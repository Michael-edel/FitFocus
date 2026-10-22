import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { mockApp, openApp } from './support/appHarness';
import { startPwaReleaseServer } from './support/pwaReleaseServer';

const sourceKey = 'fitfocus.remote-kv-outbox.v1';
const key = 'fitfocus_data_google-e2e-sub_plan_task_done';
const value = JSON.stringify({ 'proof-recovery': true });

type ProbeWindow = Window & {
  __proofRecoveryBlocked?: boolean;
  __proofRecoveryProbes?: number;
  __proofRecoveryDatabase?: IDBDatabase;
  __proofRecoveryNextProbe?: (probe: { challengeId: string; atMs: number }) => void;
  __proofRecoveryLastBlockedProbe?: { challengeId: string; atMs: number };
  __proofRecoverySelectedProbe?: { challengeId: string; atMs: number };
};

async function preparePage(page: Page, blocked: boolean) {
  await mockApp(page, { session: 'app', realServiceWorker: true, nativeApi: true });
  await page.addInitScript(({ blocked, sourceKey, key, value }) => {
    // Init scripts also run after the test deliberately leaves the app origin.
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    const control = window as ProbeWindow;
    control.__proofRecoveryBlocked = blocked;
    control.__proofRecoveryProbes = 0;
    // Registered before the application responder: suppress a real worker probe,
    // without mocking the worker inventory, its reply, or the sender gate.
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type !== 'FITFOCUS_LEGACY_WRITER_FENCE_PROBE') return;
      control.__proofRecoveryProbes! += 1;
      if (control.__proofRecoveryBlocked) {
        const probe = { challengeId: String(event.data.challengeId), atMs: performance.now() };
        control.__proofRecoveryLastBlockedProbe = probe;
        event.stopImmediatePropagation();
        const nextProbe = control.__proofRecoveryNextProbe;
        delete control.__proofRecoveryNextProbe;
        if (nextProbe) control.__proofRecoverySelectedProbe = probe;
        nextProbe?.(probe);
      }
    }, { capture: true });
    if (localStorage.getItem(sourceKey) === null) {
      localStorage.setItem(sourceKey, JSON.stringify([{ type: 'put', key, value }]));
    }
    const originalOpen = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function(name: string, version?: number) {
      const request = version === undefined ? originalOpen.call(this, name) : originalOpen.call(this, name, version);
      if (name === 'fitfocus-user-state-v1') request.addEventListener('success', () => {
        control.__proofRecoveryDatabase = request.result;
      });
      return request;
    };
  }, { blocked, sourceKey, key, value });
}

async function snapshot(page: Page) {
  return page.evaluate(async ({ key }) => {
    const control = window as ProbeWindow;
    const database = control.__proofRecoveryDatabase;
    if (!database) throw new Error('APP_DATABASE_CONNECTION_NOT_CAPTURED');
    const tx = database.transaction(['outbox_meta', 'outbox', 'values'], 'readonly');
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    const read = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const [progress, operations, storedValue] = await Promise.all([
      read(tx.objectStore('outbox_meta').get('legacy-migration:v1')),
      read(tx.objectStore('outbox').getAll()) as Promise<Array<{ key: string; opId: string; value: string; status: string; reason?: string }>>,
      read(tx.objectStore('values').get(key)),
    ]);
    await done;
    return { progress, operations: operations.filter(operation => operation.key === key), storedValue,
      probes: control.__proofRecoveryProbes ?? 0 };
  }, { key });
}

for (const recovery of ['reply-resumes', 'navigate-away'] as const) {
test(`a real writer proof recovers after a same-build tab stops withholding probe replies: ${recovery}`, async ({ context }, info) => {
  test.setTimeout(90_000);
  const server = await startPwaReleaseServer(resolve('dist'), resolve('dist'));
  const blockedPage = await context.newPage();
  const currentPage = await context.newPage();
  const errors: string[] = [];
  for (const page of [blockedPage, currentPage]) {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  }
  try {
    await preparePage(blockedPage, true);
    await preparePage(currentPage, false);
    await openApp(blockedPage, `${server.origin}/#dashboard`);
    await expect.poll(() => blockedPage.evaluate(() => navigator.serviceWorker.controller?.state)).toBe('activated');
    await openApp(currentPage, `${server.origin}/#dashboard`);
    await expect.poll(() => currentPage.evaluate(() => navigator.serviceWorker.controller?.state)).toBe('activated');
    await expect.poll(() => blockedPage.evaluate(() => (window as ProbeWindow).__proofRecoveryProbes ?? 0), { timeout: 15_000 }).toBeGreaterThan(1);
    await expect.poll(async () => {
      const state = await snapshot(currentPage);
      return { audited: state.progress?.snapshotAuditComplete, writersStopped: state.progress?.writersStopped,
        sendAllowed: state.progress?.sendAllowed, intentCount: state.operations.length };
    }, { timeout: 15_000 }).toEqual({ audited: true, writersStopped: false, sendAllowed: false, intentCount: 1 });
    const before = await snapshot(currentPage);
    expect(before.operations[0]).toMatchObject({ value, status: 'conflicted', reason: 'legacy-server-generation-unproven' });
    expect(before.storedValue).toMatchObject({ key, value });
    expect(server.counts.currentStatePutAttempts).toBe(0);
    expect(server.counts.legacyStatePutAttempts).toBe(0);

    if (recovery === 'reply-resumes') {
      // No reload, focus event, manual sync or diagnostic challenge: polling must recover.
      await blockedPage.evaluate(() => { (window as ProbeWindow).__proofRecoveryBlocked = false; });
    } else {
      const probe = await blockedPage.evaluate(() => {
        const control = window as ProbeWindow;
        // Persist evidence in the old origin so the surviving page can read it.
        window.addEventListener('beforeunload', () => {
          localStorage.setItem('fitfocus.e2e.proof-navigation', JSON.stringify({
            probe: control.__proofRecoverySelectedProbe,
            lastBlockedProbe: control.__proofRecoveryLastBlockedProbe,
            unloadAtMs: performance.now(),
          }));
        }, { once: true });
        return new Promise<{ challengeId: string; atMs: number }>(resolve => {
          control.__proofRecoveryNextProbe = resolve;
        });
      });
      // This waits for an actual subsequent worker challenge, not a synthetic check.
      await blockedPage.goto('about:blank');
      const navigation = await currentPage.evaluate(() =>
        JSON.parse(localStorage.getItem('fitfocus.e2e.proof-navigation') ?? 'null') as {
          probe: { challengeId: string; atMs: number };
          lastBlockedProbe: { challengeId: string; atMs: number };
          unloadAtMs: number;
        } | null);
      expect(navigation).not.toBeNull();
      expect(navigation!.probe.challengeId).toBe(probe.challengeId);
      expect(navigation!.lastBlockedProbe.atMs).toBeGreaterThanOrEqual(probe.atMs);
      const elapsed = navigation!.unloadAtMs - probe.atMs;
      // This measures page-side ordering only. The worker starts its own timer
      // before delivery, so it does not prove that the worker still awaits this reply.
      expect(elapsed).toBeGreaterThanOrEqual(0);
      await info.attach('writer-proof-navigation', { body: JSON.stringify({ probe, navigation, elapsed }),
        contentType: 'application/json' });
    }
    await expect.poll(async () => {
      const state = await snapshot(currentPage);
      return state.progress?.writersStopped === true && state.progress.sendAllowed === true;
    }, { timeout: 30_000 }).toBe(true);
    const after = await snapshot(currentPage);
    expect(after.operations).toEqual(before.operations);
    expect(after.storedValue).toEqual(before.storedValue);
    expect(after.operations[0].opId).toBe(before.operations[0].opId);
    expect(server.stateWriteKeys).not.toContain(key);
    expect(server.unexpectedApi).toEqual([]);
    expect(errors).toEqual([]);
    await info.attach('writer-proof-recovery', { body: JSON.stringify({ before, after }), contentType: 'application/json' });
  } finally {
    const pages = await Promise.all([blockedPage, currentPage].map(page => snapshot(page)
      .catch(error => ({ diagnosticError: String(error) }))));
    await info.attach('writer-proof-final-state', { body: JSON.stringify({ pages, counts: server.counts, errors }),
      contentType: 'application/json' }).catch(() => {});
    await Promise.allSettled([blockedPage.close(), currentPage.close()]);
    await server.close();
  }
});
}
