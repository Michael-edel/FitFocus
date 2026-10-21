# Матрица проверки стабилизации FitFocus

Сверено: 21.10.2026. Это указатель на критерии [TASKS](../TASKS.md),
контракты и доказательства. Он не вводит новый план и не закрывает P0
по наличию тестового файла.

Локальный кодовый SHA [`671196e`](https://github.com/Michael-edel/FitFocus/commit/671196e5d80dd85929028a2378484f8781377ca9)
прошёл 1477 unit-тестов / 217 файлов, root/domain/storage typecheck, audit,
schema/privacy/auth/API guards и production build после `npm ci`. Точный CI
этой ревизии ожидает push. Текущий запущенный CI #1845 относится к предыдущему
SHA `b896c2c` и не подтверждает этот follow-up.

Проверяемая ревизия тестового follow-up PR #93 —
`58f4d309f7a8359c4233905cacdb49d6adb6f430`;
его точный [CI #1832](https://github.com/Michael-edel/FitFocus/actions/runs/39489956059)
завершился success: 1469 unit tests / 216 файлов, 1627 browser passed / 74
skipped, native Chrome BFCache 1/1 и rollback/CAS HTTP 23/23. Audit,
schema/privacy/auth/API guards, три typecheck и production build прошли.
Сохранены [browser diagnostics](https://github.com/Michael-edel/FitFocus/actions/runs/39489956059/artifacts/12298829550)
и [rollback archive](https://github.com/Michael-edel/FitFocus/actions/runs/39489956059/artifacts/12300230192). Предыдущий точный
[CI #1823](https://github.com/Michael-edel/FitFocus/actions/runs/39426977716)
на `5f92da1` завершился с **1603 browser passed / 67 skipped / 3 failed**.
Причины устранены в `26e6b3a`; затронутые сценарии прошли 7/7 и 3/3 без retries.

Локальный follow-up [`b5a493e`](https://github.com/Michael-edel/FitFocus/commit/b5a493e)
закрывает stale HTTP/network alert при смене сессии во время удаления аккаунта.
Ошибка воспроизведена на всех семи browser-профилях; после фикса delayed-delete
E2E прошли 14/14, целевой unit 10/10, полный unit 1469/1469, typecheck и diff
check прошли. Для этого SHA точный CI ещё не запускался.

Предыдущий [CI #1822](https://github.com/Michael-edel/FitFocus/actions/runs/39413327068)
завершился с 1584 passed / 67 skipped / 1 failed: Firefox Council history delete.
Коммит [`11e1fd1`](https://github.com/Michael-edel/FitFocus/commit/11e1fd1) добавил
session-ready gate и проверку quota-failure marker. `owned-state.spec.ts` прошёл
42/42 на семи профилях, проблемный Firefox сценарий — 10/10; unit — 1466/1466.

Локальный follow-up [`5cb8508`](https://github.com/Michael-edel/FitFocus/commit/5cb8508)
проверяет подтверждённое сервером удаление аккаунта, когда ответ приходит уже
после смены текущей сессии. Старая операция очищает данные своего аккаунта и не
вызывает logout callback новой сессии. Целевой unit-файл прошёл 8/8, полный
unit-набор — 1467/1467, root typecheck и `git diff --check` прошли. Тест не
входил в запущенный CI #1823. Browser follow-up
[`17db3b4`](https://github.com/Michael-edel/FitFocus/commit/17db3b4) удерживает
ответ `/api/account/delete`, затем активирует аккаунт B в соседней вкладке;
сессия B сохраняется, а запрос/ответ удаления остаётся scoped на аккаунт A.
Вся `registration-account-switch.spec.ts` прошла 14/14 на семи desktop/mobile/PWA
профилях (`workers=1,retries=0`). Точный CI follow-up ожидается после завершения
текущего прогона и публикации коммитов.

Коммит [`75b59b0`](https://github.com/Michael-edel/FitFocus/commit/75b59b0)
покрывает same-account reauthentication во время PDF сравнения замеров и архива
прогресса. Вместе с коротким и подробным отчётами все четыре browser acceptance
прошли 28/28 по семи desktop/mobile/PWA профилям без retries; unit guard пяти
экспортёров — 6/6, root typecheck и diff check прошли. `75b59b0` не входил в
CI #1822; его точный workflow проверяется вместе с follow-up в CI #1823.

Коммит [`9315e33`](https://github.com/Michael-edel/FitFocus/commit/9315e33)
проверяет поздний ответ `PUT /api/profile` после reauthentication того же
аккаунта. Старый `200` не завершает повторно захваченную операцию; новый ответ
завершает её. Семь browser/PWA профилей прошли без retries, профильный unit —
9/9, root typecheck и diff check прошли. Exact CI этой ревизии выполняется в #1823.

Точный PR CI #1618 для опубликованного `66e8c19` завершился success, включая
browser mock matrix и rollback/CAS gate. Локальный follow-up `1271dfe` проверяет
валидатор staging origin; локальные проверки прошли, точный CI ещё не запускался.
Реальный staging origin не
настроен; поэтому staging acceptance, release и интеграция в защищённую `main`
остаются открытыми.

`GET /api/support/attachment` требует полный proof для владельца и admin;
оба клиента загружают media scoped fetch-запросами и проверяют markers/echo.
Route, transport, API invariant и три typecheck прошли в изолированном sandbox
на SHA `a396a30`. Unit, точный CI, старые bundles и staging media smoke ещё
открыты. [Контракт](support-session.md).

AdminScreen загружает вложения поддержки через scoped request и проверяет
`Support-Attachment` protocol/guard markers; API echo-возвращает account/session,
а temporary Blob URLs отзываются при размонтировании. Маршрут, session transport,
API invariant и три typecheck прошли в изолированном sandbox на SHA
[`f949842`](https://github.com/Michael-edel/FitFocus/commit/f949842393125ffbd321bbb07988771671c8e6eb).
Unit, точный CI и staging media smoke ещё открыты. [Контракт](support-session.md).

`GET /api/export` требует полный account/session proof в локальном SHA
[`4edeb0a`](https://github.com/Michael-edel/FitFocus/commit/4edeb0a84d8836730bfc27f3f461f0f47bbf0058).
Missing/partial proof и beta denial покрыты regression tests; отказ происходит
до чтения экспортируемых данных. Изолированные API/auth/admin guards и три
typecheck прошли; unit suite и точный CI ещё не подтверждены. Staging export и
возможные внешние клиенты требуют отдельной проверки. [Контракт](../API_CONTRACTS.md).

`POST /api/logout_all` теперь требует обязательный session proof в follow-up
[`c778515`](https://github.com/Michael-edel/FitFocus/commit/c778515db0fe8481d8fa1a767493a000334cb1f6).
Отсутствующий и partial account-only proof проверяются до auth lookup и
revocation; локально прошли API/auth/admin guards и три typecheck. Точный CI и
staging проверяются отдельно. [Контракт](admin-session.md).

Обычный `POST /api/logout` также требует полный proof в follow-up
[`b2f6938`](https://github.com/Michael-edel/FitFocus/commit/b2f6938136c6ad6a82624b295c6eb7e2fdaf5ee6).
Missing/partial proof отклоняется до cookie lookup и revoke; stale proof не отзывает
чужую сессию, Set-Cookie не применяется. Локально прошли API/auth/admin guards и
три typecheck; точный CI и staging проверяются отдельно.
[Контракт](account-lifecycle-session.md).

Все `/api/admin/*` требуют полный account/session proof в follow-up
[`90bd734`](https://github.com/Michael-edel/FitFocus/commit/90bd7347a1bbdea51f27737f530a5f4a8c562c46).
Missing/partial proof проверяется до D1 role lookup и admin-session activity;
локально прошли API/auth/admin guards и три typecheck. Предыдущий PR CI
[`38706186324`](https://github.com/Michael-edel/FitFocus/actions/runs/38706186324)
нашёл одну устаревшую fixture: общий helper добавлял proof в тест legacy-запроса.
[`478fc58`](https://github.com/Michael-edel/FitFocus/commit/478fc58) исправляет
фикстуру; полный CI нового HEAD и обновление старых bundles/staging проверяются
отдельно. [Контракт](admin-session.md).

Huawei Health session guard впервые проверен в кодовом SHA
[`455cb01`](https://github.com/Michael-edel/FitFocus/commit/455cb0160ee3c5fa3d8bb2b455f1aae385f7c5ae):
26 профильных unit/API-тестов, 15/15 выбранных account-switch E2E без retries и
полный CI [`38656586334`](https://github.com/Michael-edel/FitFocus/actions/runs/38656586334).
Follow-up [`a127bf5`](https://github.com/Michael-edel/FitFocus/commit/a127bf5e6bb2f77fb83051d66b782bbc8baf8d6f)
сделал proof обязательным для status/start/sync/disconnect; API invariants,
admin guard и три typecheck прошли локально в изолированном контейнере. Точный
PR CI follow-up HEAD [38703208009](https://github.com/Michael-edel/FitFocus/actions/runs/38703208009)
на `a127bf5` подтвердил guards, unit, typechecks и build; E2E выполнялся при
добавлении account-only regression test в `9782ef0`. Новый точный CI запускается
после push. Старые Settings bundles без proof нужно обновить; реальный
OAuth/staging ещё не пройден. P0.5 остаётся открыт до общей lifecycle-приёмки.
[Контракт](huawei-health-session.md).

Коммит-кандидат P0.5 для Push `daec94d` требует свежую IDB/account
session guard в Settings и Service Worker. Полный unit suite прошёл: 1180 тестов /
202 файла, включая 41 профильный; общий и strict typecheck,
admin/API/auth/schema/privacy checks и production build прошли.
Полный `family-callback-account-switch.spec.ts` прошёл 42/42 в desktop Chromium,
Firefox и WebKit без retries; новый delayed push status сценарий прошёл в каждом
из трёх движков. Точный полный CI для опубликованного SHA `7ff579d` (run #1501)
завершился success: 1326 unit / 212 файлов, 850 browser passed / 263 skipped
за 38,1 минуты; guards, typechecks и build прошли. Rollback/CAS выполнил
23 HTTP/D1-запроса. Native Service Worker recovery прошёл в браузерной матрице.
Реальные push provider/device/staging и old/new bundle lifecycle остаются
открытыми. Более ранний baseline `b2d787f` в [run 38669030766](https://github.com/Michael-edel/FitFocus/actions/runs/38669030766)
не проверял эти поздние изменения. [Контракт](push-session.md),
[статус](project-status.md).

Незакоммиченный billing follow-up поверх `9fb0cff` связывает Checkout и admin
subscription с исходной сессией и response markers. 18 профильных unit-тестов,
typecheck и guards прошли; поздний Checkout URL после account switch прошёл 3/3
на desktop Chromium, Firefox и WebKit. Полный CI точного дерева ожидается.
[Контракт](billing-session.md).

Локальный follow-up `13e336d` расширил family account-switch acceptance двумя
путями: отложенный `/api/family/menu/generate` и отложенный durable
`GET /api/family/menu/state`. Полная `family-menu-durable.spec.ts` прошла 39/39
на Chromium, Firefox и WebKit (`workers=1,retries=0`); typecheck прошёл.
Предыдущий PR CI `38592830599` проверял SHA `1207f5c` и не включал state-read
сценарий `13e336d`; этот follow-up вошёл в полный CI `455cb01`, завершившийся
success (run `38656586334`).

Предыдущий полный PR CI до Huawei session guard проверил PR head
[`6c6feca`](https://github.com/Michael-edel/FitFocus/commit/6c6feca) и завершился
success в [run 38550243769](https://github.com/Michael-edel/FitFocus/actions/runs/38550243769):
audit, guards, unit, typechecks, build, E2E и rollback/CAS прошли. Новый локальный
plateau-retry сценарий прошёл на трёх desktop-браузерах, связанные unit —
11/11, typecheck — success. После барьера переключения активной сессии Coach
Firefox прошёл 5/5 повторов; повторный полный callback spec — 25 passed / 2
skipped без retries. Точный полный CI source HEAD `455cb01` включает этот тест и завершился success ([run 38656586334](https://github.com/Michael-edel/FitFocus/actions/runs/38656586334)).

Последний полный CI до Firefox-finish исправления прошёл на HEAD
[a9e3096](https://github.com/Michael-edel/FitFocus/commit/a9e309696be85414a6ca96697beec3d91c19718c)
в [run 38540109329](https://github.com/Michael-edel/FitFocus/actions/runs/38540109329):
1132 unit-теста, 535 E2E passed / 79 skipped, audit, schema/privacy/auth/API,
три typecheck, build и rollback/CAS. Два desktop Firefox теста были flaky на
первой попытке и прошли retry. Первичная диагностика зафиксировала
StateStorageError:STATE_STORAGE_TRANSACTION; последующая трассировка установила
причину, а локальный follow-up описан ниже.

Предыдущий полный CI проверил SHA [`9bdeb47`](https://github.com/Michael-edel/FitFocus/commit/9bdeb47dfd21c5e5d5366bb5fe47f8e5862cda11)
и завершился success ([run `38459458051`](https://github.com/Michael-edel/FitFocus/actions/runs/38459458051)):
unit прошли во всех 198 файлах; Playwright сообщил 501 passed / 29 skipped и
два flaky-теста, прошедших retry; rollback/CAS job прошёл. Локальные повторы этих
двух сценариев прошли 10/10 каждый, но первопричины не установлены. P0.5 achievement
account-switch acceptance из `b44d46e` включена в этот HEAD; профильный локальный
прогон прошёл 7/7 browser/PWA-проектов с `retries=0`.

В историческом follow-up после CI проверен E2E-коммит [`7753d87`](https://github.com/Michael-edel/FitFocus/commit/7753d87fe99a07b7fa555dac5ab2a5c487d44d54):
оба flaky-сценария повторены 10/10 каждый; полные затронутые specs прошли 10/10
на Android PWA Chrome и 8/8 на iPhone PWA; `npm run typecheck` прошёл. Полный
CI этого follow-up для кодовой ревизии [`a99ab7b`](https://github.com/Michael-edel/FitFocus/commit/a99ab7beea367df76154faa53747aed2aa473d98)
([run `38466153712`](https://github.com/Michael-edel/FitFocus/actions/runs/38466153712))
отменён после последующего документационного push. Follow-up не подтверждён
полным CI. Текущий CI-снимок указан выше; эта историческая проверка не подтверждает HEAD `a9e3096`.
Cloudflare preview успешен, но не подтверждает полный CI или production-выпуск.

Локальный компонент [`d93ff53`](https://github.com/Michael-edel/FitFocus/commit/d93ff53)
добавил scoped photo-analysis callbacks для дневника и рецептов. Связанные unit
прошли 11/11, typecheck прошёл, полный account-switch spec прошёл 22 сценария / 2
project skips на desktop Chromium/Firefox/WebKit (`workers=1,retries=0`). Полный
CI опубликованного HEAD `a9e3096` завершился success в [run `38540109329`](https://github.com/Michael-edel/FitFocus/actions/runs/38540109329):
1132 unit, 535 E2E passed / 79 skipped, три typecheck, build, audit и rollback/CAS.
Два Firefox-сценария weekly-menu были flaky и прошли retry; локально один раз
зафиксирован `StateStorageError:STATE_STORAGE_TRANSACTION`, после которого
sender не сделал HTTP-запрос, а pending profile operation сохранилась. Поздний
10-кратный повтор timeout-сценария прошёл 10/10, но первопричина не установлена;
см. [журнал](stabilization-progress.md). Это ограничение не закрывает весь P0.5,
staging или OAuth.

Локальная late-response acceptance покрывает personal shopping list GET/PATCH,
family join/create, family-context GET и family shopping GET. `ShoppingListCard`
отправляет исходный session scope; ответы A после входа B не попадают в списки
B, не очищают ввод, не появляются в family UI аккаунта B, не инициируют
повторный family GET и не запускают achievement. Family shopping-check и
member-goal также остаются в наборе. После тестовых commits [`69c739a`](https://github.com/Michael-edel/FitFocus/commit/69c739a),
[`1b6444a`](https://github.com/Michael-edel/FitFocus/commit/1b6444a),
[`bb1866c`](https://github.com/Michael-edel/FitFocus/commit/bb1866c) и
[`8f012e4`](https://github.com/Michael-edel/FitFocus/commit/8f012e4) весь
`family-callback-account-switch.spec.ts` прошёл 30/30 на desktop Chromium,
Firefox и WebKit (`workers=1/retries=0`); шесть новых сценариев прошли 18/18.
Связанные API unit-тесты: 25/25; `npm run typecheck` прошёл. Полный CI нового
HEAD ещё не подтверждён.

## P0.8 — IndexedDB outbox transaction stability

Текущий кодовый SHA [`2539c8c`](https://github.com/Michael-edel/FitFocus/commit/2539c8c8a5f30776c486b0b274903dc70d191dbc)
прошёл полный [CI run 38398403703](https://github.com/Michael-edel/FitFocus/actions/runs/38398403703):
1115 unit, 466 E2E passed / 9 skipped, guards, три typecheck, build и rollback
на 23 HTTP/D1 запросах. Один E2E retry был flaky в desktop WebKit PWA update
(уведомление отсутствовало в первой попытке); локальный повтор прошёл 3/3 без
retries, точная причина не установлена. Исправленная IndexedDB write race прошла
30/30 повторов двух затронутых Firefox-сценариев; весь weekly-menu spec — 8/8.
P0.8 всё ещё открыт до подтверждения полного lifecycle, legacy migration и
приёмки выпуска. Подробности: [статус](project-status.md), [журнал](stabilization-progress.md)
и [контракт weekly report](weekly-ai-report-session.md).

## Локальная проверка preview origin

Компонент поверх `aefc463` удаляет entry redirect preview → production.
Итоговая матрица: 21 origin-сценарий и семь native PWA-shell, 28/28,
семь конфигураций, workers=1/retries=0, 2,8 мин; root typecheck и 15 admin
guards прошли. RED и первая ошибка Firefox-фикстуры сохранены в
[контракте](staging-origin.md). CI компонента `076f4ac` прошёл: 383 browser
passed / 9 skips и 23 HTTP/D1 запроса. Реальный staging, D1/APP_URL/OAuth
и выпуск ещё не подтверждены.

## Проверенная граница

Исторический baseline [CI `47da77c`](https://github.com/Michael-edel/FitFocus/actions/runs/38280645353):
1053 unit / 194 файла, 383 browser passed / 9 skips, workflow success, 20,6 мин.
В итоговых логах нет flaky, preview proxy errors и ECONNREFUSED; HTTP/D1 прошёл
23 запроса. CI содержит WebKit held-PUT rollback test.
Причины прежних WebKit access-control и Firefox timeout остаются открытыми;
локальные повторы Firefox также не установили причину.
Код включает семейный
CAS `405238b`, явное PWA-обновление `8d32f12` и поправку первого SW-клиента
`574de76`. Это не подтверждает защищённую main, staging или production.

Последующий опубликованный код `98d4910` удаляет неиспользуемый Google SDK;
локально прошли 7/7 auth-shell и 7/7 forward real-SW сценариев.
Этот код включён в `5b90249`. Два прежних полных прогона архива `574de76`
дали 26/28 каждый; эта база не принята. Новый компонент закрепляет `98d4910`
и сохраняет полный client/SW/Pages Worker. Локально архив прошёл проверку
82 файлов и 28/28 fresh-install/rollback/forward на семи конфигурациях
без retries. HTTP/D1-переход `bd763ec` → архив `98d4910` прошёл 23 запроса;
Компонент опубликован в `bd763ec`, поправка CI — в `5b90249`.
Итог CI, 23 HTTP/D1-запроса и сохранение архива подтверждены; скачанный
архив проверен по digest и inventory. Flaky WebKit и staging открыты.
[Текущий статус](project-status.md), [границы отката](release-artifacts.md).

Рабочая mock-фикстура отдельно дала 4/4 в диагностике и 3/3 в двухвкладочном
сценарии без proxy-ошибок. Первый расширенный семейный прогон — 97/1; после
разделения ожиданий bootstrap/экрана прошли 98/98 на семи конфигурациях,
workers=2/retries=0, без proxy-ошибок. Root typecheck прошёл.
Эти локальные результаты дополнены CI `aefc463` и последующим preview CI
`076f4ac`: 383 passed / 9 skips, 20,3 мин, без flaky/proxy-ошибок.
Это не закрытие P0;
[условия и оставшиеся ограничения](mock-api-lifecycle.md).

### История предшествующих компонентов

Ранее подтверждённая опубликованная ревизия с семейным кодом —
[`0eae743a33544d4cd707efb825ea24ae30c2a7fd`](https://github.com/Michael-edel/FitFocus/commit/0eae743a33544d4cd707efb825ea24ae30c2a7fd),
ветка `fix/durable-outbox`. [CI этой ревизии](https://github.com/Michael-edel/FitFocus/actions/runs/38201311011)
завершился success: 1009 unit / 189 файлов, 278 browser passed / 9 skips.
В итоговом browser summary нет flaky; семь проектов, workers=2.
Локальный неудачный прогон и последующая диагностика сохранены ниже и в журнале.
Это не подтверждает staging, production или слияние в main.

На `0eae743` family/week CAS, AI-клиент и постоянная семейная доставка
ещё не входили в проверенную границу. Они реализованы позднее в `405238b`;
полная приёмка выпуска и совместимый откат остаются открытыми;
[статус реализации](project-status.md#текущая-работа--семейное-меню).

Предыдущий CI документационного `14ca638` также прошёл:
[запуск](https://github.com/Michael-edel/FitFocus/actions/runs/38191713675),
950 unit, 229 browser passed / 9 skips. Новый компонент `4736ff5` проверяется
отдельно: 966 unit / 187 файлов, все обязательные guards/typecheck и 16 HTTP
локального Worker/D1 прошли. Полная browser matrix `4736ff5`: 236 passed /
9 skips, 7 проектов, workers=3, retries=0. После серверной валидации `830caf4`
прошли 976 unit и повторный Worker/D1 smoke; клиент/E2E не менялись.
CI `2d1f480` подтвердил новый компонент. Следующие HEAD требуют отдельного CI.
Подробные доказательства и условия выпуска — в [контракте проекции](personal-menu-projection.md).

Подготовительный код `dde4c71` на базе до проекции прошёл 952 unit,
обязательные проверки/build и локальный переход 0019 → 0020 → сервер проекции
на одной БД (30 HTTP). Негативный откат воспроизвёл устаревшее чтение;
[инструкция и свидетельства](profile-cas-rollout.md). Это отдельная ветка:
реальные bundles, staging и совместимый откат ещё требуют подтверждения.

Последующий CI `d7ef1af` завершился success: 976 unit и 236 browser passed / 9 skips.
Подготовительный CI `c39904c` также success: 952 unit и 229 browser passed / 9 skips.
[Семейные сессии](family-session.md), код `9c44c21`, прошли 1009 unit и обязательные
проверки, 23 HTTP локального workerd/D1. Первая полная browser matrix:
272 passed / 6 failed / 9 skips (workers=3, retries=0); все 42 семейных сценария
прошли. Диагностика шести сценариев на обоих iPhone-проектах: 12 passed,
workers=1/retries=0, без изменения кода. Полный CI `3baac01` затем прошёл:
278 browser passed / 9 skips, workers=2, без flaky в итоговом summary. Это охват
`useFamilyCloud` на указанном историческом SHA; AI-путь, CAS и постоянная
семейная доставка добавлены позднее в `405238b`.

## P0: что проверено и что ещё требуется

| Пункт | Подтверждённая часть | Где смотреть проверки | Условие, которое ещё не закрыто |
|---|---|---|---|
| P0.1 — CI и зависимости | Исправление audit и push; зелёный CI опубликованной ветки | [Журнал](stabilization-progress.md), [workflow](../.github/workflows/ci.yml) | Интеграция зависимостей через защищённую main; CI release SHA |
| P0.2 — конфликты и ошибки | Outbox сохраняет конфликт и payload для 15 state-ключей, profile и familyMenu | [Outbox tests](../tests/durable_outbox.test.ts), [profile sender](../tests/profile_sender.test.ts), [контракт](profile-persistence.md) | UI разрешения/повтора и полный lifecycle |
| P0.3 — auth-пауза | Локальная запись продолжается; отправка требует подтверждения владельца; runtime legacy использует свежий `/api/me` и all-client fence | [State sender](../tests/state_sync.test.ts), [runtime migration](../tests/state_sync_legacy_migration.test.ts), [profile E2E](../e2e/profile-durability.spec.ts), [контракт](state-sender.md) | Остальные callbacks, old/new legacy migration smoke и повторный вход на staging |
| P0.4 — облачная загрузка | Managed hydration и profile seed проверяют pending, revision и auth-fence; `useFamilyCloud` сохраняет исходный login и проверяет family/week; delayed invite и family AI callbacks после входа другого аккаунта проверены на `f9c8425`/`bca2eda`; invite/member используют явную семью на `2bbec11`; food-diary account-switch acceptance сохраняет A и скрывает данные от A/B UI, локально 3/3 desktop; bulk move/delete пишут ровно по одному snapshot, а одинаковый food id остаётся изолированным между A/B, E2E 3/3 desktop engines локально; точный CI #1501 на `7ff579d` завершился success: 850 browser passed / 263 skipped; weekly-report reader повторно проверяет login session после IndexedDB-read; family context, shopping read и check повторно проверяют week scope, rollover E2E — 9/9, полный family-session — 33/33 на desktop engines; старый shopping PATCH остаётся привязан к исходной неделе и не показывает ложную ошибку смены сессии | [Hydration](../tests/session_hydration_durable.test.ts), [bootstrap E2E](../e2e/bootstrap-session.spec.ts), [family session E2E](../e2e/family-session.spec.ts), [family callback E2E](../e2e/family-callback-account-switch.spec.ts), [family menu E2E](../e2e/family-menu-durable.spec.ts), [weekly report tests](../tests/weekly_auto_engine.test.ts), [семейный контракт](family-session.md) | Остальные cloud callbacks/cache и writers семейного членства; задержанный update цели после смены семьи прошёл 7/7 локально, точный CI расширенной матрицы ожидается |
| P0.5 — поздние ответы | Claim/finish и readGuard; guarded bootstrap, меню, достижения и `useFamilyCloud`; мобильный bearer из Settings с fresh proof, guarded no-store и delayed account-switch E2E подтверждён точным CI `08618e3` ([run 38628487894](https://github.com/Michael-edel/FitFocus/actions/runs/38628487894)); личные покупки следуют profile CAS на `4736ff5`, familyMenu использует исходный guard и family/week CAS на `405238b`; недельный AI-отчёт и retry защищены; Coach/plateau account-switch E2E прошло локально 6/6 в трёх desktop engines, точный CI `9bc98ee` — success ([run 38410002498](https://github.com/Michael-edel/FitFocus/actions/runs/38410002498)); delayed family invite/AI, personal-plan retry, achievement account-switch и explicit family target включены в полный CI `9bdeb47` ([run 38459458051](https://github.com/Michael-edel/FitFocus/actions/runs/38459458051)); личное недельное меню после account switch добавлено в `562e20d`, полный CI прошёл ([run 38531646756](https://github.com/Michael-edel/FitFocus/actions/runs/38531646756)); генерация пошагового рецепта из дневника session-bound в `71d2ca4`: account-switch spec — 44 passed / 4 skipped; billing Checkout/admin теперь session-bound (18 профильных unit, checkout E2E 3/3); точный CI billing ожидается после исправления E2E baseline `38671885368` | [Read guard](../tests/session_read_guard.test.ts), [AI account-switch E2E](../e2e/ai-callback-account-switch.spec.ts), [family callback E2E](../e2e/family-callback-account-switch.spec.ts), [family menu E2E](../e2e/family-menu-durable.spec.ts), [menu E2E](../e2e/weekly-menu-durability.spec.ts), [weekly report unit/E2E](weekly-ai-report-session.md), [family E2E](../e2e/family-session.spec.ts), [achievement E2E](../e2e/achievement-session.spec.ts), [billing session](billing-session.md) | Остальные AI retry и family producers; staging, общий lifecycle и приёмка release |
| P0.6 — аккаунты и вкладки | Постоянный accountId операции, session попытки; транзакционная координация IDB без обязательных Web Locks; runtime проверяет владельца legacy и build id всех вкладок. Параллельная запись разных ключей двумя вкладками прошла CI HEAD `a8f3219` (run 38634080772). Same-key full-snapshot E2E: пока первый PUT в полёте, независимая правка из второй вкладки остаётся конфликтом; локально 3/3 desktop engines. Account-switch 503 → B → свежая A session прошёл локально 3/3 и точный PR CI source HEAD `943d4c0` (run 38641088114). Три account acceptance — смена аккаунта, reload и logout/login с сохранением opId — прошли совместно локально 9/9 в desktop Chromium, Firefox и WebKit без retries; эти account-switch сценарии вошли в полный CI `455cb01` и прошли (run `38656586334`). Обновлённый old/new same-key snapshot acceptance прошёл локально 3/3 без retries: источник повторно проверяется, изменённое намерение остаётся конфликтом | [Outbox](../tests/durable_outbox.test.ts), [lifecycle](../tests/state_sync_lifecycle.test.ts), [cross-tab E2E](../e2e/owned-state.spec.ts), [same-key E2E](../e2e/storage-durability.spec.ts), [account-switch E2E](../e2e/ai-callback-account-switch.spec.ts), [runtime migration](../tests/state_sync_legacy_migration.test.ts), [legacy browser smoke](../e2e/legacy-outbox-migration.spec.ts), [контракт](sync-model.md) | Полное old/new writer overlap, остальные callbacks и общая lifecycle-приёмка |
| P0.7 — серверные поколения | State protocol 2, tombstones и версия своей мутации | [State generations](../tests/state_generations.test.ts), [серверный контракт](state-generations.md) | Совместимый выпуск сервера/клиента, staging и интеграция в main |
| P0.8 — постоянная очередь | Одна IDB-outbox; атомарные import/ledger; свежий auth proof владельца; Service Worker all-client fence; old/new smoke прошёл локально 7/7 и в CI `00cd005`; JSON backup v3 экспортирует и атомарно восстанавливает все пять stores; обновлённая migration E2E прошла точный CI `08618e3` ([run 38628487894](https://github.com/Michael-edel/FitFocus/actions/runs/38628487894)). Дополнительный сценарий позднего изменения legacy-снимка старой вкладкой прошёл локально 3/3 desktop engines при `workers=1`; полный CI `455cb01` завершился success (run `38656586334`) | [Legacy queue](../tests/legacy_queue.test.ts), [migration](../tests/legacy_migration.test.ts), [runtime integration](../tests/state_sync_legacy_migration.test.ts), [backup](backup-restore.md), [browser smoke](../e2e/legacy-outbox-migration.spec.ts), [ADR-005](adr/ADR-005-durable-outbox.md) | Staging и полный rollback/release acceptance; полный lifecycle, UI конфликтов и оставшиеся old/new writers |
| P0.9 — приёмка | Отдельные unit/browser критерии включают commit-with-lost-ack, повторный lease claim, 503/Retry-After, transport abort/reload, 401/403 recovery, DELETE resolution и IndexedDB abort. Trace показал 87,9-секундное ожидание отдельного `indexedDB.open()` из E2E при живом экране. Follow-up `58f4d30` использует connection приложения; CI [#1832](https://github.com/Michael-edel/FitFocus/actions/runs/39489956059) завершился success: 1469 unit / 216 файлов, 1627 browser passed / 74 skipped, native Chrome BFCache 1/1, rollback/CAS HTTP 23/23; browser и rollback artifacts сохранены. Локально `pwa-update.spec.ts` прошёл 10/4 без retries; branch-preview для этой ревизии прошёл 8/8 GET-only. Историческая причина задержки Firefox не доказана | [Матрица lifecycle](sync-model.md#матрица-приёмки), [release checklist](../RELEASE_CHECKLIST.md), [mock lifecycle](mock-api-lifecycle.md), [PWA диагностика](pwa-updates.md#повторное-исследование-firefox-indexeddb-timeout--12102026), [storage E2E](../e2e/storage-durability.spec.ts), [outbox tests](../tests/durable_outbox.test.ts) | Остальные lifecycle, staging, реальные устройства/OAuth, protected-main integration и выпуск остаются открыты |

Последующее расширение P0.4 сняло desktop-only skip с трёх семейных callback
сценариев. Отложенное обновление цели при смене загруженной семьи, отложенное
обновление цели участника после reauthentication и late member response A после
входа B прошли каждое 7/7 на desktop, Android, iPhone Safari и PWA профилях при
`workers=1,retries=0`. Ещё 15 семейных A→B и same-account delayed callbacks
прошли 60/60 на четырёх Android/iPhone/PWA профилях; ещё 10 shopping/support/
token/push/billing и write-race сценариев прошли 40/40 на тех же профилях. Их
ранее проверенная desktop часть сохранена отдельно. Полный точный CI объединённой матрицы проверяется
после push; остальные cloud callbacks/cache и writers семейного членства остаются
открытыми.

Ещё десять account-switch сценариев черновиков и локальных cache из
`ai-callback-account-switch.spec.ts` расширены на четыре мобильных/PWA профиля:
40/40 запусков прошли. Проверки раскрывают мобильные детали прогресса и
подтверждают, что AI retry/status остаются в account-scoped ключах при смене
владельца; те же два сценария прошли 6/6 на desktop Chromium, Firefox и WebKit.
Вместе с предыдущими 25 сценариями это 35 сценариев и 140 мобильных запусков.
Точный CI опубликованного HEAD ещё не завершён; общая проверка callbacks/cache не закрыта.

P0.5 mobile acceptance добавила три AI Council account/session сценария,
которые прошли 21/21 на всех семи профилях: 12 запусков Android/iPhone/PWA и
9 desktop. Проверены отбрасывание удержанного ответа после входа B и после
повторного входа того же аккаунта с новой server session, а также очистка
временного вопроса старой сессии. Суммарное расширение составляет 38 сценариев
и 152 мобильных запуска; общий P0.5 и точный CI текущего HEAD остаются открыты.
Отдельная регрессия очистки истории удерживает ответ `council_chairman`:
«Очистить» теперь abort-ит запрос и не даёт позднему ответу восстановить запись.
Известный дефект воспроизведён до исправления; новый сценарий прошёл 7/7 всех
desktop/mobile/PWA профилей без retries. Изменение требует точного CI.

Два delayed personal weekly-menu callback сценария прошли 14/14 на desktop,
Android, iPhone и PWA профилях: поздний ответ после входа B и после повторной
сессии того же владельца не меняет профиль/state/outbox и не запускает лишние
achievement effects. Production-код не менялся. В сумме мобильное расширение
составляет 40 сценариев и 160 запусков; полный P0.5 остаётся открытым.

Два held weekly-report сценария прошли 14/14, а четыре food/recipe photo
analysis сценария — 28/28 на desktop Chromium/Firefox/WebKit и Android/iPhone/PWA.
Суммарно 42/42 прогона без retries; поздние ответы не меняют profile, report,
diary/history и не запускают лишние achievement effects. Cumulative mobile
coverage: 46 account/session сценариев и 184 запуска; exact-head CI всё ещё
ожидает завершения.

Поздние profile save и refresh прошли ещё 14/14 на desktop, Android, iPhone и
PWA профилях. Ответ A не подменяет профиль B; при возврате A исходная операция
повторяется с новой session epoch. Три P0.6 outbox lifecycle сценария прошли
21/21 на семи профилях, в том числе 12 мобильных/PWA запусков. Production-код
не менялся. Два held step-by-step recipe callback сценария прошли ещё 14/14,
включая 8 мобильных/PWA запусков. Bulk move/delete дневника прошёл 7/7,
включая 4 мобильных/PWA запуска. WIS-share callback после reactivation прошёл
7/7, включая 4 мобильных/PWA запуска. Накопленное мобильное расширение — 55
сценариев и 220 запусков. PDF account-switch acceptance также прошёл 7/7,
включая четыре мобильных/PWA запуска. Матрица составляет 56 сценариев и 224
мобильных запуска. Два задержанных Huawei sync сценария прошли вместе 14/14 на
семи профилях (8 мобильных/PWA запусков), доведя накопленную матрицу до 58
сценариев и 232 мобильных запусков. Проверка использует mock API; настоящий
Huawei OAuth, устройство и staging не покрыты. Follow-up [`f233eff`](https://github.com/Michael-edel/FitFocus/commit/f233effd968ad0b2d498ce83e75963150d877369)
добавил мобильную приёмку paywall и profile-sync/adaptation notices: 21/21 на
семи профилях (12 мобильных запусков). Camera dialog остаётся desktop-only:
мобильный экран использует native capture input, не in-app modal. Итоговая
матрица на этом этапе — 61 сценарий и 244 мобильных запуска. Затем follow-up
[`35a2d30`](https://github.com/Michael-edel/FitFocus/commit/35a2d303cf26a8e88ca8a796a69fe1479c2e1240)
расширил recipe-photo auth-refusal acceptance: 7/7 на семи профилях, включая
4 мобильных запуска; обычная ошибка рецепта, browser alert и page error не
появились. Накопленная матрица составляет 62 сценария и 248 мобильных запусков.
Затем [`c751260`](https://github.com/Michael-edel/FitFocus/commit/c751260ac7edbe328eea64a4220648ef570a9adb)
расширил два held plateau-explanation callbacks: 14/14 на семи профилях,
включая 8 мобильных запусков; поздний ответ после входа B или новой server
session не меняет UI, профиль и outbox. Затем [`ebddd21`](https://github.com/Michael-edel/FitFocus/commit/ebddd21265c897316f7337e1c605c7524c9fefe0)
расширил успешную пошаговую генерацию рецепта и запись в избранное на все семь
профилей: 7/7, включая четыре мобильных запуска. Затем
[`81aec0d`](https://github.com/Michael-edel/FitFocus/commit/81aec0d59a1d71f034c09570071c02e1f804feff)
расширил прямой success path анализа фото еды до 7/7 на семи профилях, включая
четыре мобильных запуска. Follow-up
[`e6f73f2`](https://github.com/Michael-edel/FitFocus/commit/e6f73f27208055ce51bb48899327c0fafc68db67)
покрыл held AI response после фото, выбранного через mobile `input[capture]`:
4/4 Android/iPhone browser/PWA прогона; исходный gallery-upload сценарий прошёл
7/7 после выделения общего assert helper. Это Playwright file-input fixture,
не запуск камеры ОС. Матрица составляет 67 сценариев и 268 мобильных запусков.
Затем [`746e26e`](https://github.com/Michael-edel/FitFocus/commit/746e26eb483dca986f4ca10fea896279dd34fd0d)
проверил тот же поздний `foodphoto_enhanced` callback через отдельный native
capture input страницы рецептов: 4/4 Android/iPhone browser/PWA прогона; исходный
gallery path — 7/7. Всего 11 passed и 3 ожидаемых desktop skips, без retries.
Это file-input acceptance; системная камера и физическое устройство не проверены.
Матрица — 68 сценариев и 272 мобильных запуска.
Полный P0.4/P0.5 lifecycle и точный CI нового HEAD остаются открытыми.

Коммит [`265bb6a`](https://github.com/Michael-edel/FitFocus/commit/265bb6afe939aed6730fd7cbc5dff42218be85d3)
проверяет held progress-photo decode после account switch A → B. После
освобождения `Image.src` profile, managed state, outbox и API write counters
остаются неизменны; фото отсутствует в обеих вкладках. E2E — 7/7 на desktop
Chromium/Firefox/WebKit, Android Chrome/PWA и iPhone Safari/PWA
(`workers=1`, `retries=0`); root typecheck и `git diff --check` прошли. Это
mock API и Playwright file fixture, без физической камеры или staging.
Матрица выросла до 69 сценариев и 276 мобильных запусков. CI #1791 на родительском
SHA `4630689` выполнялся и не включает тест; точный CI этой ревизии ожидается
после push. Полный P0.4/P0.5 lifecycle остаётся открытым.

Коммит [`2db372b`](https://github.com/Michael-edel/FitFocus/commit/2db372b4eaa1a0ddb2286cebf76b295efdad8393)
добавил P0.6 account/session сценарий для фото прогресса: удержанный callback
отпускается после повторного входа в аккаунт A с новым `serverSessionId`; тест
проверяет смену `sessionEpoch`, отсутствие новых profile/state writes, прежние
profile/managed state/outbox снимки и отсутствие фото в UI. Новый сценарий прошёл
7/7, а A → B после общего helper — повторно 7/7 на desktop Chromium/Firefox/
WebKit, Android Chrome/PWA и iPhone Safari/PWA (`workers=1`, `retries=0`).
Вместе матрица составляет 72 сценария и 288 мобильных запусков. Root typecheck
и `git diff --check` прошли. Используется mock API и SVG file fixture; физическая
камера и staging не проверялись. Полный P0.4/P0.6 lifecycle остаётся открытым.

Дополнительный same-account reauthentication сценарий открывает paywall в старой
сессии и входит в тот же аккаунт с новым `serverSessionId` в соседней вкладке.
IndexedDB `sessionEpoch` меняется, старая вкладка показывает session-change
notice, а paywall скрывается в обеих вкладках. E2E прошёл 7/7 desktop/mobile/PWA
профилей без retries. Аналогичные same-account проверки profile-sync и adaptation
notices прошли по 7/7 каждая. Camera dialog после same-account reauthentication
прошёл 3/3 desktop engines; четыре mobile/PWA профиля штатно пропущены, потому что
используют native capture input. Food insight и несохранённый editor после reauth
прошли 7/7, durable diary entry не изменился. Mobile navigation menu после reauth
прошло 4/4 на Android/iPhone browser/PWA. Накопленная матрица — 78 сценариев и
308 мобильных запусков.
Held food-photo callbacks подтверждают видимый spinner до смены owner/session и
его очистку после переключения и reauthentication: 18 passed / 3 ожидаемых
desktop skips; late response его не возвращает.
Тест находится в [`8afbd96`](https://github.com/Michael-edel/FitFocus/commit/8afbd96a2915c094f4f392d6b55d9b3f48c4a496).
Проверки notices добавлены в [`a1e36ee`](https://github.com/Michael-edel/FitFocus/commit/a1e36ee8fd67e676266e098fd761593782185a0f), camera dialog — в [`918e64c`](https://github.com/Michael-edel/FitFocus/commit/918e64cd47009c2596d9daf9d19e5c67ac342854), food insight/editor — в [`f71e783`](https://github.com/Michael-edel/FitFocus/commit/f71e78370c1e0a40caf23329c1a08b8f9b19d099), menu — в [`41c7467`](https://github.com/Michael-edel/FitFocus/commit/41c746729e4791e5aa05ca663eac2f3d63f95fce).
Spinner-приёмка добавлена в [`4f41c1a`](https://github.com/Michael-edel/FitFocus/commit/4f41c1a883aa663697f7a94d6114467f8dbc71b0).
Это mock API, физический billing flow и staging не проверялись.

Точный [CI #1793](https://github.com/Michael-edel/FitFocus/actions/runs/39294298288)
для `4ed7f0b` завершился browser failure: 1441 passed / 60 skipped, четыре
отказа в двух account-switch тестах. Проверка AI activity теперь допускает
собственный `wis_text` cache B и исключает перенос fixture A; adaptation notice
ждёт начальный AI handshake, подтверждает `plateau` request A и использует
разные ответы аккаунтов. Оба сценария прошли локально 14/14 на семи профилях;
root typecheck и `git diff --check` прошли. Точный CI follow-up ожидает push.

Поздний AI plateau-ответ, запущенный во время session hydration, дополнительно
проверен после входа B и после повторного входа A с новым `serverSessionId`.
Profile/state/outbox, writes, achievement и UI не изменились; каждый сценарий
прошёл 7/7 на всех desktop/mobile/PWA профилях без retries. Локальный
`ECONNREFUSED` при раннем закрытии вкладки устранён передачей очистки общей
Playwright fixture; повторная матрица прошла без proxy ошибки. Production-код
не менялся. CI #1794 для `aee0a6c` отменён при публикации follow-up. Точный
[CI #1796](https://github.com/Michael-edel/FitFocus/actions/runs/39314354105)
на `8f06da2` прошёл: 1462 unit tests / 216 файлов, 1459 browser passed / 60
skipped (1 час), audit/guards, три typecheck, build, 23 HTTP/D1 проверки
rollback/CAS и сохранение browser diagnostics и rollback artifact. Оба новых
сценария вошли в полный CI.

Локальная DELETE-конфликт приёмка в `e2e/owned-state.spec.ts` прошла 7/7:
`council_history` сохраняет tombstone, тот же `opId` и проверенный
`serverSnapshot` после 409/reload; явное принятие записывает серверный снимок,
ставит `confirmedVersion = 9`, удаляет операцию и не вызывает повторный DELETE.
Проверка входит в коммит `2592492`; это mock API, не staging.

Route-level проверка `delete → recreate → stale update` добавлена в коммите
`77d2679`: production `/api/state` handlers с SQLite-backed D1 adapter возвращают
версии 1 → tombstone 2 → recreate 3, отклоняют старые PUT с 409 и сохраняют
текущий payload. Целевой тест прошёл 1/1, полный unit suite — 1369/1369; три
typecheck и build прошли локально. Auth/capability провайдеры изолированы, а
точный CI этого HEAD ожидает push; staging остаётся открытым.

Дополнительная локальная P0.9 browser acceptance прошла 7/7: PWA cold reopen
сохраняет и отправляет тот же intent после восстановления сети во всех
desktop/mobile/PWA профилях. На Playwright 1.64.1 WebKit тоже работает с
`context.setOffline(true)` и подтверждает `navigator.onLine === false`.
IndexedDB transaction abort полностью откатывает settings value/outbox/meta и
показывает ошибку. Обновлённый runner ожидает точного CI; staging, device/BFCache
и полный P0.9 остаются открытыми.

Ещё одна локальная P0.9 проверка в кодовом коммите
[`cb22abe`](https://github.com/Michael-edel/FitFocus/commit/cb22abe40740ed8b1f55b6d0d7c716d9c4d7364c)
подтверждает `401 → новая правка → login`: auth-пауза и изменение `authFence`
не скрывают локальные настройки той же account/session identity; обе операции
с исходными opId после свежего proof подтверждаются последовательно. Browser/PWA
матрица прошла 7/7, unit — 9/9. Это mock API acceptance; точный CI и staging
не подтверждены.

Предыдущий полный CI на проверенном HEAD `e96025d` завершился success
([run `38440675173`](https://github.com/Michael-edel/FitFocus/actions/runs/38440675173))
с тремя flaky E2E, прошедшими retry. Его симптомы и повторы сохранены в
[журнале](stabilization-progress.md); актуальная проверка — `9bdeb47` выше.

Дополнительная P0.9 browser-проверка прошла 7/7: две вкладки без Web Locks
повторно захватывают одну lease; после ack новой попытки старый запрос получает
409, но не меняет подтверждённые value/version и не восстанавливает operation.

Все P0 остаются открытыми в целом. Успешные части и оставшиеся условия
нужно читать вместе; результаты mock API не подтверждают поведение реального D1.

## Как фиксировать следующий результат

Для каждой проверки записывать commit SHA либо явно «незакоммиченное рабочее
дерево», команду, среду, результат и ограничения. Для браузеров дополнительно
указывать проекты, workers, retries и явные skips. Не заменять неуспешный
полный прогон успешным выборочным повтором.

После изменения контракта обновлять его документ, TASKS,
[краткий статус](project-status.md) и [журнал](stabilization-progress.md).
Эту матрицу менять, когда изменилась подтверждённая область или оставшийся
критерий; ежедневные логи и дубли всего плана сюда не добавлять.
