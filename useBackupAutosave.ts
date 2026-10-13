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
      try {
        const payload = await createBackupPayload();
        await writeBackupToHandle(handle, payload);
      } catch {
        // A failed snapshot must not replace the last known-good file.
      }
    };

    const id = window.setInterval(tick, 20000);
    return () => window.clearInterval(id);
  }, [autosaveEnabled]);

  const onExportBackup = useCallback(async () => {
    try {
      const payload = await createBackupPayload();
      downloadJson('fitfocus-backup.json', payload);
    } catch {
      alert('Не удалось создать полную резервную копию. Проверьте доступность хранилища и повторите экспорт.');
    }
  }, []);

  const onImportBackup = useCallback(async (file: File) => {
    try {
      const parsed = await restoreFromFile(file);
      const result = await applyBackupPayload(parsed);
      if (!result.ok) {
        if (result.error === 'BACKUP_DURABLE_STATE_CONFLICT') {
          alert('В копии есть данные, отличающиеся от уже сохранённых. Ничего не изменено. Экспортируйте текущее состояние или восстановите копию в пустом профиле.');
        } else if (result.error?.startsWith('BACKUP_INVALID_') || result.error === 'BACKUP_DUPLICATE_DURABLE_STATE') {
          alert('Резервная копия повреждена или имеет неподдерживаемый формат. Данные не изменены.');
        } else {
          alert('Не удалось восстановить резервную копию: проверьте доступность локального хранилища.');
        }
        return;
      }
      window.location.reload();
    } catch {
      alert('Не удалось прочитать резервную копию. Проверьте JSON-файл и повторите попытку.');
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
    try {
      const payload = await createBackupPayload();
      if (!await writeBackupToHandle(handle, payload)) {
        alert('Не удалось записать резервную копию в выбранный файл.');
        return false;
      }
    } catch {
      alert('Не удалось создать полную резервную копию. Проверьте доступность хранилища и повторите экспорт.');
      return false;
    }
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
