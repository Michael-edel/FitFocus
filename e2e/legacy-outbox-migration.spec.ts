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
const malformedLegacyCases: Array<{ rawRecord: unknown; reason: string }> = [
  { rawRecord: null, reason: 'not-an-object' },
  { rawRecord: { type: 'other', key: `fitfocus_data_${account}_invalid_type` }, reason: 'invalid-type' },
  { rawRecord: { type: 'delete', key: '' }, reason: 'invalid-key' },
  { rawRecord: { type: 'put', key: malformedKey, value: { should: 'remain-raw' } }, reason: 'put-without-value' },
  { rawRecord: { type: 'delete', key: `fitfocus_data_${account}_delete_with_value`, value: '' }, reason: 'delete-with-value' },
  { rawRecord: { type: 'put', key: `fitfocus_data_${account}_invalid_base_version`, value: 'raw', baseVersion: -1 }, reason: 'invalid-baseVersion' },
  { rawRecord: { type: 'put', key: `fitfocus_data_${account}_invalid_retry_count`, value: 'raw', retryCount: 0.5 }, reason: 'invalid-retryCount' },
];
const malformedLegacyKeys = malformedLegacyCases.flatMap(({ rawRecord }) => {
  if (typeof rawRecord !== 'object' || rawRecord === null) return [];
  const key = (rawRecord as { key?: unknown }).key;
  return typeof key === 'string' ? [key] : [];
});
const taskText = 'Записать первый завтрак';
const taskEntry = `0:${taskText}`;

type LegacyRecord = { type: string; key: string; value?: string; baseVersion?: number; retryCount?: number };
type OutboxOperation = { opId: string; type: string; key: string; value?: string; accountId: string; writerId: string; baseVersion: number;
  status: string; reason?: string; nextAttemptAtMs: number; migrationSourceKey?: string; attempt?: { startedAtMs: number } };
type MigrationItem = { id: string; canonical: string; state: string; reason?: string; accountId?: string; opId?: string;
  acknowledgedVersion?: number; resolution?: { kind: string; serverVersion: number; atMs: number; replacementOpId?: string } };
type MigrationUnknown = { rawRecord: unknown; reason: string };

async function oldQueueRecord(page: Page, key: string): Promise<LegacyRecord | null> {
  return page.evaluate(({ sourceKey, target }) => {
    const parsed: unknown = JSON.parse(localStorage.getItem(sourceKey) ?? '[]');
    return Array.isArray(parsed) ? parsed.find((item) => !!item && typeof item === 'object' && (item as { key?: unknown }).key === target) ?? null : null;
  }, { sourceKey: legacySourceKey, target: key });
}

async function migrationState(page: Page, valueKey = targetKey, traceIndexedDb = false) {
  return page.evaluate(async ({ sourceKey, valueKey, traceIndexedDb }) => {
    const trace = (phase: string, detail?: unknown) => {
      if (traceIndexedDb) console.debug('FITFOCUS_IDB_PROBE', JSON.stringify({ phase, detail }));
    };
    const db = (window as Window & { __fitfocusE2eDatabase?: IDBDatabase }).__fitfocusE2eDatabase;
    if (!db) throw new Error('APP_DATABASE_CONNECTION_NOT_CAPTURED');
    trace('connection:reused', { version: db.version, stores: [...db.objectStoreNames] });
    const requested = ['values', 'outbox', 'outbox_meta', 'outbox_migration_items', 'outbox_migration_unknown'];
    const stores = requested.filter((name) => db.objectStoreNames.contains(name));
    const tx = db.transaction(stores, 'readonly');
    trace('transaction:start', { stores });
    const complete = new Promise<void>((resolve, reject) => {
      tx.addEventListener('complete', () => { trace('transaction:complete'); resolve(); }, { once: true });
      tx.addEventListener('abort', () => { trace('transaction:abort', tx.error?.name); reject(tx.error); }, { once: true });
    });
    const read = <T,>(name: string, request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
      request.onsuccess = () => { trace('request:success', name); resolve(request.result); };
      request.onerror = () => { trace('request:error', { name, error: request.error?.name }); reject(request.error); };
    });
    const all = <T,>(name: string) => {
      if (!stores.includes(name)) return Promise.resolve([] as T[]);
      const store = tx.objectStore(name);
      return read(name, store.getAll() as IDBRequest<T[]>);
    };
    const [values, operations, metadata, migrationItems, migrationUnknown] = await Promise.all([
      all<{ key: string; value: string }>('values'), all<OutboxOperation>('outbox'),
      all<{ id: string; [key: string]: unknown }>('outbox_meta'), all<MigrationItem>('outbox_migration_items'),
      all<MigrationUnknown>('outbox_migration_unknown'),
    ]);
    trace('requests:complete');
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
      snapshots: metadata.filter((entry) => entry.id.startsWith('legacy-snapshot:v1:')),
      nowMs: Date.now(),
    };
  }, { sourceKey: legacySourceKey, valueKey, traceIndexedDb });
}

