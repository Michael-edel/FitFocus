# Компонент импорта старой очереди

Обновлено: 14.10.2026. Реализация: `storage/legacyMigration.ts` и runtime в
`storage/stateSync.ts`, проверки: `tests/legacy_migration.test.ts` и
`tests/state_sync_legacy_migration.test.ts`, ветка
[PR #93](https://github.com/Michael-edel/FitFocus/pull/93).
Это компонент [P0.8](../TASKS.md), реализующий согласованный
[ADR-005](adr/ADR-005-durable-outbox.md). Runtime подключён; old/new bundle
smoke с настоящей записью прошёл на семи Playwright-проектах. Локальная
account-scoped очистка пяти IDB stores реализована в `b53a55e`, CI компонента
прошёл. Локальный tombstone подавляет повторный импорт записей удалённого
аккаунта и мешает старому backup вернуть его durable rows, если tombstone уже
есть в браузере или backup. Global legacy source и snapshots сохраняются как
evidence; физическое удаление payload и оставшийся lifecycle P0.8 открыты.
[Контракт очистки](account-data-cleanup.md).
Tombstone-итерация закоммичена в [`c7700eb`](https://github.com/Michael-edel/FitFocus/commit/c7700eb0a6800b535c1111f9410803a2051f7a2e);
локальный 7/7 browser smoke пройден. Точный
[CI run 38340805337](https://github.com/Michael-edel/FitFocus/actions/runs/38340805337)
завершился success на документирующем SHA `57e0a93`: 1082 unit / 197 файлов,
390 browser passed / 9 skipped, audit без уязвимостей, typecheck/build и rollback
прошли.

## Browser acceptance — 13.10.2026

[Тест](../e2e/legacy-outbox-migration.spec.ts) собирает закреплённый legacy
bundle `22a77889f131b554f52519515efc7ac811f6169f` и текущую сборку, отдаёт обе
с одного native HTTP origin и запускает их в одном browser context. Старая
страница создаёт pending intent действием «Записать первый завтрак» через свой
реальный UI и legacy Map/localStorage writer; запись в legacy-ключ тест вручную
не подменяет. Пока открыта старая вкладка, новая сборка импортирует intent,
сопоставляет точного владельца из `/api/me`, оставляет чужой ключ в quarantine,
сохраняет исходный legacy snapshot и не отправляет операцию.

После явного обновления обе вкладки подтверждают один текущий build id. Новая
очередь отправляет известную операцию пакетным `/api/state`, получает ack и
сохраняет версию в ledger; legacy-ключ остаётся без изменений, чужая запись не
отправляется. Старый single-key запрос получает отказ по scope до обновления.
API fixture отвечает 503 на новые пакетные записи до подтверждения build id
обоих окон и короткой паузы после навигации; после этого backend принимает их.
Проверка прошла в Chromium, Firefox, WebKit, Android Chrome, Android PWA Chrome,
iPhone Safari и iPhone PWA: 7/7, `workers=1/retries=0`. Используется HTTP API
fixture; реальный OAuth/D1/staging и полный lifecycle этим smoke не подтверждены.

## IDB-транзакции импорта — 37dc4b0

В текущем импортере readwrite-транзакции не ждут завершения promise между
запросами. Чтения снимка и прогресса ставятся заранее; обработка продолжается
в success-событиях IndexedDB-запросов. Для каждой записи outbox operation,
ledger и progress фиксируются согласованно в одной транзакции. Если запись
импортируется как неизвестная, карантин и прогресс также остаются в её
транзакционной границе. Batch chaining, сохранение snapshots и финальный audit
используют те же активные request events.

Код зафиксирован в [`37dc4b0`](https://github.com/Michael-edel/FitFocus/commit/37dc4b0c26326cb6f862ab7baa945a802a03990b).
На этой ревизии прошли 94 целевых теста migration/outbox/account cleanup,
весь unit-набор (1133 теста / 198 файлов), общий и два strict typecheck,
production build. `legacy-outbox-migration.spec.ts` прошёл 6/6 последовательных
запусков на desktop Firefox и Android Chrome без retries. До этого один раз
упал timeout в совместном прогоне migration и weekly-menu specs; изолированный
повтор и серия повторов migration прошли. Точный CI документирующего HEAD
[`152d7d7`](https://github.com/Michael-edel/FitFocus/commit/152d7d729d84d9d86d1c3968911d075df23045d7)
завершился success в [run 38577353585](https://github.com/Michael-edel/FitFocus/actions/runs/38577353585):
540 browser passed / 83 skipped; unit, guards, typechecks, build и rollback/CAS
также прошли. Durable backup restore callbacks и общая lifecycle-приёмка
остаются открытыми.

## Формат legacy-записи

Контракт согласованного нормализатора уже реализован в
[storage/legacyQueue.ts на ревизии сверки](https://github.com/Michael-edel/FitFocus/blob/48cf797b2b08cd4b62bdf59c265c4d85a4db863f/storage/legacyQueue.ts).

| Поле | Условие |
|---|---|
| record | Объект, не null; иначе `not-an-object` |
| type | `put` или `delete`; иначе `invalid-type` |
| key | Непустая строка; иначе `invalid-key` |
| value для put | Обязательная строка; иначе `put-without-value` |
| value для delete | Поле должно отсутствовать, даже `value: undefined` отклоняется как `delete-with-value` |
| baseVersion | Отсутствие нормализуется в 0; присутствующее поле — целое неотрицательное число, иначе `invalid-baseVersion` |
| retryCount | Отсутствие нормализуется в 0; присутствующее поле — целое неотрицательное число, иначе `invalid-retryCount` |

Входной тип и тип неизвестной записи:

```ts
type LegacyQueueRecord = {
  type: 'put' | 'delete';
  key: string;
  value?: string;
  baseVersion?: number;
  retryCount?: number;
};

type UnknownLegacyRecord = {
  fingerprint: string;
  rawRecord: unknown;
  reason:
    | 'not-an-object'
    | 'invalid-type'
    | 'invalid-key'
    | 'put-without-value'
    | 'delete-with-value'
    | 'invalid-baseVersion'
    | 'invalid-retryCount';
  detectedAt: string;
};
```

Успешный результат нормализатора имеет различимые варианты: `put` всегда
содержит строковый `value`; `delete` не имеет этого свойства вообще. В обоих
вариантах `baseVersion` и `retryCount` уже присутствуют как целые числа,
включая значения `0`, подставленные при отсутствии полей в legacy-записи.

Нормализованный delete возвращается без поля value. Отрицательные,
дробные и нечисловые значения, включая NaN/Infinity, отклоняются.
Все семь причин входят в `UnknownLegacyRecord.reason`; повреждённое
намерение сохраняется в `outbox_migration_unknown` с исходной записью,
fingerprint и временем обнаружения.

Fingerprint вычисляется из нормализованных полей:
`JSON.stringify([type, key, valueOrNull, baseVersion])` → SHA-256.
Для delete используется null. Индекс элемента, retryCount и порядок свойств
объекта не участвуют. Отсутствующий baseVersion эквивалентен явному 0.
Совпавший hash дополнительно сверяется по каноническим полям при импорте.

Сверка кода и тестов на `48cf797` подтвердила все правила выше. Повторная
проверка branch HEAD `659aebd` 14.10.2026 подтвердила контракт на актуальной
ветке: файлы нормализатора и его тестов не менялись после `ce546c1`, а
`npx vitest run tests/legacy_queue.test.ts tests/legacy_migration.test.ts`
прошёл 124/124. Полный PR workflow [run 38608666208](https://github.com/Michael-edel/FitFocus/actions/runs/38608666208)
проверяет точный HEAD `659aebd` и пока выполняется. Локальная проверка
подтверждает нормализатор и импортные unit-тесты, но не завершённый CI, полный
lifecycle, staging или готовность P0.8. Оставшаяся работа указана в
[статусе проекта](project-status.md).

## Входные данные и граница доверия

LegacyQueueMigration получает источник с единственным методом getItem
и общий StateDatabase. Читает только `fitfocus.remote-kv-outbox.v1`;
не изменяет этот ключ, не удаляет его и не создаёт новую localStorage-очередь.

## Подавление после удаления аккаунта

Очистка создаёт в `outbox_meta` запись `legacy-deleted-account:v1:<sha256>` в
той же транзакции, что удаляет account-owned строки. Запись не хранит ID
аккаунта в открытом виде. Когда свежая проверка подтверждает владельца точного
ключа, мигратор проверяет tombstone внутри транзакции: совпавший fingerprint
помечается обработанным в snapshot без создания outbox operation, migration
item или новой quarantine-копии raw payload. Такая запись учитывается в
`processedRecords`, но не в `importedRecords`; legacy source и snapshot остаются
без изменений.

Удаление отзывает прежний `sendAllowed` и writer proof. При восстановлении v3
backup account-owned values, outbox, ledger и metadata пропускаются, если
tombstone присутствует в текущей базе или в backup. Общие source/snapshot при
этом остаются; механизм обеспечивает локальное подавление, а не физическое
удаление payload или серверную синхронизацию tombstone. Sender также проверяет
marker на claim и finish: уже существующая legacy operation не отправляется,
а поздний ответ не может её подтвердить. На другом устройстве старый backup
без tombstone не знает о более позднем удалении.

| Параметр migrate | Требование |
|---|---|
| verifiedOwners | Map точного ключа к accountId из свежего `/api/me`; включаются только корректные записи, чей ключ начинается с точного префикса подтверждённого аккаунта |
| verifyWritersStopped | Callback повторно проверяет Service Worker fence после порций импорта. Отсутствующий, старый или не ответивший клиент не даёт разрешения на отправку |
| batchSize | Целое 1–500, по умолчанию 100; abort откатывает всю порцию |

Владение копируется до первого await. Отсутствующий или неоднозначный владелец
ведёт в карантин. Явная принадлежность другому аккаунту, глобальные ключи и
служебные all_users/version-ключи не получают права автоматической отправки.
Уже импортированная запись сохраняет доказанного постоянного владельца;
отсутствие новой подсказки не назначает ей текущего пользователя.

Runtime запускает импорт только после принятия свежего `/api/me` proof и
auth-fence. Неизвестные записи других аккаунтов остаются в карантине до входа
в соответствующий аккаунт; текущая сессия не присваивает им владельца.

Writer fence использует два сообщения Service Worker. Worker перечисляет все
окна текущего origin, посылает каждой вкладке одноразовый challenge через
`MessageChannel` и принимает только встроенный в страницу build id. Подтверждение
валидно, когда ответили все окна, включая инициатора, все ids уникальны, а
страницы и активный worker сообщают одинаковый build id. Старая или замороженная
вкладка, отсутствие контролирующего worker и timeout дают отказ. Проверка
повторяется после импорта непосредственно перед финальным IDB audit; неподтверждённая
порция может сохраниться, но отправка остаётся закрытой. При первом управлении
worker, смене origin snapshot или изменении legacy-ключа runtime повторяет
проверку.

## Сохранение и восстановление

Нормализация и SHA-256 выполняются вне IDB-транзакций. Точный снимок источника
сохраняется в outbox_meta. Порция атомарно сохраняет операцию либо карантин,
migration item и прогресс. Новое value пишется общей транзакционной функцией;
отличающееся локальное значение сохраняется, legacy-намерение становится
конфликтом. Независимые снимки не получают выдуманную причинную связь.

Повтор не создаёт другой opId для уже обработанной записи. Перестановка
контейнера и изменение retryCount не меняют fingerprint. Несколько записей
одного старого Map-ключа, одинаковые дубликаты и hash collision сохраняются
как неоднозначность, а не разрешаются выбором первого/последнего элемента.
Raw-варианты и их кратность сохраняются; повторный запуск не умножает их.

Параллельные запуски одного снимка используют общий runId; ledger проверяется
транзакционно. Новый запуск не наследует устаревший результат writer fence;
callback проверки выполняется заново. Другой снимок может заменить активный run: прежний запуск
завершается ошибкой LEGACY_MIGRATION_SUPERSEDED внутри StateStorageError.
Источник и уже закоммиченные порции сохраняются для повторного запуска.

Все прежние сохранённые снимки также проходят импорт и финальный аудит.
Поэтому изменение/очистка исходного legacy-ключа после abort не скрывает
необработанное намерение. Без доказанного владельца такая запись остаётся
в карантине. Unknown прежнего снимка продолжает мешать completed, даже если
в текущем источнике его уже нет.

## Статус и отправка

| Поле прогресса | Значение |
|---|---|
| totalRecords / processedRecords / importedRecords | Счётчики текущего точного снимка источника |
| pendingSnapshotRecords | Необработанные записи прежних сохранённых снимков |
| unresolvedRecords | Неразрешённые записи карантина всех снимков этого источника |
| sourceMatches | Финальное чтение совпало с текущим снимком побайтно |
| snapshotAuditComplete | Проверены все сохранённые снимки, новых неучтённых снимков нет |
| sendAllowed | Проверен writer fence, источник и обработка всех снимков; требуется также imported ledger конкретной операции |

Перед чтением источника ранее открытое разрешение отправки закрывается.
Отказ чтения или abort не оставляет старое разрешение действующим.
Финальный audit одной транзакцией проверяет операцию или подтверждение
с версией, ledger, карантин, прогресс и снимки. Одной отметки processed
недостаточно. Unknown/unprocessed даёт partial; отсутствие writer fence
не позволяет completed даже для пустого источника.

В partial разрешена отправка отдельно проверенной известной операции,
если все снимки обработаны, source/fence проверены, а её ledger имеет imported
и совпадающие accountId/opId/canonical. Карантин не отправляется. Разрешение
отправки не означает, что вся миграция завершена или конфликт разрешён.

Claim и finish проверяют ledger и разрешение внутри своей IDB-транзакции.
Ack сохраняет версию/время в ledger и удаляет операцию атомарно. Reload после
ack не импортирует её повторно. Недействительное подтверждение, исчезнувшая
операция или изменённый payload сохраняют ошибку и закрывают отправку этой
записи. Поздний ответ при закрытом разрешении не меняет операцию/версию.

## Проверки и следующая интеграция

Текущие unit-проверки покрывают нормализацию при импорте, карантин, владение,
коллизии, параллельные соединения, abort/quota, сохранённые подтверждения,
потерю ledger/операции перед финальным audit и восстановление старых снимков.
Используется fake IndexedDB; это не проверка настоящих browser bundle.

Runtime-источник владельца и Service Worker fence подключены к StateSync.
Реальный old/new bundle migration smoke прошёл локально 7/7 и полный [CI точного
SHA `00cd005`](https://github.com/Michael-edel/FitFocus/actions/runs/38324638965):
390 browser passed / 9 skipped. JSON backup v3 для долговечных stores реализован
отдельно ([контракт](backup-restore.md), commit
[`2aff6c3`](https://github.com/Michael-edel/FitFocus/commit/2aff6c33d638052d9a084902895df822efb269e5)).
Локальная очистка подтверждённо account-owned строк реализована в коммите
[`b53a55e`](https://github.com/Michael-edel/FitFocus/commit/b53a55eaf272ca8ad6ba8653760f502b0e993b6b)
([контракт](account-data-cleanup.md)); общий исходный ключ и snapshots
не меняются. Они сохраняются для безопасной миграции и могут содержать
незавершённые записи удалённого аккаунта. Уже импортированные записи с
утраченным ledger уходят в `missing-imported-operation`; незавершённые могут
быть импортированы при повторном входе с тем же подтверждённым accountId.
Нужно определить безопасную suppression/purge-политику. Кроме неё остаются
остальные callbacks, полный auth/hydration lifecycle, UI разрешения конфликтов
и общая приёмка P0.8.
[15 управляемых state-ключей](owned-state-writers.md) подключены;
прежний sender текущей сборки удалён. Unit-тесты дополняет проверенный выше
old/new bundle smoke между двумя реальными сборками на одном origin и в одном
browser context.
[Сервер P0.7](state-generations.md) реализован;
[sender шести ключей](state-sender.md) уже использует DELETE-версию и
приостанавливает отправку при необработанном legacy-источнике. Общая
[матрица приёмки](sync-model.md#матрица-приёмки) остаётся открытой.
