import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { legacyWriterPwaDist } from './support/preparePwaFixture';
import { startPwaReleaseServer } from './support/pwaReleaseServer';
import { buildMockProfile, mockApp, openApp } from './support/appHarness';

const account = 'google-e2e-sub';
const legacySourceKey = 'fitfocus.remote-kv-outbox.v1';
const targetKey = `fitfocus_data_${account}_plan_task_done`;
const orphanKey = 'fitfocus_data_another-account_orphan';
const malformedKey = `fitfocus_data_${account}_malformed`;
const taskText = 'Записать первый завтрак';
const taskEntry = `0:${taskText}`;

type LegacyRecord = { type: string; key: string; value?: string; baseVersion?: number; retryCount?: number };
type OutboxOperation = { opId: string; type: string; key: string; value?: string; accountId: string; baseVersion: number;
  status: string; reason?: string; nextAttemptAtMs: number; attempt?: { startedAtMs: number } };
type MigrationItem = { id: string; canonical: string; state: string; reason?: string; accountId?: string; opId?: string;
  acknowledgedVersion?: number; resolution?: { kind: string; serverVersion: number; atMs: number; replacementOpId?: string } };
type MigrationUnknown = { rawRecord: unknown; reason: string };

async function oldQueueRecord(page: Page, key: string): Promise<LegacyRecord | null> {
  return page.evaluate(({ sourceKey, target }) => {
    const parsed: unknown = JSON.parse(localStorage.getItem(sourceKey) ?? '[]');
    return Array.isArray(parsed) ? parsed.find((item) => !!item && typeof item === 'object' && (item as { key?: unknown }).key === target) ?? null : null;
  }, { sourceKey: legacySourceKey, target: key });
}

async function migrationState(page: Page, valueKey = targetKey) {
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
  }, { sourceKey: legacySourceKey, valueKey });
}

function itemForKey(items: MigrationItem[], key: string): MigrationItem | undefined {
  return items.find((item) => {
    try { return (JSON.parse(item.canonical) as unknown[])[1] === key; } catch { return false; }
  });
}

