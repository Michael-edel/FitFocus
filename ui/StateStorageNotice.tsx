import { useEffect, useRef, useSyncExternalStore } from 'react';
import { userStateDatabase } from '../storage/stateDatabase';
import { getStateQueueSummaries, getStateSaveIssues, getStateSyncPauses, subscribeStateSaveIssues } from '../storage/stateSaveStatus';

const subscribeDatabase = (listener: () => void) => userStateDatabase.subscribe(listener);
const databaseStatus = () => userStateDatabase.status;

export function StateStorageNotice({ accountId }: { accountId?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const pointers = new Set<number>();
    let locked = false; let frame: number | undefined;
    const unlock = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined; locked = false;
      container.style.height = ''; container.style.overflow = '';
    };
    const finish = () => {
      if (pointers.size || !locked) return;
      if (frame !== undefined) cancelAnimationFrame(frame);
      // Queue changes must not move a pressed control before its native click.
      frame = requestAnimationFrame(unlock);
    };
    const down = (event: PointerEvent) => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      if (!locked) {
        container.style.height = `${container.getBoundingClientRect().height}px`;
        container.style.overflow = 'hidden'; locked = true;
      }
      pointers.add(event.pointerId);
    };
    const up = (event: PointerEvent) => { pointers.delete(event.pointerId); finish(); };
    const blur = () => { pointers.clear(); finish(); };
    const hide = () => { pointers.clear(); unlock(); };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    window.addEventListener('click', finish, true);
    window.addEventListener('blur', blur);
    window.addEventListener('pagehide', hide);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('click', finish, true);
      window.removeEventListener('blur', blur);
      window.removeEventListener('pagehide', hide);
      hide();
    };
  }, [accountId]);
  const issues = useSyncExternalStore(subscribeStateSaveIssues, getStateSaveIssues, getStateSaveIssues);
  const queues = useSyncExternalStore(subscribeStateSaveIssues, getStateQueueSummaries, getStateQueueSummaries);
  const pauses = useSyncExternalStore(subscribeStateSaveIssues, getStateSyncPauses, getStateSyncPauses);
  const status = useSyncExternalStore(subscribeDatabase, databaseStatus, databaseStatus);
  const ownIssues = issues.filter((issue) => issue.accountId === accountId);
  const ownQueue = queues.find((queue) => queue.accountId === accountId);
  const pause = pauses.find((entry) => entry.accountId === accountId)?.reason;
  const conflict = ownQueue?.conflicted || ownIssues.some((issue) => issue.kind === 'conflicted');
  const visible = status === 'blocked' || ownIssues.length || ownQueue?.pending || ownQueue?.sending || ownQueue?.failed || conflict;
  return (
    <div ref={containerRef} className="flow-root">
      {!!visible && <div role={status === 'blocked' || ownIssues.length || ownQueue?.failed || conflict || pause === 'auth' || pause === 'access' ? 'alert' : 'status'} className="relative z-50 m-4 rounded-xl border border-amber-400/50 bg-slate-900 p-4 text-sm text-slate-100">
        {status === 'blocked' ? 'Хранилище ожидает обновления. Закройте другие вкладки FitFocus и повторите действие.'
          : ownIssues.some((issue) => issue.kind === 'error') ? 'Не удалось сохранить изменения на устройстве. Не закрывайте эту вкладку. Освободите место и повторите действие.'
            : conflict ? 'Обнаружен конфликт данных. Ваша правка сохранена отдельно и требует разрешения; синхронизация ещё не завершена.'
              : ownQueue?.failed ? 'Не удалось отправить изменения. Данные сохранены на устройстве; требуется проверка ошибки синхронизации.'
                : pause === 'auth' ? 'Изменения сохранены на устройстве. Войдите в свой аккаунт, чтобы продолжить синхронизацию.'
                  : pause === 'access' ? 'Изменения сохранены на устройстве. Для синхронизации требуется доступ к FitFocus.'
                    : pause === 'protocol' ? 'Изменения сохранены на устройстве и ожидают синхронизации. Сервер ещё не подтвердил совместимый формат отправки.'
                      : pause === 'legacy' ? 'Изменения сохранены на устройстве и ожидают синхронизации. Сначала нужно проверить импорт прежних изменений.'
                        : 'Изменения сохранены на устройстве и ожидают синхронизации.'}
      </div>}
    </div>
  );
}
