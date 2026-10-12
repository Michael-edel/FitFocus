import { useSyncExternalStore } from 'react';
import { userStateDatabase } from '../storage/stateDatabase';
import { getStateQueueSummaries, getStateSaveIssues, getStateSyncPauses, subscribeStateSaveIssues } from '../storage/stateSaveStatus';

const subscribeDatabase = (listener: () => void) => userStateDatabase.subscribe(listener);
const databaseStatus = () => userStateDatabase.status;
const messages = {
  blocked: 'Хранилище ожидает обновления. Закройте другие вкладки FitFocus и повторите действие.',
  error: 'Не удалось сохранить изменения на устройстве. Не закрывайте эту вкладку. Освободите место и повторите действие.',
  conflict: 'Обнаружен конфликт данных. Ваша правка сохранена отдельно и требует разрешения; синхронизация ещё не завершена.',
  failed: 'Не удалось отправить изменения. Данные сохранены на устройстве; требуется проверка ошибки синхронизации.',
  auth: 'Изменения сохранены на устройстве. Войдите в свой аккаунт, чтобы продолжить синхронизацию.',
  access: 'Изменения сохранены на устройстве. Для синхронизации требуется доступ к FitFocus.',
  protocol: 'Изменения сохранены на устройстве и ожидают синхронизации. Сервер ещё не подтвердил совместимый формат отправки.',
  legacy: 'Изменения сохранены на устройстве и ожидают синхронизации. Сначала нужно проверить импорт прежних изменений.',
  pending: 'Изменения сохранены на устройстве и ожидают синхронизации.',
};
const noticeClass = 'col-start-1 row-start-1 m-4 rounded-xl border p-4 text-sm';

export function StateStorageNotice({ accountId }: { accountId?: string }) {
  const issues = useSyncExternalStore(subscribeStateSaveIssues, getStateSaveIssues, getStateSaveIssues);
  const queues = useSyncExternalStore(subscribeStateSaveIssues, getStateQueueSummaries, getStateQueueSummaries);
  const pauses = useSyncExternalStore(subscribeStateSaveIssues, getStateSyncPauses, getStateSyncPauses);
  const status = useSyncExternalStore(subscribeDatabase, databaseStatus, databaseStatus);
  const ownIssues = issues.filter((issue) => issue.accountId === accountId);
  const ownQueue = queues.find((queue) => queue.accountId === accountId);
  const pause = pauses.find((entry) => entry.accountId === accountId)?.reason;
  const conflict = ownQueue?.conflicted || ownIssues.some((issue) => issue.kind === 'conflicted');
  const visible = status === 'blocked' || ownIssues.length || ownQueue?.pending || ownQueue?.sending || ownQueue?.failed || conflict;
  const message = status === 'blocked' ? messages.blocked
    : ownIssues.some((issue) => issue.kind === 'error') ? messages.error
      : conflict ? messages.conflict
        : ownQueue?.failed ? messages.failed
          : pause === 'auth' ? messages.auth
            : pause === 'access' ? messages.access
              : pause === 'protocol' ? messages.protocol
                : pause === 'legacy' ? messages.legacy : messages.pending;
  return (
    <div className="grid" data-state-notice-region>
      {/* Reserve the largest wrapped message so queue updates cannot move controls before or during a click. */}
      {Object.entries(messages).map(([key, text]) => (
        <div key={key} aria-hidden="true" data-notice-text={text}
          className={`${noticeClass} invisible pointer-events-none select-none after:content-[attr(data-notice-text)]`} />
      ))}
      {!!visible && <div role={status === 'blocked' || ownIssues.length || ownQueue?.failed || conflict || pause === 'auth' || pause === 'access' ? 'alert' : 'status'}
        className={`${noticeClass} relative z-50 border-amber-400/50 bg-slate-900 text-slate-100`}>
        {message}
      </div>}
    </div>
  );
}
