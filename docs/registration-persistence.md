# Регистрация: постоянный профиль и проверенный владелец

Обновлено: 19.10.2026. Исходный код этапа:
[`2e41742`](https://github.com/Michael-edel/FitFocus/commit/2e41742baa8c8dfafc2aa4c8c124940e302dfc03),
ветка `fix/durable-outbox`, [draft PR #93](https://github.com/Michael-edel/FitFocus/pull/93), база #94 → #90.
Продолжает [редактор профиля](profile-persistence.md). Это регистрация
и восстановление собственного локального профиля; весь auth lifecycle ещё открыт.

## Доступ только при подтверждённой сессии

Регистрационная форма и её запуск доступны только когда состояние проверки
совпадает с текущим Google subject и имеет статус `active`. Отсутствующий или
чужой subject считается состоянием `checking`; форма остаётся скрыта до
подтверждения. Обработчик регистрации проверяет актуальное состояние
проверки и требует подходящий session guard, поэтому callback, созданный до
смены владельца, не начинает сохранение профиля или AI-запрос. Перед созданием
профиля он заново читает активную IDB-сессию и сравнивает её с подтверждённым
session key. Сам `profile` intent записывается с `OutboxLocalCommitGuard`:
транзакция атомарно сверяет accountId, serverSessionId и sessionEpoch. Если
между чтением сессии и commit другая вкладка переключила вход, запись
отклоняется до создания значения и операции. Эта локальная проверка допускает
сохранение при sender pause; запрет относится к смене владельца или сессии.

## Порядок создания

[registrationFlow](../registrationFlow.ts) использует подтверждённый при входе
`googleMe.sub` как ID профиля с первого шага. Временного user-<timestamp>,
прямого PUT `/api/profile` и записи all_users в localStorage больше нет.

До AI-запроса [createProfileIntent](../storage/profileState.ts) сохраняет
профиль с базовым планом и version/baseVersion=0. Значение, операция
resource=profile и ревизия атомарны в прежней IDB-outbox. Создание допускается
только при пустом профиле без поколения и операций. Существующий профиль
не принимается как новая база; гонка после наблюдения пустого профиля
сохраняет намерение как конфликт без перезаписи существующего значения.
Ошибка commit оставляет форму открытой, без AI-запроса и перехода в приложение.

Успешный AI-результат записывается причинным продолжением того же редактора.
Отказ этой записи сохраняет исходный базовый профиль. Конфликт не перезаписывает
другую локальную правку. Вход и отображение выполняются после локального commit;
состояние облака определяется общим sender, а не успехом генерации AI.
Счётчик регистрации, поколение bootstrap и текущий аккаунт отсекают поздние
AI/invite/login callbacks. Уже закоммиченная собственная операция после выхода
не удаляется и не передаётся другому аккаунту.

В локальной реализации рабочей ветки генерация плана проходит через `AiSession`.
Первичная регистрация может принять начальную сессию только при отсутствии
активной IDB-сессии; fence проверяется до HTTP proof и повторно атомарно при
принятии. Каждая AI-модель использует тот же scope. После сетевой ошибки исходная
сессия проверяется ещё раз; stale proof, auth/protocol отказ и unload не
превращаются в успешный план. `beforeunload` заранее отменяет active AI fetch;
`pagehide` остаётся дополнительной защитой для закрытия и BFCache. Generated
plan пишется в профиль с `readGuard` и `canCommit`. Проверки текущего рабочего
дерева перечислены в
[контракте AI callbacks](ai-callback-sessions.md); CI этого дерева ещё не
подтверждён.

## Восстановление и legacy

После свежего `/me` bootstrap может восстановить профиль именно этого subject
из IDB, даже без OAuth-маркера, если сервер ещё не получил регистрацию или
временно недоступен. Чтение требует accountId записи и owner-meta, а также
точного id в payload. Неизвестный владелец, ошибочный профиль или отказ чтения
останавливают вход; сырые данные сохраняются для восстановления.

Профиль из legacy all_users не выбирается по email, googleSub или размеру
истории. [prepareLoginSession](../features/auth/loginSession.ts) не меняет id
и не переименовывает storage prefix под текущий вход. Список локальной сессии
содержит её владельца. Legacy-источник не удаляется; доказанный перенос
остаётся задачей [runtime-миграции](legacy-migration.md).

Bootstrap 401/403 не активирует локальную сессию. Новая регистрация после OAuth
предлагается только при корректном profile=null; ошибка сети или повреждённый
ответ не считается отсутствием серверного профиля. Проверки актуальности
добавлены до/после login hydration и перед применением cloud snapshot.

## Приглашение

Если требуется invite, перед расходованием кода выполняется свежий `/api/me`.
Проверяются аккаунт, state session proof и `inviteSync: { protocol: 1, guard: 1 }`.
POST `/api/invite/redeem` передаёт парные X-FitFocus-State-Account/Session;
сервер проверяет их до DB/body/consume, смена cookie или аккаунта даёт 401.
Успех принимается только с X-FitFocus-Invite-Guard: 1 и своей привязкой.
POST не повторяется автоматически; повторное подтверждение того же кода
тем же аккаунтом поддерживает серверный consumeInviteCode. Сервер требует
оба scope-заголовка и отвергает отсутствующий или устаревший proof до чтения
body и расходования приглашения. Старые сборки без proof получают 401 и должны
обновиться для регистрации с invite.

Follow-up `f4dcce8` ограничивает оба регистрационных invite-запроса общим
транспортом `requestJson` с таймаутом 12 секунд. Ожидающий invite-запрос
отменяется при `beforeunload` или `pagehide`; тогда redeem/profile/AI шаги не
запускаются. Таймаут показывает повторяемую ошибку, но POST не повторяется автоматически. Если ответ
на расходование кода потерялся, пользователь может повторить действие:
`consumeInviteCode` идемпотентен для того же кода и аккаунта. Если unload
прерывает AI уже после durable commit базового профиля, профиль остаётся
восстанавливаемым, но вход в приложение не выполняется.

Локально на `f4dcce8` прошли registration unit 16/16, полный unit suite
1384/1384 в 215 файлах, root/storage typecheck, auth-scope guard, production build
и registration durability E2E 2/2 в desktop Chromium. Follow-ups `32d58d7`,
`f4a4140` и `c219f17` добавили timeout/pagehide initial `/api/me` и invite redeem,
запрет auto-retry POST и abort AI после durable commit; registration spec прошёл
19/19 и полный unit — 1387/1387.

В локальном `dc38a51` устранено расхождение между unit-событием `pagehide` и
реальным браузерным unload: до teardown `beforeunload` отменяет request-specific
AI controller и registration action; `pagehide` сохраняется. Настоящий переход
во время удержанного `/api/ai` проверяет signal, durable базовый профиль,
единственную pending operation и отсутствие profile PUT/login. Полная
registration спека прошла 21/21 на семи browser/PWA профилях без retries;
transport/registration unit — 44/44, полный unit — 1388/1388, все три typecheck,
build и diff check прошли.
Эти follow-ups ещё локальные.

Code commit `f4dcce8` опубликован в PR. Точный
[CI #1628](https://github.com/Michael-edel/FitFocus/actions/runs/39139902243)
для remote HEAD `5d5dca8` завершился success, но не содержит локальный unload fix.
Точный CI для `dc38a51` ожидает push. Родитель `702b4d1` прошёл
[CI #1624](https://github.com/Michael-edel/FitFocus/actions/runs/39136081427),
включая browser matrix и rollback compatibility.

## Проверки и оставшаяся работа

[Регистрация](../tests/registration_flow.test.ts), [вход](../tests/auth_login_session.test.ts),
[восстановление](../tests/auth_session_transport.test.ts),
[hydration](../tests/session_hydration_durable.test.ts) и
[invite guard](../tests/invite_session_guard.test.ts) проверяют commit/rollback,
причинный AI-update, поздний ответ, аккаунты, отказ хранения и guarded invite.
[E2E](../e2e/registration-durability.spec.ts) проверяет запись до AI, auth-паузу
и reload без OAuth-маркера, а также quota-отказ без сетевого создания профиля.
Результаты и ограничения mock-среды — [в журнале](stabilization-progress.md).

Последующее исправление `b723b7d`: при reload sender останавливается на `pagehide`; BFCache-восстановление
заново проверяет сессию исходного аккаунта. Контракт последующего исправления:
[жизненный цикл страницы](state-sender.md#жизненный-цикл-страницы).

Дополнение `dac2de2`: [bootstrap/state-hydration](bootstrap-hydration.md)
использует свежий proof, проверяет HTTP scope, epoch и auth-fence; seed
профиля защищён той же транзакционной границей. Неподтверждённый `/me`
останавливает вход и на пути без входящего readGuard. Результаты этого
дополнения учитываются отдельно от проверок `2e41742` и `b723b7d`.

Остаются остальные family/AI
callbacks и AI-cache, runtime provenance/barrier/import, UI конфликтов,
backup/экспорт/очистка всех stores, staging и защищённая main. [TASKS](../TASKS.md).
