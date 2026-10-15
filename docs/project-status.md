# Текущее состояние FitFocus

Сверено: 16.10.2026. Функции описаны в [PRODUCT](../PRODUCT.md), общий статус —
здесь, результаты проверок — в [журнале](stabilization-progress.md). Последнее
локально проверенное исправление в ветке `durable-outbox` скрывает account-
зависимые экраны, пока активная IndexedDB-сессия не совпадает с аккаунтом UI.
До фикса в старой вкладке оставались видны профильное приветствие и сохранённая
история AI-отчётов аккаунта A после входа B; теперь содержимое скрыто, а данные A
остаются сохранены. Account-switch E2E прошёл на Chromium/Firefox/WebKit без
retries; общий typecheck и production build прошли. P0.4 остаётся открытым для
остальных callbacks, staging и полного lifecycle. CI предыдущего HEAD ещё
выполняет E2E; точный CI этого follow-up проверяется после публикации.

`a67ed17` исправляет production-сбой при создании ID рецепта и сбрасывает
несохранённый черновик при смене активной IndexedDB-сессии из другой вкладки.
`beedbee` добавляет такую же браузерную приёмку черновика измерения веса и
задаёт начальный размер графиков прогресса, устраняя предупреждение Recharts
при первом layout. Follow-up `a8d20ee` дополняет сброс UI-кэша выбранной датой
дневника питания: при сбросе удаляется запись активного аккаунта, но не данные
другого аккаунта или профиль. `02a12e2` также предотвращает восстановление
черновика настроек аккаунта A в старой вкладке, если IndexedDB уже активирует
аккаунт B; запись A сохраняется и восстанавливается при reload, пока активен A.
Полный unit suite — 1306/1306; общий, domain-strict и storage-strict typecheck,
production build и `git diff --check` прошли. Settings draft account-switch E2E
прошёл 3/3, прежние recipe/progress draft сценарии — 6/6 на desktop
Chromium/Firefox/WebKit без retries. Follow-up `6c53b68` блокирует восстановление
account-scoped UI-кэшей, пока активная IndexedDB-сессия не подтверждает текущего
пользователя; сохранённый кэш account A остаётся доступен при возврате к A.
Полный unit suite — 1308/1308, общий и два strict typecheck, production build и
diff check прошли; draft account-switch матрица — 15/15 на desktop
Chromium/Firefox/WebKit без retries. Follow-up `2e2c1d1` расширяет gate на
screen-local caches прогресса и списка покупок; повторная draft matrix и полные
локальные проверки также прошли. План содержит 34 открытых пункта: общий
P0.4/P0.5, остальные callbacks/cache, staging и полный lifecycle открыты.

Для `18af4ee` прошли полный unit suite (1300/1300 в 209 файлах), общий и два
strict typecheck, production build и Coach retry account-switch E2E (3/3 на
desktop Chromium/Firefox/WebKit, без retries). Follow-up `0646e3d` также прошёл
20 профильных unit, общий typecheck, production build и тот же E2E 3/3 после
перевода всех AI action reads на явный accountId. В плане остаются 34 пункта:
20 P0, 7 P1 и 7 следующих задач. P0.4 и P0.5 остаются открытыми до проверки
остальных callbacks, staging и полного lifecycle.

`f814234` сбрасывает черновики экрана прогресса при смене account/session и
добавляет в зависимости гидратации id профиля и его значения глюкозы. Полный
unit suite прошёл 1305/1305 в 210 файлах, общий typecheck и production build
прошли; два целевых Push E2E прошли по 1/1 в desktop Chromium без retries.
P0.4 остаётся открытым: для экрана прогресса ещё нужен browser account-switch
acceptance, кроме проверки остальных callbacks/cache и staging.

`cdc872b` распространяет account/session render key на все account-aware
workspace screens, включая рецепты с несохранённым editor draft. После этой
ревизии полный unit suite — 1305/1305, typecheck/build прошли; recipe
account-switch E2E — 3/3 и family-menu durable E2E — 39/39 на desktop
Chromium/Firefox/WebKit без retries. Точный CI этого HEAD выполняется после push.

## P0.5 — AI retry metadata с областью аккаунта, [`18af4ee`](https://github.com/Michael-edel/FitFocus/commit/18af4ee48cf1cde471dd85cea892715a04691d2d)

Последнее AI-действие теперь сохраняется под `userId` самой записи, в том числе
при первичной регистрации до установки активной области. Чтение принимает явный
accountId; прежний unscoped action совместим только если его сохранённый
`userId` совпадает с текущим аккаунтом. У старого status без владельца нет
такого fallback. Hook привязывает snapshot к профилю и сразу возвращает пустой
AI activity при смене scope, пока не прочитаны данные нового аккаунта.

Проверки: 1300 unit в 209 файлах, общий/domain/storage strict typecheck,
production build, адресный Coach retry account-switch E2E 3/3 на desktop
Chromium/Firefox/WebKit с `workers=1,retries=0`; diff check прошёл. GitHub CI
этого SHA ожидает push. Компонент закрывает только локальную часть AI
retry-metadata scope; остальные AI/family callbacks, staging и полный P0.5
lifecycle остаются открытыми.

Follow-up `32818d1` распространяет account-scope gate на остальные локальные UI
preferences: search query, weight draft, PDF flag, diary date, camera facing и
plan controls. В App plan scope теперь помечен owner id; setters старого scope
отбрасывают запоздавшие обновления. Полный unit прошёл 1304/1304 в 210 файлах;
общий typecheck, production build и `git diff --check` прошли. Broad P0.4 и P0.5
остаются открытыми.

Коммит `64d14a4` скрывает локальное состояние урока и викторины, пока hook не
загрузит снимок для текущего account key. Это устраняет кратковременный показ
состояния прошлого аккаунта во время переключения и после выхода. Проверки:
course UI unit 3/3; общий unit запуск — 1297 тестов в 207 файлах, а две suite,
не загрузившиеся из-за Windows `EBUSY`, прошли отдельным последовательным
повтором (4/4); typecheck, production build и diff check прошли.

## P0.7/P0.8 — legacy intent без доказанного поколения

Реализация этой части на базе `24aa070` сохраняет старую операцию как видимый конфликт
`legacy-server-generation-unproven` с `baseVersion: 0`. Уже существующая
pending/sending операция атомарно снимается с отправки; поздний ответ старого
запроса не подтверждает новую версию. Исходный источник, payload и migration
ledger сохраняются. Старое значение попадает в durable storage только когда
это не перезаписывает другую текущую операцию; оно не становится sendable.

Проверки предыдущей ревизии включали unit 1279/1279, общий и domain/storage
strict typecheck, production build, old/new migration browser/PWA matrix 7/7 и
`git diff --check`. Результаты новой ревизии приведены выше и в журнале.
Безопасное ручное разрешение legacy-конфликтов, остальные callbacks и полный
lifecycle остаются открытыми; в [плане](../TASKS.md) открыты 34 пункта.

