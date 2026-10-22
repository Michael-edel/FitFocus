import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyBackupPayload, createBackupPayload, downloadJson } from '../backup';
import { clearIndexedUserStateForUser, readIndexedUserStateRaw, writeIndexedUserStateRaw } from '../storage/indexedUserState';
import { UserStateRepository } from '../storage/userStateRepository';
import { DurableOutbox } from '../storage/durableOutbox';
import { STATE_STORES, stateTransaction, indexedRequest, userStateDatabase } from '../storage/stateDatabase';
import { LegacyQueueMigration } from '../storage/legacyMigration';
import { LEGACY_QUEUE_SOURCE_KEY, legacyDeletedAccountMetaId } from '../storage/legacyQueue';
import { clearLocalUserData } from '../storage/hybrid';
import * as stateDatabase from '../storage/stateDatabase';

function createLocalStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

describe('browser backup', () => {
  beforeEach(() => {
    userStateDatabase.close();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('localStorage', createLocalStorage());
  });
  afterEach(() => {
    userStateDatabase.close();
    vi.unstubAllGlobals();
  });

  it('reports a rejected restore without overwriting durable values or their pending intent', async () => {
    const repository = new UserStateRepository('backup-owned-user');
    await repository.writeJson('weekly_reports', []);
    const before = await new DurableOutbox().list('backup-owned-user');
    const result = await applyBackupPayload({ version: 2, createdAt: '2026-10-09T00:00:00Z', localStorage: {},
      indexedDb: { 'fitfocus_data_backup-owned-user_weekly_reports': '[{"replaced":true}]' } });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(await readIndexedUserStateRaw('fitfocus_data_backup-owned-user_weekly_reports')).toBe('[]');
    expect(await new DurableOutbox().list('backup-owned-user')).toEqual(before);
  });
  it('round-trips indexed volume state with the local snapshot', async () => {
    const indexedKey = 'fitfocus_data_backup-user_diary';
    localStorage.setItem('fitfocus_data_backup-user_settings', '{"theme":"dark"}');
    await writeIndexedUserStateRaw(indexedKey, '[{"id":"meal-1"}]');

    const payload = await createBackupPayload();
    expect(payload.version).toBe(3);
    expect(payload.indexedDb?.[indexedKey]).toContain('meal-1');

    localStorage.clear();
    userStateDatabase.close();
    vi.stubGlobal('indexedDB', new IDBFactory());
    await expect(applyBackupPayload(payload)).resolves.toEqual({ ok: true });

    expect(localStorage.getItem('fitfocus_data_backup-user_settings')).toContain('dark');
    expect(await readIndexedUserStateRaw(indexedKey)).toContain('meal-1');
  });

  it('preserves the dormant scaffold outbox key as opaque localStorage data', async () => {
    const scaffoldPayload = JSON.stringify([{
      opId: 'scaffold-op-1', deviceId: 'old-device', userUid: 'old-user', tenantId: 'old-tenant',
      entityType: 'settings', entityId: 'theme', patch: { theme: 'light' }, updatedAt: 1,
    }]);
    localStorage.setItem('fitfocus_outbox_ops', scaffoldPayload);

    const backup = await createBackupPayload();
    expect(backup.localStorage.fitfocus_outbox_ops).toBe(scaffoldPayload);
    expect(backup.durableState?.stores[STATE_STORES.outbox]).toEqual([]);

    localStorage.clear();
    await expect(applyBackupPayload(backup)).resolves.toEqual({ ok: true });
    expect(localStorage.getItem('fitfocus_outbox_ops')).toBe(scaffoldPayload);
    await expect(new DurableOutbox().list('old-user')).resolves.toEqual([]);
  });

  it('keeps version-one snapshots importable', async () => {
    await expect(applyBackupPayload({
      version: 1,
      createdAt: '2026-10-08T00:00:00.000Z',
      localStorage: { 'fitfocus_data_legacy_settings': '{"theme":"light"}' },
    })).resolves.toEqual({ ok: true });

    expect(localStorage.getItem('fitfocus_data_legacy_settings')).toContain('light');
  });

  it('restores legacy volume values atomically when one key is protected by the durable outbox', async () => {
    const repository = new UserStateRepository('legacy-backup-owner');
    await repository.writeRaw('settings', '{"source":"current"}');
    localStorage.setItem('fitfocus_restore_marker', 'current');
    const result = await applyBackupPayload({
      version: 2,
      createdAt: '2026-10-13T00:00:00.000Z',
      localStorage: { fitfocus_restore_marker: 'from-backup' },
      indexedDb: {
        'fitfocus_data_legacy-backup-owner_diary': '[{"id":"must-not-partially-restore"}]',
        'fitfocus_data_legacy-backup-owner_settings': '{"source":"backup"}',
      },
    });

    expect(result.ok).toBe(false);
    expect(await readIndexedUserStateRaw('fitfocus_data_legacy-backup-owner_diary')).toBeNull();
    expect(await readIndexedUserStateRaw('fitfocus_data_legacy-backup-owner_settings')).toBe('{"source":"current"}');
    expect(localStorage.getItem('fitfocus_restore_marker')).toBe('current');
  });

  it('downloads a JSON object as a parseable backup file, not as a quoted JSON string', async () => {
    let downloaded: Blob | null = null;
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn() },
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob: Blob) => { downloaded = blob; return 'blob:backup'; }),
      revokeObjectURL: vi.fn(),
    });

    downloadJson('fitfocus-backup.json', { version: 3, localStorage: {}, durableState: { formatVersion: 1 } });

    expect(anchor.click).toHaveBeenCalledOnce();
    if (!downloaded) throw new Error('Expected a downloaded Blob');
    const contents: unknown = JSON.parse(await downloaded.text());
    expect(contents).toMatchObject({ version: 3, localStorage: {} });
  });

  it('exports and restores values, pending operations, migration quarantine and durable metadata atomically', async () => {
    const accountId = 'backup-owner';
    const legacyKey = `fitfocus_data_${accountId}_diary`;
    const rawLegacy = JSON.stringify([
      { type: 'put', key: legacyKey, value: '[{"id":"meal-1"}]' },
      { type: 'put', key: 'fitfocus_data_foreign_diary', value: 'foreign' },
    ]);
    localStorage.setItem(LEGACY_QUEUE_SOURCE_KEY, rawLegacy);
    const migration = new LegacyQueueMigration({ getItem: (key) => key === LEGACY_QUEUE_SOURCE_KEY ? rawLegacy : null });
    const migrationOptions = {
      verifiedOwners: new Map([[legacyKey, [accountId]]]),
      verifyWritersStopped: async () => ({
        buildId: 'backup-test', checkedAtMs: Date.now(), challengeId: crypto.randomUUID(), clientIds: ['backup-client'],
      }),
    };
    await migration.migrate(migrationOptions);
    await new DurableOutbox().activateSession(accountId, 'server-session');

    const payload = JSON.parse(JSON.stringify(await createBackupPayload())) as Awaited<ReturnType<typeof createBackupPayload>>;
    expect(payload.version).toBe(3);
    expect(payload.localStorage[LEGACY_QUEUE_SOURCE_KEY]).toBe(rawLegacy);
    expect(payload.durableState?.stores[STATE_STORES.values]).toHaveLength(1);
    expect(payload.durableState?.stores[STATE_STORES.outbox]).toHaveLength(1);
    expect(payload.durableState?.stores[STATE_STORES.migrationItems]).toHaveLength(2);
    expect(payload.durableState?.stores[STATE_STORES.migrationUnknown]).toHaveLength(1);
    expect(payload.durableState?.stores[STATE_STORES.meta]).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'active-session' }), expect.objectContaining({ id: 'auth-fence' }),
    ]));

    userStateDatabase.close();
    vi.stubGlobal('indexedDB', new IDBFactory());
    await new DurableOutbox().activateSession(accountId, 'destination-session');
    await expect(applyBackupPayload(payload)).resolves.toEqual({ ok: true });
    await expect(applyBackupPayload(payload)).resolves.toEqual({ ok: true });

    const restoredOperations = await new DurableOutbox().list(accountId);
    expect(restoredOperations).toHaveLength(1);
    expect(restoredOperations[0]).toMatchObject({ accountId, key: `fitfocus_data_${accountId}_diary`, status: 'conflicted',
      baseVersion: 0, reason: 'legacy-server-generation-unproven' });
    expect(await readIndexedUserStateRaw(legacyKey)).toContain('meal-1');
    const restoredUnknown = await stateTransaction(await userStateDatabase.open(), [STATE_STORES.migrationUnknown], 'readonly',
      (tx) => indexedRequest(tx.objectStore(STATE_STORES.migrationUnknown).getAll()));
    expect(restoredUnknown).toEqual([expect.objectContaining({ reason: 'unknown-owner', rawRecord: expect.objectContaining({ value: 'foreign' }) })]);
    const restoredSession = await new DurableOutbox().sessionState();
    expect(restoredSession.active).toMatchObject({ accountId: 'backup-owner' });
    const restoredGate = await stateTransaction(await userStateDatabase.open(), [STATE_STORES.meta], 'readonly',
      (tx) => indexedRequest(tx.objectStore(STATE_STORES.meta).get('legacy-migration:v1')));
    expect(restoredGate).toMatchObject({ status: 'partial', sendAllowed: false, writersStopped: false });
    expect(await new DurableOutbox().claim({ accountId, sessionEpoch: restoredSession.active!.sessionEpoch,
      owner: 'backup-test-sender', nowMs: Date.now(), leaseMs: 5_000 })).toBeNull();

    const resumedMigration = new LegacyQueueMigration({ getItem: (key) => key === LEGACY_QUEUE_SOURCE_KEY ? rawLegacy : null });
    await resumedMigration.migrate(migrationOptions);
    const resumedSession = await new DurableOutbox().sessionState();
    expect(await new DurableOutbox().claim({ accountId, sessionEpoch: resumedSession.active!.sessionEpoch,
      owner: 'backup-test-sender', nowMs: Date.now(), leaseMs: 5_000 })).toBeNull();
  });

  it('does not restore deleted-account rows from a backup made before deletion', async () => {
    const accountId = 'deleted-backup-owner';
    const key = `fitfocus_data_${accountId}_diary`;
    const rawLegacy = JSON.stringify([{ type: 'put', key, value: 'private legacy value' }]);
    localStorage.setItem(LEGACY_QUEUE_SOURCE_KEY, rawLegacy);
    const migration = new LegacyQueueMigration({ getItem: (requested) => requested === LEGACY_QUEUE_SOURCE_KEY ? rawLegacy : null });
    await migration.migrate({
      verifiedOwners: new Map([[key, [accountId]]]),
      verifyWritersStopped: async () => ({
        buildId: 'backup-delete-test', checkedAtMs: Date.now(), challengeId: crypto.randomUUID(), clientIds: ['backup-client'],
      }),
    });
    const staleBackup = JSON.parse(JSON.stringify(await createBackupPayload())) as Awaited<ReturnType<typeof createBackupPayload>>;
    expect(staleBackup.durableState?.stores[STATE_STORES.outbox]).toHaveLength(1);

    expect(await clearIndexedUserStateForUser(accountId)).toEqual({ cleared: true, legacyEvidenceRetained: true });
    await expect(applyBackupPayload(staleBackup)).resolves.toEqual({ ok: true });

    expect(await new DurableOutbox().list(accountId)).toEqual([]);
    expect(await readIndexedUserStateRaw(key)).toBeNull();
    const restoredMeta = await stateTransaction(await userStateDatabase.open(), [STATE_STORES.meta], 'readonly',
      (tx) => indexedRequest(tx.objectStore(STATE_STORES.meta).getAll()));
    expect(restoredMeta).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'legacy-deleted-account', version: 1 }),
      expect.objectContaining({ id: expect.stringMatching(/^legacy-snapshot:v1:/), rawSource: rawLegacy }),
    ]));

    const deletionBackup = await createBackupPayload();
    const deletionMarkerId = await legacyDeletedAccountMetaId(accountId);
    expect(deletionBackup.durableState?.stores[STATE_STORES.meta]).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: deletionMarkerId, kind: 'legacy-deleted-account', version: 1 }),
    ]));
    userStateDatabase.close();
    vi.stubGlobal('indexedDB', new IDBFactory());
    await expect(applyBackupPayload(deletionBackup)).resolves.toEqual({ ok: true });
    const portableMarker = await stateTransaction(await userStateDatabase.open(), [STATE_STORES.meta], 'readonly',
      (tx) => indexedRequest(tx.objectStore(STATE_STORES.meta).get(deletionMarkerId)));
    expect(portableMarker).toMatchObject({ kind: 'legacy-deleted-account', version: 1 });
  });

  it('does not restore deleted-account localStorage keys from a stale version-three backup', async () => {
    const accountId = 'deleted-localstorage-backup-owner';
    const relatedAccountId = `${accountId}-related`;
    const key = `fitfocus_data_${accountId}_diary`;
    const relatedKey = `fitfocus_data_${relatedAccountId}_diary`;
    const staleValue = '[{"id":"must-stay-deleted"}]';
    localStorage.setItem(key, staleValue);
    localStorage.setItem(relatedKey, '[{"id":"related-account"}]');
    const staleBackup = await createBackupPayload();
    expect(staleBackup.localStorage[key]).toBe(staleValue);

    await expect(clearIndexedUserStateForUser(accountId)).resolves.toMatchObject({ cleared: true });
    expect(localStorage.getItem(key)).toBe(staleValue);

    await expect(applyBackupPayload(staleBackup)).resolves.toMatchObject({ ok: true });

    expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(relatedKey)).toBe('[{"id":"related-account"}]');
    expect(await readIndexedUserStateRaw(key)).toBeNull();
  });

  it('does not restore deleted-account IndexedDB values from a stale version-three backup', async () => {
    const accountId = 'deleted-indexed-backup-owner';
    const relatedAccountId = `${accountId}-related`;
    const key = `fitfocus_data_${accountId}_diary`;
    const relatedKey = `fitfocus_data_${relatedAccountId}_diary`;
    await expect(writeIndexedUserStateRaw(key, '[{"id":"stale-durable"}]')).resolves.toBe(true);
    await expect(writeIndexedUserStateRaw(relatedKey, '[{"id":"related-account"}]')).resolves.toBe(true);
    const staleBackup = await createBackupPayload();
    expect(staleBackup.durableState?.stores[STATE_STORES.values]).toEqual(expect.arrayContaining([
      expect.objectContaining({ key, value: '[{"id":"stale-durable"}]' }),
    ]));

    await expect(clearIndexedUserStateForUser(accountId)).resolves.toMatchObject({ cleared: true });
    await expect(applyBackupPayload(staleBackup)).resolves.toMatchObject({ ok: true });

    expect(await readIndexedUserStateRaw(key)).toBeNull();
    expect(await readIndexedUserStateRaw(relatedKey)).toBe('[{"id":"related-account"}]');
  });

  it.each(['diary', 'council_history'])('does not restore deleted-account %s from a legacy version-two backup', async (suffix) => {
    const accountId = 'deleted-version-two-owner';
    const key = `fitfocus_data_${accountId}_${suffix}`;
    const relatedKey = `fitfocus_data_${accountId}-related_diary`;
    await expect(clearIndexedUserStateForUser(accountId)).resolves.toMatchObject({ cleared: true });

    await expect(applyBackupPayload({
      version: 2,
      createdAt: '2026-10-20T00:00:00.000Z',
      localStorage: { [key]: '[{"id":"stale-local"}]' },
      indexedDb: { [key]: '[{"id":"stale-indexed"}]', [relatedKey]: '[{"id":"keep-other-account"}]' },
    })).resolves.toMatchObject({ ok: true });

    expect(localStorage.getItem(key)).toBeNull();
    expect(await readIndexedUserStateRaw(key)).toBeNull();
    expect(await readIndexedUserStateRaw(relatedKey)).toBe('[{"id":"keep-other-account"}]');
  });

  it('honors a portable deletion marker before restoring local keys into a fresh database', async () => {
    const accountId = 'portable-deletion-owner';
    const key = `fitfocus_data_${accountId}_diary`;
    localStorage.setItem(key, 'stale local value');
    await clearIndexedUserStateForUser(accountId);
    const backup = await createBackupPayload();
    localStorage.clear();
    userStateDatabase.close();
    vi.stubGlobal('indexedDB', new IDBFactory());

    await expect(applyBackupPayload(backup)).resolves.toEqual({ ok: true });
    expect(localStorage.getItem(key)).toBeNull();
    expect(await readIndexedUserStateRaw(key)).toBeNull();
  });

  it.each(['success', 'conflict'] as const)('keeps account data deleted when deletion overlaps a %s restore', async (outcome) => {
    const accountId = 'delete-during-backup';
    const key = `fitfocus_data_${accountId}_diary`;
    const otherKey = 'fitfocus_data_other-restore-owner_settings';
    localStorage.setItem(key, 'previous local value');
    await writeIndexedUserStateRaw(otherKey, 'backup settings');
    const backup = await createBackupPayload();
    backup.localStorage[key] = 'imported local value';
    if (outcome === 'conflict') await writeIndexedUserStateRaw(otherKey, 'current settings');
    const originalOpen = userStateDatabase.open.bind(userStateDatabase);
    let count = 0;
    let signalRestore!: () => void;
    let releaseRestore!: () => void;
    const started = new Promise<void>(resolve => { signalRestore = resolve; });
    const gate = new Promise<void>(resolve => { releaseRestore = resolve; });
    const open = vi.spyOn(userStateDatabase, 'open').mockImplementation(async () => {
      if (++count === 2) { signalRestore(); await gate; }
      return originalOpen();
    });
    try {
      const restore = applyBackupPayload(backup);
      await started;
      expect(localStorage.getItem(key)).toBe('imported local value');
      await expect(clearLocalUserData(accountId)).resolves.toMatchObject({ complete: true });
      releaseRestore();
      await expect(restore).resolves.toMatchObject({ ok: outcome === 'success' });
      expect(localStorage.getItem(key)).toBeNull();
      expect(await readIndexedUserStateRaw(otherKey)).toBe(outcome === 'success' ? 'backup settings' : 'current settings');
    } finally {
      releaseRestore();
      open.mockRestore();
    }
  });

  it('orders account rollback before deletion even when cleanup finishes after the marker read', async () => {
    const accountId = 'delete-after-rollback-read';
    const key = `fitfocus_data_${accountId}_diary`;
    const siblingKey = `fitfocus_data_${accountId}-sibling_diary`;
    const conflictKey = 'fitfocus_data_rollback-conflict_settings';
    localStorage.setItem(key, 'previous private value');
    localStorage.setItem(siblingKey, 'previous sibling value');
    localStorage.setItem('fitfocus_restore_marker', 'previous global value');
    await writeIndexedUserStateRaw(conflictKey, 'backup settings');
    const backup = await createBackupPayload();
    backup.localStorage[key] = 'imported private value';
    backup.localStorage[siblingKey] = 'imported sibling value';
    backup.localStorage.fitfocus_restore_marker = 'imported global value';
    await writeIndexedUserStateRaw(conflictKey, 'current settings');

    const transaction = stateDatabase.stateTransaction;
    let markerReads = 0;
    let cleanupComplete = false;
    const observed = vi.spyOn(stateDatabase, 'stateTransaction').mockImplementation(async <T,>(
      database: IDBDatabase, stores: stateDatabase.StateStore[], mode: IDBTransactionMode,
      work: (tx: IDBTransaction) => T | Promise<T>,
    ): Promise<T> => {
      const result = await transaction(database, stores, mode, work);
      if (mode === 'readonly' && stores.length === 1 && stores[0] === STATE_STORES.meta && ++markerReads === 2) {
        // Model another tab completing deletion after the rollback guard's
        // transaction finishes, before its consumer resumes. No fake markers.
        const cleanup = await clearLocalUserData(accountId);
        cleanupComplete = cleanup.complete;
      }
      return result;
    });
    try {
      await expect(applyBackupPayload(backup)).resolves.toMatchObject({ ok: false, error: 'BACKUP_DURABLE_STATE_CONFLICT' });
      expect(cleanupComplete).toBe(true);
      expect(localStorage.getItem(key)).toBeNull();
      expect(localStorage.getItem(siblingKey)).toBe('previous sibling value');
      expect(localStorage.getItem('fitfocus_restore_marker')).toBe('previous global value');
      expect(await readIndexedUserStateRaw(conflictKey)).toBe('current settings');
    } finally { observed.mockRestore(); }
  });

  it('aborts every IndexedDB store and rolls localStorage back when one durable key conflicts', async () => {
    const diaryKey = 'fitfocus_data_restore-user_diary';
    const settingsKey = 'fitfocus_data_restore-user_settings';
    const payload = {
      version: 3,
      createdAt: '2026-10-13T00:00:00.000Z',
      localStorage: { fitfocus_restore_marker: 'from-backup' },
      durableState: {
        formatVersion: 1,
        stores: {
          [STATE_STORES.values]: [
            { key: diaryKey, value: 'new diary', updatedAt: 1 },
            { key: settingsKey, value: 'backup settings', updatedAt: 1 },
          ],
          [STATE_STORES.outbox]: [],
          [STATE_STORES.migrationItems]: [],
          [STATE_STORES.migrationUnknown]: [],
          [STATE_STORES.meta]: [],
        },
      },
    };
    await stateTransaction(await userStateDatabase.open(), [STATE_STORES.values], 'readwrite', (tx) => {
      tx.objectStore(STATE_STORES.values).add({ key: settingsKey, value: 'current settings', updatedAt: 2 });
    });
    localStorage.setItem('fitfocus_restore_marker', 'current');

    const result = await applyBackupPayload(payload);
    expect(result).toMatchObject({ ok: false, error: 'BACKUP_DURABLE_STATE_CONFLICT' });
    expect(await readIndexedUserStateRaw(diaryKey)).toBeNull();
    expect(await readIndexedUserStateRaw(settingsKey)).toBe('current settings');
    expect(localStorage.getItem('fitfocus_restore_marker')).toBe('current');
  });

  it('rejects malformed durable records before changing localStorage', async () => {
    const payload = {
      version: 3,
      createdAt: '2026-10-13T00:00:00.000Z',
      localStorage: { fitfocus_restore_marker: 'must rollback' },
      durableState: {
        formatVersion: 1,
        stores: {
          [STATE_STORES.values]: [],
          [STATE_STORES.outbox]: [{
            opId: 'foreign-op', accountId: 'somebody-else', key: 'fitfocus_data_restore-user_diary',
            writerId: 'writer', revision: 1, baseVersion: 0, status: 'pending', retryCount: 0,
            nextAttemptAtMs: 1, createdAtMs: 1, updatedAtMs: 1, type: 'put', value: 'foreign',
          }],
          [STATE_STORES.migrationItems]: [],
          [STATE_STORES.migrationUnknown]: [],
          [STATE_STORES.meta]: [],
        },
      },
    };
    localStorage.setItem('fitfocus_restore_marker', 'current');
    const result = await applyBackupPayload(payload);
    expect(result.ok).toBe(false);
    expect(localStorage.getItem('fitfocus_restore_marker')).toBe('current');
    expect(await new DurableOutbox().list('somebody-else')).toEqual([]);
  });
});