async function captureAppDatabase(page: Page, label: string, diagnostics: string[]) {
  page.on('console', (message) => {
    if (!message.text().startsWith('FITFOCUS_IDB_LIFECYCLE ')) return;
    diagnostics.push(`${label}: ${message.text().slice(0, 900)}`);
    if (diagnostics.length > 200) diagnostics.splice(0, diagnostics.length - 200);
  });
  await page.addInitScript((pageLabel) => {
    const report = (event: string, detail: Record<string, unknown> = {}) => {
      console.debug('FITFOCUS_IDB_LIFECYCLE', JSON.stringify({ page: pageLabel, event, ...detail }));
    };
    const diagnosticWindow = window as Window & { __fitfocusE2eDatabase?: IDBDatabase };
    const originalOpen = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function(name: string, version?: number) {
      const request = version === undefined ? originalOpen.call(this, name) : originalOpen.call(this, name, version);
      if (name !== 'fitfocus-user-state-v1') return request;
      const detail = { name, requestedVersion: version ?? null };
      report('open-requested', detail);
      request.addEventListener('blocked', () => report('blocked', detail));
      request.addEventListener('upgradeneeded', (event) => report('upgradeneeded', {
        ...detail, oldVersion: (event as IDBVersionChangeEvent).oldVersion, newVersion: request.result.version,
      }));
      request.addEventListener('error', () => report('open-error', { ...detail, error: request.error?.name ?? null }));
      request.addEventListener('success', () => {
        const database = request.result;
        report('open-success', { ...detail, version: database.version });
        diagnosticWindow.__fitfocusE2eDatabase = database;
        database.addEventListener('versionchange', (event) => {
          report('versionchange', { version: database.version, newVersion: (event as IDBVersionChangeEvent).newVersion });
          if (diagnosticWindow.__fitfocusE2eDatabase === database) delete diagnosticWindow.__fitfocusE2eDatabase;
        });
        const close = database.close.bind(database);
        database.close = () => {
          report('close', { version: database.version });
          if (diagnosticWindow.__fitfocusE2eDatabase === database) delete diagnosticWindow.__fitfocusE2eDatabase;
          close();
        };
      });
      return request;
    };
  }, label);
}

async function expectCapturedAppDatabase(page: Page) {
  await expect.poll(() => page.evaluate(() => Boolean(
    (window as Window & { __fitfocusE2eDatabase?: IDBDatabase }).__fitfocusE2eDatabase,
  ))).toBe(true);
}

test('shows a partial migration notice when all legacy records are quarantined', async ({ page }) => {
  test.setTimeout(90_000);
  const server = await startPwaReleaseServer(resolve('dist'), resolve('dist'));
  const storageTrace: string[] = [];
  await captureAppDatabase(page, 'quarantine-only', storageTrace);
  try {
    await mockApp(page, { session: 'app', realServiceWorker: true, nativeApi: true });
    await page.addInitScript(({ sourceKey, record }) => localStorage.setItem(sourceKey, JSON.stringify([record])), {
      sourceKey: legacySourceKey,
      record: { type: 'put', key: '', value: 'must-remain-quarantined' },
    });
    await openApp(page, `${server.origin}/#settings`);
    await expect(page).toHaveTitle(/FitFocus/);
    await expectCapturedAppDatabase(page);

    await expect.poll(async () => {
      const state = await migrationState(page);
      const active = state.metadata.find(entry => entry.id === 'active-session');
      return {
        status: state.progress?.status,
        sendAllowed: state.progress?.sendAllowed,
        unknown: state.migrationUnknown.map(({ reason, rawRecord }) => ({ reason, rawRecord })),
        operations: state.operations,
        pause: active?.pause,
      };
    }).toEqual({
      status: 'partial',
      sendAllowed: true,
      unknown: [{ reason: 'invalid-key', rawRecord: { type: 'put', key: '', value: 'must-remain-quarantined' } }],
      operations: [],
      pause: undefined,
    });

    await expect(page.locator('[data-state-notice-region] p[role="status"]'))
      .toContainText('Некоторые записи из прежней очереди не удалось импортировать');
    expect(server.stateWriteKeys).not.toContain('');
    expect(server.unexpectedApi).toEqual([]);
  } finally {
    await server.close();
  }
});

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

function quarantinedRecordForRaw(records: MigrationUnknown[], expectedRawRecord: unknown, reason: string): MigrationUnknown | undefined {
  const expected = JSON.stringify(expectedRawRecord);
  return records.find(({ rawRecord, reason: actualReason }) => actualReason === reason
    && JSON.stringify(rawRecord) === expected);
}

function malformedQuarantineSummary(records: MigrationUnknown[]) {
  return malformedLegacyCases.map(({ rawRecord, reason }) => {
    const retained = quarantinedRecordForRaw(records, rawRecord, reason);
    return { reason: retained?.reason, rawRecord: retained?.rawRecord };
  });
}

