# Реализация P0.8: постоянная очередь

Обновлено: 09.10.2026. Это карта реализации согласованного
[ADR-005](adr/ADR-005-durable-outbox.md), а не новый архитектурный план.
Общий порядок P0/P1 остаётся в [TASKS](../TASKS.md).

## Проверенная граница

Ревизия [`51a789c5c0d8b724a54071ecf10232ecc58a42df`](https://github.com/Michael-edel/FitFocus/commit/51a789c5c0d8b724a54071ecf10232ecc58a42df),
ветка `fix/durable-outbox`, [draft PR #93](https://github.com/Michael-edel/FitFocus/pull/93).
Зависимость — PR #90, `cc880d9`. [CI success](https://github.com/Michael-edel/FitFocus/actions/runs/37925347789): 649 unit-тестов,
три проверки типов, audit/инварианты, сборка, 19 browser passed / 9 skips.
Подробные ограничения — в [журнале](stabilization-progress.md#p08--возобновляемый-компонент-legacy-импорта).

На этом SHA очередь реализована как отдельный API. Работающее приложение
ещё использует прежние writers и HTTP sender. Изменения после этого SHA
требуют собственного diff и CI; результаты нельзя переносить на них.

После этого снимка серверный PR #94 объединён коммитом `93f90c0`.
Следующее изменение подключает шесть ключей repository, защищённую hydration,
settings и сообщения об отказе/ожидании. [Граница текущего клиента](runtime-state.md)
и [новые результаты](stabilization-progress.md#p08--repository-и-загрузка-пользовательских-данных)
описаны отдельно. [Sender шести ключей](state-sender.md) подключён;
импорт из runtime, остальные writers и
приёмка жизненного цикла остаются открытыми; таблица ниже относится к `51a789c`.

## Код и подтверждение

| Компонент | Что реализовано | Подтверждение на 51a789c |
|---|---|---|
| [legacyQueue.ts](https://github.com/Michael-edel/FitFocus/blob/51a789c5c0d8b724a54071ecf10232ecc58a42df/storage/legacyQueue.ts) | Семь причин отказа; отсутствующие metadata → 0; delete без value; SHA-256 по нормализованному JSON-массиву | [62 проверки](https://github.com/Michael-edel/FitFocus/blob/51a789c5c0d8b724a54071ecf10232ecc58a42df/tests/legacy_queue.test.ts), включая порядок, retryCount и границы полей |
| [stateDatabase.ts](https://github.com/Michael-edel/FitFocus/blob/51a789c5c0d8b724a54071ecf10232ecc58a42df/storage/stateDatabase.ts) | Та же база, схема 2; values сохранён; пять stores; blocked/versionchange; повтор открытия; ожидание commit/rollback | [8 проверок](https://github.com/Michael-edel/FitFocus/blob/51a789c5c0d8b724a54071ecf10232ecc58a42df/tests/state_database.test.ts); fake-IDB upgrade, отказ открытия и abort |
| [durableOutbox.ts](https://github.com/Michael-edel/FitFocus/blob/51a789c5c0d8b724a54071ecf10232ecc58a42df/storage/durableOutbox.ts) | Атомарные value/операция; владелец ключа; конфликты; claim/lease; проверяемый finish; migration gate/ledger и атомарный ack receipt | [22 базовые проверки](https://github.com/Michael-edel/FitFocus/blob/51a789c5c0d8b724a54071ecf10232ecc58a42df/tests/durable_outbox.test.ts); migration gate/ack дополнительно покрыты тестами импортера |
| [legacyMigration.ts](https://github.com/Michael-edel/FitFocus/blob/51a789c5c0d8b724a54071ecf10232ecc58a42df/storage/legacyMigration.ts) | Атомарные импорт/карантин/ledger/прогресс; точные снимки; восстановление прежних снимков; финальный audit операции или ack; readonly legacy-источник | [59 проверок](https://github.com/Michael-edel/FitFocus/blob/51a789c5c0d8b724a54071ecf10232ecc58a42df/tests/legacy_migration.test.ts); abort/restart, владение, коллизии, потеря ledger/операции, параллельные соединения |
| [indexedUserState.ts](https://github.com/Michael-edel/FitFocus/blob/51a789c5c0d8b724a54071ecf10232ecc58a42df/storage/indexedUserState.ts) | Объёмные values используют общий менеджер IDB | Входит в полный CI; прежние bool/null API ещё сохранены |
| [userStateRepository.ts](https://github.com/Michael-edel/FitFocus/blob/51a789c5c0d8b724a54071ecf10232ecc58a42df/storage/userStateRepository.ts) и [hybrid.ts](https://github.com/Michael-edel/FitFocus/blob/51a789c5c0d8b724a54071ecf10232ecc58a42df/storage/hybrid.ts) | Прежняя запись и Map/localStorage sender остаются активными | Подключение новой очереди не выполнено |

Владельца новой записи передаёт вызывающая сторона; он не определяется
по активному экрану. Подтверждённый parent связывает только операции того же
автора/ключа. Независимый JSON-снимок другой вкладки сохраняется как конфликт.
Тестовая активация сессии не заменяет подтверждение личности через auth.

## Следующие изменения

| Порядок | Что сделать | Критерий проверки |
|---|---|---|
| 1. Доказательства для импорта | Компонент готов; подключить подтверждённое соответствие ключа владельцу и проверяемую остановку старых writers | Текущий аккаунт не становится доказательством; boolean не заменяет остановку; старый writer не дописывает legacy после финального marker |
| 2. Repository и writers | Шесть ключей уже используют DurableOutbox; перевести оставшиеся account-owned writers, profile/localStorage | Ошибка commit не выглядит успехом; delete сохраняет намерение; все вызовы проинвентаризированы |
| 3. Интеграция сервера P0.7 | Компонент проверен на `237f862` в PR #94; подключить protocol 2, tombstone-чтение и подтверждённый ack | Совместная ревизия проходит delete/recreate/stale CAS; старые поколения, writers и порядок выпуска проверены |
| 4. Sender и сессии | Шесть ключей подключены к claim/finish и server session guard; проверить оставшиеся пути | Новые правки при auth-паузе сохраняются; поздний ответ и смена аккаунта безопасны |
| 5. Hydration, UI и данные | Шесть ключей защищены, ошибки/ожидание показаны; завершить остальные пути, повтор/разрешение, экспорт/очистку | Reload/login/online сохраняют локальное намерение; очищаются данные только выбранного владельца |
| 6. Браузерная приёмка | Две вкладки без Web Locks; старый/новый bundle на одном origin и в одном browser context | Реальные blocked/versionchange, lease recovery, reload и отсутствие дописывания legacy после завершения |

Порядок 3–4 учитывает два контракта. На исходном `810adb1`
[DELETE](../API_CONTRACTS.md#delete-apistatekeybaseversion) возвращает только
`{ "ok": true }`. На `237f862` [новый сервер](state-generations.md) возвращает
версию и exists=false. Sender должен проверить protocol 2 и ответ своей
мутации; вычисленная клиентом версия не заменяет серверного подтверждения.

## Обязательные правила импорта

Компонент реализован на `51a789c`; полный контракт и ограничения —
[импорт старой очереди](legacy-migration.md). Следующие правила остаются
обязательными при подключении к приложению.

- Единственное новое хранилище очереди — IDB; Web Locks лишь координируют.
- Исходный `fitfocus.remote-kv-outbox.v1` сохраняется. Это источник миграции;
  новый формат не записывается под этим или переименованным legacy-ключом.
- Fingerprint корректной записи: JSON-массив type/key/value-or-null/baseVersion.
  Индекс и retryCount исключены; при совпадении хеша сравниваются поля.
- Неизвестный accountId, повреждение, неоднозначный дубликат и коллизия
  сохраняются с raw и причиной; текущий вход не разрешает автоматическую отправку.
- Нормализация/хеширование выполняются до транзакции. Операция или карантин,
  ledger и прогресс порции коммитятся вместе; ошибка откатывает всю порцию.
- Итог миграции проверяет все записи и сохранность источника. `completed`
  недопустим при неизвестных или необработанных записях.
- Проверяются также прежние сохранённые снимки и backing operation/ack;
  одного processed marker недостаточно. Claim/finish требуют matching ledger
  и разрешение миграции; ack receipt сохраняется вместе с удалением операции.
- Старые writers должны быть остановлены проверяемым способом до финального
  marker; новое уведомление не меняет код уже открытой старой вкладки.

## Как фиксировать готовность

Каждое изменение обновляет соответствующий пункт TASKS и этот документ,
а журнал получает точный SHA, результаты и ограничения. Примитивы проверяются
unit-тестами с отказами; поведение вкладок — реальным браузером; API/D1 —
отдельно в staging. Полная [матрица приёмки](sync-model.md#матрица-приёмки)
и [чек-лист выпуска](../RELEASE_CHECKLIST.md) остаются обязательными.
Слияние PR и deploy отмечаются только после отдельной проверки.
