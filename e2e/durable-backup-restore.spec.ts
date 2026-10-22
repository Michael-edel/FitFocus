import { expect } from '@playwright/test';
import { test } from './support/mockTest';
import { mockApp, openApp } from './support/appHarness';

const accountId = 'google-e2e-sub';
const valuesStore = 'values';
const outboxStore = 'outbox';
const unknownStore = 'outbox_migration_unknown';
const metaStore = 'outbox_meta';

function backupPayload(values: Array<{ key: string; value: string; updatedAt: number; accountId: string }>, localValue: string) {
  const operationKey = `fitfocus_data_${accountId}_restore_operation`;
  return {
    version: 3,
    createdAt: '2026-10-14T00:00:00.000Z',
    localStorage: { fitfocus_e2e_restore_marker: localValue },
    durableState: {
      formatVersion: 1,
      stores: {
        values,
        outbox: [{
          opId: 'e2e-restored-conflicted-op', accountId, key: operationKey, writerId: 'e2e-backup-writer',
          revision: 1, baseVersion: 0, retryCount: 0, nextAttemptAtMs: 0,
          createdAtMs: 1, updatedAtMs: 1, type: 'put', value: 'pending local intent', status: 'conflicted',
        }],
        outbox_migration_items: [],
        outbox_migration_unknown: [{
          id: 'e2e-restored-unknown-record', sourceKey: 'fitfocus.remote-kv-outbox.v1',
          fingerprint: 'a'.repeat(64), rawRecord: { type: 'put', key: 'foreign-key', value: 'preserved evidence' },
          rawRecords: [{ type: 'put', key: 'foreign-key', value: 'preserved evidence' }],
          canonicalEvidence: 'e2e-backup-restore', reason: 'unknown-owner', detectedAt: '2026-10-14T00:00:00.000Z',
        }],
        outbox_meta: [{ id: `owner:${JSON.stringify(operationKey)}`, key: operationKey, accountId }],
      },
    },
  };
}

async function readRestoredRows(page: import('@playwright/test').Page) {
  return page.evaluate(async ({ valuesName, outboxName, unknownName, metaName }) => {
    const opening = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const tx = db.transaction([valuesName, outboxName, unknownName, metaName], 'readonly');
      const read = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const [values, outbox, unknown, meta] = await Promise.all([
        read(tx.objectStore(valuesName).getAll()), read(tx.objectStore(outboxName).getAll()),
        read(tx.objectStore(unknownName).getAll()), read(tx.objectStore(metaName).getAll()),
      ]);
      return { values, outbox, unknown, meta };
    } finally {
      db.close();
    }
  }, { valuesName: valuesStore, outboxName: outboxStore, unknownName: unknownStore, metaName: metaStore });
}

test('restores a multi-row v3 backup through Settings and persists every durable store', async ({ page }) => {
  await mockApp(page, { session: 'app' });
  await openApp(page, '/#settings');
  await expect(page.getByRole('button', { name: 'Импорт JSON' })).toBeVisible();

  const values = Array.from({ length: 64 }, (_, index) => {
    const key = `fitfocus_data_${accountId}_restore_probe_${index}`;
    return { key, value: `restored-value-${index}`, updatedAt: index + 1, accountId };
  });
  const payload = backupPayload(values, 'imported');
  const navigation = page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame());
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'fitfocus-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)),
  });

  await navigation;
  await page.waitForLoadState('load');
  await expect(page.getByRole('button', { name: 'Импорт JSON' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('fitfocus_e2e_restore_marker'))).toBe('imported');

  const restored = await readRestoredRows(page);
  const imported = restored.values.filter((row: { key: string }) => row.key.includes('_restore_probe_'));
  expect(imported).toHaveLength(64);
  expect(imported).toContainEqual(expect.objectContaining({ key: values[63].key, value: 'restored-value-63' }));
  expect(restored.outbox).toContainEqual(expect.objectContaining({ opId: 'e2e-restored-conflicted-op', status: 'conflicted' }));
  expect(restored.unknown).toContainEqual(expect.objectContaining({ id: 'e2e-restored-unknown-record', reason: 'unknown-owner' }));
  expect(restored.meta).toContainEqual(expect.objectContaining({ key: `fitfocus_data_${accountId}_restore_operation`, accountId }));
});

