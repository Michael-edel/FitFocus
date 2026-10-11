# Контракты API, критичные для синхронизации

Обновлено: 11.10.2026. State описывает серверный компонент P0.7
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
проверяет парные заголовки до body/DB/consume; смена аккаунта, cookie или
неполная привязка → 401 `{"ok":false,"error":"UNAUTH"}`.
Ответ содержит `X-FitFocus-Invite-Guard: 1` и переданные account/session.
Новый клиент требует совпадающий scope и ok=true для подтверждения успеха.
Запрос без заголовков поддерживается для прежних клиентов; это не writer barrier.
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

`/api/me` дополнительно сообщает `profileSync: { protocol: 1, guard: 1 }`.
Проверенные accountId/sessionId берутся из stateSync того же ответа /me.
Новый sender требует обе capabilities перед отправкой profile-операции.
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
Загрузка state и сохранение профиля — отдельные пути, которые нужно тестировать
по отдельности; наличие `stateItems` в ответе не означает общую атомарную outbox.

## Рабочий контракт bootstrap и загрузки state

Следующий этап добавляет отдельную bootstrap capability, привязку HTTP-чтения
к account/session и транзакционную проверку auth-fence при применении снимков.
Его [контракт, исходники и открытые проверки](docs/bootstrap-hydration.md)
описаны отдельно. Это незакоммиченная рабочая версия поверх `4f7b874`;
она не входит в проверенный CI этого SHA и не объявляется выпущенным API.

## Изменения, которые ещё предстоит внедрить

Серверный компонент P0.7 реализован и проверяется в этой ветке; его
[условия выпуска](docs/state-generations.md#условия-выпуска-и-отката)
требуют совместимого клиента, миграции, барьера старых writers и staging.
Старый sender может потерять намерение при 409, поэтому этот сервер
нельзя считать совместно выпущенным с прежним клиентом по одному CI.

409 не разрешает потерять локальную правку. 401 приостанавливает отправку,
но не локальное сохранение. 403 разбирается по коду причины. Эти требования
к новому клиенту описаны в [модели синхронизации](docs/sync-model.md);
текущий клиент им полностью не соответствует.
