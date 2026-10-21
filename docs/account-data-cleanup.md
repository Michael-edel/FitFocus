# Очистка локальных данных аккаунта

Обновлено: 21.10.2026. Код рабочего пакета: `storage/hybrid.ts`,
`storage/indexedUserState.ts`, вызовы из `App.tsx` и
`useDeleteUserProfile.ts`; тесты — `tests/account_state_cleanup.test.ts`,
`tests/local_privacy.test.ts` и `tests/authSession_logout.test.ts`.

Статус: коммит [`b53a55e`](https://github.com/Michael-edel/FitFocus/commit/b53a55eaf272ca8ad6ba8653760f502b0e993b6b)
опубликован в ветке `fix/durable-outbox`. Его точный [CI run](https://github.com/Michael-edel/FitFocus/actions/runs/38334411131)
завершился success. Этот контракт описывает текущую реализацию и не утверждает,
что все копии данных аккаунта полностью стёрты.

Follow-up [`671196e`](https://github.com/Michael-edel/FitFocus/commit/671196e5d80dd85929028a2378484f8781377ca9)
закрывает возврат удалённых локальных данных старым backup и гонку, когда
восстановление успевало записать ключ после первого прохода очистки. После
завершения IDB-транзакции удаление повторно сканирует scoped localStorage ключи;
v2/v3 restore также сверяет tombstone перед восстановлением. Регрессионные тесты
прошли в общем локальном наборе 1477/1477; точный CI новой ревизии ещё не запускался.

Дополнение 13.10.2026: подавление повторного legacy-импорта, sender guard и
фильтрация старого backup реализованы в коммите
[`c7700eb`](https://github.com/Michael-edel/FitFocus/commit/c7700eb0a6800b535c1111f9410803a2051f7a2e).
Локально прошли 1082 unit-теста, typecheck/build и migration smoke 7/7.
Изменение отправлено в `fix/durable-outbox`; точный
[CI run 38340805337](https://github.com/Michael-edel/FitFocus/actions/runs/38340805337)
завершился success на SHA `57e0a93`: 1082 unit-теста / 197 файлов, 390 browser
passed / 9 skipped, audit (0 уязвимостей), guards, typecheck, build и rollback
(23 запроса). Диагностика browser smoke и rollback-артефакт доступны в
[workflow artifacts](https://github.com/Michael-edel/FitFocus/actions/runs/38340805337/artifacts/11787457599)
и [rollback artifact](https://github.com/Michael-edel/FitFocus/actions/runs/38340805337/artifacts/11787357946).

## Область очистки

`clearLocalUserData(userId)` удаляет локальные ключи, однозначно принадлежащие
точному аккаунту. Сравнение выполняется с полным идентификатором; например,
`user-1` не совпадает с `user-10`. Удаляются scoped-ключи приложения, их
метаданные `__ffv` и перечисленные в `storage/hybrid.ts` ключи интерфейса,
планирования, аналитики и достижений для этого аккаунта.

Сбор локальных onboarding, WIS-share и food-streak event logs удалён: они не
читались приложением и записывали чувствительные показатели в общие ключи без
владельца. При старте новая сборка очищает старые global telemetry keys и
milestone markers. Owner-scoped прежние food-streak markers также остаются в
перечне ключей аккаунта и удаляются сразу при удалении владельца, без ожидания
перезапуска; маркеры аккаунтов с похожим ID сохраняются. При удалении любого
аккаунта также удаляются три прежних unscoped event logs, поскольку они могут
содержать чувствительные показатели и уже не используются приложением.

В IndexedDB одна readwrite-транзакция проходит по всем пяти долговечным
stores: `values`, `outbox`, `outbox_migration_items`,
`outbox_migration_unknown` и `outbox_meta`. Она удаляет строки с подтверждённым
`accountId`, принадлежащие аккаунту значения по точному префиксу и связанные
с ними уже разрешённые migration-записи. Неоднозначные и чужие строки
сохраняются. Если явный владелец значения противоречит его ключу, значение
сохраняется и очистка возвращает неполный результат.

Если активная IDB-сессия относится к удаляемому аккаунту, транзакция закрывает
её и увеличивает auth-fence. Поэтому поздний ответ sender не может подтвердить
операцию после очистки. Активная сессия другого аккаунта не затрагивается.

Та же транзакция записывает в `outbox_meta` локальный tombstone удаления. Его
ID — SHA-256 точного account ID; запись не хранит ID в открытом виде или legacy
payload. Она также закрывает старое разрешение legacy-отправки до нового аудита.

Вызовы удаления ждут результат очистки до завершения выхода из аккаунта.
Результат содержит `complete`, числа удалённых localStorage-ключей и отдельные
флаги `localStorageCleared`, `indexedDbCleared`, `legacyEvidenceRetained`.
`complete` становится true только при успешной очистке обоих хранилищ без
сохранённой legacy evidence. Если localStorage или IndexedDB недоступны, либо
IndexedDB не открылась за 5 секунд, пользователь получает предупреждение.
Таймаут помечает результат как неполный; начатая операция IndexedDB при этом
не отменяется и может завершиться позже.

Серверное удаление также требует proof исходной login-сессии и перед локальной
очисткой сверяет response markers. Logout после удаления использует тот же guard;
если вкладка уже перешла к другому входу, она очищает данные удалённого аккаунта,
не выходя из новой сессии. Подробный HTTP-контракт — в
[session guard выхода и удаления](account-lifecycle-session.md).

## Что остаётся сохранённым

`fitfocus.remote-kv-outbox.v1` и глобальные legacy-снимки в `outbox_meta`
сохраняются. Они могут содержать операции разных аккаунтов, а старые снимки
нужны для безопасного повтора и финального аудита миграции. Очистка анализирует
их и возвращает `legacyEvidenceRetained`, если обнаруживает ключ удаляемого
аккаунта, повреждённый формат или запись, для которой нельзя доказать
безопасное разделение. Ошибки чтения также считаются неполной очисткой.
Глобальный ключ без account-префикса нельзя считать чужим только потому, что
его владелец неизвестен: source/snapshot сохраняется, `legacyEvidenceRetained`
становится `true`, а `complete` — `false`. Такой ключ не получает владельца и
не импортируется автоматически. Явно account-scoped ключ другого аккаунта не
блокирует очистку текущего пользователя.

Общий источник и snapshots остаются неизменными. Когда последующая проверка
владельца связывает точный legacy-ключ с удалённым account ID, мигратор
проверяет tombstone внутри транзакции импорта. Он отмечает fingerprint как
обработанный в snapshot, но не создаёт outbox-операцию, migration ledger или
новую quarantine-копию исходной записи. Поэтому незавершённая операция не
возвращается после повторного входа того же аккаунта.

При восстановлении v3 backup старые values, операции, ledger и owner metadata
этого аккаунта также пропускаются, если tombstone есть в текущей базе или самом
backup. Для старых volume values без поля `accountId` владелец определяется по
account-scoped storage key. v2 volume-restore проверяет тот же tombstone в одной
транзакции с записью. Общий source/snapshot сохраняется. Это локальное
подавление, а не физическое стирание: legacy source и snapshots могут по-прежнему
содержать payload. `legacyEvidenceRetained` продолжает сообщать о неполном
локальном стирании. Backup, созданный после удаления, переносит tombstone; старый
файл на другом браузере не знает о более позднем удалении. Tombstone не
синхронизируется с сервером. Если legacy-операция уже находится в очереди, sender
повторно проверяет tombstone при claim и finish: такая операция не отправится, а
поздний HTTP-ack не подтвердит её.

## Проверки и оставшаяся работа

`tests/account_state_cleanup.test.ts` проверяет изоляцию двух аккаунтов,
сохранение глобального legacy source/progress/snapshot и tombstone, поведение
при конфликтующем владельце и отказ позднего sender ack/claim.
`tests/legacy_migration.test.ts` проверяет повторный вход без повторного импорта;
`tests/backup.test.ts` — отказ старой backup-копии восстанавливать account-owned
строки после удаления.

В локальном коммите `4e8adff`
общая проверка legacy-записей стала консервативно отмечать глобальные и
неразбираемые ключи как retained evidence. Это исправляет ложный `complete: true`
при сохранённом payload и оставляет scoped-записи соседних аккаунтов вне отчёта
об удаляемом аккаунте. Регрессии проверяют оба случая на localStorage и глобальные
snapshot/quarantine в IndexedDB.

Полный локальный unit suite — **1426/1426** (216 файлов), общий, `domain-strict`
и `storage-strict` typecheck, privacy/API-invariant guards, production build и
`git diff --check` прошли. Точный CI новой ревизии ожидает публикации; run #1673
проверяет предыдущий опубликованный HEAD.

Локально и в точном CI `b53a55e` прошли 1079 unit-тестов / 197 файлов,
общий, `domain-strict` и `storage-strict` typecheck, production build; CI также
прошёл audit, guards и 23 HTTP/D1-запроса. E2E: 390 browser passed / 9 skipped,
20,1 минуты. [Workflow](https://github.com/Michael-edel/FitFocus/actions/runs/38334411131);
[rollback artifact](https://github.com/Michael-edel/FitFocus/actions/runs/38334411131/artifacts/11784907304).
Staging и выпуск не подтверждены.

Остаётся отдельный план физически удалить payload из общего legacy-источника и
сохранённых снимков, если будет определена политика сохранения evidence; также
нужно завершить UI разрешения конфликтов и общую lifecycle-приёмку P0.8/P0.9.
Общий статус — в [TASKS](../TASKS.md) и
[статусе проекта](project-status.md).
