// Local backup/restore helpers. Volume state can live in IndexedDB, so both
// browser storage layers are included in the portable JSON snapshot.

import { restoreIndexedUserStateBackup } from './storage/indexedUserState';
import { localUserIdFromStorageKey } from './storage/hybrid';
import {
  createDurableStateBackup, getBackupIndexedValues, restoreDurableStateBackup,
  type DurableStateBackup,
} from './storage/durableStateBackup';
import { LEGACY_DELETED_ACCOUNT_META_PREFIX, LEGACY_QUEUE_SOURCE_KEY, legacyDeletedAccountMetaId } from './storage/legacyQueue';
import { afterIndexedRequests, STATE_STORES, stateTransaction, userStateDatabase } from './storage/stateDatabase';

export type BackupPayload = {
  version: number;
  createdAt: string;
  localStorage: Record<string, string>;
  indexedDb?: Record<string, string>;
  durableState?: DurableStateBackup;
};

export type BackupFileHandle = {
  createWritable(): Promise<{
    write(data: string): Promise<void>;
    close(): Promise<void>;
  }>;
};

type FilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<BackupFileHandle>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function isBackupPayload(value: unknown): value is BackupPayload {
  return isRecord(value)
    && isStringRecord(value.localStorage)
    && (value.indexedDb === undefined || isStringRecord(value.indexedDb))
    && typeof value.version === 'number'
    && Number.isSafeInteger(value.version)
    && value.version >= 1
    && value.version <= 3
    && (value.version !== 3 || isRecord(value.durableState))
    && typeof value.createdAt === "string";
}

function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isFitFocusBackupKey(key: string): boolean {
  return (
    key === LEGACY_QUEUE_SOURCE_KEY ||
    key.startsWith('fitfocus_') ||
    key.startsWith('ff_') ||
    key.startsWith('fitfocus_data_') ||
    key.startsWith('ff_dev_plan_override_scope_')
  );
}

function backupDeletionMarkerIds(payload: BackupPayload): Set<string> {
  const stores = payload.durableState?.stores;
  const rows = stores?.[STATE_STORES.meta];
  if (!Array.isArray(rows)) return new Set();
  return new Set(rows.flatMap((row) => isRecord(row) && typeof row.id === 'string'
    && row.id.startsWith(LEGACY_DELETED_ACCOUNT_META_PREFIX) ? [row.id] : []));
}

async function withBackupDeletionGuard<T>(
  accountIds: readonly string[],
  payload: BackupPayload,
  work: (deleted: Set<string>) => T,
): Promise<T> {
  const uniqueAccountIds = [...new Set(accountIds)];
  if (!uniqueAccountIds.length) return work(new Set());

  const markerByAccount = new Map(await Promise.all(uniqueAccountIds.map(async (accountId) =>
    [accountId, await legacyDeletedAccountMetaId(accountId)] as const)));
  const importedMarkers = backupDeletionMarkerIds(payload);
  const deleted = new Set(uniqueAccountIds.filter((accountId) => importedMarkers.has(markerByAccount.get(accountId)!)));
  const currentMarkerIds = uniqueAccountIds
    .filter((accountId) => !deleted.has(accountId))
    .map((accountId) => markerByAccount.get(accountId)!);
  if (!currentMarkerIds.length) return work(deleted);

  const database = await userStateDatabase.open();
  return stateTransaction(database, [STATE_STORES.meta], 'readonly', (tx) => {
    const requests = currentMarkerIds.map((id) => tx.objectStore(STATE_STORES.meta).get(id));
    return afterIndexedRequests(tx, requests, (results) => {
      currentMarkerIds.forEach((id, index) => {
        if (results[index]) {
          const accountId = uniqueAccountIds.find((candidate) => markerByAccount.get(candidate) === id);
          if (accountId) deleted.add(accountId);
        }
      });
      // Keep synchronous rollback writes inside the marker read transaction.
      // Account deletion's metadata write must finish before or after this work.
      return work(deleted);
    });
  });
}

function deletedAccountsForBackup(accountIds: readonly string[], payload: BackupPayload): Promise<Set<string>> {
  return withBackupDeletionGuard(accountIds, payload, deleted => deleted);
}

