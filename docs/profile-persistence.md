## Cached form lifecycle (second pass, 22 October 2026)

`ProfileDraftHydration` allows cached UI restoration once per verified
account/session scope. Explicit edits or save consume that opportunity before
publishing the profile. A same-scope profile update preserves a dirty working
form and refreshes a clean form from the profile, without rereading a stale dirty
cache. This prevents a completed Save from manufacturing a new edit revision.
Helper eligibility tests are in `tests/settings_profile_draft_hydration.test.ts`;
real form, outbox and reload checks are in `e2e/profile-durability.spec.ts`.

# Профиль: постоянная запись и проверка сессии

## Подтверждение показанной ревизии и повторный Save, 22.10.2026

Второй проход локальной ветки `qa/first-users-20261022` устраняет гонку:
новый редактор читает регистрационный профиль до ACK, затем ACK повышает
confirmedVersion без изменения значения. Ранее первая правка получала
`base-version-conflict` даже без двойного нажатия.

Repository передаёт точные прочитанные байты только для профиля. В той же
IDB write-транзакции допускается только ACK этой показанной ревизии:
valueRevision и acknowledgedRevision совпадают с expectedRevision, байты
не менялись, ACK metadata присутствует, head и любые операции отсутствуют,
confirmedVersion выросла. Остальные revision/parent/session/auth-fence и
canCommit проверки остаются обязательными. Это не принятие чужой версии
и не автоматическое разрешение конфликта. Обычные state-записи исключены.

`SettingsScreen` использует синхронный [Save gate](../features/settings/profileDraftSave.ts)
для cloud и local путей. Повторное нажатие во время await не создаёт вторую
операцию; ошибка сохраняет dirty draft, завершение старой попытки не очищает
новый ввод или данные другой сессии.

Регрессии: [ACK interleaving](../tests/profile_editor_ack_interleaving.test.ts),
[отрицательная матрица ACK](../tests/profile_ack_observation.test.ts),
[Save gate](../tests/settings_profile_draft_save.test.ts).
Публикация и точный CI фиксируются отдельно; исторические границы ниже сохранены.

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

## Сохранение сгенерированного результата

