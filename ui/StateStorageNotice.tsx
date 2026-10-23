import { useState, useSyncExternalStore } from 'react';
import { stateSync } from '../storage/stateSync';
import { legacyRecoveryResource } from '../storage/durableOutbox';
import { userStateDatabase } from '../storage/stateDatabase';
import type { MigrationUnknownReason } from '../storage/legacyMigration';
import {
  getStateLegacyMigrationNotices, getStateQueueOperations, getStateQueueSummaries, getStateSaveIssues, getStateSyncPauses,
  subscribeStateSaveIssues, type StateQueueOperation,
} from '../storage/stateSaveStatus';

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
  legacyPartial: 'Некоторые записи из прежней очереди не удалось импортировать. Они сохранены для проверки; проверенные изменения продолжают синхронизироваться.',
  pending: 'Изменения сохранены на устройстве и ожидают синхронизации.',
  recovery: 'Разрешить конфликт или повторить отправку',
};
const migrationReasonLabels: Record<MigrationUnknownReason, string> = {
  'not-an-object': 'Запись имеет неверный формат',
  'invalid-type': 'Неизвестный тип операции',
  'invalid-key': 'Некорректный ключ записи',
  'put-without-value': 'У записи отсутствует значение',
  'delete-with-value': 'У удаления есть лишнее значение',
  'invalid-baseVersion': 'Некорректная версия записи',
  'invalid-retryCount': 'Некорректный счётчик повторов',
  'invalid-json': 'Очередь не удалось прочитать',
  'invalid-container': 'Неверный формат очереди',
  'unknown-owner': 'Не удалось подтвердить владельца записи',
  'ambiguous-owner': 'У записи несколько возможных владельцев',
  'ownership-conflict': 'Ключ записи не совпадает с владельцем',
  'forbidden-key': 'Служебный ключ нельзя импортировать',
  'ambiguous-duplicate': 'Найдены неоднозначные дубликаты',
  'ambiguous-key': 'Для одного ключа найдены разные записи',
  'fingerprint-collision': 'Не удалось однозначно различить записи',
  'missing-imported-operation': 'Импортированная операция не найдена',
};
const noticeClass = 'col-start-1 row-start-1 m-4 min-w-0 break-words rounded-xl border p-4 text-sm';
const labels: Record<string, string> = {
  profile: 'Профиль', diary: 'Дневник', history: 'История', favorite_recipes: 'Избранные рецепты',
  weekly_reports: 'Недельные отчёты', last_coach_card: 'Совет тренера', settings: 'Настройки',
  habits: 'Привычки', favorites: 'Избранное', adapt_read: 'Адаптация плана', adapt_expanded: 'Адаптация плана',
  refeed: 'План питания', plan_task_done: 'План питания', council_history: 'История помощника',
  family_menu_prefs: 'Параметры семейного меню', invite_code: 'Приглашение в семью',
};

type RecoveryGroup = { key: string; label: string; operations: StateQueueOperation[] };
type RecoveryChoice = 'keep-latest-local' | 'accept-server';

function labelFor(operation: StateQueueOperation): string {
  if (operation.resource === 'profile') return 'Профиль';
  if (operation.resource === 'familyMenu') return 'Семейное меню';
  const prefix = `fitfocus_data_${operation.accountId}_`;
  const name = operation.key.startsWith(prefix) ? operation.key.slice(prefix.length) : '';
  return labels[name] ?? 'Данные приложения';
}

function groupRecoveryOperations(operations: readonly StateQueueOperation[]): RecoveryGroup[] {
  const groups = new Map<string, RecoveryGroup>();
  for (const operation of operations) {
    if (operation.status !== 'conflicted' && operation.status !== 'failed' && operation.status !== 'pending' && operation.status !== 'sending') continue;
    const group = groups.get(operation.key) ?? { key: operation.key, label: labelFor(operation), operations: [] };
    group.operations.push(operation);
    groups.set(operation.key, group);
  }
  return [...groups.values()]
    .filter((group) => group.operations.some((operation) => operation.status === 'conflicted' || operation.status === 'failed'))
    .map((group) => ({ ...group, operations: group.operations.sort((left, right) => left.revision - right.revision || left.opId.localeCompare(right.opId)) }));
}

function recoveryReason(operations: readonly StateQueueOperation[]): string {
  const reason = operations.find((operation) => operation.status === 'failed')?.reason
    ?? operations.find((operation) => operation.status === 'conflicted')?.reason;
  if (!reason) return '';
  const labels: Record<string, string> = {
    FORBIDDEN_KEYSPACE: 'Сервер запретил запись в этот раздел.',
    'invalid-profile-intent': 'Профиль не прошёл проверку перед отправкой.',
    'invalid-family-menu-intent': 'Семейное меню не прошло проверку перед отправкой.',
    'retry-exhausted': 'Автоматические попытки исчерпаны.',
    'server-version-conflict': 'Версия на сервере отличается от локальной.',
    'legacy-server-generation-unproven': 'Для прежней операции не подтверждено поколение данных на сервере, поэтому она сохранена на устройстве и не отправляется автоматически.',
  };
  return labels[reason] ?? `Причина: ${reason}`;
}