export async function createBackupPayload(): Promise<BackupPayload> {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !isFitFocusBackupKey(k)) continue;
    const v = localStorage.getItem(k);
    if (v != null) data[k] = v;
  }

  const durableState = await createDurableStateBackup();

  return {
    version: 3,
    createdAt: new Date().toISOString(),
    localStorage: data,
    // Keep the old volume-state field so v1/v2 clients can still recover values.
    indexedDb: getBackupIndexedValues(durableState),
    durableState,
  };
}

export async function applyBackupPayload(payload: unknown): Promise<{ ok: boolean; error?: string }> {
  const localStorageBefore = new Map<string, string | null>();
  const accountByKey = new Map<string, string>();
  let validatedPayload: BackupPayload | null = null;
  let localStorageWasChanged = false;
  try {
    if (!isBackupPayload(payload)) return { ok: false, error: 'Invalid payload' };
    validatedPayload = payload;

    const entries = Object.entries(payload.localStorage).filter(([key]) => isFitFocusBackupKey(key));
    for (const [key] of entries) {
      const accountId = localUserIdFromStorageKey(key);
      if (accountId) accountByKey.set(key, accountId);
    }
    const deletedBeforeRestore = await deletedAccountsForBackup([...accountByKey.values()], payload);
    for (const [key, value] of entries) {
      const accountId = accountByKey.get(key);
      if (accountId && deletedBeforeRestore.has(accountId)) continue;
      localStorageBefore.set(key, localStorage.getItem(key));
      localStorage.setItem(key, value);
      localStorageWasChanged = true;
    }

    if (payload.version === 3) {
      await restoreDurableStateBackup(payload.durableState);
    } else if (!await restoreIndexedUserStateBackup(payload.indexedDb || {})) {
      throw new Error('Не все данные удалось восстановить: хранилище недоступно или запись защищена очередью изменений.');
    }

    const deletedAfterRestore = await deletedAccountsForBackup([...accountByKey.values()], payload);
    for (const [key, accountId] of accountByKey) {
      if (!deletedAfterRestore.has(accountId)) continue;
      const importedValue = payload.localStorage[key];
      if (localStorage.getItem(key) !== importedValue) continue;
      localStorage.removeItem(key);
    }
    return { ok: true };
  } catch (error: unknown) {
    if (localStorageWasChanged) {
      // A concurrent deletion outranks rollback: restoring the previous local
      // snapshot would otherwise resurrect data already removed by cleanup.
      const rollback = (deleted: Set<string> | null) => {
        for (const [key, previous] of localStorageBefore) {
          try {
            const accountId = accountByKey.get(key);
            // If storage is unavailable, leave account keys as they are rather
            // than assume a deletion marker is absent and restore private data.
            if (accountId && deleted === null) continue;
            if (accountId && deleted?.has(accountId)) {
              if (localStorage.getItem(key) === validatedPayload?.localStorage[key]) localStorage.removeItem(key);
              continue;
            }
            if (previous === null) localStorage.removeItem(key);
            else localStorage.setItem(key, previous);
          } catch { /* Report the original failure; the IDB restore itself is transactional. */ }
        }
      };
      if (validatedPayload) {
        await withBackupDeletionGuard([...accountByKey.values()], validatedPayload, rollback).catch(() => rollback(null));
      } else rollback(null);
    }
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to apply backup' };
  }
}

export async function restoreFromFile(file: File): Promise<BackupPayload> {
  const txt = await file.text();
  const payload = safeJsonParse(txt);
  if (!isBackupPayload(payload)) {
    throw new Error('Invalid backup file');
  }
  return payload;
}

export function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- Optional File System Access API support (best-effort; safe no-ops elsewhere) ---

export function supportsFileSystemAccessApi(): boolean {
  const w: FilePickerWindow = window as FilePickerWindow;
  return !!w?.showSaveFilePicker;
}

// We don't persist the handle in this prototype; just provide stubs.
export async function getSavedBackupHandle(): Promise<BackupFileHandle | null> {
  return null;
}

export async function chooseAndSaveBackupHandle(): Promise<BackupFileHandle | null> {
  const w: FilePickerWindow = window as FilePickerWindow;
  if (!w?.showSaveFilePicker) return null;
  try {
    const handle = await w.showSaveFilePicker({
      suggestedName: 'fitfocus-backup.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    return handle;
  } catch {
    return null;
  }
}

export async function writeBackupToHandle(handle: BackupFileHandle | null, payload: unknown): Promise<boolean> {
  if (!handle) return false;
  try {
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
    return true;
  } catch {
    return false;
  }
}