Последующий компонент [`f4b4eee`](https://github.com/Michael-edel/FitFocus/commit/f4b4eee1e577292019481b711b097941df27558e) добавляет отдельный guarded путь:
`persistUser(functionalPatch, { readGuard, canCommit })` →
`StateEditor.commitGenerated` → repository/outbox. Proof и predicate копируются
до ожидания; session/epoch/auth-fence и актуальность editor revision
проверяются внутри транзакции до любой записи value/операции.

Generated value публикуется после durable commit. Quota/abort не заменяют
видимое значение; конфликт хранится как intent без публикации успешного AI-результата.
Независимая правка во время запроса или ожидания IDB не перезаписывается.
Обычный `persistUser(update)` сохраняет прежнее поведение локального редактора,
включая offline/auth-паузу; для него HTTP proof не требуется.

Локальный запасной AI-план подчиняется тому же правилу: если профиль после
входа или чистого refresh не содержит `aiPlan`, экран остаётся в состоянии
подготовки. `App.tsx` создаёт план функциональным profile patch с account/session
guard и показывает его только после durable commit. При quota/abort план не
появляется в интерфейсе и не создаёт запись outbox или облачную мутацию; после
reload действие может повториться. Регрессия проверяет отказ и восстановление
на desktop Chromium, Firefox и WebKit в
[profile-durability.spec.ts](../e2e/profile-durability.spec.ts).

Персональное меню ждёт pending commit до отдельного items writer.
[Сценарий и границы](ai-session-guard.md#клиентское-подключение-в-работе),
[транзакционные регрессии](../tests/generated_result_commit.test.ts).

## Автоматический flush профиля

На [`f3930ec`](https://github.com/Michael-edel/FitFocus/commit/f3930ec64f7fa74f3aad352246aa18b92d2542b7) debounce использует `StateSync.flushPending`, а ручное действие —
`syncNow` со свежим proof. Таймер не переавторизует auth-паузу и не создаёт
новый профиль: отправляется существующее намерение outbox.
Чистый профиль не запускает debounce и не получает ложную ошибку из-за ещё
не готового sender; cloud recovery продолжает выбирать refresh.
Проверенный источник native `/api/me` при reload устранён в этом callback;
исторические результаты ниже сохраняют свои ревизии.
[Контракт sender](state-sender.md#автоматическая-отправка-и-ручная-проверка-сессии).

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

## Стабильность формы при изменении уведомления

Дополнение 12.10.2026, код `3550cc8`: [StateStorageNotice](../ui/StateStorageNotice.tsx)
сохраняет высоту своей области от pointerdown до завершения жеста. Обновление
очереди продолжает менять текст и роль уведомления, но не перемещает форму
под нажатой кнопкой. После pointerup/click или pointercancel размер освобождается
на следующем animation frame. Blur завершает удержание; pagehide, смена
аккаунта и unmount освобождают область и обработчики. В покое пустое уведомление
не резервирует высоту. Запись профиля и обработка 409 не изменены.

[Регрессионный E2E](../e2e/profile-durability.spec.ts) удерживает один Save,
пока сервер подтверждает state-операцию и уведомление исчезает. Проверяются
координаты формы в документе и viewport, одна profile-операция, один PUT,
локальное имя и serverSnapshot версии 8 после 409. Затем уведомление конфликта
должно целиком попасть в viewport: временное ограничение высоты снято.

До исправления новая проверка упала на Chromium, Firefox и iPhone PWA:
сдвиг в документе составил 86/86/106 px. Проверка только viewport ранее
проходила благодаря компенсации прокрутки; её было недостаточно для
доказательства стабильной раскладки. После исправления сценарий прошёл
во всех семи проектах Playwright; исходный и новый Save-сценарии прошли
20 повторов Safari/PWA без retries. Полная матрица и CI фиксируются отдельно
[в журнале](stabilization-progress.md).

Это проверка эмуляции устройств и mock API. Отдельные Safari page errors
`due to access control checks` при reload ещё требуют проверки причины;
их фильтр не расширен и успешный повтор не считается исправлением.

Остаются полный lifecycle остальных callbacks, legacy provenance/barrier/import,
UI разрешения конфликтов, атомарный backup/экспорт/очистка всех stores,
реальные OAuth/staging и выпуск в защищённую main. [TASKS](../TASKS.md).

## Дополнительная проверка до pointerdown 12.10.2026

Регрессия показала границу `3550cc8`: защита только начатого жеста не мешала
уведомлению исчезнуть до pointerdown. На iPhone PWA завершение фоновой
state-записи сдвинуло кнопку Save в документе на 106 px. Успешные повторы
прежнего сценария не исключали эту гонку.

Поправка [`724ecf1`](https://github.com/Michael-edel/FitFocus/commit/724ecf1aad05461d86644789f773ffca73f6efad)
в [StateStorageNotice](../ui/StateStorageNotice.tsx) резервирует
одну grid-область по максимальной высоте всех сообщений с учётом их переноса
на текущей ширине. Скрытые измерители недоступны для assistive technology
и pointer events; видимое сообщение сохраняет `alert`/`status`. Обработчики
глобальных pointer events больше не требуются. Когда сообщения нет, область
остаётся пустой: это явная цена постоянного положения формы. Resize может
изменить раскладку, подтверждение очереди — нет.

Новый [E2E](../e2e/profile-durability.spec.ts) завершает фоновую запись перед
нажатием, сравнивает координаты кнопки в документе, затем проверяет один Save,
постоянную profile-операцию и конфликт. Старый сценарий удержанного Save
сохранён. Runtime `724ecf1` прошёл полную матрицу 229 passed / 9 skips
без retries, включая все 42 profile-сценария; [журнал](stabilization-progress.md).

Auth-сценарий теперь моделирует согласованное истечение входа: после PUT/401
последующий `/me` тоже возвращает 401 до новой загрузки документа. Проверка
focus подтверждает отказ proof, отсутствие дополнительного PUT и сохранение
auth-паузы. Новая загрузка восстанавливает вход, но сохраняет тот же opId.
Это уточнение fixture; свежий действующий proof в реальном клиенте по-прежнему
может возобновить синхронизацию. Оно не доказывает причину прежнего Android-падения.