## Старая вкладка: сохранение local-only изменения

После отказа старому unscoped API старая вкладка могла сохранить следующее
изменение account-scoped state только в localStorage: legacy queue при этом не
обновлялась. Новый runtime теперь сохраняет строковую запись известного ключа
подтверждённого аккаунта как `legacy-writer-local-only` conflict в IndexedDB,
не меняя активное durable value и не отправляя конфликт. Проверка выполняет
реальный второй клик в старом bundle на том же origin и подтверждает, что legacy
queue осталась прежней.

Локально прошли полный unit-набор (1279/1279), `typecheck`, domain/storage strict
typecheck, production build и old/new migration E2E (7/7 браузерных/PWA-проектов,
без retries). Точный CI нового SHA и staging ещё требуют проверки. Profile
callbacks и удаление localStorage ключа старой вкладкой остаются отдельными
lifecycle-сценариями.

## Offline retry при обновлении PWA и flaky acceptance — `ad89020`, `aa4073c`

Rollback E2E получает offline `503`, задерживает следующую отправку и активирует
обновление при `sending`; операция сохраняет тот же `opId` и payload, старый
запрос прерывается. `ad89020` дополнительно проверяет между навигациями отсутствие
`unhandledrejection` и `window.error`. Локально прошли desktop WebKit 4/4,
Chromium 1/1 и Firefox 1/1; отдельная повторная серия после lifecycle assertions
дала 6/6, `npm run typecheck` прошёл.

