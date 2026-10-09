import { useSyncExternalStore } from 'react';
import { userStateDatabase } from '../storage/stateDatabase';
import { getStateQueueSummaries, getStateSaveIssues, subscribeStateSaveIssues } from '../storage/stateSaveStatus';

const subscribeDatabase = (listener: () => void) => userStateDatabase.subscribe(listener);
const databaseStatus = () => userStateDatabase.status;

export function StateStorageNotice({ accountId }: { accountId?: string }) {
  const issues = useSyncExternalStore(subscribeStateSaveIssues, getStateSaveIssues, getStateSaveIssues);
  const queues = useSyncExternalStore(subscribeStateSaveIssues, getStateQueueSummaries, getStateQueueSummaries);
  const status = useSyncExternalStore(subscribeDatabase, databaseStatus, databaseStatus);
  const ownIssues = issues.filter((issue) => issue.accountId === accountId);
  const ownQueue = queues.find((queue) => queue.accountId === accountId);
  if (status !== 'blocked' && !ownIssues.length && !ownQueue?.pending && !ownQueue?.sending) return null;
  return (
    <div role={status === 'blocked' || ownIssues.length ? 'alert' : 'status'} className="relative z-50 m-4 rounded-xl border border-amber-400/50 bg-slate-900 p-4 text-sm text-amber-100">
      {status === 'blocked' ? 'Хранилище ожидает обновления. Закройте другие вкладки FitFocus и повторите действие.'
        : ownIssues.some((issue) => issue.kind === 'error') ? 'Не удалось сохранить изменения на устройстве. Не закрывайте эту вкладку. Освободите место и повторите действие.'
          : ownIssues.length ? 'Обнаружен конфликт данных. Ваша правка сохранена отдельно и требует разрешения; синхронизация ещё не завершена.'
            : 'Изменения сохранены на устройстве и ожидают синхронизации.'}
    </div>
  );
}