test('preserves legacy intent across a full storage clear without sending an unproven operation', async ({ context }, info) => {
  test.setTimeout(120_000);
  const server = await startPwaReleaseServer(legacyWriterPwaDist, resolve('dist'), {
    stateUnavailable: true, currentStateUnavailable: true,
  });
  const oldPage = await context.newPage();
  const currentPage = await context.newPage();
  const storageTrace: string[] = [];
  await Promise.all([
    captureAppDatabase(oldPage, 'old', storageTrace),
    captureAppDatabase(currentPage, 'current', storageTrace),
  ]);
  currentPage.on('console', (message) => {
    if (message.text().startsWith('FITFOCUS_IDB_PROBE ')) storageTrace.push(message.text().slice(0, 1000));
  });
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

    // Exercise owner quarantine and every legacy normalizer failure alongside the real write.
    const oldSource = await oldPage.evaluate(({ sourceKey, foreignKey, invalidRecords }) => {
      const records = JSON.parse(localStorage.getItem(sourceKey) ?? '[]') as unknown[];
      records.push({ type: 'put', key: foreignKey, value: 'must-remain-quarantined' });
      records.push(...invalidRecords);
      const raw = JSON.stringify(records);
      localStorage.setItem(sourceKey, raw);
      return raw;
    }, { sourceKey: legacySourceKey, foreignKey: orphanKey,
      invalidRecords: malformedLegacyCases.map(({ rawRecord }) => rawRecord) });

    server.release();
    await mockApp(currentPage, { session: 'app', realServiceWorker: true, nativeApi: true, push: { standalone } });
    await currentPage.addInitScript(() => {
      const diagnosticWindow = window as Window & {
        __fitfocusStorageClearEvents?: number;
        __fitfocusStorageEvents?: Array<{ key: string | null; oldValue: string | null; newValue: string | null }>;
      };
      diagnosticWindow.__fitfocusStorageClearEvents = 0;
      diagnosticWindow.__fitfocusStorageEvents = [];
      window.addEventListener('storage', event => {
        diagnosticWindow.__fitfocusStorageEvents?.push({ key: event.key, oldValue: event.oldValue, newValue: event.newValue });
        if (event.key === null) {
          diagnosticWindow.__fitfocusStorageClearEvents = (diagnosticWindow.__fitfocusStorageClearEvents ?? 0) + 1;
        }
      });
    });
    await openApp(currentPage, `${server.origin}/?release=next#plan`);
    await expect(currentPage).toHaveTitle(/FitFocus/);
    await expect.poll(() => currentPage.evaluate(async () => (await navigator.serviceWorker.ready).waiting?.state ?? null)).toBe('installed');
    await expectCapturedAppDatabase(currentPage);
    await expect(currentPage.getByRole('alert')).toContainText('Обнаружен конфликт данных');
    const quarantine = currentPage.locator('[data-legacy-quarantine]');
    await expect(quarantine.locator('summary')).toContainText('Карантин: 8 записей');
    await quarantine.locator('summary').click();
    await expect(quarantine.getByText('Не удалось подтвердить владельца записи: 1')).toBeVisible();
    await expect(quarantine.getByText('Неизвестный тип операции: 1')).toBeVisible();
    await expect(quarantine).not.toContainText('must-remain-quarantined');
    await expect(quarantine).not.toContainText(orphanKey);

    await expect.poll(async () => {
      const state = await migrationState(currentPage, targetKey, true);
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
        targetOperationStatus: operation?.status,
        targetOperationReason: operation?.reason,
        foreignState: quarantined?.state,
        foreignReason: quarantined?.reason,
        foreignRawRetained: quarantinedRecordExists(state.migrationUnknown, orphanKey),
        malformedQuarantine: malformedQuarantineSummary(state.migrationUnknown),
        malformedOperationCount: state.operations.filter((entry) => malformedLegacyKeys.includes(entry.key)).length,
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
      malformedQuarantine: malformedLegacyCases,
      malformedOperationCount: 0,
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

    // A StorageEvent for localStorage.clear() has key=null. It re-verifies the
    // source but must not manufacture per-key DELETE operations. The imported
    // intent, original source snapshot, and quarantine evidence are in IndexedDB.
    const sourceBeforeClear = await oldPage.evaluate(key => localStorage.getItem(key), legacySourceKey);
    expect(sourceBeforeClear).toBe(updatedOldSource);
    const beforeClear = await migrationState(currentPage);
    const targetOperationsBeforeClear = beforeClear.operations.filter(operation => operation.key === targetKey)
      .map(({ opId, type, value, status, reason }) => ({ opId, type, value, status, reason }))
      .sort((left, right) => left.opId.localeCompare(right.opId));
    const valueBeforeClear = beforeClear.value;
    await oldPage.evaluate(() => localStorage.clear());
    await expect.poll(() => currentPage.evaluate(() =>
      (window as Window & { __fitfocusStorageClearEvents?: number }).__fitfocusStorageClearEvents ?? 0,
    )).toBeGreaterThan(0);
    await expect.poll(() => currentPage.evaluate(key => localStorage.getItem(key), legacySourceKey)).toBeNull();
    await expect.poll(async () => {
      const state = await migrationState(currentPage);
      const oldSnapshotRetained = state.metadata.some(entry => entry.rawSource === sourceBeforeClear);
      const targetOperations = state.operations.filter(operation => operation.key === targetKey)
        .map(({ opId, type, value, status, reason }) => ({ opId, type, value, status, reason }))
        .sort((left, right) => left.opId.localeCompare(right.opId));
      return {
        source: state.source,
        oldSnapshotRetained,
        importedState: itemForRecord(state.migrationItems, targetKey, previousOldRecord.value!)?.state,
        foreignRawRetained: quarantinedRecordExists(state.migrationUnknown, orphanKey),
        malformedQuarantine: malformedQuarantineSummary(state.migrationUnknown),
        targetOperations,
        localDeleteCount: state.operations.filter(operation => operation.writerId === 'legacy-local-storage'
          && operation.type === 'delete').length,
        value: state.value,
      };
    }, { timeout: 20_000 }).toEqual({
      source: null,
      oldSnapshotRetained: true,
      importedState: 'imported',
      foreignRawRetained: true,
      malformedQuarantine: malformedLegacyCases,
      targetOperations: targetOperationsBeforeClear,
      localDeleteCount: 0,
      value: valueBeforeClear,
    });
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
      const operationPresent = state.operations.some((entry) => entry.opId === imported?.opId);
      return {
        source: state.source,
        oldSnapshotRetained: state.metadata.some(entry => entry.rawSource === sourceBeforeClear),
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
        malformedQuarantine: malformedQuarantineSummary(state.migrationUnknown),
        malformedOperationCount: state.operations.filter((entry) => malformedLegacyKeys.includes(entry.key)).length,
        migrationStatus: state.progress?.status,
        sendAllowed: state.progress?.sendAllowed,
        writersStopped: state.progress?.writersStopped,
      };
    }).toEqual({
      source: null,
      oldSnapshotRetained: true,
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
      malformedQuarantine: malformedLegacyCases,
      malformedOperationCount: 0,
      migrationStatus: 'partial',
      sendAllowed: true,
      writersStopped: true,
    });
    expect(server.counts.currentStatePutAccepted).toBe(0);
    expect(server.stateWriteKeys).not.toContain(targetKey);
    expect(server.stateWriteKeys).not.toContain(orphanKey);
    for (const key of malformedLegacyKeys.filter((entry) => entry.length > 0)) {
      expect(server.stateWriteKeys).not.toContain(key);
    }
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
    await currentPage.locator('[data-state-notice-region] details:not([data-legacy-quarantine]) summary').click();
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
    for (const key of malformedLegacyKeys.filter((entry) => entry.length > 0)) {
      expect(server.stateWriteKeys).not.toContain(key);
    }
    await info.attach('legacy-outbox-migration', { body: JSON.stringify({
      sourceRecord: generatedRecord, oldSource, databaseVersion: (await migrationState(currentPage)).databaseVersion,
      acceptedStateKeys: server.stateWriteKeys, counts: server.counts, storageTrace: storageTrace.slice(-100),
    }), contentType: 'application/json' });
  } catch (error) {
    const diagnostic = {
      counts: server.counts, stateWriteKeys: server.stateWriteKeys, unexpectedApi: server.unexpectedApi,
      source: await oldPage.evaluate((key) => localStorage.getItem(key), legacySourceKey).catch(() => null),
      storageTrace: storageTrace.slice(-100),
      currentBody: await currentPage.locator('body').innerText().catch(() => ''),
      storageEvents: await currentPage.evaluate(() =>
        (window as Window & { __fitfocusStorageEvents?: unknown[] }).__fitfocusStorageEvents ?? [],
      ).catch(() => []),
    };
    await info.attach('legacy-outbox-failure', { body: JSON.stringify(diagnostic), contentType: 'application/json' });
    console.error('LEGACY_OUTBOX_FAILURE', JSON.stringify(diagnostic));
    throw error;
  } finally {
    await Promise.allSettled([oldPage.close(), currentPage.close()]);
    await server.close();
  }
});

