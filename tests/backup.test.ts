import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyBackupPayload, createBackupPayload, downloadJson } from '../backup';
import { clearIndexedUserStateForUser, readIndexedUserStateRaw, writeIndexedUserStateRaw } from '../storage/indexedUserState';
import { UserStateRepository } from '../storage/userStateRepository';
import { DurableOutbox } from '../storage/durableOutbox';
import { STATE_STORES, stateTransaction, indexedRequest, userStateDatabase } from '../storage/stateDatabase';
import { LegacyQueueMigration } from '../storage/legacyMigration';
import { LEGACY_QUEUE_SOURCE_KEY, legacyDeletedAccountMetaId } from '../storage/legacyQueue';

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
