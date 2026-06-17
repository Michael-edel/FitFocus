// Simple local backup/restore helpers.
// In this prototype we keep everything in localStorage and allow exporting/importing a JSON snapshot.

export type BackupPayload = {
  version: number;
  createdAt: string;
  localStorage: Record<string, string>;
};

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
    const p = payload as BackupPayload;
    if (!p || typeof p !== 'object') return { ok: false, error: 'Invalid payload' };
    if (!p.localStorage || typeof p.localStorage !== 'object') return { ok: false, error: 'Missing localStorage in payload' };

    const ls = p.localStorage as Record<string, string>;
    for (const [k, v] of Object.entries(ls)) {
      if (typeof k !== 'string') continue;
      if (typeof v !== 'string') continue;
      if (!isFitFocusBackupKey(k)) continue;
      try { localStorage.setItem(k, v); } catch {}
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to apply backup' };
  }
}

export async function restoreFromFile(file: File): Promise<BackupPayload> {
  const txt = await file.text();
  const payload = JSON.parse(txt);
  return payload as BackupPayload;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = window as any;
  return !!w?.showSaveFilePicker;
}

// We don't persist the handle in this prototype; just provide stubs.
export async function getSavedBackupHandle(): Promise<any | null> {
  return null;
}

export async function chooseAndSaveBackupHandle(): Promise<any | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = window as any;
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

export async function writeBackupToHandle(handle: any, payload: unknown): Promise<boolean> {
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