Точный CI [`38729850933`](https://github.com/Michael-edel/FitFocus/actions/runs/38729850933)
для parent SHA `96937ea` завершился success: 1277 unit, 632 browser passed и
143 skipped. Итог отметил две flaky проверки: Firefox delete-операция оставалась
в корректном `sending` lease, а задержанный WebKit menu GET давал access-control
console warning при дополнительном `page.route` поверх mock API. В `aa4073c`
первая проверка принимает только durable `pending`/`sending`; вторая держит GET
внутри того же API handler. После изменений локально прошли
`family-menu-durable.spec.ts` 39/39 на Chromium/Firefox/WebKit и
`owned-state.spec.ts` 4/4 на Firefox. CI точного нового HEAD запускается после
push. Исторический WebKit trace всё ещё не устанавливает точную первопричину;
устройство и staging не проверялись. [План](../TASKS.md),
[запись проверок](stabilization-progress.md).

## Follow-up — обновление семейных данных после BFCache, `29b1e3a`

После `pagehide` семейный hook отменял запросы, но при BFCache-возврате только
снимал признак загрузки. Он не перечитывал изменившийся в соседней вкладке
семейный контекст или список покупок. Теперь `pageshow.persisted` запускает
новые GET для ранее запрошенного семейного контекста и списка покупок; scope
старых ответов остаётся инвалидированным. Новый регрессионный тест воспроизвёл прежнее
отсутствие запросов и прошёл после исправления.

Проверки `29b1e3a`: `family-session.spec.ts` — 24/24 на Chromium, Firefox и
WebKit (`workers=1`, `retries=0`); unit — 1275/1275; общий, domain-strict и
storage-strict typecheck, production build и `git diff --check` прошли.
Проверка использует синтетическое событие BFCache; реальное устройство, OAuth,
staging и полный P0 lifecycle остаются открытыми. Точный GitHub CI проверяется
на опубликованном HEAD. [Контракт](family-session.md), [план](../TASKS.md).

## Локальный follow-up — обязательный proof и scoped fetch для всех вложений поддержки, `a396a30`

`GET /api/support/attachment` теперь требует полный account/session proof до
проверки тикета и чтения файла; доступ владельца/admin сохраняется после guard.
SupportScreen и AdminScreen скачивают media scoped fetch-запросом, сверяют
Support-Attachment markers и показывают временные Blob URL. Regression cases
покрывают запросы с proof, отказ без proof и marker validation. В изолированном
sandbox прошли API/auth/admin guards и три typecheck. Unit и CI точного SHA ещё
не подтверждены; обновление старых bundles и staging media smoke остаются
открытыми. [Контракт](support-session.md).

К этому исправлению добавлен браузерный сценарий для приватных вложений тикета
и ответа поддержки. Он проверяет парный account/session proof на обоих fetch-
запросах и то, что полученные Blob действительно отображаются как изображения.
Это mock API acceptance; выполнение на точном новом SHA и staging media smoke
ещё ожидаются.

## Локальный follow-up — guarded media загрузка admin-вложений поддержки, `f949842`

После обязательного session proof у `requireAdminRequest` прямые `<img>`,
`<video>` и `<audio>` URL вложений переставали работать: такие элементы не
передают scope headers. AdminScreen теперь скачивает вложения через
`requestAdminResponse`, проверяет `Support-Attachment` markers и показывает
временный Blob URL; API возвращает маркеры и echo исходной сессии. Тесты
покрывают маршрут и transport. В изолированном sandbox прошли API/auth/admin
guards и три typecheck. Unit и CI этого SHA ещё не подтверждены; staging
проверка открытия вложений остаётся открытой. [Контракт](support-session.md).

## Локальный кандидат — обязательный session proof для GDPR export, `4edeb0a`

`GET /api/export` теперь требует полный account/session proof до формирования
пользовательской выгрузки; отсутствующий или неполный proof получает 401 до
запросов к данным. Ответы получают `Export` protocol/guard markers и echo scope;
успешная выгрузка сохраняет `no-store`, `nosniff` и `no-referrer`. Найдены
регрессии для отсутствующей/частичной пары и beta denial. В сетево-отключённом
sandbox прошли API invariants, auth-scope, admin guard и три typecheck. Unit и
точный CI этого SHA ещё не подтверждены; старых внешних клиентов и frontend
вызовов в исходниках не найдено, staging и обновление любых таких клиентов
остаются открытыми. [Контракт](../API_CONTRACTS.md).

## Новый кандидат — обязательный Huawei session proof, `a127bf5`

Status, OAuth start, sync и disconnect требуют парные account/session headers;
запросы без полного proof получают 401 до body и прикладных D1/Huawei вызовов.
OAuth callback проверяет nonce и подписанный user/session state; профиль
остаётся под guarded outbox commit. В sandbox прошли API invariants, admin guard и три
typecheck. Локальный Vitest не стартовал: общий Windows `node_modules` не содержит
Linux Rollup optional binary. Точный PR CI [38703208009](https://github.com/Michael-edel/FitFocus/actions/runs/38703208009)
на `a127bf5` подтвердил guards, unit, typechecks и build; E2E выполнялся при
добавлении теста неполного scope в
[`9782ef0`](https://github.com/Michael-edel/FitFocus/commit/9782ef02d94278ec31878ada3c14878f1d4aa0fa).
Точный CI нового HEAD запускается после push. Старые Settings bundles, настоящий
OAuth, BFCache, устройство и staging требуют отдельной проверки.
[Контракт](huawei-health-session.md).

## Follow-up — обязательный proof для обычного logout, `b2f6938`

`POST /api/logout` больше не отзывает текущую cookie-сессию по unscoped legacy
запросу. Отсутствующий или неполный proof получает 401 до cookie lookup и
revocation; mismatched proof также получает 401, все ответы оставляют cookie
нетронутой. Профильные тесты покрывают missing/partial scope и сохранение
сессии/cookie. В изолированном контейнере прошли API/auth/admin guards и три
typecheck; unit suite и точный CI ждут push. Старые bundles, реальный OAuth и
staging остаются открытыми. [Контракт](account-lifecycle-session.md).

## Follow-up — обязательный proof для admin routes, `90bd734`

Все `/api/admin/*` теперь требуют полного account/session proof через общий
admin guard. Отсутствующая или частичная пара возвращает 401 до D1 role lookup
и admin-session activity; middleware добавляет response markers. Тесты покрывают
оба guard overload и отказ до auth lookup в request/env стиле. В изолированном
контейнере прошли API/auth/admin guards и три typecheck. Предыдущий PR CI
[`38706186324`](https://github.com/Michael-edel/FitFocus/actions/runs/38706186324)
на `01bfa05` остановился на unit: 1263/1264 теста прошли, единственная ошибка
была в legacy request fixture, который helper автоматически сделал scoped.
Исправление [`478fc58`](https://github.com/Michael-edel/FitFocus/commit/478fc58)
явно отправляет в этом тесте запрос без proof; полный CI нового HEAD ожидает push.
Обновление старых admin bundles и staging остаются открытыми.
[Контракт](admin-session.md).

## Follow-up — обязательный proof для `logout_all`, `c778515`

`POST /api/logout_all` отзывает все сессии и теперь требует полный account/session
proof через `requireScopedStateUser`. Отсутствующий или неполный scope отклоняется
до auth lookup, session revocation и `Set-Cookie`; `AdminScreen` уже отправляет
парную пару заголовков. В sandbox прошли API/auth/admin guards и три typecheck.
Точный CI этого HEAD запускается после push; обновление старого AdminScreen bundle
и реальные staging-проверки остаются открытыми. [Контракт](admin-session.md).

## Локальный кандидат — обязательный proof для bootstrap, `84e735c`

`/api/bootstrap` теперь требует парный account/session proof через
`requireScopedStateUser`; старые запросы получают 401 до чтения профиля, state
и features. Текущий login transport уже отправляет scope и проверяет ответ.
Bootstrap-тесты прошли 29/29, полный unit suite — 1256/1256 в 208 файлах;
общий/domain-strict/storage-strict typecheck, API/auth/admin guards,
schema/privacy и production build прошли. CI run `38699271370` проверяет
предыдущий опубликованный SHA `2206120`; новый кандидат ждёт push после его
завершения. Staging и старые bundles остаются открытыми.
[Контракт](bootstrap-hydration.md).

## Локальный кандидат — обязательный proof для state/profile, `3abb374`

`/api/state` GET/PUT/DELETE и `/api/profile` GET/PUT/PATCH требуют парный
account/session proof через `requireScopedStateUser`. Старые запросы без proof
получают 401 до body parsing и прикладных чтений/записей. Текущий `StateSync`
уже передаёт proof в профильный refresh и sender; rollout старых bundles требует
отдельной проверки. Полный unit suite прошёл 1255/1255 в 208 файлах;
typechecks, API/auth/admin guards, schema/privacy и production build прошли.
CI для `3abb374` ещё не запускался: текущий GitHub run проверяет предыдущий
опубликованный SHA. Staging и полный профильный lifecycle остаются открытыми.
[Контракт](../API_CONTRACTS.md).

## Локальный кандидат — обязательный proof для Support feedback, `bc3e7c2`

Пользовательские и административные handlers `/api/support/feedback` теперь
требуют `requireScopedStateUser`. Запросы без proof получают 401 до разбора
тела, admin role lookup и прикладных запросов/записей. Текущие `SupportScreen`
и `adminRequest` уже передают proof через свои transports. Профильные тесты
прошли 34/34, полный unit suite — 1249/1249 в 208 файлах; общий/domain-strict/
storage-strict typecheck, API invariants, auth-scope, admin guards, schema
parity, privacy coverage и production build прошли. PR CI
[38699271370](https://github.com/Michael-edel/FitFocus/actions/runs/38699271370)
на опубликованном tip проверяет этот код: guards/unit/typechecks/build прошли,
E2E выполняется.
Обновление старых bundles и support CRUD на staging остаются открытыми.
[Контракт](support-session.md).

## Локальный кандидат — обязательный proof для mobile token, `a1e79ac`

`POST /api/mobile/token` отклоняет unscoped legacy запрос с 401 до mint bearer
токена. Локально прошли 1244 unit, девять профильных mobile/beta тестов, три
typecheck, API/auth/admin/schema/privacy guards и production build. Точный CI
ожидает push; обновление старого Settings bundle, staging и реальное устройство
остаются открытыми. [Контракт](wearable-sync.md).

## Локальный кандидат — обязательный proof для billing, `28341ed`

Checkout и admin subscription требуют парный session proof; unscoped старые
запросы получают 401 до разбора body и платежных/административных эффектов.
На точном локальном SHA прошли 1244 unit, три typecheck, API/auth/admin/schema/
privacy guards и build. Точный CI ожидает push; rollout старых bundles, staging
и Stripe acceptance остаются открытыми. [Контракт](billing-session.md).

## Локальный кандидат — обязательный proof для достижений, `616f42c`

`GET /api/achievements` и `POST /api/achievements/check` требуют парную
account/session-привязку. Unscoped legacy-запросы получают 401; POST отклоняется
до разбора body. Локально прошли полный unit suite (1242/1242), три typecheck,
API/auth/schema/privacy guards и production build. Точный CI follow-up ожидает
push; старые bundles, staging и реальный BFCache остаются открытыми.
[Контракт](achievement-session.md).

## Локальный кандидат — обязательный proof для AI/items, `7240fec`

`/api/ai` и `/api/weekly_menu/items` требуют парную account/session-привязку
через `requireScopedStateUser`; старые запросы без proof получают 401 до чтения
body и прикладных эффектов. Локально прошли полный unit suite (1240/1240),
общий и два strict typecheck, API/auth/schema/privacy guards, production build и
`git diff --check`. Точный CI этого follow-up ожидает push; старые bundles,
staging rollout и реальная приёмка остаются открытыми.
[Контракт](ai-session-guard.md).

## Локальный кандидат — proof для invite redeem, `55bc09e`

`/api/invite/redeem` теперь требует парные account/session headers через
`requireScopedStateUser`; отсутствующие или неполные заголовки и proof от
прежней сессии дают 401 до чтения body и расходования приглашения. Старые
клиентские сборки без proof нужно обновить для регистрации с invite. Локально прошли 1216 unit-тестов в
208 файлах, typecheck, API invariants и production build. Точный CI этого SHA
ожидает push; staging-регистрация и остальной P0.5 lifecycle остаются открытыми.
[Контракт регистрации](registration-persistence.md).

## Локальный кандидат — logout и удаление аккаунта, `956cf96`

Удаление аккаунта требует совпадающий account/session proof на клиенте и
сервере; старые запросы без proof завершаются 401 до side effects. Обычный
logout перед очисткой состояния проверяет актуальный IDB guard и передаёт scope;
сервер отзывает только совпавшую сессию. Scoped ответы не истекают общую cookie,
чтобы поздний ответ вкладки A не удалил новый вход B. Локально прошли 1215 unit
в 208 файлах, три typecheck, build, auth/API/admin/privacy guards. Точный CI
этого SHA ещё не подтверждён; legacy unscoped logout, остальная P0.5 матрица,
staging и выпуск остаются открытыми. [Контракт](account-lifecycle-session.md).

## Локальный кандидат — session guard админ-панели, `5e163e6`

Коммит [`5e163e6`](https://github.com/Michael-edel/FitFocus/commit/5e163e6cec0506dfad0085adaaa01465bbfd6c99)
привязал административные API-вызовы, support-очередь, `logout_all` и CSV-аудит
к login proof панели. Все запросы используют общий transport, проверяющий
response markers и IDB auth-fence; сервер отклоняет scope от другой сессии до
D1 role lookup и admin-session side effects. Локально прошли 1203 unit-теста /
206 файлов, общий и domain/storage strict typecheck, admin/API/auth guards и
production build. Точный CI этого commit запускается после push.
PR run [38685738198](https://github.com/Michael-edel/FitFocus/actions/runs/38685738198)
проверяет `acb561a`; audit, guards, unit, typechecks и build прошли, E2E шёл
перед новым follow-up и этот run не включает `bb4773b`. Реальный browser/admin
account-switch acceptance, остальные callbacks, общий P0.5 lifecycle, staging
и выпуск остаются открытыми. [Контракт](admin-session.md).

## Локальный кандидат — CSV экспорт личной корзины, `bb4773b`

CSV строится из уже загруженного account-scoped списка, с повторной проверкой
исходной сессии до скачивания. Серверный `/api/shopping/export` также проверяет
переданный proof и отмечает ответ Family guard headers. Локально прошли полный
unit suite — 1207/1207, общий typecheck, auth/API guards, production build и
новый двухвкладочный сценарий 3/3 на Chromium/Firefox/WebKit. Точный CI HEAD с
этим компонентом ожидает push. [Контракт](family-session.md).

## Рабочее дерево — запрет AI proxy без session proof

Коммит `45575d2` удаляет из `callAiProxy` обычный `/api/ai` fallback без proof.
Помощник требует `AiSession`, а отсутствие сессии отклоняется до сети; все
действующие вызовы используют scoped transport. Локально прошли профильный AI
transport — 24/24, полный unit suite — 1188/1188 в 203 файлах, `typecheck`,
auth-scope и production build. Дополнительно профильный Safari reload spec прошёл
8/8 на desktop WebKit, 8/8 на iPhone Safari и 8/8 на iPhone PWA без retries;
первопричина исторического pageerror не установлена.

Полный CI точного SHA `45575d2` завершился success в
[run 38679312640](https://github.com/Michael-edel/FitFocus/actions/runs/38679312640):
audit, guards, 1188 unit / 203 файла, три typecheck, build и rollback/CAS прошли;
E2E отметил 614 passed, 133 skipped и 2 flaky, прошедших retry. Один flaky
устранён в assertion `636d2c7` (локально 7/7 browser/PWA-проектов). Второй
WebKit access-control `pageerror` пока не воспроизведён локально (5/5), но его
первопричина не установлена. Commits `ba973c1` и `636d2c7` ожидают точного CI.

Billing guard Checkout и административной смены тарифа включён в `1b80734`;
его точные локальные проверки и контракт приведены в [журнале](stabilization-progress.md)
и [контракте billing](billing-session.md).

## Кандидат — push session guard, `daec94d`

В коммите `daec94d` ветки `fix/durable-outbox` добавлена привязка push-статуса,
подписки, отключения и тестового уведомления в Settings к свежей account/session
проверке. PWA recovery и `pushsubscriptionchange` используют владельца,
подтверждённого активной IDB-сессией. Добавлены серверные scope checks и
регрессионный сценарий с задержанным status-ответом аккаунта A после входа B.
Контракт: [push session](push-session.md).

Для `daec94d` локально прошли 1180 unit-тестов / 202 файла (включая 41
профильный тест в 5 файлах), общий и domain/storage strict typecheck; полный
`family-callback-account-switch.spec.ts` прошёл 42/42 на
desktop Chromium, Firefox и WebKit без retries и skips. `npm run build`, admin,
API invariants, auth-scope, schema и privacy checks прошли. В рабочем дереве
добавлен native HTTP E2E: событие реального собранного Service Worker отправило
подписку с account/session proof активной IDB-сессии; после logout повторное
событие не вызвало `/api/me` и повторную подписку. Тест прошёл 1/1 в Chromium,
а шесть соседних PWA-регрессий — 6/6 без retries; typecheck прошёл. CI точного
`45575d2` завершился с двумя flaky E2E после retry в
[run 38679312640](https://github.com/Michael-edel/FitFocus/actions/runs/38679312640).
Commits `ba973c1` и `636d2c7` локально проверены, но ожидают точного CI. Это
проверенный локальный кандидат, а не принятый релиз. Старые открытые bundle и
scope guard старых клиентов отдельно не приняты; совместимость старых клиентов
сохраняется. Общий P0.5 и остановка старых writers остаются открытыми. CI
предыдущего baseline `b2d787f` прошёл в
[run 38669030766](https://github.com/Michael-edel/FitFocus/actions/runs/38669030766),
но завершился до коммита `daec94d` и его не проверяет.

## Push recovery после повторного входа — `04b61dd`

Native Service Worker acceptance дополнена сценарием смены server session:
после logout тест перезагружает приложение с новым session id, ждёт обновления
active-session в IndexedDB и отправляет `pushsubscriptionchange` в собранный
`/sw.js`. Запрос подписки использует новый account/session proof; событие до
повторного входа не вызывает `/api/me` и не отправляет данные. Это локальный
HTTP fixture и Chromium, не реальный OAuth, push provider, устройство или
staging. Ветка содержит проверенный commit `04b61dd`; точный CI для него ожидает
push. Общий P0.5 остаётся открытым до staging-приёмки.

## P0.5 — пошаговый рецепт из дневникового фото

Кодовый commit [`71d2ca4`](https://github.com/Michael-edel/FitFocus/commit/71d2ca4)
привязал `getRecipeFromPhoto` к обязательному `AiSession`. Поздний ответ после
смены аккаунта или закрытия исходной записи больше не может изменить дневник,
экран рецепта или локальный usage. Запись рецепта проходит через guarded
`UserStateRepository.updateJson`; конкурентный независимый snapshot сохраняется
как конфликт.

Локально прошли 1173 unit-теста / 201 файл, общий и storage-strict typecheck,
admin guards и production build. Полный account-switch spec на desktop Chromium,
Firefox и WebKit: 44 passed / 4 skipped без retries; отдельный success path
проверен в Chromium. CI для code SHA ожидается после push; остальные AI/family
callbacks, общий P0.5/P0.8 lifecycle и staging остаются открытыми.

## Текущий кандидат — Huawei Health session guard

Кодовый SHA [`455cb01`](https://github.com/Michael-edel/FitFocus/commit/455cb0160ee3c5fa3d8bb2b455f1aae385f7c5ae)
в `fix/durable-outbox` привязал Huawei status, OAuth start/callback, sync и
disconnect к account/session, а возвращённый профиль — к guarded outbox commit.
Локально прошли 1167 unit-тестов, три typecheck, production build и проверки
API/auth/schema/privacy. Выбранные account-switch сценарии, включая поздний
Huawei sync после входа B, прошли 15/15 в desktop Chromium, Firefox и WebKit
без retries (`workers=1`). Первый полный локальный запуск account-switch spec
поймал отдельные timing flakes в соседних сценариях;
после уточнения ожиданий выбранная выборка прошла повторно. Полный PR E2E job
на `455cb01` завершился success.

Полный PR CI на точном SHA [`455cb01`](https://github.com/Michael-edel/FitFocus/actions/runs/38656586334)
завершился success: E2E, unit, audit, schema/privacy/auth/API guards, три
typecheck, build, canonical readers/CAS after rollback и сохранение артефактов
прошли. GitGuardian не обнаружил секретов. Cloudflare Pages preview опубликован
по адресу [fix-durable-outbox.fitfocus.pages.dev](https://fix-durable-outbox.fitfocus.pages.dev);
это не production-релиз. Последний полный проверенный source HEAD теперь
`455cb01`. Huawei OAuth с настоящим
провайдером, устройство, staging и production не проверялись; общий P0.5,
staging и выпуск остаются открытыми. [Контракт](huawei-health-session.md).

После него acceptance-only follow-up [`5d3e4d6`](https://github.com/Michael-edel/FitFocus/commit/5d3e4d664879529dc73c8b3d313bfda7c975b96c)
проверяет задержанный `PATCH /api/family/member` аккаунта A после входа B.
Локально прошёл 3/3 на desktop Chromium, Firefox и WebKit без retries;
typecheck и admin guards прошли. Runtime-код не менялся, полный CI этого commit
ещё не подтверждён. Trace выявил и устранил ложную точку отсчёта в E2E; остальные
callback/lifecycle проверки остаются открытыми.

Предыдущая полная проверка ветки до Huawei session guard была на source HEAD
[`943d4c0`](https://github.com/Michael-edel/FitFocus/commit/943d4c0f658d05150b78a5a41925ea7f8ae03aa8).
Точный PR CI [`38641088114`](https://github.com/Michael-edel/FitFocus/actions/runs/38641088114)
завершился success на merge-ref `75362ae`: 1153 unit-теста / 199 файлов,
587 browser passed / 99 skipped за 30,3 минуты. Audit дал 0 уязвимостей;
schema/privacy/auth/API guards, три typecheck, production build, 23 rollback/CAS
запроса и сохранение rollback-артефакта прошли.
Новый acceptance для pending outbox операции аккаунта A после входа B и возврата
A с новой server session прошёл локально 3/3 в desktop Chromium, Firefox и WebKit
без retries и включён в этот CI. Предыдущий docs-only run `38638704278` отменён
после нового push из-за branch concurrency.
Отдельный reload acceptance для pending операции с сохранением `opId` и
возобновлением под новой server session и logout/login acceptance также прошли
совместно 9/9 в desktop Chromium, Firefox и WebKit без retries. При logout
отправка приостанавливается; после нового входа под свежей server session
возобновляется та же операция с прежним `opId`. Эти E2E вошли в полный CI
`455cb01`, завершившийся success.
Дополнительный same-key acceptance на рабочем дереве поверх `ce6ade0` проверил
две вкладки без Web Locks: пока первый PUT задержан, вторая независимая правка
того же полного JSON-снимка сохраняется как конфликт; после ack первой записи
конфликт остаётся доступным, а сервер получил только первую запись. Локально
прошёл 3/3 в desktop Chromium, Firefox и WebKit без retries; сценарий вошёл в
полный CI `455cb01`, завершившийся success.
Old/new migration acceptance на рабочем дереве поверх `9f8f548` проверяет,
что открытый старый bundle меняет legacy-снимок после его первого импорта:
новый bundle повторно читает источник, сохраняет новую same-key запись как
`independent-snapshot` конфликт и не отправляет её вместо исходной. После
обновления всех клиентов исходная запись подтверждается, изменённая остаётся
доступным конфликтом, а чужая запись остаётся в карантине. Локально 3/3 без
retries в desktop Chromium, Firefox и WebKit (`workers=1`); второй старый write
смоделирован парой localStorage-записей `safeSetItem`, а первый создан через UI.
Этот old/new migration сценарий вошёл в полный CI `455cb01`, завершившийся
success.
Предыдущая проверка `08618e3` успешно покрыла migration smoke и bearer token;
её результаты приведены в [журнале стабилизации](stabilization-progress.md).

PR #93 остаётся draft к `fix/state-generations`; интеграция в `main`, staging и выпуск
не выполнены.

Вопрос и очистка истории сохраняются при паузе отправителя только при
совпадении account, server session и epoch. Сгенерированный ответ AI требует
строгий read guard. [Контракт](ai-council-session.md).

PR #93 направлен в fix/state-generations; в main изменения не влиты.
Проверка local commit при sender pause закрыта CI; общий P0.5/P0.8,
полный lifecycle, staging и выпуск остаются открытыми. Зелёный общий workflow
не заменяет целевую приёмку установленного iPhone PWA.

## P0.5 — AI Совет

Коммит 500d83e связал 14 запросов совета, историю и поздние ответы с login-сессией.
Предыдущий CI на SHA 6305695, run 38613219717, выявил семь E2E-сбоев локальной
очистки истории во время sender pause: строгий guard запрещал запись, хотя пауза
должна останавливать отправку, а не локальное сохранение. Отдельное iPhone PWA
падение family-menu остаётся открытым.

Коммит 32bc410 добавил session-bound local commit для вопроса и очистки истории.
В 92ecaa3 обычные AI repository-записи отделены от local-only методов, а
ce7b60d добавил пропущенные типовые импорты. Точный PR CI прошёл: 1153 unit,
576 browser passed / 95 skipped; один flaky migration test прошёл после retry
([run 38621962929](https://github.com/Michael-edel/FitFocus/actions/runs/38621962929)).
Контракт: [AI Совет](ai-council-session.md). Общий P0.5, P0.8 и выпуск остаются
открытыми.
## P0.8 — устойчивое завершение IndexedDB-транзакции

Код [cae28bd](https://github.com/Michael-edel/FitFocus/commit/cae28bd)
исправляет Firefox-сбой в DurableOutbox.finish. Трассировка показала
TransactionInactiveError: после ожидания Promise.all транзакция могла стать
неактивной до зависимых записей подтверждения. Теперь все чтения ставятся в
очередь заранее, а проверка guard и связанные записи выполняются синхронно в
success-событии последнего чтения, сохраняя атомарность finish.

Локально прошли все 1132 unit-теста в 198 файлах, 37 целевых тестов durable
outbox и базы состояния, общий typecheck и storage-strict typecheck. Два
проблемных Firefox-сценария прошли 20/20 повторов, полный weekly-menu spec —
24/24 на Chromium, Firefox и WebKit. PR CI опубликованного HEAD `6c6feca`
завершился success в
[run 38550243769](https://github.com/Michael-edel/FitFocus/actions/runs/38550243769).
Это закрывает найденную транзакционную причину flaky, но не весь P0.8:
оставшиеся writers, миграция, восстановление конфликтов и полный lifecycle
перечислены в [TASKS](../TASKS.md).

Последующий CI [run 38556748824](https://github.com/Michael-edel/FitFocus/actions/runs/38556748824)
на `8dc7f71` завершился success (1132 unit, 537 browser passed / 83 skipped),
но пометил три flaky. Два Firefox-сценария выявили тот же lifecycle-риск в
`DurableOutbox.write`: чтения завершались, а зависимые записи ставились после
`Promise.all`. Android migration diagnostic показал, что backend recovery
соревновался с открытием Service Worker send-gate после фиксированной паузы.
В коде `8d7aee0` записи `write` выполняются в success-событии последнего чтения;
тест миграции включает API до открытия gate и ждёт фактический барьер.
Локально прошли 1132 unit, три typecheck, целевой Firefox timeout 5/5,
account-switch 3/3, Android migration 5/5 и 27 связанных E2E без retry.
Последующий аудит выявил такой же риск в `claim`. На кодовом SHA `35fceb4`
поиск claim теперь планирует записи в success-событии IDB-чтений, включая
legacy gate/receipt. Для него прошли 1132 unit, общий и storage-strict typecheck,
production build и 18 целевых Firefox/Android E2E без retries. CI для
опубликованного SHA [`35fceb4`](https://github.com/Michael-edel/FitFocus/commit/35fceb467f7928be3f7df57f0f6b3d669f8265dc)
отменён для push-события из-за concurrency
([run 38566246646](https://github.com/Michael-edel/FitFocus/actions/runs/38566246646));
PR run [38566257477](https://github.com/Michael-edel/FitFocus/actions/runs/38566257477)
на том же SHA выполняется. После push документации нужно проверить CI нового
branch HEAD; полная P0.8-приёмка остаётся открытой.

В коде [`f3a9abf`](https://github.com/Michael-edel/FitFocus/commit/f3a9abf796f9b3bedd969efc5f032bd8d4d370cf)
тот же приём распространён на остальные критичные outbox/session readwrite
пути и account cleanup/user-state backup restore. Unit — 1133/1133, три typecheck и build
прошли; шесть связанных Firefox/Android E2E дали 57 passed / 9 skipped.
Workflow [38566637885](https://github.com/Michael-edel/FitFocus/actions/runs/38566637885)
для прежнего docs SHA `933213d` во время локальной проверки оставался на E2E;
он не включает новый код. Проверка точного нового branch HEAD остаётся следующим
критерием. Полный P0.8 lifecycle не завершён.

Последующий кодовый commit [`37dc4b0`](https://github.com/Michael-edel/FitFocus/commit/37dc4b0c26326cb6f862ab7baa945a802a03990b)
переводит readwrite callbacks импорта legacy-очереди на активные IndexedDB
request events. На этой ревизии прошли 94 целевых storage unit tests,
весь набор 1133 unit / 198 файлов, общий/domain-strict/storage-strict typecheck
и production build. Migration E2E прошёл 6/6 последовательных запусков на
desktop Firefox и Android Chrome. Первый совместный прогон двух E2E specs дал
один Firefox timeout; последующий изолированный прогон и повторы миграции были
успешны. Точный CI документирующего HEAD [`152d7d7`](https://github.com/Michael-edel/FitFocus/commit/152d7d729d84d9d86d1c3968911d075df23045d7)
завершился success в [run 38577353585](https://github.com/Michael-edel/FitFocus/actions/runs/38577353585):
540 browser passed / 83 skipped, 1133 unit / 198 файлов, audit без уязвимостей,
guards, три typecheck, build и 23 rollback/CAS-запроса прошли. Артефакты
[browser diagnostics](https://github.com/Michael-edel/FitFocus/actions/runs/38577353585/artifacts/11903083122)
и [rollback](https://github.com/Michael-edel/FitFocus/actions/runs/38577353585/artifacts/11902803403)
сохранены. На кодовом SHA [`38d169c`](https://github.com/Michael-edel/FitFocus/commit/38d169c)
закрыта транзакционная проверка durable backup restore: 1133 unit / 198 файлов,
общий и два strict typecheck, build и 4/4 targeted Firefox/Android browser E2E
прошли локально. Новый полный CI после push ещё не подтверждён; полный P0.8
lifecycle, staging и выпуск остаются открытыми.

## P0.5 — поздний ответ retry объяснения плато

Новый сценарий удерживает ответ retry для аккаунта A, пока соседняя вкладка
входит в аккаунт B. После ответа проверяются profile, локальные values, outbox,
active session, achievement effects и отсутствие старого объяснения в UI.
Целевой тест прошёл на desktop Chromium, Firefox и WebKit; связанные unit
тесты прошли 11/11, `npm run typecheck` прошёл. Первый полный прогон выявил
один timeout в существующем Coach retry для Firefox. После добавления барьера
активной сессии до освобождения ответов Coach прошёл 5/5 повторов, затем полный
callback spec завершился 25 passed / 2 skipped без retries.
Новый тест не входил в CI run 38550243769; staging и весь P0.5 остаются открытыми.

## P0.5 — session guard фотоанализа

Код [`d93ff53`](https://github.com/Michael-edel/FitFocus/commit/d93ff53)
привязывает анализ еды и фото-рецепта к исходной AI-сессии и lifecycle-попытке.
Поздний результат не попадает в другой профиль, дневник/историю, usage,
achievement или черновик рецепта. Успешный путь проверяет сохранение дневника,
истории и usage в аккаунте.

На локальном HEAD `d93ff53` прошли связанные unit-тесты 11/11,
`npm run typecheck` и `git diff --check`. Полный
`ai-callback-account-switch.spec.ts` прошёл 22 сценария, 2 пропущены проектной
конфигурацией, при `workers=1,retries=0`: задержанные ответы фото/рецепта прошли
в Chromium, Firefox и WebKit, успешная запись фото проверена в Chromium. Первый
прогон выявил слишком широкое ожидание из-за независимой записи `weekly_reports`;
проверка теперь ограничена diary/history и полный повтор прошёл без ошибок.

Полный [CI run 38540109329](https://github.com/Michael-edel/FitFocus/actions/runs/38540109329)
для опубликованного HEAD `a9e3096` завершился success: 1132 unit-теста в 198
файлах, 535 E2E passed / 79 skipped, audit без уязвимостей, проверки схемы,
приватности, auth/API, три typecheck, build, rollback и canonical readers/CAS
прошли; rollback-артефакт `11883487207` сохранён. В Firefox E2E два теста
`weekly-menu-durability.spec.ts` были flaky на первой попытке и прошли retry.
Локальные повторы подтвердили intermittent ошибку: в одной диагностической
серии sender остановился на `StateStorageError:STATE_STORAGE_TRANSACTION` до
HTTP, хотя профиль и pending operation остались в IndexedDB. Позднее трассировка
установила точную причину: TransactionInactiveError в DurableOutbox.finish,
когда зависимые IDB-записи выполнялись после асинхронного продолжения уже
неактивной транзакции. Исправление опубликовано в
[cae28bd](https://github.com/Michael-edel/FitFocus/commit/cae28bd) и локально
прошло целевые Firefox-повторы 20/20 и полный weekly-menu spec 24/24 на трёх
движках. Подробности — в разделе P0.8 выше. Причинная связь с изменением
фотоанализа не подтверждена. Staging, OAuth и весь P0.5 остаются открытыми.

## P0.5 — personal weekly-menu account switch

Кодовая ревизия [`562e20d`](https://github.com/Michael-edel/FitFocus/commit/562e20d210695328bcd17309f9836a2e10c68935)
добавляет browser acceptance позднего ответа личной генерации недельного меню.
Когда аккаунт A генерирует меню, а в соседней вкладке входит B, отпущенный ответ
A не меняет профиль/outbox A или B и не запускает achievement. Новый сценарий
прошёл 3/3 на desktop Chromium, Firefox и WebKit; весь изменённый
`ai-callback-account-switch.spec.ts` прошёл 15/15 при `workers=1,retries=0`.
`npm run typecheck`, admin guards и `git diff --check` прошли. Порог ожидания
отложенного ответа в тестах согласован с 12-секундным timeout session transport;
повтор coach WebKit после правки прошёл.

Полный [CI run 38531646756](https://github.com/Michael-edel/FitFocus/actions/runs/38531646756)
для этой ревизии завершился success: audit, schema/privacy/auth/API checks,
unit, typechecks, build, E2E и canonical readers/CAS after server rollback прошли.
Rollback-артефакт сохранён как `11879443791`. Другие AI/family callbacks,
общий lifecycle, staging и выпуск остаются открытыми.

Предыдущий полный CI ниже относится к `9bdeb47`; сверка формата
legacy-нормализатора отдельно зафиксирована на
[`48cf797`](https://github.com/Michael-edel/FitFocus/commit/48cf797b2b08cd4b62bdf59c265c4d85a4db863f)
в [контракте миграции](legacy-migration.md). Эти результаты относятся к своим
ревизиям и не заменяют проверки текущей кодовой ветки.

Предыдущий завершённый полный CI проверил SHA
[`9bdeb47`](https://github.com/Michael-edel/FitFocus/commit/9bdeb47dfd21c5e5d5366bb5fe47f8e5862cda11)
([run 38459458051](https://github.com/Michael-edel/FitFocus/actions/runs/38459458051))
и завершился success. Unit прошли во всех 198 файлах; Playwright сообщил 501
passed, 29 skipped и два flaky-теста, прошедших retry. Rollback/CAS job прошёл,
артефакт сохранён в CI как `11847145964`.

В Android PWA Chrome тест quota fault увидел фоновый `WEEKLY_AI_REPORT_FAILED`;
в iPhone PWA после reload появился WebKit access-control warning для
`/api/profile`. Тестовый follow-up [`7753d87`](https://github.com/Michael-edel/FitFocus/commit/7753d87fe99a07b7fa555dac5ab2a5c487d44d54)
добавил барьер записи недельного отчёта перед fault injection и ожидание
завершённого 503-ответа перед reload. После этого целевые повторы прошли 10/10
на каждом проекте; полные затронутые specs прошли 10/10 на Android PWA Chrome
и 8/8 на iPhone PWA; `npm run typecheck` прошёл. Полный CI run
[38466153712](https://github.com/Michael-edel/FitFocus/actions/runs/38466153712)
для кодовой ревизии [`a99ab7b`](https://github.com/Michael-edel/FitFocus/commit/a99ab7beea367df76154faa53747aed2aa473d98)
отменён после отправки следующего документационного коммита. Устранение flaky
подтверждено локальными повторами, но не полным CI этого follow-up. Последняя
проверка опубликованного HEAD `a9e3096` приведена выше; новые коммиты проверяйте
по [checks PR #93](https://github.com/Michael-edel/FitFocus/pull/93/checks).
Cloudflare preview SHA `a99ab7b` успешен; это не production-релиз.

## P0.5 — поздние ответы и личная корзина, локальная проверка

Код [`b56544e`](https://github.com/Michael-edel/FitFocus/commit/b56544e)
передаёт `ShoppingListCard` исходный login guard, защищает GET/PATCH свежим
account/session proof и отделяет React/localStorage состояние по аккаунту и
неделе. Шесть новых account-switch сценариев проверяют personal-list GET/PATCH,
family join/create, семейный контекст и семейный shopping GET: устаревшие данные
A не появляются после входа B, поздние мутации не очищают ввод, не запускают
повторную загрузку семьи или achievement; семейный список B остаётся своим.

Весь `e2e/family-callback-account-switch.spec.ts` прошёл 30/30 на desktop
Chromium, Firefox и WebKit; шесть новых сценариев прошли 18/18 без retries.
`npm run typecheck` и 25 связанных API unit-тестов прошли. Это локальная
проверка: полный workflow нового HEAD и остальные callbacks/lifecycle ещё
открыты. Актуальный статус CI смотрите на [странице checks PR #93](https://github.com/Michael-edel/FitFocus/pull/93/checks).

Предыдущий полный CI на SHA
[`92a5be2`](https://github.com/Michael-edel/FitFocus/commit/92a5be2115f1cf9cea4685a10bbba4e9bc051d0f)
([run 38444933538](https://github.com/Michael-edel/FitFocus/actions/runs/38444933538))
исправил последовательные чтения из одной IndexedDB-транзакции: независимые
запросы ставятся в очередь до первого `await`, а parent/head операции
выбираются из одного индексного снимка. E2E-диагностика сохраняет вложенную
причину `Error.cause`.

Тот предыдущий CI `92a5be2` завершился success: 1115 unit-тестов / 198 файлов,
484 E2E passed / 25 skipped, audit без известных уязвимостей,
schema/privacy/auth/API guards, три typecheck, build и HTTP/D1 rollback-проверка
на 23 запросах прошли. Два E2E были flaky и прошли retry: settings durability
в desktop Chromium прочитал статус `sending` вместо ожидаемого `pending`, а
family-menu recovery в desktop WebKit обнаружил access-control warning.
Изолированные повторы обоих сценариев прошли 5/5; первопричина CI нестабильности
не установлена. Это не подтверждает её устранение.

В полном CI один WebKit PWA update тест был flaky: кнопка обновления отсутствовала
в первой попытке, retry прошёл. Локальный повтор этого сценария прошёл 3/3 при
`retries=0`; причина не установлена и пока не воспроизведена. Если сбой повторится,
следующий шаг — сохранить подробный SW/registration snapshot в момент отсутствия
уведомления. P0.8 остаётся открытым до полной lifecycle-приёмки. Для P0.5 тесты
позднего ответа coach/plateau и смены аккаунта добавлены в `9bc98ee` и локально
прошли 6/6 на desktop Chromium, Firefox и WebKit. Точный [CI run 38410002498](https://github.com/Michael-edel/FitFocus/actions/runs/38410002498)
завершился success. Коммиты [`f9c8425`](https://github.com/Michael-edel/FitFocus/commit/f9c8425272804b0bf9fc5963bcfb015e2926e469) и
[`bca2eda`](https://github.com/Michael-edel/FitFocus/commit/bca2edaf8c4bee1f465dfc3cb6bfabaa08960ea5) добавили delayed family invite и AI-menu account-switch E2E; каждый прошёл 3/3 на desktop Chromium, Firefox и WebKit. Полный CI для `b66dcb4` прошёл; оба сценария также входят в проверенный полный HEAD `9bdeb47`.
PR #93 остаётся draft и не слит в `main`.

Следующая family mutation поправка закоммичена на текущей ветке как
[`2bbec11`](https://github.com/Michael-edel/FitFocus/commit/2bbec1143bb850cbf73bf0e2820d64be9d89db10): invite/member используют явную
целевую семью и `familySync.target`, а UI не принимает поздний invite после
переключения семьи тем же аккаунтом. Локально прошли 1128 unit / 198 файлов,
27 family E2E, 7 capability E2E-проектов, typecheck/guards/schema/privacy/audit/build
и 23 HTTP rollback/CAS запроса. Изменение включено в успешный полный CI
`9bdeb47` ([run 38459458051](https://github.com/Michael-edel/FitFocus/actions/runs/38459458051));
в запуске отмечены два других flaky-сценария, описанных выше. Staging и реальные
старые/новые bundles для family target остаются открытыми.

Локальная приёмка personal-plan retry после смены аккаунта добавлена в
`e2e/ai-callback-account-switch.spec.ts`: поздний ответ A не меняет профиль,
значения, outbox или success-effects A и B. Она прошла 3/3 на desktop Chromium,
Firefox и WebKit; `npm run typecheck` прошёл. Кодовый commit `eae1ce1` и MD
обновления опубликованы в `c48ce1b`; точный CI run `38429247879` завершился
success с одним flaky в отдельном legacy-migration сценарии. Follow-up `d5341a0`
входит в проверенный HEAD `92a5be2`; CI `38435173387` и `38440675173` прошли
success с тремя flaky каждый, а `38444933538` завершился success с двумя
другими flaky. Их локальные повторы прошли, но причина нестабильности не
установлена. Новый E2E для позднего achievement callback добавлен в
[`b44d46e`](https://github.com/Michael-edel/FitFocus/commit/b44d46eb78255b4b5da0fcbb58cd442e0b2d2eb3): при входе B в соседней вкладке тест отпускает положительный
ответ A со старым scope и проверяет отсутствие unlock в обеих сессиях. Локально
прошло 7/7 browser/PWA-профилей с `retries=0`, общий typecheck прошёл; изменение
включено в успешный полный CI `9bdeb47` ([run 38459458051](https://github.com/Michael-edel/FitFocus/actions/runs/38459458051)). Предыдущий run
`38425515018` для `c6ebbdc` отменён concurrency после push нового HEAD.

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
После этой ревизии achievement HTTP защищён отдельным `57da2cf`. Позднее
личные покупки переведены на profile CAS, а семейное меню — на family/week CAS
и durable `familyMenu` outbox. Остальные AI/report/retry/family callbacks,
staging и общий lifecycle остаются открытыми; весь P0.5 не закрыт.

Последний локальный шаг P0.5 — [`2866985`](https://github.com/Michael-edel/FitFocus/commit/2866985267adb3b9f36c40c28fe400e3696cee57): все family и shopping
HTTP routes требуют парный account/session proof до чтения body и D1-эффектов.
Локально прошли 1234 unit-теста в 208 файлах, typecheck, API/auth guards,
production build и diff check. Сборки без proof получают 401. CI этого SHA,
staging, rollout и полный family lifecycle ещё не подтверждены.

Следующий локальный шаг P0.5 — [`1ac44fb`](https://github.com/Michael-edel/FitFocus/commit/1ac44fb0a821a44029d1265c49f0a5a72eac160a): все четыре Push API требуют парный
account/session proof; unscoped-запросы отклоняются до body, D1 и доставки.
Прошли 1238 unit-тестов, три typecheck, API/auth/schema/privacy guards,
production build и целевые Push E2E: 4 passed / 2 штатно skipped. Полный CI
этого SHA и staging/provider-проверки ещё не подтверждены.

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