test('rolls back legacy import and migration marker together after an IndexedDB abort, then retries idempotently', async ({ context }, info) => {
  test.setTimeout(120_000);
  const valueKey = `fitfocus_data_${account}_migration_abort`;
  const value = JSON.stringify({ source: 'legacy', retained: true });
  const source = JSON.stringify([{ type: 'put', key: valueKey, value }]);
  const abortFlag = '__fitfocusE2eAbortLegacyMigration';
  const abortCountKey = '__fitfocusE2eLegacyMigrationAbortCount';
  const server = await startPwaReleaseServer(legacyWriterPwaDist, resolve('dist'));
  server.release();
  const page = await context.newPage();
  const storageTrace: string[] = [];
  await captureAppDatabase(page, 'legacy-import-abort', storageTrace);
  try {
    await mockApp(page, { session: 'app', realServiceWorker: true, nativeApi: true });
    await page.addInitScript(({ sourceKey, source, abortFlag, abortCountKey }) => {
      localStorage.setItem(sourceKey, source);
      const control = window as Window & { __fitfocusMigrationAbortCount?: number };
      control.__fitfocusMigrationAbortCount = Number(sessionStorage.getItem(abortCountKey) ?? '0');
      const originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
        const request = originalPut.apply(this, args);
        const record = args[0] as { state?: unknown } | undefined;
        if (this.name === 'outbox_migration_items' && record?.state === 'imported'
          && sessionStorage.getItem(abortFlag) !== 'disabled') {
          const nextCount = Number(sessionStorage.getItem(abortCountKey) ?? '0') + 1;
          sessionStorage.setItem(abortCountKey, String(nextCount));
          control.__fitfocusMigrationAbortCount = nextCount;
          this.transaction.abort();
        }
        return request;
      };
    }, { sourceKey: legacySourceKey, source, abortFlag, abortCountKey });

    await openApp(page, `${server.origin}/?legacy-import-abort=1#plan`);
    await expect(page).toHaveTitle(/FitFocus/);
    await expectCapturedAppDatabase(page);
    await expect.poll(() => page.evaluate((key) => Number(sessionStorage.getItem(key) ?? '0'), abortCountKey),
      { timeout: 30_000 }).toBeGreaterThan(0);

    const afterAbort = await migrationState(page, valueKey);
    const snapshotAfterAbort = afterAbort.snapshots.find((row) => row.sourceKey === legacySourceKey);
    expect({
      source: afterAbort.source,
      value: afterAbort.value,
      migrationOperations: afterAbort.operations.filter((operation) => operation.key === valueKey
        && operation.migrationSourceKey === legacySourceKey),
      ledgerForValue: itemForKey(afterAbort.migrationItems, valueKey),
      quarantineForValue: afterAbort.migrationUnknown.filter((entry) => JSON.stringify(entry.rawRecord).includes(valueKey)),
      progress: afterAbort.progress && {
        status: afterAbort.progress.status,
        processedRecords: afterAbort.progress.processedRecords,
        sendAllowed: afterAbort.progress.sendAllowed,
      },
      snapshot: snapshotAfterAbort && {
        rawSource: snapshotAfterAbort.rawSource,
        processed: snapshotAfterAbort.processed,
      },
    }).toEqual({
      source,
      value: null,
      migrationOperations: [],
      ledgerForValue: undefined,
      quarantineForValue: [],
      progress: { status: 'importing', processedRecords: 0, sendAllowed: false },
      snapshot: { rawSource: source, processed: [] },
    });

    await page.evaluate((key) => sessionStorage.setItem(key, 'disabled'), abortFlag);
    await page.reload();
    await expect(page).toHaveTitle(/FitFocus/);
    await expect.poll(async () => {
      const state = await migrationState(page, valueKey);
      const item = itemForKey(state.migrationItems, valueKey);
      const operation = state.operations.find((candidate) => candidate.key === valueKey
        && candidate.migrationSourceKey === legacySourceKey);
      return {
        value: state.value,
        operationCount: state.operations.filter((candidate) => candidate.key === valueKey
          && candidate.migrationSourceKey === legacySourceKey).length,
        operationStatus: operation?.status,
        operationReason: operation?.reason,
        itemState: item?.state,
        itemOpId: item?.opId,
        operationId: operation?.opId,
        progress: state.progress && {
          status: state.progress.status,
          processedRecords: state.progress.processedRecords,
          sendAllowed: state.progress.sendAllowed,
        },
      };
    }, { timeout: 30_000 }).toEqual({
      value,
      operationCount: 1,
      operationStatus: 'conflicted',
      operationReason: 'legacy-server-generation-unproven',
      itemState: 'imported',
      itemOpId: expect.any(String),
      operationId: expect.any(String),
      progress: expect.objectContaining({ processedRecords: 1 }),
    });

    const afterRetry = await migrationState(page, valueKey);
    const firstOperation = afterRetry.operations.find((candidate) => candidate.key === valueKey
      && candidate.migrationSourceKey === legacySourceKey);
    const firstItem = itemForKey(afterRetry.migrationItems, valueKey);
    expect(firstOperation).toBeTruthy();
    expect(firstItem?.opId).toBe(firstOperation?.opId);
    const abortCountBeforeSecondLoad = Number(await page.evaluate((key) => sessionStorage.getItem(key), abortCountKey) ?? '0');
    await page.reload();
    await expect(page).toHaveTitle(/FitFocus/);
    await expect.poll(async () => {
      const state = await migrationState(page, valueKey);
      return state.operations.filter((candidate) => candidate.key === valueKey
        && candidate.migrationSourceKey === legacySourceKey).map((candidate) => candidate.opId);
    }, { timeout: 30_000 }).toEqual([firstOperation!.opId]);
    expect(Number(await page.evaluate((key) => sessionStorage.getItem(key), abortCountKey))).toBe(abortCountBeforeSecondLoad);
    expect(server.stateWriteKeys).not.toContain(valueKey);
    expect(server.unexpectedApi).toEqual([]);
    await info.attach('legacy-import-abort', { body: JSON.stringify({
      source, abortCountBeforeSecondLoad, operation: firstOperation, ledger: firstItem,
      final: await migrationState(page, valueKey), stateWriteKeys: server.stateWriteKeys,
      unexpectedApi: server.unexpectedApi, storageTrace: storageTrace.slice(-100),
    }), contentType: 'application/json' });
  } catch (error) {
    await info.attach('legacy-import-abort-failure', { body: JSON.stringify({
      abortCount: await page.evaluate((key) => sessionStorage.getItem(key), abortCountKey).catch(() => null),
      body: await page.locator('body').innerText().catch(() => ''),
      storageTrace: storageTrace.slice(-100), stateWriteKeys: server.stateWriteKeys,
      unexpectedApi: server.unexpectedApi,
    }), contentType: 'application/json' });
    throw error;
  } finally {
    await page.close().catch(() => undefined);
    await server.close();
  }
});

