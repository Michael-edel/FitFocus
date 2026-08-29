import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyBackupPayload,
  createBackupPayload,
  downloadJson,
  getSavedBackupHandle,
  chooseAndSaveBackupHandle,
  supportsFileSystemAccessApi,
  writeBackupToHandle,
  restoreFromFile,
  type BackupFileHandle,
} from './backup';

export function useBackupAutosave() {
  const backupHandleRef = useRef<BackupFileHandle | null>(null);
  const [autosaveEnabled, setAutosaveEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const handle = await getSavedBackupHandle();
        if (handle) {
          backupHandleRef.current = handle;
          setAutosaveEnabled(true);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    if (!autosaveEnabled) return;

    const tick = async () => {
      const handle = backupHandleRef.current;
      if (!handle) return;
      const payload = createBackupPayload();
      await writeBackupToHandle(handle, JSON.stringify(payload));
    };

    const id = window.setInterval(tick, 20000);
    return () => window.clearInterval(id);
  }, [autosaveEnabled]);

  const onExportBackup = useCallback(() => {
    const payload = createBackupPayload();
    downloadJson('fitfocus-backup.json', JSON.stringify(payload, null, 2));
  }, []);

  const onImportBackup = useCallback(async (file: File) => {
    try {
      const parsed = await restoreFromFile(file);
      const result = applyBackupPayload(parsed);
      if (!result.ok) {
        alert('Файл не похож на резервную копию FitFocus.');
        return;
      }
      window.location.reload();
    } catch {
      alert('Не удалось прочитать JSON.');
    }
  }, []);

  const onConnectAutosave = useCallback(async () => {
    if (!supportsFileSystemAccessApi()) {
      alert('Автосейв в файл поддерживается только в Chrome/Edge (File System Access API). Используйте Экспорт JSON.');
      return false;
    }

    const handle = await chooseAndSaveBackupHandle();
    if (!handle) return false;
    backupHandleRef.current = handle;
    setAutosaveEnabled(true);
    const payload = createBackupPayload();
    await writeBackupToHandle(handle, JSON.stringify(payload, null, 2));
    return true;
  }, []);

  return {
    autosaveEnabled,
    onConnectAutosave,
    onExportBackup,
    onImportBackup,
    setAutosaveEnabled,
  };
}
