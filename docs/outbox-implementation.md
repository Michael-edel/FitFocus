# Реализация P0.8: постоянная очередь

Обновлено: 09.10.2026. Это карта реализации согласованного
[ADR-005](adr/ADR-005-durable-outbox.md), а не новый архитектурный план.
Общий порядок P0/P1 остаётся в [TASKS](../TASKS.md).

## Проверенная граница

Ревизия [`61d256e84e92225c45535e917c4ff424a5904aba`](https://github.com/Michael-edel/FitFocus/commit/61d256e84e92225c45535e917c4ff424a5904aba),
ветка `fix/durable-outbox`, [draft PR #93](https://github.com/Michael-edel/FitFocus/pull/93).
Зависимость — PR #90, `cc880d9`. [CI success](https://github.com/Michael-edel/FitFocus/actions/runs/37919548774): 590 unit-тестов,
три проверки типов, audit/инварианты, сборка, 19 browser passed / 9 skips.
Подробные ограничения — в [журнале](stabilization-progress.md#p08--транзакционный-фундамент-на-61d256e).

На этом SHA очередь реализована как отдельный API. Работающее приложение
ещё использует прежние writers и HTTP sender. Изменения после этого SHA
требуют собственного diff и CI; результаты нельзя переносить на них.

## Код и подтверждение

| Компонент | Что реализовано | Подтверждение на 61d256e |
|---|---|---|
| [legacyQueue.ts](https://github.com/Michael-edel/FitFocus/blob/61d256e84e92225c45535e917c4ff424a5904aba/storage/legacyQueue.ts) | Семь причин отказа; отсутствующие metadata → 0; delete без value; SHA-256 по нормализованному JSON-массиву | [62 проверки](https://github.com/Michael-edel/FitFocus/blob/61d256e84e92225c45535e917c4ff424a5904aba/tests/legacy_queue.test.ts), включая порядок, retryCount и границы полей |
| [stateDatabase.ts](https://github.com/Michael-edel/FitFocus/blob/61d256e84e92225c45535e917c4ff424a5904aba/storage/stateDatabase.ts) | Та же база, схема 2; values сохранён; пять stores; blocked/versionchange; повтор открытия; ожидание commit/rollback | [8 проверок](https://github.com/Michael-edel/FitFocus/blob/61d256e84e92225c45535e917c4ff424a5904aba/tests/state_database.test.ts); fake-IDB upgrade, отказ открытия и abort |
| [durableOutbox.ts](https://github.com/Michael-edel/FitFocus/blob/61d256e84e92225c45535e917c4ff424a5904aba/storage/durableOutbox.ts) | Атомарные value/операция; владелец ключа; конфликты; claim/lease; проверяемый finish | [22 проверки](https://github.com/Michael-edel/FitFocus/blob/61d256e84e92225c45535e917c4ff424a5904aba/tests/durable_outbox.test.ts); конкуренция, quota, поздние ответы, сессии и причинный parent |
| [indexedUserState.ts](https://github.com/Michael-edel/FitFocus/blob/61d256e84e92225c45535e917c4ff424a5904aba/storage/indexedUserState.ts) | Объёмные values используют общий менеджер IDB | Входит в полный CI; прежние bool/null API ещё сохранены |
| [userStateRepository.ts](https://github.com/Michael-edel/FitFocus/blob/61d256e84e92225c45535e917c4ff424a5904aba/storage/userStateRepository.ts) и [hybrid.ts](https://github.com/Michael-edel/FitFocus/blob/61d256e84e92225c45535e917c4ff424a5904aba/storage/hybrid.ts) | Прежняя запись и Map/localStorage sender остаются активными | Подключение новой очереди не выполнено |

Владельца новой записи передаёт вызывающая сторона; он не определяется
по активному экрану. Подтверждённый parent связывает только операции того же
автора/ключа. Независимый JSON-снимок другой вкладки сохраняется как конфликт.
Тестовая активация сессии не заменяет подтверждение личности через auth.

## Следующие изменения

| Порядок | Что сделать | Критерий проверки |
|---|---|---|
| 1. Импорт legacy | Подтверждённое соответствие ключа владельцу; карантин; операция, ledger и прогресс одной транзакцией порции | Abort/restart без потери и дублей; raw и причина сохранены; unknown/unprocessed не дают completed |
| 2. Repository и writers | Новые account-owned values и операции пишутся через DurableOutbox; profile/localStorage получают явный путь | Ошибка commit не выглядит успехом; delete сохраняет намерение; все вызовы проинвентаризированы |
| 3. Сервер P0.7 | Сохранить поколение ключа после delete и возвращать версию подтверждённой мутации | Delete → recreate → stale update не проходит CAS; старые клиенты совместимы |
| 4. Sender и сессии | HTTP только после claim commit; 401/403/409/retry → соответствующий исход; finish проверяет попытку | Новые правки при auth-паузе сохраняются; поздний ответ и смена аккаунта безопасны |
| 5. Hydration, UI и данные | Не затирать pending/conflicted; показывать blocked/ошибку; включить очередь и карантин в экспорт/очистку | Reload/login/online сохраняют локальное намерение; очищаются данные только выбранного владельца |
| 6. Браузерная приёмка | Две вкладки без Web Locks; старый/новый bundle на одном origin и в одном browser context | Реальные blocked/versionchange, lease recovery, reload и отсутствие дописывания legacy после завершения |

Порядок 3–4 учитывает действующий [DELETE-контракт](../API_CONTRACTS.md#delete-apistatekeybaseversion):
`{ "ok": true }` не содержит возрастающую версию для DurableOutbox.finish.
Нельзя заменять серверное подтверждение вычисленной клиентом версией.

## Обязательные правила импорта

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
- Старые writers должны быть остановлены проверяемым способом до финального
  marker; новое уведомление не меняет код уже открытой старой вкладки.

## Как фиксировать готовность

Каждое изменение обновляет соответствующий пункт TASKS и этот документ,
а журнал получает точный SHA, результаты и ограничения. Примитивы проверяются
unit-тестами с отказами; поведение вкладок — реальным браузером; API/D1 —
отдельно в staging. Полная [матрица приёмки](sync-model.md#матрица-приёмки)
и [чек-лист выпуска](../RELEASE_CHECKLIST.md) остаются обязательными.
Слияние PR и deploy отмечаются только после отдельной проверки.