test('keeps legacy operation identities after source reorder and retryCount changes', async ({ context }, info) => {
  test.setTimeout(120_000);
  const putKey = `fitfocus_data_${account}_migration_reorder_put`;
  const deleteKey = `fitfocus_data_${account}_migration_reorder_delete`;
  const putValue = JSON.stringify({ source: 'legacy-reorder', retained: true });
  const initialSource = JSON.stringify([
    { type: 'put', key: putKey, value: putValue, baseVersion: 0 },
    { type: 'delete', key: deleteKey, baseVersion: 0 },
  ]);
  const replaySource = JSON.stringify([
    { type: 'delete', key: deleteKey, baseVersion: 0, retryCount: 19 },
    { type: 'put', key: putKey, value: putValue, baseVersion: 0, retryCount: 9 },
  ]);
  const seededKey = '__fitfocusE2eLegacyReorderSeeded';
  const server = await startPwaReleaseServer(legacyWriterPwaDist, resolve('dist'));
  server.release();
  const page = await context.newPage();
  const storageTrace: string[] = [];
  await captureAppDatabase(page, 'legacy-reorder-retry-count', storageTrace);
  const ownedOperations = async () => (await migrationState(page, putKey)).operations
    .filter((operation) => operation.migrationSourceKey === legacySourceKey
      && (operation.key === putKey || operation.key === deleteKey));
  const importedItems = async () => (await migrationState(page, putKey)).migrationItems
    .filter((item) => itemForKey([item], putKey) || itemForKey([item], deleteKey));
  try {
    const standalone = info.project.name.includes('-pwa');
    await mockApp(page, { session: 'app', realServiceWorker: true, nativeApi: true, push: { standalone } });
    await page.addInitScript(({ sourceKey, source, seededKey }) => {
      if (sessionStorage.getItem(seededKey) !== '1') {
        localStorage.setItem(sourceKey, source);
        sessionStorage.setItem(seededKey, '1');
      }
    }, { sourceKey: legacySourceKey, source: initialSource, seededKey });
    await openApp(page, `${server.origin}/?legacy-reorder-retry-count=1#plan`);
    await expect(page).toHaveTitle(/FitFocus/);
    await expectCapturedAppDatabase(page);
    await expect.poll(async () => (await ownedOperations()).length, { timeout: 30_000 }).toBe(2);
    await expect.poll(async () => (await importedItems()).length, { timeout: 30_000 }).toBe(2);

    const initialOperations = await ownedOperations();
    const initialIds = Object.fromEntries(initialOperations.map((operation) => [operation.key, operation.opId]));
    expect(initialOperations.map((operation) => operation.status).sort()).toEqual(['conflicted', 'conflicted']);
    expect(Object.keys(initialIds).sort()).toEqual([deleteKey, putKey].sort());
    expect((await migrationState(page, putKey)).value).toBe(putValue);

    await page.evaluate(({ sourceKey, source }) => localStorage.setItem(sourceKey, source), {
      sourceKey: legacySourceKey, source: replaySource,
    });
    await page.reload();
    await expect(page).toHaveTitle(/FitFocus/);
    await expect.poll(async () => {
      const state = await migrationState(page, putKey);
      const operations = state.operations.filter((operation) => operation.migrationSourceKey === legacySourceKey
        && (operation.key === putKey || operation.key === deleteKey));
      const snapshot = state.snapshots.find((entry) => entry.sourceKey === legacySourceKey && entry.rawSource === replaySource);
      const ledgerCount = state.migrationItems.filter((item) => itemForKey([item], putKey) || itemForKey([item], deleteKey)).length;
      return {
        source: state.source,
        count: operations.length,
        ids: Object.fromEntries(operations.map((operation) => [operation.key, operation.opId])),
        statuses: operations.map((operation) => operation.status).sort(),
        ledgerCount,
        processed: Array.isArray(snapshot?.processed) ? snapshot.processed.length : -1,
        value: state.value,
      };
    }, { timeout: 30_000 }).toEqual({
      source: replaySource,
      count: 2,
      ids: initialIds,
      statuses: ['conflicted', 'conflicted'],
      ledgerCount: 2,
      processed: 2,
      value: putValue,
    });

    await page.reload();
    await expect(page).toHaveTitle(/FitFocus/);
    await expect.poll(async () => {
      const operations = await ownedOperations();
      return {
        count: operations.length,
        ids: Object.fromEntries(operations.map((operation) => [operation.key, operation.opId])),
        ledgerCount: (await importedItems()).length,
      };
    }, { timeout: 30_000 }).toEqual({ count: 2, ids: initialIds, ledgerCount: 2 });
    expect(server.stateWriteKeys).not.toContain(putKey);
    expect(server.stateWriteKeys).not.toContain(deleteKey);
    expect(server.unexpectedApi).toEqual([]);
    await info.attach('legacy-reorder-retry-count', { body: JSON.stringify({
      initialSource, replaySource, initialIds, operations: await ownedOperations(), items: await importedItems(),
      final: await migrationState(page, putKey), stateWriteKeys: server.stateWriteKeys,
      unexpectedApi: server.unexpectedApi, storageTrace: storageTrace.slice(-80),
    }), contentType: 'application/json' });
  } catch (error) {
    await info.attach('legacy-reorder-retry-count-failure', { body: JSON.stringify({
      operations: await ownedOperations().catch(() => []), items: await importedItems().catch(() => []),
      body: await page.locator('body').innerText().catch(() => ''), stateWriteKeys: server.stateWriteKeys,
      unexpectedApi: server.unexpectedApi, storageTrace: storageTrace.slice(-100),
    }), contentType: 'application/json' });
    throw error;
  } finally {
    await page.close().catch(() => undefined);
    await server.close();
  }
});

