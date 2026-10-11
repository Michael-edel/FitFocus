# Регистрация: постоянный профиль и проверенный владелец

Обновлено: 11.10.2026. Код этапа:
[`2e41742`](https://github.com/Michael-edel/FitFocus/commit/2e41742baa8c8dfafc2aa4c8c124940e302dfc03),
ветка `fix/durable-outbox`, [draft PR #93](https://github.com/Michael-edel/FitFocus/pull/93), база #94 → #90.
Продолжает [редактор профиля](profile-persistence.md). Это регистрация
и восстановление собственного локального профиля; весь auth lifecycle ещё открыт.

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
тем же аккаунтом поддерживает серверный consumeInviteCode.
Старые запросы без scope остаются совместимы; это не барьер старых сборок.

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

Остаются свежий session proof и guarded HTTP всего bootstrap/state-hydration,
атомарный auth-fence при их применении и seed профиля, остальные family/AI
callbacks и AI-cache, runtime provenance/barrier/import, UI конфликтов,
backup/экспорт/очистка всех stores, staging и защищённая main. [TASKS](../TASKS.md).