function itemForRecord(items: MigrationItem[], key: string, value: string): MigrationItem | undefined {
  return items.find((item) => {
    try {
      const fields = JSON.parse(item.canonical) as unknown[];
      return fields[1] === key && fields[2] === value;
    } catch { return false; }
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

function quarantinedRecordFor(records: MigrationUnknown[], key: string, reason: string): MigrationUnknown | undefined {
  return records.find(({ rawRecord, reason: actualReason }) => actualReason === reason && rawRecord !== null
    && typeof rawRecord === 'object' && (rawRecord as { key?: unknown }).key === key);
}

test('preserves legacy intent without sending an operation whose server generation is unproven', async ({ context }, info) => {
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
    server.recoverState();
    await expect.poll(() => server.counts.legacyStateScopeRejected).toBeGreaterThan(0);
    legacyWritesBeforeUpdate = server.counts.legacyStatePutAttempts;
    expect(legacyWritesBeforeUpdate).toBeGreaterThan(0);
    expect(server.counts.currentStatePutAttempts).toBe(0);

    // Exercise both owner quarantine and malformed-record quarantine alongside the real write.
    const malformedRecord = { type: 'put', key: malformedKey, value: { should: 'remain-raw' } };
    const oldSource = await oldPage.evaluate(({ sourceKey, foreignKey, invalidRecord }) => {
      const records = JSON.parse(localStorage.getItem(sourceKey) ?? '[]') as unknown[];
      records.push({ type: 'put', key: foreignKey, value: 'must-remain-quarantined' });
      records.push(invalidRecord);
      const raw = JSON.stringify(records);
      localStorage.setItem(sourceKey, raw);
      return raw;
    }, { sourceKey: legacySourceKey, foreignKey: orphanKey, invalidRecord: malformedRecord });

    server.release();
    await mockApp(currentPage, { session: 'app', realServiceWorker: true, nativeApi: true, push: { standalone } });
    await openApp(currentPage, `${server.origin}/?release=next#plan`);
    await expect(currentPage).toHaveTitle(/FitFocus/);
    await expect.poll(() => currentPage.evaluate(async () => (await navigator.serviceWorker.ready).waiting?.state ?? null)).toBe('installed');
    await expect(currentPage.getByRole('alert')).toContainText('Обнаружен конфликт данных');

    await expect.poll(async () => {
      const state = await migrationState(currentPage);
      const imported = itemForKey(state.migrationItems, targetKey);
      const quarantined = itemForKey(state.migrationItems, orphanKey);
      const malformed = quarantinedRecordFor(state.migrationUnknown, malformedKey, 'put-without-value');
      const operation = state.operations.find((entry) => entry.opId === imported?.opId);
      return {
        sourceFingerprintFields: legacySourceFingerprintFields(state.source),
        targetState: imported?.state,
        targetOwner: imported?.accountId,
        targetOperationKey: operation?.key,
        targetOperationOwner: operation?.accountId,
        targetOperationValue: operation?.value,
        targetOperationBaseVersion: operation?.baseVersion,
        targetOperationStatus: operation?.status,
        targetOperationReason: operation?.reason,
        foreignState: quarantined?.state,
        foreignReason: quarantined?.reason,
        foreignRawRetained: quarantinedRecordExists(state.migrationUnknown, orphanKey),
        malformedReason: malformed?.reason,
        malformedRawRecord: malformed?.rawRecord,
        malformedOperationCreated: state.operations.some((entry) => entry.key === malformedKey),
        migrationStatus: state.progress?.status,
        sendAllowed: state.progress?.sendAllowed,
        writersStopped: state.progress?.writersStopped,
      };
    }, { timeout: 30_000 }).toEqual({
      sourceFingerprintFields: legacySourceFingerprintFields(oldSource),
      targetState: 'imported',
      targetOwner: account,
      targetOperationKey: targetKey,
      targetOperationOwner: account,
      targetOperationValue: generatedRecord?.value,
      targetOperationBaseVersion: 0,
      targetOperationStatus: 'conflicted',
      targetOperationReason: 'legacy-server-generation-unproven',
      foreignState: 'unknown',
      foreignReason: 'unknown-owner',
      foreignRawRetained: true,
      malformedReason: 'put-without-value',
      malformedRawRecord: malformedRecord,
      malformedOperationCreated: false,
      migrationStatus: 'partial',
      sendAllowed: false,
      writersStopped: false,
    });
    // Keep the backend unavailable until the release barrier has been checked;
    // the old/current clients must not even attempt a current-state write yet.
    expect(server.counts.currentStatePutAttempts).toBe(0);
    expect(server.stateWriteKeys).not.toContain(targetKey);

    // The old bundle can persist a local value after its legacy sender is
    // auth-blocked, without changing its Map-backed legacy queue. The new
    // bundle must retain that value as a conflict rather than silently lose it.
    const previousOldRecord = generatedRecord!;
    const updatedOldValue = JSON.stringify({ [taskEntry]: false });
    await oldPage.getByRole('button', { name: taskText, exact: true }).click();
    await expect.poll(() => oldPage.evaluate((key) => localStorage.getItem(key), targetKey)).toBe(updatedOldValue);
    const updatedOldSource = await oldPage.evaluate((key) => localStorage.getItem(key), legacySourceKey);
    expect(updatedOldSource).toBe(oldSource);
    const oldRecordAfterClick = await oldQueueRecord(oldPage, targetKey);
    expect(oldRecordAfterClick).toMatchObject({ type: 'put', key: targetKey, value: previousOldRecord.value });
    expect(oldRecordAfterClick && 'baseVersion' in oldRecordAfterClick).toBe(false);
    await expect.poll(async () => {
      const state = await migrationState(currentPage);
      const original = itemForRecord(state.migrationItems, targetKey, previousOldRecord.value!);
      const preserved = state.operations.find((entry) => entry.reason === 'legacy-writer-local-only');
      return {
        source: state.source,
        sourceMatches: state.progress?.sourceMatches,
        sendAllowed: state.progress?.sendAllowed,
        writersStopped: state.progress?.writersStopped,
        originalImported: original?.state,
        preservedKey: preserved?.key,
        preservedOperationStatus: preserved?.status,
        preservedOperationValue: preserved?.value,
      };
    }, { timeout: 20_000 }).toEqual({
      source: updatedOldSource,
      sourceMatches: true,
      sendAllowed: false,
      writersStopped: false,
      originalImported: 'imported',
      preservedKey: targetKey,
      preservedOperationStatus: 'conflicted',
      preservedOperationValue: updatedOldValue,
    });
    legacyWritesBeforeUpdate = server.counts.legacyStatePutAttempts;
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
    }, { timeout: 30_000 }).toBe(true);
    const beforeRecovery = await migrationState(currentPage);
    const importedBeforeRecovery = itemForRecord(beforeRecovery.migrationItems, targetKey, previousOldRecord.value!);
    const targetBeforeRecovery = beforeRecovery.operations.find(operation => operation.opId === importedBeforeRecovery?.opId);
    expect(targetBeforeRecovery).toMatchObject({ status: 'conflicted', baseVersion: 0,
      reason: 'legacy-server-generation-unproven' });
    // The fresh all-client fence may open the sender gate for current work, but
    // it cannot establish which server generation this old operation targeted.
    expect(server.stateWriteKeys).not.toContain(targetKey);
    await expect.poll(async () => {
      const state = await migrationState(currentPage);
      const imported = itemForRecord(state.migrationItems, targetKey, previousOldRecord.value!);
      const preserved = state.operations.find((entry) => entry.reason === 'legacy-writer-local-only');
      const malformed = quarantinedRecordFor(state.migrationUnknown, malformedKey, 'put-without-value');
      const operationPresent = state.operations.some((entry) => entry.opId === imported?.opId);
      return {
        sourceFingerprintFields: legacySourceFingerprintFields(state.source),
        targetState: imported?.state,
        targetOwner: imported?.accountId,
        acknowledgedVersion: imported?.acknowledgedVersion,
        operationPresent,
        targetOperationStatus: state.operations.find(entry => entry.opId === imported?.opId)?.status,
        targetOperationReason: state.operations.find(entry => entry.opId === imported?.opId)?.reason,
        preservedOperationStatus: preserved?.status,
        preservedOperationReason: preserved?.reason,
        preservedOperationValue: preserved?.value,
        foreignState: itemForKey(state.migrationItems, orphanKey)?.state,
        foreignReason: itemForKey(state.migrationItems, orphanKey)?.reason,
        foreignRawRetained: quarantinedRecordExists(state.migrationUnknown, orphanKey),
        malformedReason: malformed?.reason,
        malformedRawRecord: malformed?.rawRecord,
        malformedOperationCreated: state.operations.some((entry) => entry.key === malformedKey),
        migrationStatus: state.progress?.status,
        sendAllowed: state.progress?.sendAllowed,
        writersStopped: state.progress?.writersStopped,
      };
    }).toEqual({
      sourceFingerprintFields: legacySourceFingerprintFields(oldSource),
      targetState: 'imported',
      targetOwner: account,
      acknowledgedVersion: undefined,
      operationPresent: true,
      targetOperationStatus: 'conflicted',
      targetOperationReason: 'legacy-server-generation-unproven',
      preservedOperationStatus: 'conflicted',
      preservedOperationReason: 'legacy-writer-local-only',
      preservedOperationValue: updatedOldValue,
      foreignState: 'unknown',
      foreignReason: 'unknown-owner',
      foreignRawRetained: true,
      malformedReason: 'put-without-value',
      malformedRawRecord: malformedRecord,
      malformedOperationCreated: false,
      migrationStatus: 'partial',
      sendAllowed: true,
      writersStopped: true,
    });
    expect(server.counts.currentStatePutAccepted).toBe(0);
    expect(server.stateWriteKeys).not.toContain(targetKey);
    expect(server.stateWriteKeys).not.toContain(orphanKey);
    expect(server.stateWriteKeys).not.toContain(malformedKey);
    expect(server.counts.legacyStatePutAttempts).toBe(legacyWritesBeforeUpdate);
    // The pinned old profile writer has no current scope headers; its request is denied as expected.
    expect(server.unexpectedApi).toContain('INVALID_SCOPE:/api/profile');
    expect(server.unexpectedApi.filter(request => request !== 'INVALID_SCOPE:/api/profile')).toEqual([]);
    await expect(currentPage.getByText('1/3 выполнено', { exact: true })).toBeVisible();
    await expect(oldPage.getByText('1/3 выполнено', { exact: true })).toBeVisible();
    await expect(currentPage).toHaveTitle(/FitFocus/);

    // An explicit user action reads the current server version, retires the
    // imported records in the same transaction, then sends a new operation.
    const acceptedBeforeResolution = server.counts.currentStatePutAccepted;
    server.recoverCurrentState();
    await currentPage.locator('[data-state-notice-region] details summary').click();
    const recovery = currentPage.getByRole('region', { name: 'План питания' });
    const keepLocal = recovery.getByRole('button', { name: 'Оставить последнюю локальную версию' });
    await expect(keepLocal).toBeVisible();
    const confirmation = currentPage.waitForEvent('dialog').then(async dialog => {
      const message = dialog.message();
      await dialog.accept();
      return message;
    });
    await keepLocal.click();
    expect(await confirmation).toContain('свежей версии сервера');
    await expect.poll(async () => (await migrationState(currentPage)).operations.filter(operation => operation.key === targetKey)).toHaveLength(0);
    const resolvedState = await migrationState(currentPage);
    const resolvedReceipt = itemForRecord(resolvedState.migrationItems, targetKey, previousOldRecord.value!);
    expect(resolvedReceipt?.resolution).toMatchObject({ kind: 'keep-latest-local', serverVersion: 0 });
    expect(server.stateWriteKeys).toContain(targetKey);
    expect(server.counts.currentStatePutAccepted).toBeGreaterThan(acceptedBeforeResolution);
    expect(resolvedState.value).toBe(updatedOldValue);
    expect(server.stateWriteKeys).not.toContain(malformedKey);
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

test('resolves a legacy profile through its guarded profile CAS endpoint', async ({ context }, info) => {
  test.setTimeout(120_000);
  const profileKey = `fitfocus_data_${account}_profile`;
  const profileValue = JSON.stringify({ ...buildMockProfile(), name: 'Локальный профиль из прежней очереди' });
  const server = await startPwaReleaseServer(legacyWriterPwaDist, resolve('dist'));
  server.release();
  const page = await context.newPage();
  try {
    await mockApp(page, { session: 'app', realServiceWorker: true, nativeApi: true });
    await page.addInitScript(({ sourceKey, record }) => localStorage.setItem(sourceKey, JSON.stringify([record])), {
      sourceKey: legacySourceKey, record: { type: 'put', key: profileKey, value: profileValue },
    });
    await openApp(page, `${server.origin}/?legacy-profile=1#plan`);
    await expect(page).toHaveTitle(/FitFocus/);
    await expect(page.getByRole('alert')).toContainText('Обнаружен конфликт данных');
    await expect.poll(async () => {
      const state = await migrationState(page, profileKey);
      return state.operations.some(operation => operation.key === profileKey && operation.status === 'conflicted');
    }, { timeout: 30_000 }).toBe(true);

    const updateNotice = page.getByRole('status', { name: 'Обновление FitFocus' });
    const postponeUpdate = updateNotice.getByRole('button', { name: 'Позже' });
    if (await postponeUpdate.isVisible().catch(() => false)) {
      await postponeUpdate.click();
      await expect(updateNotice).toBeHidden();
    }
    await page.locator('[data-state-notice-region] details summary').click();
    const group = page.getByRole('region', { name: 'Профиль' });
    const keepLocal = group.getByRole('button', { name: 'Оставить последнюю локальную версию' });
    await expect(keepLocal).toBeVisible();
    if (info.project.name === 'desktop-chromium') {
      await info.attach('legacy-profile-recovery-panel.png', { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' });
    }
    const confirmation = page.waitForEvent('dialog').then(async dialog => {
      const message = dialog.message();
      await dialog.accept();
      return message;
    });
    await keepLocal.click();
    expect(await confirmation).toContain('свежей версии сервера');

    await expect.poll(async () => {
      const state = await migrationState(page, profileKey);
      const receipt = itemForRecord(state.migrationItems, profileKey, profileValue);
      return { pending: state.operations.some(operation => operation.key === profileKey), resolution: receipt?.resolution };
    }).toEqual({ pending: false, resolution: expect.objectContaining({ kind: 'keep-latest-local', serverVersion: 1 }) });
    expect(server.counts.profile).toBe(1);
    expect(server.stateWriteKeys).not.toContain(profileKey);
    expect(server.unexpectedApi).toEqual([]);
    expect((await migrationState(page, profileKey)).value).toBe(profileValue);
    await info.attach('legacy-profile-resolution', { body: JSON.stringify({ counts: server.counts, unexpectedApi: server.unexpectedApi }),
      contentType: 'application/json' });
  } catch (error) {
    const diagnostic = { counts: server.counts, unexpectedApi: server.unexpectedApi,
      migration: await migrationState(page, profileKey).catch(cause => ({ error: String(cause) })),
      body: await page.locator('body').innerText().catch(() => '') };
    await info.attach('legacy-profile-resolution-failure', { body: JSON.stringify(diagnostic), contentType: 'application/json' });
    console.error('LEGACY_PROFILE_RESOLUTION_FAILURE', JSON.stringify(diagnostic));
    throw error;
  } finally {
    await page.close().catch(() => undefined);
    await server.close();
  }
});
