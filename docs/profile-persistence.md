# Профиль: постоянная запись и проверка сессии

Обновлено: 12.10.2026. Ветка `fix/durable-outbox`,
[draft PR #93](https://github.com/Michael-edel/FitFocus/pull/93), база #94 → #90.
Код этапа: [`fc6bb82`](https://github.com/Michael-edel/FitFocus/commit/fc6bb82a6bfcf6e82cd19e223d66b0e9296896dc).
Это продолжение [15 state-ключей](owned-state-writers.md).
Ниже описано редактирование существующего профиля; регистрация и полный
auth/legacy lifecycle ещё не завершены.
Последующий этап [постоянной регистрации](registration-persistence.md)
убирает прямое создание через HTTP и уточняет доказательство владельца
локального профиля. Описание ниже сохраняет границу `fc6bb82`.

## Локальная запись

[Редактор профиля](../features/profile/useProfilePersistence.ts) использует
StateEditor и UserStateRepository. Значение хранится по ключу
`fitfocus_data_<accountId>_profile` в том же IDB v2 `values`, операция —
в единственной `outbox`. Value, операция и ревизия коммитятся атомарно.
Ошибка commit остаётся видимой; форма не очищает признак несохранённых правок.

Операция профиля имеет явный `resource: "profile"` и тип put. Операции без
resource остаются state-операциями прежнего формата. Профиль не добавлен
в USER_STATE_KEYS: state-prefix hydration не применяет его и не создаёт
для него tombstone. Дополнительного store или localStorage-outbox нет.

Функциональные patches используют рабочее значение одного редактора,
поэтому две быстрые правки до React-render не теряют друг друга. Ранние и
независимые stale-правки сохраняются как конфликт. Flush ждёт предыдущие
commit, но не принимает новую ревизию, которую редактор не показывал.

При входе [restoreProfile](../storage/profileState.ts) восстанавливает
имеющийся IDB-профиль. Bootstrap может заполнить только пустое хранилище
профилем с серверной версией; pending-профиль не заменяется более новым cloud
snapshot. Чтение и генерация defaults для отображения не создают intent.

## HTTP и завершение

Прежняя Promise-очередь и прямые PUT/PATCH из profileSync удалены.
[StateSync](../storage/stateSync.ts) dispatch по resource отправляет профиль
на `/api/profile`, state — на `/api/state`. Для profile требуется отдельная
capability `/api/me`: `profileSync: { protocol: 1, guard: 1 }`, а также
проверенная state-привязка account/session.

Profile GET/PUT/PATCH проверяет парные X-FitFocus-State-Account/Session
до чтения или мутации. Ответ содержит X-FitFocus-Profile-Protocol: 1,
X-FitFocus-Profile-Guard: 1 и переданную привязку. Ack требует совпадения
account/session, id профиля и подтверждённой версии той же мутации.
Старые запросы без заголовков пока поддерживаются; это не барьер старых сборок.
[Полный HTTP-контракт](../API_CONTRACTS.md#apiprofile).

409 сохраняет локальное намерение и проверенный серверный снимок. Повтора
с новой server baseVersion нет. Auth/access/protocol-пауза сохраняет новые
правки; неповторяемые ошибки остаются failed, сеть/429/5xx используют общий
bounded retry. Claim и finish проверяют аккаунт, epoch, попытку, resource,
операцию и ревизию транзакционно. Для немедленной паузы используется одно
время finish, чтобы движение часов не создавало OUTBOX_INVALID_RETRY_TIME.

## Обновление и форма

Guarded GET применяет профиль только без локальной операции и изменения
ревизии, с действующим sessionEpoch внутри IDB-транзакции. UI дополнительно
проверяет поколение входа и счётчик правок. Обновляется только редактор
профиля; state-редакторы не заменяются повторным входом.

Несохранённая форма блокирует refresh и объявление полного успеха flush.
Счётчик меняется при вводе, поэтому старый GET не заменяет новый черновик.
Локальный cache формы хранит profileDirty; явно clean-cache не оживляет
старые поля после cloud refresh. Старый cache без этого поля сохраняется
как потенциальный черновик. Cache формы не является очередью отправки.

Bootstrap проверяет свою актуальность после асинхронных чтений; профиль
другого subject не переименовывается в текущий account. Это не подтверждает
полную защиту всех HTTP bootstrap/state-hydration/AI/family путей.

## Проверки и оставшаяся работа

[Profile actions](../tests/profile_sync.test.ts), [sender](../tests/profile_sender.test.ts),
[server guard](../tests/profile_session_guard.test.ts) и
[bootstrap](../tests/auth_session_transport.test.ts) проверяют конфликт,
быстрые правки, reload, смену сессии, quota-отказ, capability и поздние ответы.
[Browser-сценарии](../e2e/profile-durability.spec.ts) проверяют изменение имени,
auth-паузу, конфликт без перебазирования, чистый refresh с новой CAS-версией
и сохранение черновика при отказе commit. SHA, результаты и ограничения —
в [журнале](stabilization-progress.md).

Последующие компоненты: [регистрация](registration-persistence.md) на `2e41742`
сохраняет профиль до AI; [bootstrap/hydration](bootstrap-hydration.md) на
`dac2de2` проверяет HTTP scope и атомарный auth-fence при refresh/seed профиля.
Исторические результаты этого документа относятся к указанному выше SHA.

Остаются полный lifecycle остальных callbacks, legacy provenance/barrier/import,
UI разрешения конфликтов, атомарный backup/экспорт/очистка всех stores,
реальные OAuth/staging и выпуск в защищённую main. [TASKS](../TASKS.md).