test('preserves an old-bundle council-history deletion as a conflicted legacy intent', async ({ context }, info) => {
  test.setTimeout(120_000);
  const councilKey = `fitfocus_data_${account}_council_history`;
  const messageText = 'История, удалённая в старой вкладке';
  const historyValue = JSON.stringify([{ id: 'legacy-council-message', role: 'user', text: messageText,
    createdAt: '2026-10-18T00:00:00.000Z' }]);
  const server = await startPwaReleaseServer(legacyWriterPwaDist, resolve('dist'));
  const oldPage = await context.newPage();
  const currentPage = await context.newPage();
  const storageTrace: string[] = [];
  await Promise.all([
    captureAppDatabase(oldPage, 'legacy-council-delete', storageTrace),
    captureAppDatabase(currentPage, 'current-council-delete', storageTrace),
  ]);
  try {
    const standalone = info.project.name.includes('-pwa');
    await mockApp(oldPage, { session: 'app', realServiceWorker: true, nativeApi: true, push: { standalone } });
    await oldPage.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: councilKey, value: historyValue });
    await openApp(oldPage, `${server.origin}/#council`);
    await expect(oldPage).toHaveTitle(/FitFocus/);
    await expect(oldPage.getByRole('heading', { name: 'AI Совет Экспертов' })).toBeVisible();
    await expect(oldPage.getByText(messageText, { exact: true })).toBeVisible();
    await expect(oldPage.getByRole('button', { name: 'Очистить', exact: true })).toBeVisible();
    await expectCapturedAppDatabase(oldPage);

    // Open the new bundle on the same origin while the old tab remains active.
    server.release();
    await mockApp(currentPage, { session: 'app', realServiceWorker: true, nativeApi: true, push: { standalone } });
    await openApp(currentPage, `${server.origin}/?release=next#plan`);
    await expect(currentPage).toHaveTitle(/FitFocus/);
    await expectCapturedAppDatabase(currentPage);
    await expect.poll(async () => (await migrationState(currentPage, councilKey)).operations
      .some(operation => operation.key === councilKey && operation.type === 'put' && operation.status === 'conflicted'),
    { timeout: 30_000 }).toBe(true);

    // After the old writer is auth-blocked, its actual UI clear action removes
    // localStorage but cannot update the legacy queue. The new tab must retain
    // that deletion for explicit resolution without applying or sending it.
    await oldPage.getByRole('button', { name: 'Очистить', exact: true }).click();
    await expect(oldPage.getByText(messageText, { exact: true })).toHaveCount(0);
    await expect.poll(() => oldPage.evaluate(key => localStorage.getItem(key), councilKey)).toBeNull();
    await expect.poll(async () => {
      const state = await migrationState(currentPage, councilKey);
      return {
        legacyDelete: state.operations.find(operation => operation.key === councilKey && operation.type === 'delete'
          && operation.writerId === 'legacy-local-storage'),
        durableValue: state.value,
        sourceDelete: JSON.parse(state.source ?? '[]').find((record: { key?: string; type?: string }) =>
          record.key === councilKey && record.type === 'delete') ?? null,
      };
    }, { timeout: 30_000 }).toMatchObject({
      legacyDelete: { type: 'delete', key: councilKey, status: 'conflicted', reason: 'legacy-writer-local-only' },
      durableValue: historyValue,
      sourceDelete: null,
    });
    const final = await migrationState(currentPage, councilKey);
    const deleteOperation = final.operations.find(operation => operation.key === councilKey && operation.type === 'delete');
    expect(deleteOperation && 'value' in deleteOperation).toBe(false);
    expect(server.counts.currentStatePutAttempts).toBe(0);
    expect(server.stateWriteKeys).not.toContain(councilKey);
    await info.attach('legacy-council-delete', { body: JSON.stringify({
      councilKey, deleteOperation, retainedValue: final.value,
      source: final.source, counts: server.counts, stateWriteKeys: server.stateWriteKeys,
      storageTrace: storageTrace.slice(-80),
    }), contentType: 'application/json' });
  } catch (error) {
    const diagnostic = {
      counts: server.counts, stateWriteKeys: server.stateWriteKeys, unexpectedApi: server.unexpectedApi,
      oldBody: await oldPage.locator('body').innerText().catch(() => ''),
      currentBody: await currentPage.locator('body').innerText().catch(() => ''),
      storageTrace: storageTrace.slice(-100),
    };
    await info.attach('legacy-council-delete-failure', { body: JSON.stringify(diagnostic), contentType: 'application/json' });
    console.error('LEGACY_COUNCIL_DELETE_FAILURE', JSON.stringify(diagnostic));
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
  const storageTrace: string[] = [];
  await captureAppDatabase(page, 'profile', storageTrace);
  try {
    await mockApp(page, { session: 'app', realServiceWorker: true, nativeApi: true });
    await page.addInitScript(({ sourceKey, record }) => localStorage.setItem(sourceKey, JSON.stringify([record])), {
      sourceKey: legacySourceKey, record: { type: 'put', key: profileKey, value: profileValue },
    });
    await openApp(page, `${server.origin}/?legacy-profile=1#plan`);
    const updateNotice = page.getByRole('status', { name: 'Обновление FitFocus' });
    // The old bundle can discover a waiting worker after the recovery UI is ready.
    // Defer it through the normal "Позже" action whenever it would block an interaction.
    await page.addLocatorHandler(updateNotice, async notice => {
      await notice.getByRole('button', { name: 'Позже' }).click();
      await expect(notice).toBeHidden();
    });
    await expect(page).toHaveTitle(/FitFocus/);
    await expect(page.getByRole('alert')).toContainText('Обнаружен конфликт данных');
    await expectCapturedAppDatabase(page);
    await expect.poll(async () => {
      const state = await migrationState(page, profileKey);
      return state.operations.some(operation => operation.key === profileKey && operation.status === 'conflicted');
    }, { timeout: 30_000 }).toBe(true);

    const recoverySummary = page.locator('[data-state-notice-region] details summary');
    await recoverySummary.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await recoverySummary.click();
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
    await info.attach('legacy-profile-resolution', { body: JSON.stringify({ counts: server.counts, unexpectedApi: server.unexpectedApi, storageTrace: storageTrace.slice(-100) }),
      contentType: 'application/json' });
  } catch (error) {
    const diagnostic = { counts: server.counts, unexpectedApi: server.unexpectedApi,
      storageTrace: storageTrace.slice(-100),
      body: await page.locator('body').innerText().catch(() => '') };
    await info.attach('legacy-profile-resolution-failure', { body: JSON.stringify(diagnostic), contentType: 'application/json' });
    console.error('LEGACY_PROFILE_RESOLUTION_FAILURE', JSON.stringify(diagnostic));
    throw error;
  } finally {
    await page.close().catch(() => undefined);
    await server.close();
  }
});

