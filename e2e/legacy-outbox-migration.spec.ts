import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { legacyWriterPwaDist } from './support/preparePwaFixture';
import { startPwaReleaseServer } from './support/pwaReleaseServer';
import { mockApp, openApp } from './support/appHarness';

const account = 'google-e2e-sub';
const legacySourceKey = 'fitfocus.remote-kv-outbox.v1';
const targetKey = `fitfocus_data_${account}_plan_task_done`;
const orphanKey = 'fitfocus_data_another-account_orphan';
const taskText = 'Записать первый завтрак';
const taskEntry = `0:${taskText}`;
// Keep in sync with the production sender lease in storage/stateSync.ts.
const SENDER_LEASE_MS = 30_000;

type LegacyRecord = { type: string; key: string; value?: string; baseVersion?: number; retryCount?: number };
type OutboxOperation = { opId: string; type: string; key: string; value?: string; accountId: string; baseVersion: number;
  status: string; reason?: string; nextAttemptAtMs: number; attempt?: { startedAtMs: number } };
type MigrationItem = { id: string; canonical: string; state: string; reason?: string; accountId?: string; opId?: string; acknowledgedVersion?: number };
type MigrationUnknown = { rawRecord: unknown; reason: string };

async function oldQueueRecord(page: Page, key: string): Promise<LegacyRecord | null> {
  return page.evaluate(({ sourceKey, target }) => {
    const parsed: unknown = JSON.parse(localStorage.getItem(sourceKey) ?? '[]');
    return Array.isArray(parsed) ? parsed.find((item) => !!item && typeof item === 'object' && (item as { key?: unknown }).key === target) ?? null : null;
  }, { sourceKey: legacySourceKey, target: key });
}

async function migrationState(page: Page) {
  return page.evaluate(async ({ sourceKey, valueKey }) => {
    const opening = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
      opening.onblocked = () => reject(new Error('STATE_DATABASE_OPEN_BLOCKED'));
    });
    try {
      const requested = ['values', 'outbox', 'outbox_meta', 'outbox_migration_items', 'outbox_migration_unknown'];
      const stores = requested.filter((name) => db.objectStoreNames.contains(name));
      const tx = db.transaction(stores, 'readonly');
      const complete = new Promise<void>((resolve, reject) => {
        tx.addEventListener('complete', () => resolve(), { once: true });
        tx.addEventListener('abort', () => reject(tx.error), { once: true });
      });
      const read = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const all = <T,>(name: string) => stores.includes(name)
        ? read(tx.objectStore(name).getAll() as IDBRequest<T[]>)
        : Promise.resolve([] as T[]);
      const [values, operations, metadata, migrationItems, migrationUnknown] = await Promise.all([
        all<{ key: string; value: string }>('values'), all<OutboxOperation>('outbox'),
        all<{ id: string; [key: string]: unknown }>('outbox_meta'), all<MigrationItem>('outbox_migration_items'),
        all<MigrationUnknown>('outbox_migration_unknown'),
      ]);
      await complete;
      return {
        databaseVersion: db.version,
        source: localStorage.getItem(sourceKey),
        value: values.find((entry) => entry.key === valueKey)?.value ?? null,
        operations,
        metadata,
        progress: metadata.find((entry) => entry.id === 'legacy-migration:v1') ?? null,
        migrationItems,
        migrationUnknown,
        nowMs: Date.now(),
      };
    } finally { db.close(); }
  }, { sourceKey: legacySourceKey, valueKey: targetKey });
}

function itemForKey(items: MigrationItem[], key: string): MigrationItem | undefined {
  return items.find((item) => {
    try { return (JSON.parse(item.canonical) as unknown[])[1] === key; } catch { return false; }
  });
}

function legacySourceFingerprintFields(source: string | null): string[] {
  const parsed: unknown = JSON.parse(source ?? '[]');
  if (!Array.isArray(parsed)) throw new Error('LEGACY_SOURCE_NOT_AN_ARRAY');
  // retryCount is mutable delivery metadata and is intentionally excluded from the stable fingerprint.
  return parsed.map((record: unknown) => {
    if (typeof record !== 'object' || record === null) return JSON.stringify(['invalid', record]);
    const value = record as Record<string, unknown>;
    return JSON.stringify([
      value.type,
      value.key,
      value.value ?? null,
      value.baseVersion ?? 0,
    ]);
  }).sort();
}

function quarantinedRecordExists(records: MigrationUnknown[], key: string): boolean {
  return records.some(({ rawRecord, reason }) => reason === 'unknown-owner' && rawRecord !== null
    && typeof rawRecord === 'object' && (rawRecord as { key?: unknown }).key === key);
}

