# Контракты API, критичные для синхронизации

Обновлено: 09.10.2026. Описан код `810adb1` из PR #90,
а не гарантированно развёрнутый API. Полная область: [документация](docs/README.md).
Это ограниченный реестр state/profile, не полная спецификация всех endpoints.

Последующее серверное изменение проверено на `237f862` в draft PR #94:
[state protocol 2](docs/state-generations.md) сохраняет tombstone-поколения,
добавляет includeDeleted/exists и подтверждённую версию DELETE. Разделы ниже
сохраняют контракт исходного `810adb1`; новый API ещё не объявлен выпущенным.

Источники: [state.ts](https://github.com/Michael-edel/FitFocus/blob/810adb11b01447114de9f240c6e2d520f747470b/functions/api/state.ts),
[state_write.ts](https://github.com/Michael-edel/FitFocus/blob/810adb11b01447114de9f240c6e2d520f747470b/functions/api/_lib/state_write.ts),
[state_store.ts](https://github.com/Michael-edel/FitFocus/blob/810adb11b01447114de9f240c6e2d520f747470b/functions/api/_lib/state_store.ts),
[profile.ts](https://github.com/Michael-edel/FitFocus/blob/810adb11b01447114de9f240c6e2d520f747470b/functions/api/profile.ts).

## Общие условия в этих endpoints

Проверяются пользовательская сессия/поддерживаемый bearer token и beta access.
State дополнительно проверяет разрешённое пространство ключей пользователя.
`X-Request-ID` возвращается заголовком; это не поле общей JSON-обёртки.
Тела ответов ниже сохраняют действующие формы.

| Ответ | Значение |
|---|---|
| 401 `{"error":"UNAUTH"}` | Не удалось подтвердить пользователя |
| 403 `{"error":"ACCESS_REQUIRED"}` | Нет требуемого доступа |
| 403 `{"error":"FORBIDDEN_KEYSPACE"}` | Запрещённое пространство ключей |
| 413 `{"error":"PAYLOAD_TOO_LARGE","message":"Payload too large"}` | Превышен лимит JSON-body 512 KiB |

## GET /api/state?prefix=…

Читает разрешённый prefix для текущего пользователя.
Успех 200: `{ "items": [{ "key": "…", "value": "…", "version": 1 }] }`.
Значение — строка, часто содержащая сериализованный JSON.

## PUT /api/state

Предпочтительная форма: `{ "items": [{ "key": "…", "value": "…", "baseVersion": 1 }] }`.
Поддерживается одиночная форма `{ "key": "…", "value": "…", "baseVersion": 1 }`.

Фактическая нормализация: отсутствующее/null значение превращается в пустую
строку; иное нестроковое значение отклоняется. Элементы с пустым ключом
пропускаются; если не остаётся ни одного, возвращается `NO_ITEMS`.
Повторяющийся ключ в пакете запрещён.

`baseVersion`: отсутствие, null или пустая строка → 0; принимаются целые
неотрицательные числа и числовые строки. Иное значение → `BAD_BASE_VERSION`.
Это действующий HTTP-парсер; [legacy-нормализатор](docs/adr/ADR-005-durable-outbox.md)
намеренно строже и не принимает числовые строки в metadata.

При baseVersion=0 PUT создаёт отсутствующую запись; существующая запись
конфликтует. При baseVersion>0 требуется совпадение версии существующей записи.
Пакет записывается одним условным SQL-выражением: конфликт одного ключа
не должен сохранять остальные элементы пакета.

Успех 200:

```json
{ "ok": true, "items": [{ "key": "…", "version": 2 }] }
```

Конфликт 409: `{ "error": "KV_CONFLICT", "key": "…", "value": "…", "version": 2 }`.
Поля конфликта могут отсутствовать: fallback в `state_store.ts` допускает `{}`.
Потребитель не должен считать каждый 409 полным серверным снимком.
При конфликте отсутствующей записи текущая реализация может вернуть
`value: ""` и `version: 0`; отдельного признака exists пока нет.

Ошибки 400: `BAD_JSON`, `NO_ITEMS`, `DUPLICATE_KEY`, `BAD_VALUE`,
`BAD_BASE_VERSION`; у части ответов присутствует `key`.

## DELETE /api/state?key=…&baseVersion=…

`key` обязателен; baseVersion разбирается тем же парсером, что и PUT.
В текущем коде baseVersion=0 означает **безусловное удаление**.
Положительная версия ограничивает DELETE совпадающей версией;
отсутствующая запись может подтверждаться успехом.

Успех 200: `{ "ok": true }`, без версии и признака существования.
409 использует `KV_CONFLICT`; 400 — `MISSING_KEY` или `BAD_BASE_VERSION`.
Физический DELETE уничтожает текущую версию, поэтому recreate может
повторить старый номер. Это известное ограничение, а не целевое поведение.

## /api/profile

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
409: `{ "error": "PROFILE_CONFLICT", "profile": …, "version": … }`.
400: `BAD_JSON`, `BAD_BASE_VERSION`, `EMPTY_PATCH`, `STATE_ITEMS_USE_STATE_ENDPOINT`.
Загрузка state и сохранение профиля — отдельные пути, которые нужно тестировать
по отдельности; наличие `stateItems` в ответе не означает общую атомарную outbox.

## Изменения, которые ещё предстоит внедрить

Серверная часть P0.7 реализована и проверена на `237f862`:
[новый контракт и условия выпуска](docs/state-generations.md). Клиентское
подключение и staging ещё ожидаются. Нельзя отправлять старый sender на
новый DELETE-контракт без приёмки совместимости и остановки старых writers.

409 не разрешает потерять локальную правку. 401 приостанавливает отправку,
но не локальное сохранение. 403 разбирается по коду причины. Эти требования
к новому клиенту описаны в [модели синхронизации](docs/sync-model.md);
текущий клиент им полностью не соответствует.
