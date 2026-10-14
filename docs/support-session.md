# Сессия обращений поддержки

Сверено: 14.10.2026. Документ описывает привязку пользовательского экрана
поддержки к login session и границы текущего изменения. Это один компонент
P0.5; он не закрывает остальные callbacks, staging или выпуск.

## Запросы пользователя

`SupportScreen` читает список и детали через `GET /api/support/feedback/my`,
создаёт обращение через `POST /api/support/feedback`, а ответ пользователя
отправляет через `POST /api/support/feedback/my`. Перед каждой операцией
клиент обновляет proof, сохраняя исходные account/session из `loginGuard`.
Запросы передают парные заголовки
`X-FitFocus-State-Account` и `X-FitFocus-State-Session`.

Перед прикладными чтениями и записями `requireStateUser` сверяет оба заголовка
с текущей cookie-сессией. Несовпадение возвращает 401 до прикладных чтений и
записей тикетов и вложений.
Успешные ответы и прикладные ошибки, кроме 401, несут
`X-FitFocus-Support-Protocol: 1`, `X-FitFocus-Support-Guard: 1` и переданный
публичный account/session scope. Новый клиент отвергает ответ без каждого из
этих маркеров или с несовпадающим scope до применения результата к интерфейсу.

Старые клиенты без state-заголовков сохраняют совместимость; они не получают
защиты привязки к исходной сессии. Этот компонент не меняет формат тикетов,
вложения, роли администраторов или их рабочий экран.

## Поздний ответ и UI

Экран получает `loginGuard` и `isCurrentSession` от `AppWorkspace`. Его React
key включает account, session epoch, server session и auth fence; при смене
сессии экран монтируется заново. Каждый запрос проверяет актуальность proof
до и после HTTP. Список, деталь, создание и ответ имеют отдельные abort
controllers; смена выбранного тикета отменяет предыдущую загрузку деталей.
`pagehide`, timeout и закрытие компонента прекращают запрос или не позволяют
его результату изменить интерфейс.

Долгие чтения списка/детали не могут показать тикет прежней учётной записи.
Позднее создание или ответ не очищает черновик и не отображает успех в другой
сессии. Автоматических повторов у мутаций нет. Компонент также останавливает
MediaStream и освобождает object URLs вложений при демонтаже.

## Проверки и границы

- Серверный scope и отказ до записи: [support feedback tests](../tests/support_feedback_my.test.ts), [admin route tests](../tests/support_feedback_admin.test.ts).
- Клиентский proof, заголовки, response markers, IDB invalidation и pagehide: [transport tests](../tests/support_session_transport.test.ts).
- Поздний список A после входа B в соседней вкладке: [account-switch E2E](../e2e/family-callback-account-switch.spec.ts).
- Исходники: [SupportScreen](../SupportScreen.tsx), [transport](../services/supportSession.ts), [серверный scope](../functions/api/_lib/state_session.ts).

Эти проверки подтверждают локальный код своей ревизии. Полный CI, реальный
OAuth/session expiry, BFCache, staging, выпуск и остальные writers проверяются
отдельно; см. [TASKS P0.5](../TASKS.md#p05--защититься-от-запоздавших-ответов).