test('holds a state write from the old bundle at protocol 426 and retries it with the current bundle', async ({ context }, info) => {
  test.setTimeout(120_000);
  const settingsKey = `fitfocus_data_${account}_settings`;
  const server = await startPwaReleaseServer(legacyWriterPwaDist, resolve('dist'));
  const oldPage = await context.newPage();
  const currentPage = await context.newPage();
  await Promise.all([
    captureAppDatabase(oldPage, 'old-state-writer', []),
    captureAppDatabase(currentPage, 'current-state-writer', []),
  ]);
  try {
    const standalone = info.project.name.includes('-pwa');
    await mockApp(oldPage, { session: 'app', realServiceWorker: true, nativeApi: true, push: { standalone } });
    await openApp(oldPage, `${server.origin}/#settings`);
    await expect(oldPage).toHaveTitle(/FitFocus/);
    await expect.poll(() => oldPage.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? '')).toContain('/sw.js');
    const oldScript = await oldPage.locator('script[type="module"][src]').getAttribute('src');
    expect(oldScript).toBeTruthy();

    // Isolate the durable writer from the separate legacy-queue import gate.
    // The durable records created during startup remain in IndexedDB.
    await oldPage.evaluate(sourceKey => localStorage.setItem(sourceKey, '[]'), legacySourceKey);
    await expect.poll(async () => {
      const state = await migrationState(oldPage, settingsKey);
      return state.metadata.find(entry => entry.id === 'active-session')?.pause ?? null;
    }).toBeNull();
    await oldPage.getByRole('button', { name: /^Светлая/ }).click();
    await expect(oldPage.getByRole('button', { name: /^Светлая/ })).toHaveClass(/border-indigo-500\/40/);
    // Startup can enqueue a background legacy mirror after the first cleanup;
    // clear that test-only source again and wake the durable sender explicitly.
    await oldPage.evaluate(sourceKey => {
      localStorage.setItem(sourceKey, '[]');
      window.dispatchEvent(new Event('focus'));
    }, legacySourceKey);
    await expect.poll(() => server.counts.stateProtocolRejected).toBeGreaterThan(0);
    await expect.poll(async () => {
      const state = await migrationState(oldPage, settingsKey);
      return state.operations.find(operation => operation.key === settingsKey)?.status;
    }).toBe('failed');

    const rejectedState = await migrationState(oldPage, settingsKey);
    const rejectedOperation = rejectedState.operations.find(operation => operation.key === settingsKey);
    expect(rejectedState.value).toContain('"theme":"light"');
    expect(rejectedOperation).toMatchObject({ key: settingsKey, status: 'failed', reason: 'http-426' });
    expect(server.counts.currentStatePutAccepted).toBe(0);
    expect(server.stateWriteKeys).not.toContain(settingsKey);

    server.release();
    await mockApp(currentPage, { session: 'app', realServiceWorker: true, nativeApi: true, push: { standalone } });
    await openApp(currentPage, `${server.origin}/?release=next#settings`);
    await expect(currentPage).toHaveTitle(/FitFocus/);
    await expect.poll(() => currentPage.evaluate(async () => (await navigator.serviceWorker.ready).waiting?.state ?? null)).toBe('installed');

    const update = currentPage.getByRole('button', { name: 'Обновить приложение', exact: true });
    await expect(update).toBeVisible();
    const currentNavigation = currentPage.waitForEvent('framenavigated', frame => frame === currentPage.mainFrame());
    const oldNavigation = oldPage.waitForEvent('framenavigated', frame => frame === oldPage.mainFrame());
    await update.click({ noWaitAfter: true });
    await Promise.all([currentNavigation, oldNavigation]);
    await Promise.all([currentPage.waitForLoadState('load'), oldPage.waitForLoadState('load')]);
    const currentScript = await currentPage.locator('script[type="module"][src]').getAttribute('src');
    expect(currentScript).toBeTruthy();
    expect(currentScript).not.toBe(oldScript);
    await expect(oldPage.locator('script[type="module"][src]')).toHaveAttribute('src', currentScript!);

    await expect.poll(async () => {
      const state = await migrationState(currentPage, settingsKey);
      return state.operations.find(operation => operation.key === settingsKey)?.status;
    }).toBe('failed');
    const retainedAfterUpdate = (await migrationState(currentPage, settingsKey)).operations
      .find(operation => operation.key === settingsKey);
    expect(retainedAfterUpdate).toMatchObject({
      opId: rejectedOperation?.opId, key: settingsKey,
      value: rejectedOperation?.value, baseVersion: rejectedOperation?.baseVersion,
    });
    await currentPage.locator('[data-state-notice-region] details summary').click();
    const recovery = currentPage.getByRole('region', { name: 'Настройки' });
    const retry = recovery.getByRole('button', { name: 'Повторить отправку', exact: true });
    await expect(retry).toBeVisible();
    await retry.click();

    await expect.poll(() => server.stateWriteKeys).toContain(settingsKey);
    await expect.poll(async () => (await migrationState(currentPage, settingsKey)).operations.filter(operation => operation.key === settingsKey)).toHaveLength(0);
    expect(server.counts.currentStatePutAccepted).toBeGreaterThan(0);
    expect(server.stateWriteItems.filter(item => item.key === settingsKey)).toEqual([{
      key: settingsKey, value: rejectedOperation?.value, baseVersion: rejectedOperation?.baseVersion,
    }]);
    expect((await migrationState(currentPage, settingsKey)).value).toContain('"theme":"light"');
    await info.attach('old-new-state-protocol-barrier', { body: JSON.stringify({
      settingsKey, rejectedState: { value: rejectedState.value, operation: rejectedOperation },
      retainedAfterUpdate, protocolRejections: server.counts.stateProtocolRejected,
      acceptedStateItems: server.stateWriteItems,
      acceptedStateKeys: server.stateWriteKeys, counts: server.counts,
    }), contentType: 'application/json' });
  } finally {
    await Promise.allSettled([oldPage.close(), currentPage.close()]);
    await server.close();
  }
});