export function StateStorageNotice({ accountId }: { accountId?: string }) {
  const issues = useSyncExternalStore(subscribeStateSaveIssues, getStateSaveIssues, getStateSaveIssues);
  const queues = useSyncExternalStore(subscribeStateSaveIssues, getStateQueueSummaries, getStateQueueSummaries);
  const queueOperations = useSyncExternalStore(subscribeStateSaveIssues, getStateQueueOperations, getStateQueueOperations);
  const pauses = useSyncExternalStore(subscribeStateSaveIssues, getStateSyncPauses, getStateSyncPauses);
  const legacyMigrationNotices = useSyncExternalStore(subscribeStateSaveIssues, getStateLegacyMigrationNotices, getStateLegacyMigrationNotices);
  const status = useSyncExternalStore(subscribeDatabase, databaseStatus, databaseStatus);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const ownIssues = issues.filter((issue) => issue.accountId === accountId);
  const ownQueue = queues.find((queue) => queue.accountId === accountId);
  const ownOperations = queueOperations.filter((operation) => operation.accountId === accountId);
  const recoveryGroups = groupRecoveryOperations(ownOperations);
  const pause = pauses.find((entry) => entry.accountId === accountId)?.reason;
  const legacyMigrationNotice = legacyMigrationNotices.find((entry) => entry.accountId === accountId);
  const conflict = ownQueue?.conflicted || ownIssues.some((issue) => issue.kind === 'conflicted');
  const visible = status === 'blocked' || ownIssues.length || ownQueue?.pending || ownQueue?.sending || ownQueue?.failed || conflict || legacyMigrationNotice;
  const message = status === 'blocked' ? messages.blocked
    : ownIssues.some((issue) => issue.kind === 'error') ? messages.error
      : conflict ? messages.conflict
        : pause === 'auth' ? messages.auth
          : pause === 'access' ? messages.access
            : pause === 'protocol' ? messages.protocol
              : pause === 'legacy' ? `${messages.legacy}${legacyMigrationNotice ? ` ${messages.legacyPartial}` : ''}`
                : legacyMigrationNotice ? messages.legacyPartial
                : ownQueue?.failed ? messages.failed : messages.pending;

  async function resolve(group: RecoveryGroup, choice: RecoveryChoice): Promise<void> {
    if (!accountId) return;
    const legacy = group.operations.some((operation) => operation.legacy);
    if (choice === 'accept-server') {
      const accepted = window.confirm('Принять проверенную серверную версию и перезагрузить FitFocus? Локальные изменения этого раздела будут удалены; незавершённые поля форм могут потеряться.');
      if (!accepted) return;
    } else if (legacy || group.operations.length > 1) {
      const discarded = group.operations.length - 1;
      const accepted = window.confirm(legacy
        ? 'Сохранить последнюю локальную версию и отправить её на основе свежей версии сервера? Прежние записи миграции будут сохранены в журнале как разрешённые.'
        : `Оставить последнюю локальную версию? Она заменит остальные ${discarded} несинхронизированные операции этого раздела.`);
      if (!accepted) return;
    }
    const id = JSON.stringify([accountId, group.key]);
    setBusyKey(id);
    setActionError(null);
    try {
      const expectedOpIds = group.operations.map((operation) => operation.opId);
      const resolved = legacy
        ? await stateSync.resolveLegacyConflictedKey(accountId, group.key, expectedOpIds, choice)
        : await stateSync.resolveConflictedKey(accountId, group.key, expectedOpIds, choice);
      if (!resolved) {
        setActionError('Сеанс или очередь изменились. Обновите статус и повторите действие.');
        return;
      }
      if (choice === 'accept-server') window.location.reload();
    } catch {
      setActionError('Не удалось обновить очередь. Изменения сохранены на устройстве; повторите позже.');
    } finally {
      setBusyKey(null);
    }
  }

  async function retry(group: RecoveryGroup): Promise<void> {
    if (!accountId) return;
    const id = JSON.stringify([accountId, group.key]);
    setBusyKey(id);
    setActionError(null);
    try {
      const expectedOpIds = group.operations.map((operation) => operation.opId);
      const retried = await stateSync.retryFailedKey(accountId, group.key, expectedOpIds);
      if (!retried) setActionError('Сеанс или очередь изменились. Обновите статус и повторите действие.');
    } catch {
      setActionError('Не удалось повторить отправку. Изменения сохранены на устройстве; повторите позже.');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="grid" data-state-notice-region>
      {/* Reserve both the largest notice and the recovery disclosure so async status changes do not shift controls. */}
      {Object.entries(messages).map(([key, text]) => (
        <div key={key} aria-hidden="true" data-notice-text={text}
          className={`${noticeClass} invisible pointer-events-none select-none after:content-[attr(data-notice-text)]`} />
      ))}
      <div aria-hidden="true" className={`${noticeClass} invisible pointer-events-none select-none`}>
        <div>{messages.conflict}</div>
        <div className="mt-3">{messages.recovery}</div>
      </div>
      {(!!visible || (status === 'ready' && recoveryGroups.length > 0)) && (
        <div className={`${noticeClass} relative z-50 border-amber-400/50 bg-slate-900 text-slate-100`}>
          {!!visible && <p role={status === 'blocked' || ownIssues.length || ownQueue?.failed || conflict || pause === 'auth' || pause === 'access' ? 'alert' : 'status'}>
            {message}
          </p>}
          {legacyMigrationNotice && (
            <details data-legacy-quarantine className={visible ? 'mt-3' : ''}>
              <summary className="cursor-pointer font-bold">
                Карантин: {legacyMigrationNotice.quarantinedRecords} записей. Показать причины
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5" aria-label="Причины записей в карантине">
                {legacyMigrationNotice.reasons.map(({ reason, count }) => (
                  <li key={reason}>{migrationReasonLabels[reason] ?? 'Другая причина'}: {count}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-300">
                Ключи и содержимое записей скрыты. Неподтверждённые записи не отправляются автоматически.
              </p>
            </details>
          )}
          {status === 'ready' && recoveryGroups.length > 0 && (
            <details className={visible ? 'mt-3' : ''}>
              <summary className="cursor-pointer font-bold">{messages.recovery}</summary>
              <div className="mt-3 space-y-3">
                {recoveryGroups.map((group) => {
                  const id = JSON.stringify([accountId, group.key]);
                  const conflicted = group.operations.filter((operation) => operation.status === 'conflicted');
                  const failed = group.operations.filter((operation) => operation.status === 'failed');
                  const legacy = group.operations.some((operation) => operation.legacy);
                  const sending = group.operations.some((operation) => operation.status === 'sending');
                  const serverVersion = conflicted.map((operation) => operation.serverVersion).filter((version): version is number => version !== undefined)
                    .sort((left, right) => right - left)[0];
                  const missingServerVersion = conflicted.some((operation) => operation.reason === 'server-version-conflict' && operation.serverVersion === undefined);
                  const canResolve = conflicted.length > 0 && !legacy && !sending && !missingServerVersion;
                  const canResolveLegacy = conflicted.length > 0 && legacy && !sending
                    && group.operations.every((operation) => operation.resource === undefined)
                    && !!accountId && legacyRecoveryResource(accountId, group.key) !== null;
                  const canKeepLocal = canResolve || canResolveLegacy;
                  const canAcceptServer = canResolveLegacy || (canResolve && serverVersion !== undefined);
                  const canRetry = conflicted.length === 0 && failed.length > 0 && !legacy && !sending;
                  return (
                    <section key={group.key} className="rounded-lg border border-slate-700 p-3" aria-label={group.label}>
                      <h3 className="font-bold">{group.label}</h3>
                      <p className="mt-1 text-xs text-slate-300">
                        {conflicted.length > 0
                          ? `Конфликт: ${conflicted.length} локальных операций${serverVersion === undefined ? '' : `; версия сервера ${serverVersion}`}. ${recoveryReason(group.operations)}`
                          : `Не отправлено: ${failed.length} операций. ${recoveryReason(group.operations)}`}
                      </p>
                      {legacy ? <p className="mt-2 text-xs text-amber-200">Это запись из прежней очереди. Автоматическая отправка отключена; ручное разрешение сначала проверит свежую серверную версию.{canResolveLegacy ? '' : ' Для этого типа данных ручное разрешение недоступно.'}</p>
                        : missingServerVersion ? <p className="mt-2 text-xs text-amber-200">Сервер не предоставил проверенную версию. Локальные данные сохранены, разрешение пока недоступно.</p>
                          : sending ? <p className="mt-2 text-xs text-slate-300">Дождитесь завершения текущей отправки.</p>
                            : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canKeepLocal && <button type="button" disabled={busyKey === id}
                          onClick={() => void resolve(group, 'keep-latest-local')}
                          className="rounded-lg border border-amber-300/40 px-3 py-2 font-bold text-amber-100 disabled:opacity-50">
                          {busyKey === id ? 'Обновляю…' : 'Оставить последнюю локальную версию'}
                        </button>}
                        {canAcceptServer && <button type="button" disabled={busyKey === id}
                          onClick={() => void resolve(group, 'accept-server')}
                          className="rounded-lg border border-slate-500 px-3 py-2 font-bold text-slate-100 disabled:opacity-50">
                          Принять серверную версию
                        </button>}
                        {canRetry && <button type="button" disabled={busyKey === id}
                          onClick={() => void retry(group)}
                          className="rounded-lg border border-amber-300/40 px-3 py-2 font-bold text-amber-100 disabled:opacity-50">
                          {busyKey === id ? 'Повторяю…' : 'Повторить отправку'}
                        </button>}
                      </div>
                    </section>
                  );
                })}
                {actionError && <p role="alert" className="text-xs text-red-200">{actionError}</p>}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
