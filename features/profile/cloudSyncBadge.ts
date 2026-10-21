export type ProfileSyncState = 'idle' | 'saving' | 'saved' | 'error';
export type CloudSyncBadge = { label: string; cls: string; title: string };

/** Formats cloud-sync state for the app shell without coupling it to React state. */
export function buildCloudSyncBadge(input: {
  hasCloudSession: boolean;
  state: ProfileSyncState;
  note: string | null;
  lastSyncAt: number | null;
  formatTime?: (value: number) => string;
  stateQueue?: { pending: number; sending: number; conflicted: number; failed: number };
  localSaveError?: boolean;
}): CloudSyncBadge {
  const lastSync = input.lastSyncAt == null ? '—' : (input.formatTime ?? ((value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })))(input.lastSyncAt);
  if (!input.hasCloudSession) {
    return { label: 'Cloud: local', cls: 'bg-slate-800/60 text-slate-300 border-slate-700', title: 'Облачная синхронизация не активна: войдите в Google, чтобы сохранять данные между устройствами.' };
  }
  if (input.localSaveError || input.stateQueue?.failed || input.stateQueue?.conflicted) {
    return { label: 'Cloud: error', cls: 'bg-rose-500/10 text-rose-200 border-rose-500/20', title: input.localSaveError
      ? 'Изменения не сохранены на устройстве. Повторите действие.' : 'Ожидают разрешения конфликт или ошибка очереди. Синхронизация не завершена.' };
  }
  if (input.stateQueue?.pending || input.stateQueue?.sending) {
    return { label: 'Cloud: pending', cls: 'bg-amber-500/10 text-amber-200 border-amber-500/20', title: 'Локальные изменения сохранены и ожидают подтверждения облака.' };
  }
  if (input.state === 'saving') {
    return { label: 'Cloud: saving', cls: 'bg-indigo-500/10 text-indigo-200 border-indigo-500/20', title: `Синхронизация с облаком… Последний успешный синк: ${lastSync}` };
  }
  if (input.state === 'saved') {
    return { label: 'Cloud: saved', cls: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/20', title: `Синхронизировано с облаком. Последний синк: ${lastSync}` };
  }
  if (input.state === 'error') {
    return { label: 'Cloud: error', cls: 'bg-rose-500/10 text-rose-200 border-rose-500/20', title: input.note ? `${input.note} Последний успешный синк: ${lastSync}` : `Ошибка синхронизации. Последний успешный синк: ${lastSync}` };
  }
  return { label: 'Cloud: idle', cls: 'bg-slate-800/60 text-slate-300 border-slate-700', title: input.note || `Синхронизация готова. Последний синк: ${lastSync}` };
}