test('leaves the retired scaffold outbox opaque and never imports it at startup', async ({ page }) => {
  const sourceKey = 'fitfocus_outbox_ops';
  const scaffoldTarget = `fitfocus_data_${accountId}_plan_task_done`;
  const sentinel = 'retired-scaffold-sentinel';
  const payload = JSON.stringify([{
    opId: 'retired-scaffold-op', deviceId: 'old-device', userUid: accountId,
    tenantId: 'old-tenant', entityType: 'settings', entityId: scaffoldTarget,
    patch: { value: sentinel }, updatedAt: 1,
  }]);
  const stateWrites: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/state' && ['PUT', 'DELETE'].includes(request.method())) {
      stateWrites.push(`${request.method()} ${request.postData() ?? ''}`);
    }
  });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: sourceKey, value: payload });
  await mockApp(page, { session: 'app' });
  const stateHydration = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === '/api/state' && request.method() === 'GET';
  });
  await openApp(page, '/#settings');
  await stateHydration;
  await expect(page.getByRole('button', { name: 'Экспорт JSON' })).toBeVisible();

  expect(await page.evaluate((key) => localStorage.getItem(key), sourceKey)).toBe(payload);
  const durableRows = await readRestoredRows(page);
  expect(durableRows.outbox).not.toContainEqual(expect.objectContaining({ key: scaffoldTarget }));
  expect(durableRows.outbox).not.toContainEqual(expect.objectContaining({ opId: 'retired-scaffold-op' }));
  expect(stateWrites.join('\n')).not.toContain(scaffoldTarget);
  expect(stateWrites.join('\n')).not.toContain(sentinel);
});

test('a durable conflict leaves all stores and localStorage unchanged through the import UI', async ({ page }) => {
  await mockApp(page, { session: 'app' });
  await openApp(page, '/#settings');
  const conflictingKey = `fitfocus_data_${accountId}_restore_probe_conflict`;
  const currentRow = { key: conflictingKey, value: 'current value', updatedAt: 8, accountId };
  await page.evaluate(async (row) => {
    const opening = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const tx = db.transaction('values', 'readwrite');
      tx.objectStore('values').add(row);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, currentRow);
  await page.evaluate(() => localStorage.setItem('fitfocus_e2e_restore_marker', 'current'));

  const newRow = { key: `fitfocus_data_${accountId}_restore_probe_before_conflict`, value: 'must roll back', updatedAt: 1, accountId };
  const payload = backupPayload([newRow, { ...currentRow, value: 'backup value', updatedAt: 9 }], 'from-backup');
  const dialogPromise = page.waitForEvent('dialog');
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'fitfocus-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)),
  });
  const dialog = await dialogPromise;
  expect(dialog.message()).toContain('Ничего не изменено');
  await dialog.accept();

  expect(await page.evaluate(() => localStorage.getItem('fitfocus_e2e_restore_marker'))).toBe('current');
  const restored = await readRestoredRows(page);
  expect(restored.values).not.toContainEqual(expect.objectContaining({ key: newRow.key }));
  expect(restored.values).toContainEqual(expect.objectContaining({ ...currentRow }));
  expect(restored.outbox).not.toContainEqual(expect.objectContaining({ opId: 'e2e-restored-conflicted-op' }));
  expect(restored.unknown).not.toContainEqual(expect.objectContaining({ id: 'e2e-restored-unknown-record' }));
  expect(restored.meta).not.toContainEqual(expect.objectContaining({ key: `fitfocus_data_${accountId}_restore_operation` }));
});
