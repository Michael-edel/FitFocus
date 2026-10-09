import { useSyncExternalStore } from 'react';
import { userStateDatabase } from '../storage/stateDatabase';
import { getStateQueueSummaries, getStateSaveIssues, getStateSyncPauses, subscribeStateSaveIssues } from '../storage/stateSaveStatus';

const subscribeDatabase = (listener: () => void) => userStateDatabase.subscribe(listener);
const databaseStatus = () => userStateDatabase.status;

export function StateStorageNotice({ accountId }: { accountId?: string }) {
  const issues = useSyncExternalStore(subscribeStateSaveIssues, getStateSaveIssues, getStateSaveIssues);
  const queues = useSyncExternalStore(subscribeStateSaveIssues, getStateQueueSummaries, getStateQueueSummaries);
  const pauses = useSyncExternalStore(subscribeStateSaveIssues, getStateSyncPauses, getStateSyncPauses);
  const status = useSyncExternalStore(subscribeDatabase, databaseStatus, databaseStatus);
  const ownIssues = issues.filter((issue) => issue.accountId === accountId);
  const ownQueue = queues.find((queue) => queue.accountId === accountId);
  const pause = pauses.find((entry) => entry.accountId === accountId)?.reason;
  const conflict = ownQueue?.conflicted || ownIssues.some((issue) => issue.kind === 'conflicted');
  if (status !== 'blocked' && !ownIssues.length && !ownQueue?.pending && !ownQueue?.sending && !ownQueue?.failed && !conflict) return null;
  return (
    <div role={status === 'blocked' || ownIssues.length || ownQueue?.failed || conflict || pause === 'auth' || pause === 'access' ? 'alert' : 'status'} className="relative z-50 m-4 rounded-xl border border-amber-400/50 bg-slate-900 p-4 text-sm text-slate-100">
      {status === 'blocked' ? 'Хранилище ожидает обновления. Закройте другие вкладки FitFocus и повторите действие.'
        : ownIssues.some((issue) => issue.kind === 'error') ? 'Не удалось сохранить изменения на устройстве. Не закрывайте эту вкладку. Освободите место и повторите действие.'
          : conflict ? 'Обнаружен конфликт данных. Ваша правка сохранена отдельно и требует разрешения; синхронизация ещё не завершена.'
            : ownQueue?.failed ? 'Не удалось отправить изменения. Данные сохранены на устройстве; требуется проверка ошибки синхронизации.'
              : pause === 'auth' ? 'Изменения сохранены на устройстве. Войдите в свой аккаунт, чтобы продолжить синхронизацию.'
                : pause === 'access' ? 'Изменения сохранены на устройстве. Для синхронизации требуется доступ к FitFocus.'
                  : pause === 'protocol' ? 'Изменения сохранены на устройстве и ожидают синхронизации. Сервер ещё не подтвердил совместимый формат отправки.'
                    : pause === 'legacy' ? 'Изменения сохранены на устройстве и ожидают синхронизации. Сначала нужно проверить импорт прежних изменений.'
                      : 'Изменения сохранены на устройстве и ожидают синхронизации.'}
    </div>
  );
}