test('imports a pending write produced by the legacy bundle and keeps unknown ownership quarantined', async ({ context }, info) => {
  test.setTimeout(120_000);
  const server = await startPwaReleaseServer(legacyWriterPwaDist, resolve('dist'), {
    stateUnavailable: true, currentStateUnavailable: true,
  });
  const oldPage = await context.newPage();
  const currentPage = await context.newPage();
  let legacyWritesBeforeUpdate = 0;
  try {
    const standalone = info.project.name.includes('-pwa');
    await mockApp(oldPage, { session: 'app', realServiceWorker: true, nativeApi: true, push: { standalone } });
    await openApp(oldPage, `${server.origin}/#plan`);
    await expect(oldPage).toHaveTitle(/FitFocus/);
    await expect.poll(() => oldPage.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? '')).toContain('/sw.js');
    const legacyScript = await oldPage.locator('script[type="module"][src]').getAttribute('src');
    expect(legacyScript).toBeTruthy();

    // This click runs safeSetItem from the pinned legacy client, which writes the old Map queue.
    const task = oldPage.getByRole('button', { name: taskText, exact: true });
    await expect(task).toBeVisible();
    await task.click();
    await expect.poll(async () => (await oldQueueRecord(oldPage, targetKey))?.value ?? '').toContain(taskEntry);
    const generatedRecord = await oldQueueRecord(oldPage, targetKey);
    expect(generatedRecord).toMatchObject({ type: 'put', key: targetKey });
    expect(generatedRecord?.value).toContain(taskEntry);
    expect(generatedRecord && 'baseVersion' in generatedRecord).toBe(false);
    expect(generatedRecord && 'retryCount' in generatedRecord).toBe(false);
    server.recoverState();
    await expect.poll(() => server.counts.legacyStateScopeRejected).toBeGreaterThan(0);
    legacyWritesBeforeUpdate = server.counts.legacyStatePutAttempts;
    expect(legacyWritesBeforeUpdate).toBeGreaterThan(0);
    expect(server.counts.currentStatePutAttempts).toBe(0);

    // Add one valid but foreign-owned old-format record to exercise quarantine alongside the real write.
    const oldSource = await oldPage.evaluate(({ sourceKey, foreignKey }) => {
      const records = JSON.parse(localStorage.getItem(sourceKey) ?? '[]') as unknown[];
      records.push({ type: 'put', key: foreignKey, value: 'must-remain-quarantined' });
      const raw = JSON.stringify(records);
      localStorage.setItem(sourceKey, raw);
      return raw;
    }, { sourceKey: legacySourceKey, foreignKey: orphanKey });

    server.release();
    await mockApp(currentPage, { session: 'app', realServiceWorker: true, nativeApi: true, push: { standalone } });
    await openApp(currentPage, `${server.origin}/?release=next#plan`);
    await expect(currentPage).toHaveTitle(/FitFocus/);
    await expect.poll(() => currentPage.evaluate(async () => (await navigator.serviceWorker.ready).waiting?.state ?? null)).toBe('installed');
    await expect(currentPage.getByText(/Сначала нужно проверить импорт прежних изменений/)).toBeVisible();

    await expect.poll(async () => {
      const state = await migrationState(currentPage);
      const imported = itemForKey(state.migrationItems, targetKey);
      const quarantined = itemForKey(state.migrationItems, orphanKey);
      const operation = state.operations.find((entry) => entry.opId === imported?.opId);
      return {
        sourceFingerprintFields: legacySourceFingerprintFields(state.source),
        targetState: imported?.state,
        targetOwner: imported?.accountId,
        targetOperationKey: operation?.key,
        targetOperationOwner: operation?.accountId,
        targetOperationValue: operation?.value,
        targetOperationBaseVersion: operation?.baseVersion,
        foreignState: quarantined?.state,
        foreignReason: quarantined?.reason,
        foreignRawRetained: quarantinedRecordExists(state.migrationUnknown, orphanKey),
        sendAllowed: state.progress?.sendAllowed,
        writersStopped: state.progress?.writersStopped,
      };
    }).toEqual({
      sourceFingerprintFields: legacySourceFingerprintFields(oldSource),
      targetState: 'imported',
      targetOwner: account,
      targetOperationKey: targetKey,
      targetOperationOwner: account,
      targetOperationValue: generatedRecord?.value,
      targetOperationBaseVersion: 0,
      foreignState: 'unknown',
      foreignReason: 'unknown-owner',
      foreignRawRetained: true,
      sendAllowed: false,
      writersStopped: false,
    });
    // Keep the backend unavailable until the release barrier has been checked;
    // the old/current clients must not even attempt a current-state write yet.
    expect(server.counts.currentStatePutAttempts).toBe(0);
    expect(server.stateWriteKeys).not.toContain(targetKey);

    // Keep current writes unavailable while both documents navigate. The first
    // new-build request must not be accepted just before that page is unloaded:
    // the server could commit it while navigation drops the acknowledgement.
    const update = currentPage.getByRole('button', { name: 'Обновить приложение', exact: true });
    await expect(update).toBeVisible();
    const currentNavigation = currentPage.waitForEvent('framenavigated', frame => frame === currentPage.mainFrame());
    const oldNavigation = oldPage.waitForEvent('framenavigated', frame => frame === oldPage.mainFrame());
    await update.click({ noWaitAfter: true });
    await Promise.all([currentNavigation, oldNavigation]);
    await Promise.all([currentPage.waitForLoadState('load'), oldPage.waitForLoadState('load')]);
    const currentScript = await currentPage.locator('script[type="module"][src]').getAttribute('src');
    expect(currentScript).toBeTruthy();
    expect(currentScript).not.toBe(legacyScript);
    await expect(oldPage.locator('script[type="module"][src]')).toHaveAttribute('src', currentScript!);
    const buildIds = await Promise.all([oldPage, currentPage].map(page => page.evaluate(() => localStorage.getItem('fitfocus.build.id'))));
    expect(buildIds[0]).toBeTruthy();
    expect(buildIds[0]).toBe(buildIds[1]);
    await expect.poll(async () => {
      const progress = (await migrationState(currentPage)).progress;
      return progress?.writersStopped === true && progress.sendAllowed === true;
    }).toBe(true);
    const beforeRecovery = await migrationState(currentPage);
    const importedBeforeRecovery = itemForKey(beforeRecovery.migrationItems, targetKey);
    const targetBeforeRecovery = beforeRecovery.operations.find(operation => operation.opId === importedBeforeRecovery?.opId);
    const eligibleAtMs = targetBeforeRecovery?.status === 'sending' && targetBeforeRecovery.attempt
      ? targetBeforeRecovery.attempt.startedAtMs + SENDER_LEASE_MS
      : targetBeforeRecovery?.nextAttemptAtMs ?? beforeRecovery.nowMs;
    const recoveryTimeoutMs = Math.max(10_000, eligibleAtMs - beforeRecovery.nowMs + 10_000);
    // A request aborted by navigation remains sending until its durable lease
    // expires. Otherwise the explicit 503 response returns it to pending.
    await expect.poll(async () => {
      const state = await migrationState(currentPage);
      const imported = itemForKey(state.migrationItems, targetKey);
      const operation = state.operations.find(entry => entry.opId === imported?.opId);
      return operation?.status === 'pending' && operation.reason === 'http-503';
    }, { timeout: recoveryTimeoutMs }).toBe(true);
    expect(server.stateWriteKeys).not.toContain(targetKey);
    server.recoverCurrentState();
    await expect.poll(() => server.stateWriteKeys.includes(targetKey)).toBe(true);
    await expect.poll(async () => {
      const state = await migrationState(currentPage);
      const imported = itemForKey(state.migrationItems, targetKey);
      const operationPresent = state.operations.some((entry) => entry.opId === imported?.opId);
      return {
        sourceFingerprintFields: legacySourceFingerprintFields(state.source),
        targetState: imported?.state,
        targetOwner: imported?.accountId,
        acknowledgedVersion: imported?.acknowledgedVersion,
        operationPresent,
        foreignState: itemForKey(state.migrationItems, orphanKey)?.state,
        foreignReason: itemForKey(state.migrationItems, orphanKey)?.reason,
        foreignRawRetained: quarantinedRecordExists(state.migrationUnknown, orphanKey),
        sendAllowed: state.progress?.sendAllowed,
        writersStopped: state.progress?.writersStopped,
      };
    }).toEqual({
      sourceFingerprintFields: legacySourceFingerprintFields(oldSource),
      targetState: 'imported',
      targetOwner: account,
      acknowledgedVersion: 1,
      operationPresent: false,
      foreignState: 'unknown',
      foreignReason: 'unknown-owner',
      foreignRawRetained: true,
      sendAllowed: true,
      writersStopped: true,
    });
    expect(server.stateWriteKeys).toContain(targetKey);
    expect(server.stateWriteKeys).not.toContain(orphanKey);
    expect(server.counts.legacyStatePutAttempts).toBe(legacyWritesBeforeUpdate);
    // The pinned old profile writer has no current scope headers; its request is denied as expected.
    expect(server.unexpectedApi).toContain('INVALID_SCOPE:/api/profile');
    expect(server.unexpectedApi.filter(request => request !== 'INVALID_SCOPE:/api/profile')).toEqual([]);
    await expect(currentPage.getByText('1/3 выполнено', { exact: true })).toBeVisible();
    await expect(oldPage.getByText('1/3 выполнено', { exact: true })).toBeVisible();
    await expect(currentPage).toHaveTitle(/FitFocus/);
    await info.attach('legacy-outbox-migration', { body: JSON.stringify({
      sourceRecord: generatedRecord, oldSource, databaseVersion: (await migrationState(currentPage)).databaseVersion,
      acceptedStateKeys: server.stateWriteKeys, counts: server.counts,
    }), contentType: 'application/json' });
  } catch (error) {
    const diagnostic = {
      counts: server.counts, stateWriteKeys: server.stateWriteKeys, unexpectedApi: server.unexpectedApi,
      source: await oldPage.evaluate((key) => localStorage.getItem(key), legacySourceKey).catch(() => null),
      migration: await migrationState(currentPage).catch(cause => ({ error: String(cause) })),
      currentBody: await currentPage.locator('body').innerText().catch(() => ''),
    };
    await info.attach('legacy-outbox-failure', { body: JSON.stringify(diagnostic), contentType: 'application/json' });
    console.error('LEGACY_OUTBOX_FAILURE', JSON.stringify(diagnostic));
    throw error;
  } finally {
    await Promise.allSettled([oldPage.close(), currentPage.close()]);
    await server.close();
  }
});
