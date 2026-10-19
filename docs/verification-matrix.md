# Матрица проверки стабилизации FitFocus

Сверено: 18.10.2026. Это указатель на критерии [TASKS](../TASKS.md),
контракты и доказательства. Он не вводит новый план и не закрывает P0
по наличию тестового файла.

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
| P0.9 — приёмка | Отдельные unit/browser критерии включают commit-with-lost-ack, повторный lease claim, 503/Retry-After, transport abort/reload, 401/403 recovery, DELETE resolution и IndexedDB abort. CI точного опубликованного head `e34544d` завершился ошибкой в [run 38903745625](https://github.com/Michael-edel/FitFocus/actions/runs/38903745625): gates до E2E успешны, browser — 840 passed / 251 skipped / 1 failed; desktop Firefox завис в legacy migration state probe с дополнительным `indexedDB.open()`. Follow-up `0efec93` переиспользует соединение приложения и пишет lifecycle/transaction diagnostics; migration spec прошёл 14/14 по семи профилям, Firefox-сценарий — 10/10, без retries. Полный CI точного SHA follow-up ещё не подтверждён | [Матрица lifecycle](sync-model.md#матрица-приёмки), [release checklist](../RELEASE_CHECKLIST.md), [mock lifecycle](mock-api-lifecycle.md), [PWA диагностика](pwa-updates.md#повторная-проверка-webkit-pageerror-при-pwa-update--12102026), [storage E2E](../e2e/storage-durability.spec.ts), [outbox tests](../tests/durable_outbox.test.ts) | Разделение unit/mock/staging gates, полный P0.9 и rollback acceptance; staging, реальные устройства/BFCache/OAuth и выпуск остаются открыты |

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
повторяется с новой session epoch. Production-код не менялся. Накопленное
мобильное расширение — 48 сценариев и 192 запуска; полный P0.4/P0.5 lifecycle
и точный CI текущего HEAD остаются открытыми.

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
