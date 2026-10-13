# Текущее состояние FitFocus

Сверено: 13.10.2026. Это краткая точка входа: функции — в
[PRODUCT](../PRODUCT.md), порядок и критерии готовности — в
[TASKS](../TASKS.md), результаты отдельных проверок — в
[журнале стабилизации](stabilization-progress.md).

## Текущая проверка — P0.8 IndexedDB outbox

Последняя полная CI-проверка кода в `fix/durable-outbox` — коммит
[`9bc98ee`](https://github.com/Michael-edel/FitFocus/commit/9bc98ee43e14559fa9fd1578fdf939ba9292acbc);
P0.8 transaction follow-up в [`2539c8c`](https://github.com/Michael-edel/FitFocus/commit/2539c8c8a5f30776c486b0b274903dc70d191dbc)
исправил последовательные чтения из одной
IndexedDB-транзакции: независимые запросы ставятся в очередь до первого
`await`, а parent/head операции выбираются из одного индексного снимка.
E2E-диагностика сохраняет вложенную причину `Error.cause`.

Полный [CI run 38398403703](https://github.com/Michael-edel/FitFocus/actions/runs/38398403703)
завершился success: 1115 unit-тестов / 198 файлов, 466 E2E passed / 9 skipped,
audit без уязвимостей, schema/privacy/auth/API guards, три typecheck, build и
HTTP/D1 rollback-проверка на 23 запросах прошли. Два затронутых Firefox-сценария
прошли 30/30 повторов без retries, весь `weekly-menu-durability.spec.ts` — 8/8.

В полном CI один WebKit PWA update тест был flaky: кнопка обновления отсутствовала
в первой попытке, retry прошёл. Локальный повтор этого сценария прошёл 3/3 при
`retries=0`; причина не установлена и пока не воспроизведена. Если сбой повторится,
следующий шаг — сохранить подробный SW/registration snapshot в момент отсутствия
уведомления. P0.8 остаётся открытым до полной lifecycle-приёмки. Для P0.5 тесты
позднего ответа coach/plateau и смены аккаунта добавлены в `9bc98ee` и локально
прошли 6/6 на desktop Chromium, Firefox и WebKit. Точный [CI run 38410002498](https://github.com/Michael-edel/FitFocus/actions/runs/38410002498)
завершился success. Коммит [`f9c8425`](https://github.com/Michael-edel/FitFocus/commit/f9c8425272804b0bf9fc5963bcfb015e2926e469)
добавил семейный delayed-invite account-switch E2E; typecheck и 3/3 desktop
Chromium/Firefox/WebKit прошли локально, его точный CI ещё ожидается.
PR #93 остаётся draft и не слит в `main`.

## Предыдущий компонент — P0.5 client AI callbacks

Coach, личный план и объяснение плато используют свежий session proof, scoped
`/api/ai` transport и attempt/lifecycle guards. Coach card, usage и generated plan
используют guarded commits; stale retry и поздний результат не должны менять
данные. Hydration AI-task тоже не делает unscoped POST. Локальные unit/typecheck
и browser проверки прошли; точные ранние результаты и ошибки CI сохранены в
[журнале стабилизации](stabilization-progress.md). Два новых сценария позднего
ответа локально прошли 6/6 на трёх desktop engines; точный CI `9bc98ee` завершился
success в [run 38410002498](https://github.com/Michael-edel/FitFocus/actions/runs/38410002498).
Полная приёмка P0.5 открыта из-за остальных family callbacks и writers; см.
[контракт](ai-callback-sessions.md) и [план](../TASKS.md).

Последующий документационный SHA `75159f5` тоже прошёл CI
([run 38388730336](https://github.com/Michael-edel/FitFocus/actions/runs/38388730336)),
но с одним flaky в Firefox: фоновое чтение недельного отчёта завершилось
`STATE_STORAGE_TRANSACTION` во время независимой правки профиля. Повтор локально
воспроизвёл сбой 2/20 раз; причина — три независимых чтения в `snapshot()`,
ожидавшиеся по очереди. Последующий фикс ставит независимые чтения одновременно.
После исправления целевой Firefox-сценарий прошёл 20/20, полный spec — 8/8,
unit — 1115/1115, общий и оба strict typecheck, build. Следующий CI на `4c3ab5a`
выявил ещё одну последовательную операцию чтения в write-транзакции; её отдельное
исправление и итоговая CI-проверка приведены ниже.

CI для исправления [`4c3ab5a`](https://github.com/Michael-edel/FitFocus/commit/4c3ab5a2c9b1975f1f05c311f7cea7465e435259)
завершился success ([run 38393913597](https://github.com/Michael-edel/FitFocus/actions/runs/38393913597)),
но один Firefox flaky возник при logout во время записи weekly report. Stack
указывал на последовательные чтения в `writeOutboxInTransaction`. Follow-up
последующий фикс в [`2539c8c`](https://github.com/Michael-edel/FitFocus/commit/2539c8c8a5f30776c486b0b274903dc70d191dbc)
ставит owner/value/metadata/operations чтения в очередь сразу, parent/head
выбираются из одного результата index query; E2E сохраняет вложенную причину
ошибки. После правки два затронутых сценария прошли 30/30 повторов, полный
Firefox spec — 8/8, unit — 1115/1115, все typecheck и build. [Полный CI](https://github.com/Michael-edel/FitFocus/actions/runs/38398403703)
для `2539c8c` завершился success; его WebKit flaky описан выше.

## Предыдущий компонент — недельный AI-отчёт

Клиентская генерация недельного отчёта и её retry теперь используют свежую
account/session-привязку, проверку lifetime и guarded запись в IndexedDB outbox.
Поздний ответ после logout не применяется к UI и не создаёт durable-операцию.
Проверки: 24 профильных unit-теста, полный набор 1095/197 файлов, общий и оба
strict typecheck, admin guards; новый browser spec — 14/14 на семи проектах,
без retries, production build прошёл. GitHub CI для `0b7062d` завершился ошибкой E2E в
[run 38357547143](https://github.com/Michael-edel/FitFocus/actions/runs/38357547143),
предыдущие CI-шаги прошли, но Playwright отметил 343 из 476 сценариев как failed.
Причина — E2E /api/me mocks без AI-capabilities и ожидаемые auth/session отмены,
записанные как console errors. Локальный follow-up обновил fixtures и
классификацию: полный unit-набор (1095/197), общий typecheck и 49/49 связанных Chromium E2E
прошли; полный прогон и CI нового SHA ещё ожидаются. Это не
закрывает P0.5: прочие AI retry, семейные callbacks и staging остаются открыты.
Требования к оставшимся AI-действиям: [контракт](ai-callback-sessions.md).
Подробности: [контракт недельного AI-отчёта](weekly-ai-report-session.md).

## Account-scoped cleanup — опубликованный компонент `b53a55e`

Коммит [`b53a55e`](https://github.com/Michael-edel/FitFocus/commit/b53a55eaf272ca8ad6ba8653760f502b0e993b6b)
опубликован в `fix/durable-outbox`. Локальная очистка удаляет точные
account-owned localStorage-ключи и записи всех пяти долговечных IDB stores одной
транзакцией. При удалении активной сессии увеличивается auth-fence; чужие и
неоднозначные данные сохраняются. Общий legacy-источник и snapshots не
фильтруются и могут содержать данные аккаунта, поэтому приложение предупреждает
о неполной очистке, а полное стирание пока не подтверждено.

Точный [CI run 38334411131](https://github.com/Michael-edel/FitFocus/actions/runs/38334411131)
завершился success: 1079 unit / 197 файлов, 390 browser passed / 9 skipped за
20,1 минуты, audit/guards, три typecheck, build и 23 HTTP/D1-запроса прошли.
Rollback-артефакт [сохранён в CI](https://github.com/Michael-edel/FitFocus/actions/runs/38334411131/artifacts/11784907304).
Staging и выпуск не выполнялись. Полный контракт и остаточный риск: [очистка
локальных данных](account-data-cleanup.md).

## P0.8 — подавление legacy после удаления: `c7700eb`, CI пройден

Коммит [`c7700eb`](https://github.com/Michael-edel/FitFocus/commit/c7700eb0a6800b535c1111f9410803a2051f7a2e)
отправлен в `fix/durable-outbox`. Документация результата зафиксирована в
[`57e0a93`](https://github.com/Michael-edel/FitFocus/commit/57e0a93f8171393e5d0804e8dc395ff84a25ae94).
Реализация дополняет cleanup SHA-256 tombstone в `outbox_meta`. Повторная
миграция с доказанным владельцем помечает старый fingerprint обработанным и не
создаёт новую операцию; sender блокирует claim/finish старой legacy operation.
Восстановление старого v3 backup в браузере с tombstone пропускает account-owned
строки. Общие legacy source/snapshots остаются для
аудита, поэтому физическое локальное стирание данных этим не подтверждается.
Локально прошли 1082 unit-теста / 197 файлов, общий/domain-strict/storage-strict
typecheck, production build и профильные тесты миграции, cleanup и backup (75).
Legacy migration smoke прошёл 7/7 browser/device projects без retries. Точный
[CI run 38340805337](https://github.com/Michael-edel/FitFocus/actions/runs/38340805337)
завершился success на SHA `57e0a93`: 1082 unit-теста / 197 файлов, 390 browser
passed / 9 skipped за 21,1 минуты, audit (0 уязвимостей), schema/privacy guards,
три typecheck, build и rollback-проверка (23 HTTP/D1-запроса). Browser diagnostics
и rollback сохранены в [артефактах workflow](https://github.com/Michael-edel/FitFocus/actions/runs/38340805337/artifacts/11787457599)
и [проверенном rollback](https://github.com/Michael-edel/FitFocus/actions/runs/38340805337/artifacts/11787357946).
[Контракт и ограничения](account-data-cleanup.md).

## Рабочее дерево — восстановление очереди, `80dc1cf`

В `fix/durable-outbox` добавлены пользовательские действия для обычных
outbox-записей: повтор failed-операции, сохранение последнего локального
намерения и принятие проверенного серверного снимка. Действия проверяют свежую
сессию и точные operation IDs внутри IDB-транзакции. Legacy-записи сохраняются,
но ручное изменение для них недоступно. Некорректный 409 переводит sender в
protocol-паузу и не показывается как разрешаемый серверный конфликт.

Локальная проверка коммита [`80dc1cf`](https://github.com/Michael-edel/FitFocus/commit/80dc1cfa20249ce099f94f3d406455cc547c0819):
1092 unit-теста / 197 файлов; общий, domain-strict и storage-strict typecheck,
admin guards и production build прошли. `storage-durability.spec.ts` прошёл
42/42 на семи browser/PWA-проектах; новый сценарий разрешения конфликта — 7/7.
GitHub CI этого коммита ещё не подтверждён. Staging, merge в `main` и выпуск
не выполнялись. [Поведение и ограничения](runtime-state.md#повтор-и-разрешение-конфликтов--рабочее-дерево-13102026).

## Recovery UI — browser acceptance на `4e2ccb7`

В [`4e2ccb7`](https://github.com/Michael-edel/FitFocus/commit/4e2ccb769d9e325abdfd3abf105f805f86520ac5)
добавлена browser acceptance recovery actions для трёх ресурсов: state/settings,
profile и familyMenu. Проверены failed → retry → ack, conflict → keep latest local
на проверенной серверной версии, conflict → accept server после подтверждения и
отмена подтверждения с сохранением локального конфликта. В familyMenu проверены
обе ветки с version 8 и исходным локальным/удалённым меню.

Локально: исходный прогон трёх изменённых spec-файлов — 189/189; после добавления
multi-edit сценария `storage-durability.spec.ts` прошёл 70/70 на семи
browser/PWA-проектах. Совокупно подтверждены 196 проверок без retries. [CI run
38352095311](https://github.com/Michael-edel/FitFocus/actions/runs/38352095311)
на точном SHA `4e2ccb7` завершился success: 1092 unit / 197 файлов, 446 browser
passed / 9 skipped за 23,4 минуты, audit без уязвимостей, три typecheck, build и
23 rollback-запроса. [Rollback-артефакт](https://github.com/Michael-edel/FitFocus/actions/runs/38352095311/artifacts/11791744552)
сохранён. Последующий commit [`fe0b528`](https://github.com/Michael-edel/FitFocus/commit/fe0b5287b533a4a725d83b5ac365ba37a72588e6)
добавил multi-edit сценарий; его точный [CI run 38354517668](https://github.com/Michael-edel/FitFocus/actions/runs/38354517668)
завершился success: 1092 unit / 197 файлов, 453 browser passed / 9 skipped,
audit без уязвимостей, три typecheck, build и rollback-проверка прошли.
Выпуск и merge в `main` не выполнялись.

Полный CI на коде исправления sender завершился success в
[run 38316655963](https://github.com/Michael-edel/FitFocus/actions/runs/38316655963),
job 115035254691, на опубликованной ревизии `ca8ecb1`. Прошли 1068 unit / 196
файлов и 383 browser-теста; 9 browser-сценариев пропущены, E2E занял 13,9 мин.
Проверенный код включает commit
`8fae1008d2a9b220cc0052499271b07441ac29ac`: независимые чтения IndexedDB sender
ставятся до `await`, устраняя воспроизведённый Firefox `TransactionInactiveError`.
Локально дополнительно прошли 193 профильных unit-теста, storage-strict, общий
typecheck и 56 weekly-menu browser-сценариев в семи проектах без retries;
Firefox повторён 12/12 с тестовой диагностикой. Детали и открытая миграционная
приёмка — в [журнале](stabilization-progress.md).

## Рабочее дерево — P0.8 runtime

После `47da77c` к runtime подключён импорт legacy-очереди: владелец берётся
из свежего `/api/me`, all-client Service Worker fence удерживает отправку до
обновления старых вкладок, а read guard перепроверяется после миграции.
Настоящая pending-запись, созданная действием старого bundle, теперь проходит
old/new migration smoke на одном origin. Локально прошли все семь Playwright-
проектов (`workers=1/retries=0`); полный CI точного smoke SHA `00cd005`
завершился success в [run 38324638965](https://github.com/Michael-edel/FitFocus/actions/runs/38324638965).
JSON backup v3 со снимком всех пяти долговечных IDB stores и атомарным restore
опубликован в [`2aff6c3`](https://github.com/Michael-edel/FitFocus/commit/2aff6c33d638052d9a084902895df822efb269e5).
Локально прошли 1073 unit / 196 файлов, общий/domain-strict/storage-strict
typecheck, production build и 7/7 backup-тестов. [CI PR-head `2aff6c3`](https://github.com/Michael-edel/FitFocus/actions/runs/38327323270)
завершился success: 1073 unit / 196 файлов, 390 browser passed / 9 skips
(15,7 мин), audit, guards, schema/privacy, все три typecheck и build прошли;
HTTP/D1 rollback smoke прошёл 23 запроса, artifact сохранён. Предыдущий
полный CI `c724bce` (run 38318876304) также прошёл до smoke.

Первый полный CI runtime-изменений на `d28b3e43dda13c29c99a20a5aa70e3c153f79fa9`
[завершился failure](https://github.com/Michael-edel/FitFocus/actions/runs/38295991884).
Unit, типизация, schema/privacy/auth/API checks и build прошли; E2E завершился
с 360 passed / 22 failed / 9 skipped и одним flaky за 26,5 мин. Локально
исправлены ожидания `pause: protocol`, Firefox-чтение IDB и точная классификация
предупреждений/отмены `/api/me` в PWA-сценариях. После этих правок целевые
прогоны прошли: owned-state + weekly menu — 77/77 на семи проектах, PWA update —
7/7, PWA rollback — 14/14, все без retries. Следующий коммит
`a048289287b90e752b1db47bdab3f0f502f5a5c9` прошёл
[полный CI](https://github.com/Michael-edel/FitFocus/actions/runs/38305940088):
1068 unit / 196 файлов; 382 browser passed / 9 skips, 17,6 мин. В summary
отмечен один flaky: WebKit rollback сначала оставил операцию `pending` вместо
`conflicted`, а retry прошёл. Исправляется сама E2E-фикстура: теперь для этого
сценария backend отвечает 409 на первую запись, без перехода через 503/backoff.
Этот вариант локально прошёл 3/3 на desktop WebKit; CI ещё не запускался.
Эти прогоны завершились до old/new migration smoke и его не включают.

Предыдущий CI —
`7109dcfe13d1c8d065c8de11f842d34ffc894fa6`:
[success](https://github.com/Michael-edel/FitFocus/actions/runs/38274180638),
1053 unit / 194 файла; browser — 383 passed / 9 skips, 20,1 мин.
В итоговых логах нет flaky, ECONNREFUSED и preview proxy errors.
Причины прежнего WebKit access-control сбоя `5b90249` и Firefox timeout
`98d4910` не установлены. Успешный MD-прогон не объявляется их исправлением.
Для `076f4ac` HTTP/D1 прошёл 23 запроса: merge-кандидат `8a2a9e9` → архив
`98d4910`; browser diagnostics и rollback `.tar` загружены;
[метаданные](release-artifacts.md#ci-preview-origin-076f4ac).
Скачанный архив прежнего CI
`5b90249` проверен по GitHub digest и inventory 82 файлов; артефакты разных
запусков не отождествляются. [Идентификаторы и границы](release-artifacts.md#артефакт-из-ci).
Mock-фикстура опубликована в `085fcc1` и в предыдущий CI `3bf595f` не входит.
Локально семейные наборы прошли 98/98 без retries/proxy-ошибок;
её полный CI `aefc463` [завершился success](https://github.com/Michael-edel/FitFocus/actions/runs/38256100623):
1053 unit / 194 файлов, 362 browser passed / 9 skips, без flaky/proxy-ошибок.
Затем mock-fixture проверена повторно в CI текущего preview SHA `076f4ac`.
[Контракт](mock-api-lifecycle.md).
Подготовительный сервер `dde4c71` и переход
0019 → 0020 → проекция проверены локально;
[инструкция выпуска](profile-cas-rollout.md). Staging и выпуск ещё открыты.

В опубликованный `47da77c` вошёл WebKit rollback-сценарий с задержанным native
PUT. Локально он прошёл 3/3 (`workers=1/retries=0`), полный CI тоже завершился
success. Во время обновления SW операция сохранила `opId` и payload; pageerror
не возник. Историческая ошибка из `5b90249` не воспроизведена, её первопричина
остаётся неизвестной.
[Протокол проверки](pwa-updates.md#повторная-проверка-webkit-pageerror-при-pwa-update--12102026).

## Опубликованный компонент — origin preview

Коммит `076f4aca8e9855bb328a3fe695cb0bcd085ddd6f` удаляет клиентский переход
с branch/commit `*.pages.dev` на production.
Регрессия сначала воспроизвела переход, затем прошла: итоговая локальная
матрица — 28/28, семь конфигураций, workers=1/retries=0; root typecheck
и 15 admin guards прошли. Первая матрица 25/28 выявила ошибку Host в новой
Firefox-фикстуре; после её исправления итоговый прогон прошёл полностью.
[Поведение, доказательства и ограничения](staging-origin.md).

[CI этого компонента](https://github.com/Michael-edel/FitFocus/actions/runs/38261672999)
завершился success. Локальные результаты и CI не подтверждают deployment,
его D1 binding, APP_URL, OAuth и edge-правила.
Приёмка staging и выпуск остаются открытыми.

Отдельная локальная диагностика Firefox IndexedDB не закрыта: на базе `076f4ac`
в первом `retries=0` прогоне из трёх таймаут воспроизвёлся; далее прошло
17 запусков с IDB open/versionchange logging и ещё один со стадийной диагностикой,
все без retry. На рабочей ветке `47da77c` дополнительно прошли 3+8 запусков
с IDB-логами и 3+8 без них; для последнего сравнения временно восстановлены
исторические тест/helper из `076f4ac`, затем возвращены файлы HEAD. Тест теперь прикладывает события
IDB open/blocked/upgrade, connection lifecycle и этапы чтения при сбое.
Все новые повторы прошли; поскольку сбой снова не воспроизвёлся, первопричина неизвестна;
[условия и trace](pwa-updates.md#повторное-исследование-firefox-indexeddb-timeout--12102026).

## Что это за проект

FitFocus — PWA для питания, привычек и прогресса. Основной цикл:
профиль и цель → персональный план → дневник и ежедневные действия →
обзор прогресса → корректировка плана. Есть рецепты, семейное меню,
список покупок, AI-анализ и рекомендации. Работоспособность внешних
интеграций требует отдельной проверки окружения.

Текущий приоритет — сохранность данных и воспроизводимый выпуск.
Крупные продуктовые улучшения идут после приёмки P0.

## Проверенный компонент — сессии семьи

Код `9c44c2118749275cbb8ecaa11c520c43e4220000` привязывает `useFamilyCloud`
к исходному login proof, проверяет каждый запрос и отбрасывает поздние ответы.
Защищены family handlers, загрузка семьи/покупок, приглашение, join, смена цели,
серверная генерация и отметки. Неверные family/week и повреждённый ответ
не заменяют видимый снимок; отказ отметки восстанавливает её прежнее значение.

1009 unit / 189 файлов, три typecheck, guards/schema/privacy и audit (0) прошли.
Локальный workerd/D1: 23 HTTP-запроса прошли. Первая полная browser matrix:
272 passed / 6 failed / 9 skips (workers=3, retries=0); все 42 семейных
сценария прошли. Диагностика profile/storage/weekly-menu на обоих iPhone-проектах:
12 passed, workers=1/retries=0, без изменения кода. Затем полный CI `3baac01`
прошёл: 278 browser passed / 9 skips, workers=2, без flaky в итоговом summary.
[Контракт и приёмка](family-session.md). На этой ревизии AI-путь `useFamilyMenu`
и семейная постоянная доставка ещё отсутствовали; они реализованы следующим
компонентом `405238b`, описанным ниже. Реальный staging остаётся открытым.

Подготовительный [CI `c39904c`](https://github.com/Michael-edel/FitFocus/actions/runs/38196258543)
подтверждён: 952 unit / 186 файлов, 229 browser passed / 9 skips.
Это проверка промежуточной версии, не staging-выпуск.

## Текущая работа — семейное меню

В `405238b` реализованы family/week CAS, единый серверный снимок меню,
порций и покупок, а также resource `familyMenu` в существующей IDB-outbox.
AI-клиент `useFamilyMenu` подключён к этому сохранению; серверная генерация
возвращает preview для той же очереди. Ошибка хранения сохраняет прежнее меню,
409 сохраняет локальную правку и remote snapshot, поздний AI не создаёт запись.
Миграция 0021 и IDB v3 ещё не приняты к выпуску.

Прошли 1039 unit / 191 файл, три typecheck, обязательные guards/schema/privacy,
audit (0), 16 browser-сценариев в Chromium/iPhone Safari и 33 HTTP локального
workerd/D1 с двумя синтетическими аккаунтами. [CI точного SHA завершился успешно](https://github.com/Michael-edel/FitFocus/actions/runs/38208076392):
1039 unit и полная матрица 334 browser passed / 9 skips, семь конфигураций,
два worker, без flaky в итоговом summary. Полный локальный прогон: 332 passed,
2 failed, 9 skips (30,8 мин, workers=2, retries=0). Диагностический прогон двух
сценариев на desktop WebKit/iPhone PWA: 4/4, workers=1, retries=0,
без изменения кода и таймаутов; он не заменяет полный локальный результат.
Нагрузка хоста — предположение. Реальные v2/v3 bundles на одном origin
прошли 2/2 локальных сценария с mock API и отключённым Service Worker.
[Контракт](family-menu-state.md),
[решение](adr/ADR-008-family-menu-generation.md).

CI `405238b` проверяет опубликованную реализацию семейного меню.
Критерии завершения остаются открытыми в [TASKS](../TASKS.md):
нужны PWA/Service Worker и реальный lifecycle, совместимый откат
и staging. Локальный bundle smoke не проверяет прежний Map writer.
Merge и deploy
этого этапа не выполнялись.

## Рабочее дерево — обновление PWA

Реализация опубликована в `8d32f12279039e5d549c6e3534f741b601084812`
после `60c5421`. Компонент использует явное предложение обновления,
обработчик `SKIP_WAITING` и сценарий с настоящими старым/новым Service Worker
на одном origin. [CI этого SHA](https://github.com/Michael-edel/FitFocus/actions/runs/38224847501)
завершился success: 1043 unit / 192 файла, 341 browser passed / 9 skips,
16,6 мин browser; проверены статус и логи job 114730233874. [Контракт](pwa-updates.md).

Проверка формы после reload исправлена по фактическому поведению навигации:
выбор экрана не меняет исходный `#family`, поэтому форма открывается явно.
Сохранность профиля проверяется в IDB до/после активации; семейное намерение
сохраняет свой `opId`. Для WebKit API-фикстура перенесена с `page.route`
на native HTTP. Исправлены прозрачный фон уведомления и поздняя ошибка
попытки обновления. Локально прошли 63 связанных browser-сценария на семи
конфигурациях, workers=1/retries=0; семь из них используют реальные SW
и native HTTP. Четыре unit-проверки повторов прошли. Усиленный сценарий
с потерей сообщения активации прошёл 7/7 на тех же конфигурациях.
Полный unit-прогон: 1043 теста / 192 файла; три typecheck, guards/schema/privacy
и audit (0) прошли. Итог CI опубликованного кандидата подтверждён;
эмуляция standalone не подтверждает установку на устройстве.

Диагностика семейных WebKit-тестов отдельно воспроизвела поздние mock
API-запросы при закрытии контекста. Два прогона по четыре сценария прошли
функциональные проверки, но в каждом осталось три preview `ECONNREFUSED`.
Явное закрытие страницы не устранило ошибку. Временные диагностические hooks
удалены. Следующая рабочая фикстура с переходом на `about:blank` прошла
четыре диагностических сценария без proxy-ошибок; первый расширенный прогон дал
97 passed / 1 failed. После уточнения предусловия экрана локально прошли 98/98,
workers=2/retries=0, без proxy-ошибок. Полный CI компонента подтверждён на `aefc463`;
эта тестовая поправка не считается
продуктовым исправлением PWA. [Текущая проверка](mock-api-lifecycle.md),
[прежняя диагностика](stabilization-progress.md#сверка-md-и-диагностики-teardown--12102026).

## Опубликованное исправление — неиспользуемый Google SDK

В `98d4910` удалена безусловная загрузка `accounts.google.com/gsi/client`
из HTML. Клиент уже использует серверный OAuth redirect; вызовов SDK нет.
Локально прошли 7/7 auth-shell сценариев: настоящий SW/native HTTP,
отсутствие Google-запросов при старте, нажатие входа, invite/redirect и
pending-oauth. Forward update прошёл 7/7: обе вкладки загружают JS кандидата,
сохраняют профиль, opId/value и IDB v3. Typecheck и шесть OAuth unit прошли.
Только внешний SDK исторического v2-клиента в forward-тесте получает
синтетический ответ до первого SW control. Текущий клиент SDK не запрашивает.
Реальный OAuth, устройства и staging не проверены. CI нового SHA завершился
success с одним flaky Firefox PWA-update; исторические числа сохранены в журнале.
[Контракт PWA](pwa-updates.md), [журнал](stabilization-progress.md).

## Артефакт отката — приёмка

[Компонент упаковки и проверки](release-artifacts.md) добавляет клиентские
и серверные инструменты приёмки. Они собирают
клиент/SW и полный Pages Worker, сохраняют миграции, исходники и SHA-256
inventory. Локально прошли 1053 unit / 194 файла, три typecheck,
guards/schema/privacy и audit (0). Это результаты рабочего дерева;
они не относятся к опубликованному CI `98d4910`.

История приёмки: первая установка `8d32f12` выявила отсутствие reload после
явной активации SW. Поправка `574de76` устранила этот дефект. С базой
`574de76` прошли 6/6 desktop install/pending и 3/3 pending с бюджетом,
учитывающим persisted Retry-After/lease. Production claim/backoff не менялись.
HTTP-проверка `.tar` `d3a9496` → `574de76` прошла 23 запроса на общей локальной
D1: canonical readers, CAS, права записи, пустые поколения и legacy retention.
Это разные SHA с одинаковыми server functions/migrations.

Два полных browser-прогона `574de76` дали **26 passed / 2 failed каждый**.
Первый выявил Firefox trace/layout warning и Android DNS-ошибки Google SDK.
Последовательность click/navigation/load исправлена. Временная подмена SDK
дала 4/4 Firefox/Android, но второй полный прогон упал на двух iPhone-сценариях:
запросы SDK после SW control обходили page.route. Подмена удалена;
неиспользуемый SDK удалён из самого приложения в `98d4910`.

Архив `574de76` сохранён для диагностики и **не принят как итоговая база**.
В новом компоненте pins preparer/checker/workflow перенесены на `98d4910`.
Архив собран: 82 файла, 12 529 664 байта; Node v24.19.0/Wrangler 4.149.0,
IDB v3/D1 0021. Локальная матрица нового архива прошла **28/28**, 13,2 мин,
workers=1/retries=0: fresh install, pending/conflicted rollback и forward update
на семи конфигурациях. Проверяется отсутствие Google-запросов без подмены SDK,
обе вкладки, actual JS, opId/payload, профиль, stores/auth-fence и Retry-After.
Typecheck и шесть проверок целостности архива прошли. Скриншоты desktop/Android
просмотрены: уведомление читается, кнопки доступны, overlay отсутствует.
HTTP/D1-переход `bd763ec` → неизменённый worker из `.tar` `98d4910`
прошёл 23 запроса на одном origin/D1. Проверены canonical profile/family,
проекции покупок, CAS после отката, session/owner, старые writers=409,
пустые поколения и legacy retention. Ревизии различаются; функции/миграции
одинаковы. CI `5b90249` выполнил 23 HTTP/D1-запроса и сохранил проверенный
`.tar`; скачанный архив проверен по digest и inventory. Flaky WebKit fresh
install и staging остаются открытыми. Откат не принят для выпуска; main/deploy открыты.

## Предыдущий проверенный компонент — сессии и форма

Код [`724ecf1`](https://github.com/Michael-edel/FitFocus/commit/724ecf1aad05461d86644789f773ffca73f6efad)
содержит компонент достижений и последующие поправки:

- [`a407373`](https://github.com/Michael-edel/FitFocus/commit/a4073731ea2d30c107b49ff8cf7170dbffc8ed83): таймер завершает ожидающие вызовы, если login lifetime истёк до React cleanup.
- [`4528e2b`](https://github.com/Michael-edel/FitFocus/commit/4528e2bba08c7868ad2b24be2285c9547140b865): автоматический proof, начатый до auth-паузы, не очищает её при позднем ответе.
- `724ecf1`: уведомление не сдвигает форму до или во время нажатия; высота области сохраняется и без сообщения.

На этом коде прошли 950 unit / 186 файлов, три typecheck,
guards/schema/privacy и audit (0 известных уязвимостей).
Production build и полная браузерная матрица `724ecf1` прошли:
229 passed / 9 skips, 7 проектов, workers=3, retries=0.
[CI документирующего `42ee434`](https://github.com/Michael-edel/FitFocus/actions/runs/38189490979)
завершился success: 950 unit / 186 файлов, 229 browser passed / 9 skips,
workers=2; в итоговом summary нет flaky. Этот результат не относится
к последующим незакоммиченным изменениям.
Проверка положения кнопки до pointerdown прошла во всех семи проектах.
[Контракт профиля](profile-persistence.md#дополнительная-проверка-до-pointerdown-12102026),
[контракт достижений](achievement-session.md).

## Компонент — атомарная проекция личных покупок

Код [`4736ff5`](https://github.com/Michael-edel/FitFocus/commit/4736ff51b06f0062a6cb45a98169f4a4d0c39895)
сохраняет личные покупки в том же SQL statement, что принятый profile CAS.
Существующая IDB profile-outbox доставляет одно намерение; отдельного личного
items POST больше нет. Старый POST отклоняется, а пустая генерация не
восстанавливает legacy-покупки. Семейный путь остаётся отдельной открытой задачей.

Локально прошли 966 unit / 187 файлов, три typecheck, guards/schema/privacy,
audit (0 известных уязвимостей), 16 HTTP-проверок настоящего локального
Worker/D1 и 8 menu E2E в Chromium. Миграция сохраняет старые строки;
clean refresh работает без новой write-capability, pending-операция не теряется.
Полная production matrix `4736ff5` прошла: 236 passed / 9 skips,
7 проектов, workers=3, retries=0, 16.2m. Серверная валидация на
[`830caf4`](https://github.com/Michael-edel/FitFocus/commit/830caf43895fe00bd9eddf2b58cf254afbe847c8)
возвращает 422 до persistence вместо общей ошибки для некорректного меню.
После неё прошли 976 unit / 187 файлов, обязательные проверки и повторный
16-request Worker/D1 smoke. Клиент и E2E не изменились.
[CI опубликованного `2d1f480`](https://github.com/Michael-edel/FitFocus/actions/runs/38194485398)
прошёл: 976 unit и 236 browser passed / 9 skips; в итоговом summary нет flaky.

Подтверждённый CI предыдущего документационного `14ca638`:
[success](https://github.com/Michael-edel/FitFocus/actions/runs/38191713675),
950 unit / 186 файлов, 229 browser passed / 9 skips, без flaky в итоговом summary.
Он не подтверждает код нового компонента. Для выпуска 0020 требуется
подготовительный сервер с RETURNING до triggers, затем сервер проекции
и capability smoke до клиента. Подготовительный код `dde4c71` прошёл 952 unit,
обязательные проверки и build. На одной локальной БД переход и негативный
откат reader прошли 30 HTTP-запросов. Staging и совместимый откат ещё открыты;
[проверенные этапы](profile-cas-rollout.md).
[Контракт и следующий шаг](personal-menu-projection.md), [матрица P0](verification-matrix.md).

## Компонент — сессия и очередь достижений

Код [`57da2cf`](https://github.com/Michael-edel/FitFocus/commit/57da2cf3d8bcb682242db87994126d1c816158d4)
добавляет независимую capability, server guard до feature/application effects,
исходный login proof из hydration и проверку каждой HTTP-попытки.
Queue/context/resolvers принадлежат своему входу и page lifetime; logout и
pagehide отменяют старые запросы, pageshow создаёт новый клиент с прежней
login-привязкой. Другой вход того же аккаунта не принимается за исходный.

Локально прошли 948 unit / 186 файлов, три typecheck, guards/schema/privacy,
audit (0 известных уязвимостей). Полная матрица `57da2cf` завершилась:
219 passed / 3 failed / 9 skips, workers=3, retries=0. Все 21 новых achievement
E2E прошли; падения прежних profile/logout-сценариев исследуются.
Предыдущий кандидат прошёл 21 новый E2E во всех семи проектах после исправления
предупреждений Recharts: высота графиков соответствует существующим 220 px.
[Контракт, проверки и ограничения](achievement-session.md). Throttle-очередь
остаётся временной, счётчики best effort; реальный BFCache/staging не доказаны.

## Предыдущее изменение — автоматическая синхронизация профиля

Код [`f3930ec`](https://github.com/Michael-edel/FitFocus/commit/f3930ec64f7fa74f3aad352246aa18b92d2542b7): автоматический profile flush отправляет существующую очередь
без ручного повторного `verify`. Auth-пауза сохраняется; ручная синхронизация
по-прежнему получает свежий proof. Старое поколение не подтверждает новый вход.
Источник `/api/me` после `beforeunload` установлен по диагностическим событиям;
общий фильтр ошибок не добавлен, background/BFCache не ограничены.

Локально прошли 905 unit / 183 файла, три typecheck, guards/schema/privacy,
audit (0 известных уязвимостей), build и полная браузерная матрица:
201 passed / 9 skips, workers=3, retries=0. E2E auth-паузы теперь проверяет
два фактических PUT/401 по разные стороны reload и тот же opId.
[CI документирующего `bf01d87`](https://github.com/Michael-edel/FitFocus/actions/runs/38184851075)
завершился success: 905 unit, 201 browser passed / 9 skips, без flaky.
Это результат profile-компонента; новый код достижений проверяется отдельно.

Предыдущий `cd2e923` CI завершился success: 900 unit,
200 browser passed / 1 flaky / 9 skips. WebKit registration reload прошёл
только на retry с native `/api/me`; это не было исправлением.
[Журнал диагностики и проверок](stabilization-progress.md).

## Базовая опубликованная проверка до последних компонентов

| Область | Подтверждённое состояние |
|---|---|
| Проверенная ревизия кода | `8fc0b1b1adc44975396578e2ee60a4e7d1873eb7`, ветка `fix/durable-outbox` |
| CI этого SHA | [38175438277](https://github.com/Michael-edel/FitFocus/actions/runs/38175438277): success; 860 unit / 179 файлов, 152 browser passed / 9 skips, без flaky; обязательные проверки прошли |
| Клиентский PR | [#93](https://github.com/Michael-edel/FitFocus/pull/93), открыт как draft, база `fix/state-generations`, не слит |
| Серверная зависимость | PR #94 включён в клиентскую ветку коммитом `93f90c0`; это не слияние в main |
| GitHub main | `c939ae6f3dbdb802478ea8a305b180eefb0b90f8`, защищена |
| Production | Staging и выпуск этой интеграционной версии не подтверждены |

Результаты относятся к точному SHA. Незакоммиченные изменения рабочего дерева
этим CI не проверены. Исходный архитектурный снимок — `810adb1` из PR #90;
история промежуточных проверок сохраняется в журнале.

## Что уже реализовано в ветке

| Компонент | Контракт и проверенная граница |
|---|---|
| Исправление dependency audit и проверки push | [P0.1](../TASKS.md#p01--восстановить-ci-зависимости-и-проверка-push); интеграция в main открыта |
| IDB v2, атомарные данные/операция, claim/finish | [Фундамент P0.8](outbox-implementation.md) |
| 15 state-ключей, feature editors, удаление Map sender текущей сборки | [Управляемые записи](owned-state-writers.md), [sender](state-sender.md) |
| Profile editor, CAS, сохранение конфликта и dirty-формы | [Профиль](profile-persistence.md) |
| Canonical profile до AI, причинный update, own IDB-profile при reload | [Регистрация](registration-persistence.md) |
| Guarded bootstrap/state-hydration, readGuard и атомарный auth-fence | [Bootstrap/hydration](bootstrap-hydration.md), код `dac2de2` |
| Стабильное расположение формы при удержанном Save | [Исправление UI](profile-persistence.md#стабильность-формы-при-изменении-уведомления), код `3550cc8` |
| Серверная привязка account/session для AI/items и capabilities | [AI/items guard](ai-session-guard.md), код `16d3c34` |
| Legacy-нормализатор, атомарный importer/ledger, auth-derived owner и Service Worker all-client fence | [Legacy migration](legacy-migration.md); настоящий old/new migration smoke прошёл 7/7 локально |
| Серверные поколения и tombstones | [P0.7](state-generations.md); совместный выпуск остаётся открытым |

Наличие этих компонентов не закрывает целиком P0.5, P0.7, P0.8 или выпуск.

## Последующий компонент — персональное меню

Код [`f4b4eee`](https://github.com/Michael-edel/FitFocus/commit/f4b4eee1e577292019481b711b097941df27558e): персональное недельное меню использует свежий proof исходного
входа, capabilities/scope и ограниченный HTTP. Action/page/login lifetime и
транзакционный readGuard защищают generated-profile commit от старого ответа
и независимой правки. Результат показывается после постоянного сохранения.

Скрытый items writer вынесен из генерации: сначала profile commit, затем
отдельный scoped запрос. Ошибка списка покупок показывается отдельно от
сохранения меню. Таймаут снимает loading и разрешает повтор; logout/pagehide
останавливают старую попытку. Desktop-панель прокручивается к настройкам.

Локально: 900 unit / 183 файла, три typecheck, guards, schema/privacy, build
и audit прошли. Полная матрица: 200 browser passed / 1 failed / 9 skips, workers=4,
retries=0; все 49 новых menu-сценариев прошли в семи проектах.
Возврат pagehide/pageshow проверен синтетическими browser events; это не
доказательство реального BFCache браузера или физического устройства.
История первоначальных падений и исправлений — [в журнале](stabilization-progress.md).

Полная приёмка ещё открыта: старый profile reload на desktop WebKit
воспроизвёл native сообщение `/api/me due to access control checks`
после успешных функциональных проверок. Трасса указывает на `verify`
sender через `requestJson` во время reload. На этом снимке причина ещё не была установлена; последующая диагностика
и исправление описаны выше. Сообщение не скрыто.

CI документирующего `59a3630` прошёл: 860 unit, 152 browser passed / 9 skips,
без flaky. Он предшествует коду меню. Новый workflow проверяется на точном
опубликованном HEAD отдельно; [контракт компонента](ai-session-guard.md).
После этой ревизии achievement HTTP защищён отдельным `57da2cf`; остаются version/CAS и
durable-порядок вторичной items-проекции, остальные AI/report/retry/family
callbacks. Весь P0.5 остаётся открытым.

## Что остаётся

1. Завершить приёмку [семейного меню](family-menu-state.md) на `405238b`:
   PWA/Service Worker, lifecycle, явная цель мутации и совместимый откат.
   `useFamilyMenu`, family/week CAS и постоянная доставка уже реализованы.
   [Компонент сессий](family-session.md)
   проверен в CI; его реальный lifecycle и staging остаются открытыми.
   Личные покупки и подготовительный переход проверены локально и в CI;
   staging и выпуск остаются открытыми. Продолжить остальные
   AI/report/retry/family producers с привязкой к исходному входу,
   актуальной попытке и определённым порядком конкурирующих записей.
   CI компонента достижений на `42ee434` уже подтверждён; его счётчики
   остаются best effort, реальные BFCache/staging ещё не доказаны.
2. Продолжить приёмку lifecycle остальных callbacks. CI profile debounce
   на `bf01d87` прошёл. Исторические `/api/profile` и другие
   источники не считать автоматически объяснёнными этим изменением.
3. Завершить UI повтора/разрешения конфликтов. Локальный tombstone и проверка
   повторного входа закрывают повторный импорт и восстановление account-owned
   rows из старого backup при наличии tombstone. Физическое удаление payload из
   общего legacy source/snapshots остаётся открытым ограничением. [Контракт
   очистки](account-data-cleanup.md). JSON backup v3 реализован и прошёл CI:
   [backup/restore](backup-restore.md).
4. Пройти полную [матрицу lifecycle](sync-model.md#матрица-приёмки), staging
   и [выпуск](../RELEASE_CHECKLIST.md) через защищённую main.

Подробные условия находятся в TASKS. После P0 — типизация, границы модулей,
наблюдаемость и продуктовые улучшения из P1.

## Как поддерживать MD-файлы

Функции обновляются в PRODUCT, задачи — в TASKS, контракты — в профильных
документах, результаты — в журнале. Этот файл содержит краткий статус и
ссылки. [Карта документации](README.md) помогает выбрать документ,
[карта кода](code-map.md) — найти реализацию и тесты.
При следующей сверке обновлять дату, SHA и рабочую версию; прошлые результаты
сохранять с их ревизиями. Правила разработки — в [CONTRIBUTING](../CONTRIBUTING.md),
правила помощника — в [AGENTS](../AGENTS.md).
