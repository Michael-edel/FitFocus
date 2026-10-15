# Контракты API, критичные для синхронизации

Обновлено: 14.10.2026. State описывает серверный компонент P0.7
в `fix/state-generations` после миграции 0019; profile включает guard/capability
интеграционной ветки `fix/durable-outbox`.
Серверная ветка объединена с клиентской коммитом `93f90c0`;
слияние в main и deploy не подтверждены. [Область](docs/README.md).
Это ограниченный реестр state/profile и привязки invite, не полная спецификация всех endpoints.

Источники этой ветки: [state.ts](functions/api/state.ts),
[state_write.ts](functions/api/_lib/state_write.ts),
[state_store.ts](functions/api/_lib/state_store.ts);
профиль:
[profile.ts](https://github.com/Michael-edel/FitFocus/blob/810adb11b01447114de9f240c6e2d520f747470b/functions/api/profile.ts).

## Общие условия в этих endpoints

State/profile проверяют пользовательскую сессию/поддерживаемый bearer token
и beta access. Invite redeem проверяет сессию и сам код приглашения;
уже выданный beta access для активации кода не требуется.
State дополнительно проверяет разрешённое пространство ключей пользователя.
`X-Request-ID` возвращается заголовком; это не поле общей JSON-обёртки.
Тела ответов ниже сохраняют действующие формы.
Общий json-helper добавляет `schema_version: 3` и заголовок
`X-API-Schema-Version: 3`; примеры показывают поля сценария.
State также возвращает `X-FitFocus-State-Protocol: 2`. Новый клиент должен
проверить успешный ответ и этот заголовок до трактовки tombstone-чтения.

## Привязка новой отправки к сессии

`GET /api/me` после requireUser возвращает также
`stateSync: { protocol: 2, guard: 1, accountId, sessionId }` и hasAccess.
sessionId — SHA-256 с разделителем назначения от subject/sid; raw sid не выдаётся.
Новый sender проверяет capability и точное совпадение подтверждённого accountId.

State принимает парные `X-FitFocus-State-Account` и `X-FitFocus-State-Session`.
Если передан хотя бы один, requireStateUser требует оба и сравнивает их
с фактической сессией. Смена cookie/аккаунта → 401 до state-чтения или мутации.
Прежние запросы без обоих заголовков пока поддерживаются. Ответ state содержит
`X-FitFocus-State-Guard: 1` и переданную привязку; новый sender принимает ack
только с проверенными scope, key, exists, ok и версией своей операции.
[Порядок отправки и паузы](docs/state-sender.md).

Общие ошибки state/profile:
| Ответ | Значение |
|---|---|
| 401 `{"error":"UNAUTH"}` | Не удалось подтвердить пользователя |
| 403 `{"error":"ACCESS_REQUIRED"}` | Нет требуемого доступа |
| 403 `{"error":"FORBIDDEN_KEYSPACE"}` | Запрещённое пространство ключей |
| 413 `{"error":"PAYLOAD_TOO_LARGE","message":"Payload too large"}` | Превышен лимит JSON-body 512 KiB |

### Активация приглашения при регистрации

`/api/me` также возвращает `inviteSync: { protocol: 1, guard: 1 }`.
Новая регистрация требует эту capability и свежий state account/session proof
перед POST `/api/invite/redeem`. [Обработчик](functions/api/invite/redeem.ts)
проверяет парные заголовки до body/DB/consume; смена аккаунта или cookie,
отсутствующая либо неполная привязка → 401 `{"ok":false,"error":"UNAUTH"}`.
Ответ содержит `X-FitFocus-Invite-Guard: 1` и переданные account/session.
Новый клиент требует совпадающий scope и ok=true для подтверждения успеха.
Запрос без парных заголовков отклоняется до чтения body и consume; старые
сборки, которые не передают scope, должны обновиться до регистрации с invite.
Profile создаётся локальной операцией, затем отправляется общим sender,
без прямого PUT из регистрации. [Порядок и границы](docs/registration-persistence.md).

## GET /api/state?prefix=…

Читает разрешённый prefix для текущего пользователя; prefix сравнивается
буквально. По умолчанию возвращает только живые записи.
Успех 200: `{ "items": [{ "key": "…", "value": "…", "version": 1, "exists": true }] }`.
Значение — строка, часто содержащая сериализованный JSON.
С `includeDeleted=1` включаются tombstones с value="", exists=false и
сохранённой версией. Без этой опции отсутствие в выдаче не означает,
что ключ никогда не имел поколения. Старый сервер может игнорировать опцию.

## PUT /api/state

Предпочтительная форма: `{ "items": [{ "key": "…", "value": "…", "baseVersion": 1 }] }`.
Поддерживается одиночная форма `{ "key": "…", "value": "…", "baseVersion": 1 }`.

Фактическая нормализация: отсутствующее/null значение превращается в пустую
строку; иное нестроковое значение отклоняется. Элементы с пустым ключом
пропускаются; если не остаётся ни одного, возвращается `NO_ITEMS`.
Повторяющийся ключ в пакете запрещён.
Максимум 32 элемента; более крупный пакет получает 400 TOO_MANY_ITEMS.

`baseVersion`: отсутствие, null или пустая строка → 0; принимаются целые
неотрицательные безопасные целые числа и числовые строки
(до Number.MAX_SAFE_INTEGER). Иное значение → `BAD_BASE_VERSION`.
Это действующий HTTP-парсер; [legacy-нормализатор](docs/adr/ADR-005-durable-outbox.md)
намеренно строже и не принимает числовые строки в metadata.

При baseVersion=0 PUT создаёт ключ без предыдущего поколения;
существующая живая запись или tombstone конфликтует. При baseVersion>0
требуется совпадение текущей версии; PUT восстанавливает tombstone и повышает
версию. Исчерпанная безопасная версия конфликтует без переполнения.
Пакет записывается одним условным SQL-выражением: конфликт одного ключа
не должен сохранять остальные элементы пакета.

Успех 200:

```json
{ "ok": true, "items": [{ "key": "…", "version": 2, "exists": true }] }
```

Конфликт 409: `{ "error": "KV_CONFLICT", "key": "…", "value": "…", "version": 2, "exists": true }`.
Поля конфликта могут отсутствовать: fallback в `state_store.ts` допускает `{}`.
Потребитель не должен считать каждый 409 полным серверным снимком.
При отсутствии поколения: value="", version=0, exists=false. Для tombstone:
value="", его положительная version, exists=false. 409 — диагностический
снимок после отклонённой записи, а не подтверждение мутации.

Ошибки 400: `BAD_JSON`, `NO_ITEMS`, `DUPLICATE_KEY`, `BAD_VALUE`,
`BAD_BASE_VERSION`, `TOO_MANY_ITEMS`; у части ответов присутствует `key`.

## DELETE /api/state?key=…&baseVersion=…

`key` обязателен; baseVersion разбирается тем же парсером, что и PUT.
baseVersion=0 создаёт tombstone версии 1 только для ключа без предыдущего
поколения. Это больше не безусловное удаление. Положительная версия должна
совпадать с текущей живой записью или tombstone; DELETE очищает payload,
сохраняет deleted_at и повышает поколение. Несовпадение/отсутствие → 409.

Успех 200: `{ "ok": true, "key": "…", "version": 2, "exists": false }`.
Версия возвращается RETURNING того же условного SQL. Повтор со старой
baseVersion конфликтует; клиент не выдумывает ack после потерянного ответа.
409 использует `KV_CONFLICT`; 400 — `MISSING_KEY` или `BAD_BASE_VERSION`.
Физический DELETE остался только для полного удаления аккаунта.

## /api/profile

`/api/me` сообщает `profileSync: { protocol: 1, guard: 1 }`; после миграции
0020 и проверки таблицы/обоих triggers добавляет `weeklyMenuProjection: 1`.
Проверенные accountId/sessionId берутся из stateSync того же ответа /me.
Sender `4736ff5` требует state/profile capabilities и новый projection marker
для отправки profile. Без него операция остаётся pending с protocol-паузой.
Guarded GET чистого profile требует прежний read-контракт без нового marker.
GET/PUT/PATCH поддерживают парные X-FitFocus-State-Account/Session с той же
серверной проверкой, что state; изменение cookie возвращает 401 до работы
с профилем. Ответ profile содержит X-FitFocus-Profile-Protocol: 1,
X-FitFocus-Profile-Guard: 1 и переданную привязку. Запросы без обоих заголовков
ещё поддерживаются; реальный барьер старых клиентов этим не реализован.

GET возвращает 200 `{ "profile": … }`.
PUT заменяет профиль через сценарий `replace`, PATCH применяет сценарий `patch`.
Оба принимают разрешённые поля профиля прямо в JSON-body вместе с baseVersion,
например `{ "weight": 80, "baseVersion": 3 }`, без обёртки `profile`.
Пустой PATCH после фильтрации полей отклоняется. Непустые корректные stateItems
в запросе запрещены: записи state нужно отправлять на `/api/state`.
Форматы входа и правила полей определяются
[profile_write.ts](https://github.com/Michael-edel/FitFocus/blob/810adb11b01447114de9f240c6e2d520f747470b/functions/api/_lib/profile_write.ts)
и [profile_contract.ts](https://github.com/Michael-edel/FitFocus/blob/810adb11b01447114de9f240c6e2d520f747470b/functions/api/_lib/profile_contract.ts);
они не взаимозаменяемы с PUT state.

Успех записи содержит `profile`, `updatedFields`, `stateItems`, `mode`, `version`.
`stateItems` в этом ответе — число, а не массив state-записей.
Для ack нового sender нужны совпадающие scope и profile.id, целая версия
больше baseVersion и равенство version в ответе и profile.version.
409 сохраняет конфликт; автоматического PATCH с новой серверной базой нет.
[Граница редактора и общей outbox](docs/profile-persistence.md).
409: `{ "error": "PROFILE_CONFLICT", "profile": …, "version": … }`.
400: `BAD_JSON`, `BAD_BASE_VERSION`, `EMPTY_PATCH`, `STATE_ITEMS_USE_STATE_ENDPOINT`.
422: `PROFILE_INVALID_WEEKLY_MENU` на `830caf4`: присутствующее меню должно
содержать weekStart в форме YYYY-MM-DD и массив shoppingListItems.
Неверный input отклоняется до persistence, унаследованная неверная форма —
до CAS. Явное удаление допускается; SQL triggers сохраняют атомарную защиту.
Загрузка state и сохранение профиля — отдельные пути, которые нужно тестировать
по отдельности; наличие `stateItems` в ответе не означает общую атомарную outbox.

## Bootstrap и загрузка state

Компонент `dac2de2` добавляет в `/api/me` независимую
`bootstrapSync: { protocol: 1, guard: 1 }`. Новый клиент передаёт парные
`X-FitFocus-State-Account` / `X-FitFocus-State-Session` для bootstrap и state GET.
Bootstrap проверяет привязку до чтения профиля, state и features; успешный
ответ подтверждает scope и `X-FitFocus-Bootstrap-Protocol: 1` /
`X-FitFocus-Bootstrap-Guard: 1`. `user` содержит публичные поля без сырого sid.
State GET использует protocol 2 / guard 1 и ту же пару scope headers.

Старый bootstrap без обоих scope headers обслуживается для совместимости;
новый клиент не принимает его как доказанный снимок. До применения облачных
данных IDB-транзакция проверяет epoch/auth-fence, revision и pending.
[Контракт, исходники и границы проверки](docs/bootstrap-hydration.md).
Capability и серверный guard должны быть развёрнуты до включения нового
клиента; CI не подтверждает deploy или прекращение работы старых сборок.

## AI и нормализованный список покупок

Серверный компонент `16d3c34` добавляет в `/api/me` независимые
`aiSync: { protocol: 1, guard: 1 }` и `weeklyMenuSync: { protocol: 1, guard: 1 }`.
POST `/api/ai` и `/api/weekly_menu/items` проверяют парные
`X-FitFocus-State-Account` / `X-FitFocus-State-Session` до прикладных эффектов.
Другой аккаунт, новая сессия того же аккаунта и неполная пара дают 401.

Ответы содержат соответственно `X-FitFocus-AI-Protocol` / `-Guard` или
`X-FitFocus-Weekly-Menu-Protocol` / `-Guard` со значением 1 и переданный scope.
Заголовки присутствуют также на ошибках; клиент проверяет статус и текущую
сессию отдельно. Прежние запросы без обоих headers остаются без этой защиты.
Исторический персональный menu-сценарий на `f4b4eee` проверял свежий proof и обе
capabilities, передавал scope, ждал guarded profile commit и только затем
отправлял items. Таймаут запроса сохраняет возможность показать ошибку и
повторить действие; logout/pagehide отменяют прежнюю попытку.
Личные покупки связаны с profile CAS, семейное меню — с family/week CAS и
durable outbox; остальные callbacks и staging-приёмка остаются открытыми.
[Полный контракт и приёмка](docs/ai-session-guard.md).
Capabilities должны быть развёрнуты и проверены до выпуска нового клиента.

Компонент `4736ff5` связывает личные покупки с profile CAS и убирает
вторичный личный items POST. Profile CAS и запись `personal_menu_projections`
атомарны; покупки и CSV читают проекцию, а legacy — только при отсутствии
её строки. Пустой/повреждённый канонический снимок не включает legacy fallback.
Личный POST `/api/weekly_menu/items` с корректным `week_start` возвращает
409 `{ "error": "PERSONAL_MENU_PROFILE_REQUIRED", "requestId": "…" }` без записи
покупок. Семейный POST после миграции 0021 блокируется; семейный список следует
каноническому family/week поколению через `/api/family/menu/state`, CAS и
durable `familyMenu` outbox. [Личный контракт и проверки](docs/personal-menu-projection.md),
[семейный контракт](docs/family-menu-state.md).
Реализация в ветке не подтверждает deploy; подготовительный сервер с RETURNING
должен предшествовать миграции 0020.

## Достижения

Компонент достижений `57da2cf` добавляет capability
`achievementSync: { protocol: 1, guard: 1 }` в `/api/me` и account/session guard
для GET `/api/achievements` и POST `/api/achievements/check` до прикладных
эффектов. Ответы содержат `X-FitFocus-Achievements-Protocol` / `-Guard: 1`
и переданный scope. Новый клиент требует исходный login proof и проверяет
поздние ответы; POST требует JSON-объект. Старые unscoped-запросы не получают
подтверждения владельца. [Подробный контракт](docs/achievement-session.md).

## Оставшиеся условия выпуска

Серверный компонент P0.7 реализован и проверяется в этой ветке; его
[условия выпуска](docs/state-generations.md#условия-выпуска-и-отката)
требуют совместимого клиента, миграции, барьера старых writers и staging.
Старый sender может потерять намерение при 409, поэтому этот сервер
нельзя считать совместно выпущенным с прежним клиентом по одному CI.

409 не разрешает потерять локальную правку. 401 приостанавливает отправку,
но не локальное сохранение. 403 разбирается по коду причины. Эти требования
к новому клиенту описаны в [модели синхронизации](docs/sync-model.md);
текущий клиент им полностью не соответствует.

## Семейные запросы: исходная сессия

Компонент `9c44c21` добавляет `familySync: { protocol: 1, guard: 1 }` в `/api/me`;
коммит `2bbec11` расширяет capability до `target: 1` для явных целей семейных
мутаций. Новые клиенты отправляют `POST /api/family/invite` и
`PATCH /api/family/member` только с непустым `familyId`, полученным из выбранной
семьи. Без `familySync.target === 1` клиент блокирует эти запросы до отправки.
Invite требует владельца именно указанной активной семьи; member mutation
проверяет активное членство именно в указанной семье и повторяет условие
family/user/active в SQL `UPDATE`. Отсутствующая цель возвращает 400,
неподходящее членство/владелец — 403.
`useFamilyCloud` получает исходный login guard из hydration и обновляет proof
перед каждым HTTP, не принимая другой вход того же аккаунта. Запросы передают
`X-FitFocus-State-Account` / `X-FitFocus-State-Session`; family handlers и
shopping list/check/export/bulk проверяют их до body и прикладных эффектов.
Все семейные endpoints требуют парный scope: отсутствие, неполная пара или
несовпадение возвращают 401 до чтения body/DB side effects. Старые сборки без
proof должны обновиться; сервер больше не принимает их family/shopping запросы.

Ответы этих handlers содержат `X-FitFocus-Family-Protocol: 1`,
`X-FitFocus-Family-Guard: 1` и публичный scope. Клиент проверяет headers,
IDB epoch/auth-fence, familyId/week и форму загружаемых данных до применения.
Mutation HTTP не повторяется автоматически. Запросы без scope сохраняют
совместимость лишь на других endpoints; каждый семейный и shopping route выше
требует парный scope. `/api/family/menu/state` возвращает `Family-Menu`
protocol/guard markers.

Это не вводит family CAS или постоянную очередь. AI-путь `useFamilyMenu`
пока использует прежние writers; полные границы, методы и проверки —
в [контракте семьи](docs/family-session.md).

## Семейное меню: рабочий CAS-протокол 12.10.2026

[Контракт](docs/family-menu-state.md), [ADR-008](docs/adr/ADR-008-family-menu-generation.md).
Компонент реализован локально; общий CI и выпуск ещё не приняты.
`familyMenuSync` требует protocol=1, guard=1, cas=1. Capability отсутствует
до полного 0021; неполная миграция не включает прежний writer.
GET/PUT `/api/family/menu/state` требуют state account/session headers и
подтверждают Family-Menu protocol/guard. PUT принимает явные familyId,
weekStart, baseVersion и полный menu; только владелец с family plan пишет.
Один SQL CAS сохраняет menu/portions/structured shopping; возвращает собственный
RETURNING version. 409 содержит проверенный snapshot без удаления local intent.
Серверный `/api/family/menu/generate` на новой схеме принимает preview:true
и явный familyId, возвращает shared.menu и ничего не сохраняет.
Старые menu/items POST и генерация без preview после 0021 возвращают 409.
Generic state отклоняет family-menu key с 403. Empty canonical не читает
legacy; повреждённый canonical возвращает ошибку и требует восстановления.

## Обращения пользователя в поддержку: session guard

Новые клиенты читают свои тикеты через `GET /api/support/feedback/my` и
`GET /api/support/feedback/my?id=…`, создают обращение через
`POST /api/support/feedback`, отвечают через `POST /api/support/feedback/my`.
Запросы передают парные `X-FitFocus-State-Account` /
`X-FitFocus-State-Session`; `requireStateUser` сравнивает их с фактической
cookie-сессией до прикладной работы с тикетами и вложениями. Неполная или
устаревшая пара возвращает 401.

Ответы пользовательских endpoints кроме 401 содержат
`X-FitFocus-Support-Protocol: 1`, `X-FitFocus-Support-Guard: 1` и переданный
публичный state scope. Новые клиенты проверяют все четыре значения до
применения результата к UI. Мутации не повторяются автоматически.
Запросы без state-заголовков остаются совместимыми, но не защищены этой
привязкой. Контракт React lifetime и локальных проверок — в
[документе сессии поддержки](docs/support-session.md).

## Выдача мобильного bearer-токена

`POST /api/mobile/token` в актуальном Settings-клиенте сначала получает свежий
`/api/me` proof исходной login-сессии, затем передаёт парные
`X-FitFocus-State-Account` и `X-FitFocus-State-Session`. Сервер использует
`requireStateUser` до выпуска токена; устаревшая или неполная пара отвергается
как 401. Успешный scoped-ответ содержит `X-FitFocus-Mobile-Token-Protocol: 1`,
`X-FitFocus-Mobile-Token-Guard: 1` и echo обоих публичных scope headers, а все
ответы `POST` используют `Cache-Control: no-store`.

Клиент отправляет этот POST один раз без автоматических повторов. После ответа
он сверяет серверные markers и ещё раз проверяет durable read guard до
возвращения секрета в Settings; UI скрывает токен и bridge setup link при смене
guard и проверяет его перед копированием. Старые unscoped-вызовы остаются
совместимыми, но не имеют account/session binding. Проверки и ограничения:
[wearable sync](docs/wearable-sync.md).

## Push: обязательная привязка к сессии

`GET /api/push/status` и `POST /api/push/subscribe`, `/unsubscribe`, `/test`
требуют парные `X-FitFocus-State-Account` / `X-FitFocus-State-Session` через
`requireScopedStateUser`. Отсутствующая, неполная или устаревшая пара получает
401 до чтения JSON, работы с подписками или отправки уведомления. Ответы кроме
401 возвращают `X-FitFocus-Push-Protocol: 1`, `X-FitFocus-Push-Guard: 1` и
публичный scope; новый клиент проверяет markers перед применением результата.
Старые открытые сборки без proof получают 401 и требуют обновления до server
rollout. Подробности Service Worker и lifecycle — в
[контракте push-сессии](docs/push-session.md).

## Huawei Health: session guard

Текущий Settings-клиент получает Huawei capability из `/api/me`, затем передаёт
парные `X-FitFocus-State-Account` / `X-FitFocus-State-Session` в status, OAuth
start, sync и disconnect. `requireStateUser` сверяет scope с cookie-сессией до
прикладных эффектов; scoped-ответы содержат
`X-FitFocus-Huawei-Protocol: 1`, `X-FitFocus-Huawei-Guard: 1` и точное эхо scope.
POST start возвращает authorization URL только для совпавшей сессии. Старый GET
redirect остаётся совместимым.

Signed OAuth state дополнительно содержит публичный digest исходного session id.
Callback сверяет user/session до обмена authorization code и повторно проверяет
вход перед записью credentials и profile. Huawei sync повторяет серверную
проверку после внешнего запроса к provider перед CAS-профильной записью.
Клиент отбрасывает поздний ответ после смены IndexedDB session и пишет профиль
через guarded outbox commit. Legacy-вызовы без scope сохраняют прежний путь, но
не защищены session binding. Подробности и границы проверок:
[Huawei session contract](docs/huawei-health-session.md).

## Stripe Checkout и смена тарифа: session guard

`POST /api/billing/checkout` и `POST /api/admin/subscription` в новом paywall
получают capability `billingSync` из `/api/me` и передают исходный публичный
account/session scope. Сервер сверяет scope с cookie через `requireStateUser`
до создания Stripe Checkout session или записи тарифа. Ответы кроме 401 несут
`X-FitFocus-Billing-Protocol: 1`, `X-FitFocus-Billing-Guard: 1` и echo scope;
ответы используют `Cache-Control: no-store`.

Клиент выполняет mutation один раз, затем проверяет маркеры, совпадение активной
IDB-сессии и lifetime действия до открытия HTTPS Checkout URL или публикации
нового тарифа. Старый клиент без state-заголовков временно сохраняет прежний
серверный путь, но не имеет этой привязки. Полный CI, старые bundles, staging и
реальный Stripe checkout проверяются отдельно. [Контракт](docs/billing-session.md).

## Выход и удаление аккаунта: session guard

Новый `POST /api/logout` передаёт proof исходного guard. Сервер проверяет пару
`X-FitFocus-State-Account` / `X-FitFocus-State-Session` по подписанному cookie и
отзывает только совпавшую сессию. Для scoped logout сервер не истекает общую
cookie в ответе, чтобы поздний ответ не удалил cookie более нового входа.
Запрос без proof сохраняет поведение старых клиентов и не имеет этой защиты.

`POST /api/account/delete` требует scope обязательно, сверяет его до account
side effects и возвращает `Account-Delete` protocol/guard markers с эхом proof.
Запрос legacy-клиента без пары заголовков получает 401. Успешный ответ не
истекает общую cookie: удаление отзывает серверные сессии аккаунта, а клиент
очищает только его локальные данные после проверки ответа.
[Контракт и lifecycle-границы](docs/account-lifecycle-session.md).
