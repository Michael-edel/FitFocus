// Simple local backup/restore helpers.
// In this prototype we keep everything in localStorage and allow exporting/importing a JSON snapshot.

export type BackupPayload = {
  version: number;
  createdAt: string;
  localStorage: Record<string, string>;
};

type BackupFileHandle = {
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

function isBackupPayload(value: unknown): value is BackupPayload {
  return isRecord(value) && isRecord(value.localStorage) && typeof value.version === "number" && typeof value.createdAt === "string";
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

export function createBackupPayload(): BackupPayload {
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
    version: 1,
    createdAt: new Date().toISOString(),
    localStorage: data,
  };
}

export function applyBackupPayload(payload: unknown): { ok: boolean; error?: string } {
  try {
    if (!isBackupPayload(payload)) return { ok: false, error: 'Invalid payload' };

    const ls = payload.localStorage;
    for (const [k, v] of Object.entries(ls)) {
      if (typeof k !== 'string') continue;
      if (typeof v !== 'string') continue;
      if (!isFitFocusBackupKey(k)) continue;
      try { localStorage.setItem(k, v); } catch {}
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
