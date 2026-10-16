// Local backup/restore helpers. Volume state can live in IndexedDB, so both
// browser storage layers are included in the portable JSON snapshot.

import { listIndexedUserStateRaw, writeIndexedUserStateRaw } from './storage/indexedUserState';

export type BackupPayload = {
  version: number;
  createdAt: string;
  localStorage: Record<string, string>;
  indexedDb?: Record<string, string>;
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
    && typeof value.version === "number"
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
    key.startsWith('fitfocus_') ||
    key.startsWith('ff_') ||
    key.startsWith('fitfocus_data_') ||
    key.startsWith('ff_dev_plan_override_scope_')
  );
}

export async function createBackupPayload(): Promise<BackupPayload> {
  const data: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (!isFitFocusBackupKey(k)) continue;
      const v = localStorage.getItem(k);
      if (v == null) continue;
      data[k] = v;
    }
  } catch {
    // ignore
  }

  return {
    version: 2,
    createdAt: new Date().toISOString(),
    localStorage: data,
    indexedDb: await listIndexedUserStateRaw(),
  };
}

export async function applyBackupPayload(payload: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!isBackupPayload(payload)) return { ok: false, error: 'Invalid payload' };

    const ls = payload.localStorage;
    for (const [k, v] of Object.entries(ls)) {
      if (typeof k !== 'string') continue;
      if (typeof v !== 'string') continue;
      if (!isFitFocusBackupKey(k)) continue;
      try { localStorage.setItem(k, v); } catch {}
    }
    for (const [key, value] of Object.entries(payload.indexedDb || {})) {
      await writeIndexedUserStateRaw(key, value);
    }
    return { ok: true };
  } catch (error: unknown) {
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
