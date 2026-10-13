# Стабилизация: проверяемые изменения

## Предыдущий компонент — session guard недельного AI-отчёта, 13.10.2026

Генерация недельного AI-отчёта и её retry используют свежую account/session
привязку и lifetime guard. Сохранение проходит через проверяемый durable
commit в IndexedDB outbox; поздний ответ после logout не создаёт отчёт или
операцию синхронизации. Добавлен browser spec для успешного сохранения и
запоздавшего ответа.

Профильные unit-тесты прошли: 24 проверки в четырёх файлах; полный unit-набор —
1095 тестов / 197 файлов. Общий, `domain-strict` и `storage-strict` typecheck
и admin guards прошли. Новый browser spec прошёл 14/14 на семи проектах,
`workers=1/retries=0`; production build прошёл. GitHub CI для `0b7062d`
завершился ошибкой E2E в [run 38357547143](https://github.com/Michael-edel/FitFocus/actions/runs/38357547143);
В логе 343 failed из 476 E2E после успешных audit, schema/privacy/auth/API
checks, unit, трёх typecheck и build. Причина — неполные AI-capabilities в
mock /api/me и штатные auth/session отказы, записанные как console errors.
Рабочая копия обновляет fixtures и классификацию ожидаемой отмены. Локально
прошли полный unit-набор 1095/197, общий typecheck и 49/49 связанных E2E в desktop Chromium.
Полный E2E и CI нового SHA ещё не запускались. Остальные AI
retry, family callbacks, staging и общая приёмка P0.5 остаются открытыми.
[Контракт](weekly-ai-report-session.md); [список задач](../TASKS.md).

## P0.8 — browser acceptance recovery UI, `4e2ccb7`, 13.10.2026

Кодовый коммит [`4e2ccb7`](https://github.com/Michael-edel/FitFocus/commit/4e2ccb769d9e325abdfd3abf105f805f86520ac5)
добавляет E2E-проверки действий восстановления для state/settings, profile и
familyMenu. Покрыты failed → retry → ack, keep-latest-local на подтверждённой
серверной версии, accept-server после явного предупреждения и отмена принятия
с сохранением конфликта. Family/profile fixtures теперь позволяют продолжить
после конфликта и проверяют правильную version-base и сохранённый локальный или
серверный payload.

Локально основные три изменённых E2E-файла прошли 189/189 на семи browser/PWA
проектах без retries. Затем добавлен multi-edit сценарий; обновлённый
`storage-durability.spec.ts` прошёл 70/70. Совокупно по трём файлам подтверждены
196 проверок. `npm run test:unit` дал 1092 теста / 197 файлов; общий,
domain-strict и storage-strict typecheck, admin guards и `git diff --check`
прошли. Новый multi-edit тест не включён в SHA `4e2ccb7`. Полный
[CI run 38352095311](https://github.com/Michael-edel/FitFocus/actions/runs/38352095311)
на `4e2ccb7` завершился success: 1092 unit / 197 файлов, 446 browser passed /
9 skipped за 23,4 минуты, audit без уязвимостей, три typecheck, build и 23
rollback-запроса. [Артефакт](https://github.com/Michael-edel/FitFocus/actions/runs/38352095311/artifacts/11791744552)
сохранён. Последующая ревизия [`fe0b528`](https://github.com/Michael-edel/FitFocus/commit/fe0b5287b533a4a725d83b5ac365ba37a72588e6)
включила multi-edit сценарий. Точный [CI run 38354517668](https://github.com/Michael-edel/FitFocus/actions/runs/38354517668)
завершился success: 1092 unit / 197 файлов, 453 browser passed / 9 skipped,
audit без уязвимостей, три typecheck, build и rollback-проверка прошли. Staging,
merge и выпуск не выполнялись; прочие callbacks и lifecycle P0.8 остаются открытыми.

## P0.8 — подавление legacy-импорта после удаления аккаунта

Дата: 13.10.2026. Ветка: `fix/durable-outbox`; кодовый коммит
[`c7700eb`](https://github.com/Michael-edel/FitFocus/commit/c7700eb0a6800b535c1111f9410803a2051f7a2e)
опубликован; точный [CI run 38340805337](https://github.com/Michael-edel/FitFocus/actions/runs/38340805337)
на документирующем SHA `57e0a93` завершился success.

Account cleanup пишет в IndexedDB tombstone с SHA-256 account ID и отзывает
старый migration send gate. При повторном входе importer проверяет tombstone
в той же транзакции, где иначе создал бы операцию, и фиксирует fingerprint в
snapshot как обработанный без новой outbox/ledger/quarantine-копии payload.
Sender повторно проверяет tombstone при claim и finish.
Backup restore пропускает account-owned строки из старого файла, если tombstone
есть в текущей базе или в backup. Исходный legacy source и snapshots не меняются.

Локальная проверка: 1082 unit-теста / 197 файлов; профильные migration/cleanup/
backup-тесты — 75; общий, `domain-strict` и `storage-strict` typecheck,
production build и `git diff --check` прошли. Legacy migration smoke прошёл
7/7 browser/device projects без retries. CI подтвердил 1082 unit / 197 файлов,
390 browser passed / 9 skipped, audit без уязвимостей, guards, три typecheck,
build и rollback-check (23 HTTP/D1-запроса). Merge, staging и выпуск ещё не
подтверждены. Payload в общем legacy source/snapshot остаётся; tombstone
обеспечивает локальное подавление, а не физическое стирание или серверную
синхронизацию.

## P0.1 — зависимости и ограниченная отправка push

Дата: 09.10.2026. База изменения: GitHub main `c939ae6`.
План: [TASKS на согласованной ревизии документации](https://github.com/Michael-edel/FitFocus/blob/003307e74e4e630eb4f35aa0c0b0eb4dfd0fe1b4/TASKS.md).

Обновлены уязвимые зависимости и lockfile. Удалена цепочка braces,
требовавшая Tailwind 3: используется Tailwind 4.3.3 с PostCSS-плагином
и явной загрузкой существующей конфигурации. Vitest обновлён до 4.1.11.
`npm ci` и `npm audit` подтверждают 0 известных уязвимостей на дату проверки.

Из интеграционной ветки выделены общий `fetchWithTimeout` и push deadline.
Push использует этот помощник, сохраняет HTTP/network ошибки и отменяет
зависший запрос. Проверка API проверяет подключение помощника, а поведение
проверяется реальной цепочкой Web Crypto → push sender → fetch.
Отдельные тесты проверяют отмену вызывающей стороны и очистку таймера/слушателя.
Временное удаление передачи signal заставило регрессионный тест упасть;
исправный код восстановлен до общего прогона.

В CI добавлены push-события для `fix/**` и отмена устаревших запусков.
Перед unit-тестами генерируются сведения о сборке. Browser mocks исправлены:
неподдерживаемый PushManager удаляется, service worker mocks поддерживают события.
Недельный AI-отчёт получает корректный mock text; push-сценарий проверяет
отсутствие ошибок консоли и необработанных JavaScript-исключений.
Mock service worker применяется и в Safari без PushManager, чтобы запросы
не обходили подстановки API. Отдельный PWA shell тест сохраняет реальную
регистрацию service worker.

Локальные результаты:

- 62 unit-файла, 258 тестов — passed;
- API/auth/admin guards, schema parity и privacy coverage — passed;
- общая, domain-strict и storage-strict типизация — passed;
- production build — passed;
- Playwright: 18 passed, 3 явно предусмотренных skip, 7 browser/device projects.
- После уточнения AI mock повторены 7 push-сценариев с проверкой консоли.
- Дополнительно просмотрены desktop 1440×1000 и Pixel 7: настройки открылись,
  тестовый push отобразил подтверждение, ошибок консоли/JavaScript нет.

Сценарии браузера: загрузка PWA → значимый экран; регистрация → AI-план;
настройки → тест push → отображение подтверждения. API и push в этих тестах
подменены: результат не доказывает реальную доставку push, OAuth или работу D1.
Browser plugin not available: использован существующий Playwright-процесс.
В логах закрытия E2E-контекстов замечены фоновые proxy ECONNREFUSED для API
без локального backend; это не считается проверкой реального backend.

GitHub CI нужно оценивать на точном HEAD PR. Исправление устаревшей
проверки из PR #90 должно быть сохранено при интеграции той ветки.
P0.2–P0.9 этим изменением не закрываются.

### Уточнения после ревью

Проверка ошибочного push-ответа теперь выполняется внутри срока того же
запроса: заголовки 503 с зависшим body дают PUSH_REQUEST_TIMEOUT.
Прочитав максимум 1024 байта диагностики, клиент отменяет оставшееся тело.
Два дополнительных unit-теста проверяют оба пути; итог — 260 unit-тестов.

Для существующих outline-none добавлено совместимое прозрачное outline,
сохраняющее видимый фокус в forced-colors после обновления Tailwind.
Регрессионный браузерный тест проверяет переход клавишей Tab к числовому
полю регистрации и фактический outline в desktop Chromium. Он прошёл;
в других проектах этот специфичный тест явно пропускается.

CI на `1363ec7` прошёл полностью. После этих уточнений требуется новый
прогон на HEAD; прошлый зелёный запуск не подменяет его.

### Перенос в интеграционную ветку

На `e35cbf6` изменения перенесены в код переработки с сохранением всех
API-инвариантов выделенных use cases и fake-indexeddb. Устаревшее ожидание
`signal: controller.signal` внутри push.ts заменено проверкой подключения
помощника. 162 unit-файла / 498 тестов прошли; три проверки типов,
API/auth/admin/schema/privacy и production build прошли. Playwright:
19 passed / 9 explicit skips; шесть новых skips относятся к Chromium-only
forced-colors тесту, ещё три — к ранее ограниченному onboarding smoke.
CI и слияние в GitHub main оцениваются отдельно; P0.8 ещё не реализован.

Последующая проверка GitHub: [CI на 4c16088 в PR #92](https://github.com/Michael-edel/FitFocus/actions/runs/37914508279)
завершился success. Исправление пока не интегрировано в защищённую main;
P0.1 остаётся открытым по этому условию, а не из-за отсутствия зелёного CI ветки.

## P0.8 — транзакционный фундамент в PR #93

Дата: 09.10.2026. Ветка `fix/durable-outbox`, база — PR #90.
[Черновой PR #93](https://github.com/Michael-edel/FitFocus/pull/93).
Нормализатор на `149e4d4` прошёл 62 unit-теста, но первый CI остановился
на TS2339 в тестовом помощнике. После явной проверки `ok === false`
на `f32c5ad19768ea3e8962195d83bc69e09afba547` прошли все три режима typecheck
и [GitHub CI](https://github.com/Michael-edel/FitFocus/actions/runs/37917864872).

Добавлен `storage/stateDatabase.ts`: схема v2 существующей базы, сохранение
values, новые outbox/migration/meta stores, единое соединение, blocked,
versionchange, повтор открытия после отказа и явный результат транзакции.
`indexedUserState.ts` использует новый менеджер.

`storage/durableOutbox.ts` предоставляет атомарную запись value/операции,
сохранение независимого снимка как конфликта, accountId/writerId, явный parent,
claim/lease и транзакционный finish. Поздняя попытка, смена аккаунта/сессии
и изменённая ревизия/payload не дают подтвердить новую операцию. Неподтверждённый
delete остаётся delete. Явный владелец ключа сохраняется и после удаления value.

Локально на исполняемом коде этого этапа: 165 unit-файлов, 590 тестов — passed;
общий и storage-strict typecheck — passed. Domain-strict, API/auth/admin,
schema/privacy и production build прошли перед финальным уточнением менеджера;
их окончательный результат на новом HEAD проверяется обязательным CI.
30 новых unit-проверок покрывают новый менеджер и очередь. Quota/abort
проверены внесённым отказом fake IndexedDB; это не реальный тест заполнения
браузерного хранилища. Конкуренция проверена отдельными IDB-соединениями,
а не старым и новым browser bundle.

Существующий UserStateRepository и HTTP sender ещё используют прежнюю очередь.
Миграционные stores созданы, но импортера, карантина с данными и финальных
markers пока нет. Остаются auth/hydration и UI ошибок, экспорт/очистка новых
данных, browser lifecycle и серверный P0.7. API finish требует подтверждённую
возрастающую версию; текущий DELETE такой версии не возвращает, и клиент
не должен выдумывать её. P0.2–P0.9 этим этапом не закрываются.

## P0.8 — возобновляемый компонент legacy-импорта

Дата: 09.10.2026. Код и журнал поставляются одним изменением
[PR #93](https://github.com/Michael-edel/FitFocus/pull/93), база — PR #90.
Результат GitHub CI проверяется отдельно на точном HEAD после push.

Добавлен LegacyQueueMigration: атомарные операция/карантин, ledger и прогресс,
стабильная идентификация, подтверждённые владельцы, совместный запуск одного
снимка и сохранение точных источников. Старые необработанные снимки также
восстанавливаются, если legacy-ключ изменился после abort. Финальный audit
проверяет backing operation/ack и карантин, не доверяя одному processed marker.
Claim/finish проверяют разрешение миграции и ledger; ack записывает receipt
атомарно с удалением outbox-операции. Исходный ключ не изменяется.

Новые тесты сначала воспроизвели 11 дефектов первоначальной реализации:
конкурентное замещение run, ложный completed, неполное подтверждение,
смену payload, оставшееся разрешение при отказе чтения, повтор операции при
уточнении владельца, размножение карантина и потерю приоритета hash collision.
Исправления проверены; добавлены сценарии старых необработанных снимков.

Локально: 166 unit-файлов / 649 тестов, все три режима типизации,
API/auth/admin/schema/privacy и production build — passed. Новый файл
импортера содержит 59 проверок. Fake-IDB отказ не доказывает реальную quota,
а отдельные соединения не заменяют старый/новый browser bundle.

Runtime не переключён: UserStateRepository/HTTP, подтверждение владельца
через auth, остановка старых writers и UI/экспорт/очистка остаются задачами.
writersStopped — проверяемое предусловие будущей интеграции, не автоматическое
обнаружение старых вкладок. P0.8 и весь P0 остаются открытыми.
[Контракт компонента](legacy-migration.md).

## P0.7 — серверные поколения state

Дата: 09.10.2026. Ветка `fix/state-generations`, база PR #90 (`cc880d9`).
Код и этот журнал входят в одно изменение; GitHub CI проверяется на его
точном HEAD после push. [Контракт и условия выпуска](state-generations.md).

Добавлена additive-миграция 0019 для user_kv.deleted_at. DELETE очищает
payload, сохраняет поколение и возвращает версию своей мутации. PUT может
восстановить tombstone по совпадающей версии. CAS и ack используют один
условный statement с RETURNING; конфликт отклоняет весь пакет.
Безусловный DELETE0 существующего ключа запрещён, безопасные числовые версии
не переполняются, до 32 элементов укладываются в лимит параметров D1.

Чтение tombstones требует includeDeleted=1 и подтверждения state protocol 2;
прежний GET содержит только живые записи. Экспорт сохраняет метаданные
поколения, legacy-перенос не затирает существующие целевые ключи,
hard delete физически очищает также tombstones выбранного аккаунта.
Обновлён DB_MIGRATION_VERSION; это выявила проверка release contract.

Три новые регрессии сначала воспроизвели физическую потерю поколения,
безусловное удаление новой записи и ложный ack отсутствующей положительной
версии. После исправления локально прошли:

- 163 unit-файла / 532 теста; 34 новых проверки относительно базы PR #90;
- три режима typecheck, API/auth/admin guards;
- schema parity: 21 миграция / 30 таблиц; privacy: 27 таблиц;
- npm audit: 0 известных уязвимостей на дату проверки;
- production build.

В Wrangler 4.149.0 применены 21 миграция к отдельной локальной D1; повтор
сообщил «No migrations to apply». Worker с реальными Pages Functions
прошёл 17 HTTP-запросов: delete/recreate/stale CAS, tombstone GET,
конкурентные writers (один успех и один 409), 32-key batch, отклонение
частичного пакета, неподдерживаемые версии и старый DELETE0.
Использованы только синтетические локальные пользователь и сессия;
удалённая D1 не изменялась. Локальный сервер после smoke остановлен.

Это не staging и не проверка совместимого нового клиента. Прежний sender
не поддерживает весь контракт; необходимы его перевод, writer barrier,
обработка старых поколений и отдельная приёмка порядка выпуска.
P0.7, main/deploy и общий P0 остаются открытыми.

## P0.8 — repository и загрузка пользовательских данных

Дата: 09.10.2026. Ветка `fix/durable-outbox`, draft PR #93. Серверный
PR #94 объединён коммитом `93f90c0`; зависимость — #90 → #94 → #93.
Этот журнал поставляется вместе с кодом; GitHub CI проверяется после push
на точном HEAD. [Контракт и оставшиеся пути](runtime-state.md).

Шесть ключей UserStateRepository — diary, history, favorite_recipes,
weekly_reports, last_coach_card и settings — пишут value и отдельное намерение
одной IDB-транзакцией. Ошибка commit остаётся отказом. Редактор использует
наблюдавшуюся ревизию; устаревшая независимая правка сохраняется конфликтом,
а продолжение собственного подтверждённого parent проверяется по его личности.
Raw write/remove не затирает ключ с durable-владельцем.

Hydration protocol 2 применяет значение/отсутствие с проверкой локальной
ревизии, поколения и отсутствия неподтверждённых операций в транзакции.
При входе UI получает тот же редактор, который прочитал снимок. Настройки
асинхронно читаются из IDB без первоначальной записи defaults, недельный
отчёт ожидает commit. Ошибка восстановления backup больше не выдаётся за
успех при отклонённой raw-записи; новая проверка изолирует IDB каждого теста.

UI показывает ошибку, blocked, конфликт и ожидание на desktop и mobile.
Успех profile не превращает известную pending-очередь или локальную ошибку
в Cloud: saved. Отдельный успешный commit не скрывает сохранённый конфликт.

Локальные результаты исполняемого кода на `cfcc31b`; последующее уточнение
Markdown не меняет этот снимок реализации:

- 168 unit-файлов / 697 тестов — passed;
- три режима typecheck — passed;
- API/auth/admin guards, schema parity (21 миграция / 30 таблиц), privacy
  (27 таблиц) — passed;
- npm audit — 0 известных уязвимостей на дату проверки;
- production build и Playwright — 33 passed / 9 явных skips;
- новые 14 browser cases: смена темы → IDB/outbox → reload и quota-отказ
  → видимая ошибка → значения/намерения не изменились; все 7 проектов прошли;
- просмотрены desktop Chromium и Android Chrome screenshots: осмысленный
  экран настроек, видимая ошибка, desktop Cloud: error, контент доступен.

Среда браузерной проверки: preview `http://127.0.0.1:4173`, Chromium
1280×720, Firefox, WebKit, Android Pixel 7 Chrome/PWA и iPhone 14 Safari/PWA.
Browser plugin not available: использован проектный Playwright. В новых
сценариях нет pageerror/console error. Девять skips принадлежат прежним
ограничениям onboarding и Chromium-only forced-colors. При закрытии контекстов
есть proxy ECONNREFUSED к API без локального backend; API замокан, результат
не подтверждает staging, настоящий OAuth или клиент-серверную отправку.

Fake-IDB и внесённый браузерный quota-отказ не доказывают заполнение диска.
Артефакты тестов сохранены вне Git; скриншоты не содержат реальных данных.
Двух сборок на одном origin, общей координации auth, остальных writers,
HTTP sender, runtime legacy-импорта с реальным барьером, повторов/разрешения
в UI и полного экспорта/очистки ещё нет. Импорт backup не атомарен между
всеми хранилищами. Эта draft-ветка ещё не готова к выпуску; P0.8 открыт.

## P0.8 — отправка шести ключей и проверка серверной сессии

Дата: 09.10.2026. Ветка `fix/durable-outbox`, draft PR #93, база `dc0c0fc`.
Исполняемый код этого этапа —
[`2a72801`](https://github.com/Michael-edel/FitFocus/commit/2a728011c1639a600d566528d3030d7906741d4c).
Предыдущий совместный
[CI на dc0c0fc](https://github.com/Michael-edel/FitFocus/actions/runs/37938429410)
прошёл с 697 unit-тестами и 33 browser cases; он не подменяет проверку нового HEAD.
Контракт отправителя и оставшаяся работа: [state sender](state-sender.md).

Шесть ключей repository подключены к HTTP через транзакционные claim/finish.
Свежий `/api/me` подтверждает account, доступ и capability protocol 2 / guard 1.
Публичная SHA-256-привязка к серверной сессии не раскрывает raw sid.
Сервер проверяет ожидаемые account/session перед чтением и записью state;
смена cookie после `/me` возвращает 401 без изменения чужих данных.
Общий IDB auth-fence отклоняет запоздалое подтверждение входа. Вторая вкладка
с той же подтверждённой сессией использует общий epoch, а logout инвалидирует его.

Ack принимается только со своей реальной версией и проверенным scope/key/exists.
409 сохраняет исходное намерение и проверенный server snapshot; 401 и отказ
доступа приостанавливают отправку, сохраняя возможность новых локальных правок.
Временные HTTP/network ошибки получают ограниченные повторы с backoff,
Retry-After и deadline, включающим body. Неповторяемая ошибка остаётся failed.
UI различает конфликт, ошибку отправки, отказ локального commit и паузу.
Неизменный результат фонового чтения очереди не вызывает повторную отрисовку.

Необработанный legacy-источник временно останавливает новую отправку,
не удаляя источник и новые IDB-операции. Браузерный прогон обнаружил отсутствие
возобновления после опустошения старой очереди; исправление требует нового
`/me` перед продолжением и покрыто регрессией. При визуальной проверке также
исправлен слишком светлый текст уведомления на светлой теме; фактический
контраст уведомления проверяется с порогом 4.5:1.

Локальные результаты итогового исполняемого кода:

- 170 unit-файлов / 734 теста — passed; 31 новый тест sender и 6 session guard;
- три режима typecheck, API/auth/admin guards — passed; общая и storage-strict
  проверки повторены вместе со всеми 734 тестами после последнего изменения;
- schema parity: 21 миграция / 30 таблиц; privacy: 27 таблиц — passed;
- npm audit: 0 известных уязвимостей на дату проверки; production build — passed;
- полный браузерный прогон: 54 passed / 9 прежних явных skips;
- после исправления контраста повторены все 35 storage browser cases:
  35 passed, без skips; окончательный полный CI проверяется на новом HEAD.

Среда: preview `http://127.0.0.1:4173`, desktop Chromium 1280×720, Firefox,
WebKit, Android Pixel 7 Chrome/PWA и iPhone 14 Safari/PWA. Browser plugin
not available: использован проектный Playwright. Проверены URL/название,
значимый экран без framework overlay, смена темы → подтверждение → reload,
409 → сохранённый конфликт → reload и две вкладки без Web Locks.
Новых pageerror/console errors нет, кроме ожидаемой сетевой диагностики 409
в конфликтном сценарии. Итоговые desktop/Android screenshots просмотрены:
уведомление читается и не перекрывает настройки. Скриншоты и отчёты вне Git.

Дополнительно реальный локальный Worker/D1 прошёл 12 HTTP-запросов с двумя
синтетическими сессиями: `/me`, смена cookie/account, отказ GET/PUT/DELETE
при неверной привязке, ack, tombstone, повторное создание и совместимый GET
старого клиента. Удалённая D1 не изменялась; локальный Worker остановлен.
Это отдельная HTTP-проверка, а не настоящий OAuth или staging.

Остаются остальные writers/profile, полный auth/bootstrap/lifecycle,
runtime-импорт с доказанным владельцем и реальный барьер старых writers,
UI повтора/разрешения, атомарный backup, экспорт/очистка всех stores и staging.
Временная проверка localStorage не останавливает старую вкладку и не исключает
её гонки. Старые/новые сборки на одном origin и реальное заполнение диска
ещё не проверены. PR #93 остаётся draft, P0.8 и приёмка выпуска открыты.

### Проверка CI и уточнение браузерного сервера

[CI на 2a72801](https://github.com/Michael-edel/FitFocus/actions/runs/37944560283)
завершился success: 734 unit-теста, все typechecks, guards, audit, schema/privacy
и build прошли. Браузерный итог — 53 passed, 9 skips и 1 flaky: Android-тест
двух вкладок прошёл только при повторе. Это не чистый прогон 54/9.

В его mock-сервере устаревший baseVersion вызывал assertion внутри route,
хотя настоящий API обязан вернуть 409. Локальные десять повторов Android
без retries прошли и не воспроизвели исходную гонку; причина повторной отправки
конкретного CI-запроса этим не установлена. Mock теперь возвращает настоящий
конфликт с сохранёнными value/version. Проверка целевого settings-ключа
усилена: ровно один PUT с baseVersion=0, независимая правка второй вкладки
остаётся локальным конфликтом и не отправляется. Ожидаемая диагностика 409
допускается, остальные console/page errors по-прежнему отклоняются.
После уточнения mock все десять повторов Android без retries прошли;
общий typecheck и проверка Markdown также прошли. Полный CI оценивается
на новом HEAD; runtime отправителя после 2a72801 не менялся.

## Сверка MD-документов и текущей работы

Дата: 11.10.2026. Проверенный клиент:
`22a77889f131b554f52519515efc7ac811f6169f`.

[CI 37946004565](https://github.com/Michael-edel/FitFocus/actions/runs/37946004565)
на этом SHA завершился success: 734 unit-теста, 54 browser passed,
9 явных skips, без flaky. Audit, schema/privacy, guards, все три режима
typecheck и build прошли. Дублирующий push-run отменён общей concurrency;
успех подтверждён завершённым pull_request-run.

GitHub main при сверке — `c939ae6f3dbdb802478ea8a305b180eefb0b90f8`,
защищена. PR #93 открыт как draft с базой fix/state-generations и не слит.
Staging и выпуск этим не подтверждены.

Добавлен [краткий статус проекта](project-status.md); обновлены навигация,
ближайшие задачи и описание согласованного legacy-формата. Убрано устаревшее
утверждение TASKS, что sender шести ключей ещё ожидается.

В рабочем дереве отдельно остаётся незакоммиченный перенос остальных writers.
Его последний локальный прогон 11.10.2026: 170 test files passed, 1 failed;
740 tests passed, 1 failed из 741. Единственный отказ — ожидание строки
`quota` вместо `STATE_STORAGE_QUOTA` в новом тесте удаления.
Перенос не объявлен проверенным или выпущенным. Изменение документации
не включает этот исполняемый код; результаты CI прежнего SHA на него
не переносятся. Проверки следующего изменения должны быть записаны отдельно.

## P0.8 — подключение остальных управляемых state-записей

Дата: 11.10.2026. Код: `31ec84757ca72b4a48ccb6b3fa0e19ca8245a2f5`, ветка fix/durable-outbox,
draft PR #93 с базой #94 → #90. [Контракт этого этапа](owned-state-writers.md).

Список управляемых ключей расширен с 6 до 15. Feature editors сохраняют
исходного владельца и наблюдавшуюся ревизию; чтение не ставит defaults
в очередь. Raw-форматы flag/date/code сохранены. Ранняя правка удерживается
как конфликт, позднее чтение не стирает её рабочее значение.

Map/localStorage sender удалён из текущей сборки. Bootstrap больше не
применяет state-items сырым overwrite; managed hydration охватывает 15 ключей.
ProfileSync больше не загружает raw localStorage-пакет в `/api/state`;
он вызывает общий syncNow. Проверка завершения читает очередь и активную
сессию одной IDB-транзакцией, затем проверяет локальное поколение sender.
Profile API и его очередь не объявлены переведёнными на durable-outbox.

Сначала воспроизведена регрессия позднего удаления: после нового commit
его callback очищал новое рабочее значение. Счётчик редактора устраняет
перезапись; регрессионный тест прошёл. При quota/abort или конфликте удаления
видимая история сохраняется. Ошибка ожидания `quota` вместо
`STATE_STORAGE_QUOTA` исправлена в тесте, контракт ошибки не изменён.

Локальные проверки: 759 unit-тестов в 171 файле; общий, domain-strict
и storage-strict typecheck; auth/API/admin guards; schema 21 migrations /
30 tables; privacy 27 user-related tables; audit 0 известных уязвимостей;
production build. Браузерный итог: 75 passed / 9 явных skips, без retries.

Первый полный browser-прогон: 73 passed, 2 failed, 9 skips. Quota-подмена
нового теста затронула фоновый недельный отчёт в WebKit и Android, что
обнаружила включённая проверка console errors. Подмена ограничена конкретным
ключом council_history; остальные ошибки консоли не фильтруются.
Финальный полный прогон прошёл без retries. Старые skips относятся к ограничениям
onboarding и Chromium-only forced-colors, а не к новым трём сценариям.

Среда: `http://127.0.0.1:4173`, mock API; desktop Chromium 1280×720,
Firefox, WebKit, Android Pixel 7 Chrome/PWA, iPhone 14 Safari/PWA.
Browser plugin not available: использован проектный Playwright.
Проверены URL/title, содержательный экран, отсутствие framework overlay,
отметка плана → reload, очистка совета → stale localStorage → reload,
quota-отказ → видимая прежняя история и ошибка. Desktop/Android screenshots
просмотрены; уведомления и целевые controls читаются, новых pageerror нет.
Артефакты находятся вне Git и содержат синтетические данные.

При закрытии browser contexts preview также записал proxy ECONNREFUSED
для API без локального backend. Это не pageerror целевых сценариев;
браузерный прогон использует mock API и не подтверждает staging.

Не подтверждены настоящие OAuth/staging, реальное заполнение диска,
старый и новый build на одном origin, runtime legacy-импорт с доказательствами,
полный profile/family/AI lifecycle, UI разрешения, атомарный backup и очистка
всех stores. Старый источник сохранён; удаление sender новой сборки не
останавливает старые вкладки. P0 остаётся открытым, PR #93 — draft.
Результат CI точного опубликованного HEAD фиксируется отдельно в PR.

## Подтверждение CI и актуализация MD-файлов

Дата сверки: 11.10.2026. Исполняемый код этапа — `31ec847`;
опубликованная ревизия с документацией —
`44e0c3248079789cf7170e798a00a7589bee2b3e`.
[CI 38150544608](https://github.com/Michael-edel/FitFocus/actions/runs/38150544608)
завершился success на этом точном SHA, job `114502915620`.
Повторно проверены статус запуска, его SHA, шаги и итоговый лог:

- 759 unit-тестов в 171 файле прошли;
- 75 браузерных сценариев прошли, 9 явно пропущены, flaky нет;
- audit: 0 известных уязвимостей; schema: 21 migration / 30 tables;
  privacy: 27 user-related tables;
- общий, domain-strict и storage-strict typecheck, auth/API-инварианты
  и production build прошли.

В этом изменении документации добавлен порядок использования MD-файлов,
статус и TASKS связаны с этим CI, исторический контракт sender отделён
от расширения до 15 ключей. Исполняемый код не меняется. Результат этого
CI не переносится автоматически на следующий SHA; его запуск проверяется
отдельно после push.

На дату сверки PR #93 открыт как draft с базой `fix/state-generations`;
защищённая main остаётся на `c939ae6f3dbdb802478ea8a305b180eefb0b90f8`.
Profile, runtime legacy-миграция, полная приёмка и выпуск остаются открытыми.

## Существующий профиль в постоянной outbox

Дата сверки: 11.10.2026. Код этапа —
[`fc6bb82a6bfcf6e82cd19e223d66b0e9296896dc`](https://github.com/Michael-edel/FitFocus/commit/fc6bb82a6bfcf6e82cd19e223d66b0e9296896dc),
ветка `fix/durable-outbox`, draft PR #93 с прежней базой #94 → #90.
[Контракт компонента](profile-persistence.md) описывает существующий профиль,
а не всю регистрацию и auth/legacy lifecycle.

Редактор профиля использует StateEditor и атомарный value/intent/revision
в прежней IDB v2. `resource: profile` выбирает `/api/profile`; отсутствие
resource сохраняет формат state-операций. Новый store не добавлен,
USER_STATE_KEYS по-прежнему содержит 15 state-ключей. Прежняя Promise-очередь,
прямые PUT/PATCH profileSync и автоматический повтор 409 с новой базой удалены.

Свежий `/me` подтверждает profile capability и account/session; сервер
проверяет эту привязку до GET/PUT/PATCH. Ack требует версию своей мутации.
409 сохраняет локальное намерение и проверенный серверный снимок;
auth/access/protocol-пауза сохраняет локальные правки. Flush ждёт commit,
но не принимает незнакомую редактору ревизию другой вкладки.

При входе восстанавливается IDB-профиль; bootstrap может заполнить лишь
пустое хранилище. Guarded refresh проверяет ревизию, отсутствие intent и
sessionEpoch транзакционно; UI проверяет поколение входа и счётчик правок.
Чистое обновление заменяет только профиль. Несохранённая форма блокирует
refresh; quota-отказ сохраняет черновик и доступную кнопку после reload.
Проверки актуальности bootstrap и subject добавлены, но полная HTTP-защита
bootstrap/state-hydration остаётся отдельной работой.

### Проверка компонента fc6bb82

- 790 unit-тестов в 173 файлах прошли. Покрыты быстрые patches, локальные
  и серверные конфликты, поздний flush/refresh, смена аккаунта/сессии,
  capability, ошибочный ack, auth/access, bounded retry и сохранность intent.
- Гонка времени немедленной retry-паузы и finish сначала воспроизведена
  детерминированными движущимися часами: OUTBOX_INVALID_RETRY_TIME.
  Исправление использует единое время завершения и сохраняет допустимость retry.
- Браузерный quota-сценарий сначала упал на всех семи проектах: cache считал
  форму clean, когда её поле совпало с оптимистичным currentUser после отказа.
  Явный dirty-признак теперь сохраняется. Повтор четырёх новых сценариев
  на desktop Chromium и Android Chrome: 8 passed, без retries.
- Финальный полный локальный Playwright: 103 passed, 9 прежних явных skips,
  без retries. Все четыре profile-сценария прошли на семи проектах:
  desktop Chromium/Firefox/WebKit, Android Chrome/PWA и iPhone Safari/PWA.
  Skips относятся к выбранным платформам onboarding и Chromium-only forced-colors.
- Все три режима typecheck, auth/API/admin guards, schema parity
  (21 migration / 30 tables), privacy (27 tables) и audit
  (0 известных уязвимостей) прошли. Production build выполнен E2E-конфигурацией.
- Browser plugin not available: использован Playwright проекта на
  `http://127.0.0.1:4173`. Проверены title/URL, содержимое, отсутствие overlay,
  interactions и console/page errors. Desktop/Android screenshots просмотрены.
  Ожидаемые сообщения загрузки `/api/profile` для специально внедрённых
  401/409 учтены отдельно; прочие ошибки не скрываются.

API в браузерных сценариях mocked, quota внедрена только в commit операции
профиля. Это не проверка реального OAuth, физического заполнения диска или
staging. В stdout preview встречается ECONNREFUSED к локальному backend:
backend в этом mock-прогоне не запущен; успешный E2E не подтверждает его работу.
Предыдущий опубликованный HEAD `fdaa5ea` отдельно прошёл
[CI 38151565193](https://github.com/Michael-edel/FitFocus/actions/runs/38151565193)
с прежними 759 unit / 75 browser / 9 skips. CI следующего опубликованного
HEAD проверяется отдельно в PR #93 и не выводится из старого результата.

Остаются регистрация с прямым созданием профиля, полный bootstrap/hydration,
family/AI callbacks, runtime provenance/barrier/import legacy, UI разрешения
конфликтов, атомарный backup/экспорт/очистка всех stores, staging и защищённая
main. Старые запросы без scope пока совместимы; guard не останавливает
старую сборку. PR остаётся draft, весь P0 не закрыт.

## Постоянная регистрация и собственный профиль при входе

Дата сверки: 11.10.2026. Код этапа —
[`2e41742baa8c8dfafc2aa4c8c124940e302dfc03`](https://github.com/Michael-edel/FitFocus/commit/2e41742baa8c8dfafc2aa4c8c124940e302dfc03),
ветка `fix/durable-outbox`, draft PR #93 с базой #94 → #90.
[Контракт регистрации](registration-persistence.md) продолжает профиль `fc6bb82`.

Прежде регистрация создавала user-<timestamp>, ожидала прямой profile PUT,
затем писала localStorage-снимок и переименовывала id/prefix при входе.
Сеть или закрытие страницы до cloud-save оставляли профиль без постоянного
намерения. Старый fallback также подбирал legacy-профиль по email/истории.

Теперь canonical account берётся при подтверждённом входе с первого шага.
Профиль с базовым планом атомарно сохраняется в прежней IDB-outbox до AI;
version/baseVersion=0 обозначает создание. AI-result — причинное продолжение
того же writer. Ошибка первого commit оставляет форму без AI/перехода;
ошибка AI-commit сохраняет исходный базовый профиль. Нет прямого profile PUT,
localStorage all_users-записи или создания outgoing intent от чтения defaults.

Поздние registration/AI/invite/login callbacks проверяют актуальную попытку,
bootstrap-поколение и аккаунт. Уже закоммиченная операция сохраняет владельца
после выхода. Вход отвергает другой id без переименования prefix. Own IDB-profile
требует accountId записи, owner-meta и точного payload id; унаследованная
запись без доказанного владельца остаётся нетронутой и не активирует сессию.
Pending-регистрация восстанавливается после reload без OAuth-маркера.
Bootstrap 401/403 и некорректный профиль не активируют локальный вход.
Неопределённый ответ без собственного IDB-профиля не считается отсутствием
профиля и не предлагает новое создание.

Invite redeem требует свежий `/me` account/session proof и inviteSync capability;
сервер проверяет binding до расходования кода. Ack проверяет invite guard
и scope. Старые запросы без scope пока совместимы. Порядок выкладки capability
и guard добавлен в чек-лист; сама регистрация не заменяет legacy writer barrier.

### Проверка компонента 2e41742

- Регрессии сначала воспроизведены: 5 из 6 новых registration-тестов упали
  на прежнем коде, включая durable-before-AI и вход без прямого profile HTTP.
- Финальные unit: 814 passed в 174 файлах. Проверяются quota/rollback,
  причинный AI-update, сохранность fallback при отказе второй записи,
  поздний ответ после выхода, собственный IDB-профиль без OAuth-маркера,
  отказ подбора по email и принятия unowned IDB, wrong/absent invite scope,
  cookie/account смена до consume и отмена login hydration.
- Target Playwright: 6 passed, без retries — два новых сценария и onboarding
  на desktop Chromium и Android Chrome. Profile записан до AI; reload
  сохраняет intent при внедрённом 401; quota не запускает AI/profile HTTP.
- Все три режима typecheck, auth/API/admin guards, schema parity
  (21 migration / 30 tables), privacy (27 tables), audit
  (0 известных уязвимостей) и production build прошли.
- Browser plugin not available: использован Playwright проекта на
  `http://127.0.0.1:4173`. Title/URL, значимое содержимое, отсутствие
  неожиданного overlay, действия и console/page errors проверены;
  desktop/Android screenshots просмотрены. Только специально внедрённый
  resource error `/api/profile` 401 признаётся ожидаемым.

Проверка использует mock API и точечную quota-инъекцию. Настоящие OAuth,
физическое заполнение диска, deploy и staging этим не подтверждены.
Предыдущий точный HEAD `56f53378cf76ff53609d3a6fabae5ae87a82205c` отдельно
прошёл [CI 38156409684](https://github.com/Michael-edel/FitFocus/actions/runs/38156409684):
790 unit / 103 browser / 9 явных skips, без flaky; guards/types/audit/build
и schema/privacy успешны. Новый опубликованный HEAD проверяется отдельно в PR.

Следующий незавершённый этап — свежий session proof и guarded HTTP
bootstrap/state-hydration, атомарный auth-fence при применении и seed профиля.
Клиентские проверки поколения до/после await не заменяют этот транзакционный
guard. Также открыты остальные family/AI callbacks и AI-cache, runtime legacy
provenance/barrier/import, UI конфликтов, backup/экспорт/очистка, staging
и защищённая main. Весь P0 и выпуск не закрыты; PR #93 остаётся draft.

## Sender при reload и возврате из BFCache

Дата: 11.10.2026. Код:
[`b723b7d1c9112df1f854bac7bdce18b3ff39aa1a`](https://github.com/Michael-edel/FitFocus/commit/b723b7d1c9112df1f854bac7bdce18b3ff39aa1a),
продолжает регистрацию `2e41742`; ветка и draft PR #93 прежние.

Полная локальная браузерная проверка `2e41742` дала 115 passed, 9 skips
и два сбоя: profile reload на desktop WebKit и registration reload на iPhone PWA.
UI/IDB-проверки проходили, но pageerror фиксировал access-control fetch ошибки
`/api/me` и `/api/profile`. Trace связывает их с моментом reload.
Проверку ошибок не ослабляли и исключения для таких pageerror не добавляли.

App теперь связывает sender с жизненным циклом страницы: pagehide вызывает
stop/abort, BFCache pageshow.persisted запускает свежую проверку сессии
исходного accountId, cleanup удаляет обработчики прежнего аккаунта.
Обычный pageshow не дублирует start. Локальные pending-операции сохраняются.
[Контракт и тесты](state-sender.md#жизненный-цикл-страницы).

После исправления:

- Те же два сценария на desktop WebKit/iPhone PWA: 20 passed, каждый
  повторён пять раз на двух проектах; без retries.
- Полный unit: 816 passed в 175 файлах. Новый тест дожидается завершения
  отменённого proof и проверяет, что поздний ответ не активировал сессию.
- Все три режима typecheck и production build прошли.
- Полный Playwright: 117 passed / 9 предусмотренных skips, без retries.
  Chromium, Firefox, WebKit, Android Chrome/PWA и iPhone Safari/PWA.
- Browser plugin not available: использован Playwright на
  `http://127.0.0.1:4173`. Title/URL, содержимое, overlay, взаимодействия и
  console/page errors проверены в целевых сценариях. Просмотрены новые
  desktop/mobile screenshots: quota оставляет доступную кнопку и ошибку,
  reload показывает сохранённый план и auth-паузу без наложений.

Локальный preview не запускает настоящий backend; его лог содержит
proxy ECONNREFUSED для `/api/me`. Успех mock-сценариев не подтверждает здоровье
реального сервера. OAuth, настоящая нехватка диска, deploy и staging остаются
отдельной приёмкой. Guards/schema/privacy/audit этапа регистрации перечислены
выше; CI публикуемого HEAD проверяется отдельно, результат предыдущего
`56f5337` на него не переносится.

MD-файлы сверены с кодом: добавлен контракт регистрации, обновлены карта,
статус, задачи, API, решения и чек-лист. Исторические SHA/результаты сохранены.
Полный guarded bootstrap/hydration, атомарный auth-fence, runtime legacy,
остальные callbacks, UI конфликтов, backup/экспорт/очистка и выпуск открыты.

## Исправление ожидания auth-паузы в E2E

Дата: 11.10.2026. Документация и runtime опубликованы на
`4a459ada286a0b8563e16bfea1ca8fd2512c6732`.
[CI 38160554188](https://github.com/Michael-edel/FitFocus/actions/runs/38160554188)
завершился success: 816 unit, guards/types/audit/schema/privacy/build успешны,
GitGuardian и Cloudflare Pages успешны. Браузерный итог — 116 passed,
1 flaky и 9 skips. Это не прогон без flaky: Firefox registration-reload
на первой попытке получил два profile PUT при ожидании ровно одного.

Анализ кода показывает допустимую последовательность: старт sender отправляет
профиль, 401 ставит auth-паузу, отложенный profile auto-sync получает свежий
`/me` proof и может повторить ту же операцию. Число запросов до проверки UI
зависит от времени рендера и 500 ms debounce. Оно не является признаком
потери данных или обхода session guard.

E2E теперь ожидает сохранённую auth-паузу в IDB до и после reload, затем
проверяет профиль и обе операции. На каждом PUT сохранены проверки account,
session, canonical id и baseVersion=0; запись до AI, один AI-запрос, quota
rollback и все console/pageerror проверки остаются. Runtime не изменён.
Дополнительный unit-тест подтверждает: flush на auth-паузе не отправляет
запрос, syncNow требует свежий proof; повторный 401 сохраняет операцию
pending без расходования retryCount и без подтверждения версии.

Код проверки:
[`cb6e6cfec96cd431c56f25415cc2bfcd4bab1571`](https://github.com/Michael-edel/FitFocus/commit/cb6e6cfec96cd431c56f25415cc2bfcd4bab1571).
817 unit-тестов в 175 файлах и root typecheck прошли. Playwright повторил
оба registration/quota-сценария по пять раз на desktop Firefox и iPhone PWA:
20 passed, без retries. Browser plugin not available; API mock, локальная
quota-инъекция и границы backend/staging прежние. Новый опубликованный HEAD
требует отдельного CI; прежний success с flaky не считается чистым прогоном.

## Повторный CI после исправления ожидания auth-паузы

Дата: 11.10.2026. Опубликованный SHA:
`4f7b874029e54b928ac4575a818c57f22b8fd780`.
[CI 38161777800](https://github.com/Michael-edel/FitFocus/actions/runs/38161777800)
завершён со статусом success: 817 unit-тестов в 175 файлах,
117 browser passed / 9 skips, без flaky. Три режима typecheck,
admin/auth/API guards, audit, schema, privacy и build прошли.
Схема: 21 миграция / 30 таблиц; privacy coverage: 27 таблиц.
PR #93 открыт как draft с базой `fix/state-generations`; защищённая main
остаётся на `c939ae6f3dbdb802478ea8a305b180eefb0b90f8`, слияния нет.

Результат относится именно к `4f7b874`. История `4a459ad` с одним flaky
сохранена выше; её не переписываем как чистый прогон.

## Рабочий этап bootstrap/hydration и обновление MD-файлов

Дата: 11.10.2026. База рабочего дерева — `4f7b874`; изменения исполняемого
кода этого этапа ещё не закоммичены. Обновлены карта документации, статус,
TASKS и правила поддержания документов; добавлен
[рабочий контракт загрузки сессии](bootstrap-hydration.md).

Зафиксированы результаты уже выполненных локальных проверок рабочей версии:

- 836 unit-тестов в 178 файлах прошли.
- Три режима typecheck, admin/auth/API guards, schema и privacy прошли.
- 18 целевых E2E на desktop Chromium и Android Chrome прошли.
- Полный E2E завершился неуспешно: 130 passed / 8 failed / 9 skips,
  без retries. Сценарий независимой правки двух вкладок без Web Locks
  упал на всех семи проектах; очистка истории консилиума упала на Firefox.

Это свидетельства локального рабочего дерева, а не CI опубликованной
ревизии. Причины падений ещё не устранены и не объявляются доказанными
дефектами конкретного модуля. Дополнительно при чтении кода найден
незакрытый путь: отсутствие guard после повторного `/me` на входе без
предыдущего readGuard может допустить локальную активацию. Нужны отдельные
регрессии для выхода, отказа доступа и неподдерживаемого протокола.

Mock E2E не подтверждает настоящий OAuth/staging/production. Этап и
соответствующие P0 остаются открытыми. Дальнейшая реализация начинается
с [конкретных блокеров](bootstrap-hydration.md#приёмка-компонента-и-оставшаяся-работа).

## Guarded bootstrap/hydration и исправление повторного чтения

Дата: 12.10.2026. Код:
[`dac2de27d7697e3bb724eacd5e9fcf7b41d72cbf`](https://github.com/Michael-edel/FitFocus/commit/dac2de27d7697e3bb724eacd5e9fcf7b41d72cbf).
[Контракт компонента](bootstrap-hydration.md).

Bootstrap проверяет session scope до доступа к данным и возвращает публичные
поля user без сырого sid. `/me` объявляет bootstrap capability отдельно от
state capability. Read guard фиксирует auth-fence в транзакции принятия
proof; hydrate/profile seed проверяют fence вместе с epoch, revision и pending.
Общий transport ограничивает тело и время чтения; late response не активирует
прежний аккаунт и не меняет новую сессию.

Три регрессии сначала воспроизвели активацию без входящего readGuard после
выхода, отказа доступа или отсутствующей capability. Теперь отсутствие proof
останавливает этот путь. Ещё три регрессии выявили смешение временной
недоступности `/me` с отказом протокола: сеть, 408/429/5xx допускают чтение
собственных локальных данных; подтверждённый отказ не допускает вход.

Две регрессии воспроизвели ложное устаревание редактора: повторная загрузка
того же live/absent-снимка другой вкладкой повышала revision. Owned-снимок
той же версии теперь не меняет её после проверок pending/session/revision.
Первое подтверждение отсутствия сохраняет owner/meta; новая серверная версия
по-прежнему повышает revision и защищает независимую правку.

Трасса очистки истории показала гонку самого теста: после ожидания pending
он делал второе чтение и мог застать новый sending. Теперь значение, owner,
delete-intent, source и pending/legacy-пауза проверяются по одному снимку IDB;
проверки не ослаблены до принятия sending.

Локальные результаты:

- 846 unit-тестов в 178 файлах прошли; все три режима typecheck,
  admin/auth/API guards, schema и privacy прошли. Audit: 0 известных уязвимостей.
- Схема: 21 миграция / 30 таблиц; privacy coverage: 27 таблиц. Новых миграций
  IDB/D1 или изменений зависимостей этот компонент не требует.
- Четыре bootstrap-сценария и две вкладки прошли по три повтора на Chromium,
  Firefox и Android Chrome. Первый целевой прогон: 53 passed / 1 failed;
  единственное падение очистки истории устранено описанным снимком.
- Исправленная очистка истории: 15 passed, по пять повторов на тех же трёх
  проектах, без retries.
- Полный Playwright: 144 passed / 1 failed / 9 skips, без retries. Все
  новые bootstrap-сценарии и прежние восемь падений прошли. Profile conflict
  на iPhone PWA не увидел операцию после Save. Десять повторов с диагностикой
  событий прошли; причина исходного падения пока не установлена, случай открыт.

Browser plugin not available: использован Playwright на
`http://127.0.0.1:4173`. Целевые проверки подтверждают title/URL, непустой
экран, отсутствие overlay, ожидаемые взаимодействия и console/page errors.
Просмотрены desktop и Android screenshots: отказ `/me` оставляет экран входа;
после очистки и reload история пуста, notice показывает ожидание импорта legacy.
Mock API, синтетическая смена IDB-сессии и quota-инъекция не подтверждают
настоящий OAuth, staging или production. Proxy ECONNREFUSED в локальном
preview также не является проверкой здоровья backend.

Код зафиксирован отдельно от MD-файлов. Полная приёмка компонента остаётся
открытой из-за нестабильного profile-сценария; CI публикуемого HEAD проверяется
отдельно. Остальные family/AI callbacks/cache, runtime legacy/barrier/import,
UI конфликтов, backup/экспорт/очистка и выпуск остаются в TASKS.

## Документация проекта и уточнение приёмки 12.10.2026

Основание: опубликованный HEAD `ece4e7a62159bbfae53ccfe4b19da211fb9d298e`,
код компонента `dac2de2`. Добавлена [карта кода](code-map.md): функция,
основные исходники, контракт и существующие проверки. README, карта
документации, AGENTS и CONTRIBUTING связаны с ней. PRODUCT хранит функции,
TASKS — очередь и критерии готовности, профильные документы — контракты,
этот журнал — свидетельства проверки. Новая параллельная очередь задач
не создаётся. Изменение касается Markdown; исполняемый код не изменён.

[CI `ece4e7a`, запуск 38168916617](https://github.com/Michael-edel/FitFocus/actions/runs/38168916617)
завершился с `success`: audit, schema/privacy, auth/API guards, 846 unit-тестов
в 178 файлах, три проверки типов, сборка и E2E. Браузерный итог:
**144 passed / 1 flaky / 9 skips**. Регистрация на iPhone Safari сначала
упала на console error `/api/profile due to access control checks` после
reload, затем прошла при повторе. Значения профиля, две операции и auth-пауза
были проверены до ошибки консоли; причина сообщения ещё не установлена.
Этот CI не считается приёмкой без flaky.

[Дублирующий push-run 38168913697](https://github.com/Michael-edel/FitFocus/actions/runs/38168913697)
завершился как `cancelled`; PR-run выше завершился успешно. Workflow
объединяет push/PR одного branch через concurrency и `cancel-in-progress`.
Отмена дублирующего запуска не равна падению job действующего запуска.
PR #93 остаётся draft с базой `fix/state-generations`, main защищена и
по-прежнему указывает на `c939ae6f3dbdb802478ea8a305b180eefb0b90f8`.

Последующая локальная диагностика прежнего profile-conflict падения:

- Десять iPhone PWA повторов с одним worker прошли; этот результат уже
  был записан выше и сам по себе не доказывает исправление.
- Двадцать повторов iPhone Safari/PWA с двумя workers дали **18 passed /
  2 failed**, retries отключены. Проверялась та же реализация; диагностика
  событий находилась во внешней копии теста и не добавлена в приложение.
- Первое падение PWA: `pointerdown` в кнопке «Сохранить профиль» на 5902 мс,
  `pointerup` и `click` в DIV на 5914 мс. Операций профиля и PUT не было.
  Потеря клика воспроизведена. Notice рендерится над формой и может
  появляться/исчезать при обновлении очереди; причинную связь и исправление
  требуется подтвердить детерминированным регрессионным сценарием.
- Второе падение PWA: функциональная проверка конфликта прошла, но console
  содержала `/api/me due to access control checks` при reload. Отмена запроса
  при навигации — гипотеза до проверки сетевой трассы. Общий фильтр CORS
  и повтор теста не являются исправлением.

Порядок следующей реализации и критерии: [TASKS](../TASKS.md).
Нужно удержать один жест Save во время завершения state-sync, подтвердить
стабильную цель клика, одну profile-операцию и сохранение payload/snapshot
после 409; отдельно установить причины console errors. Затем пройти полную
матрицу без retries и CI нового HEAD. Bootstrap-контракт, runtime legacy,
staging и выпуск остаются с прежними ограничениями.

## Стабильность notice при нажатии Save 12.10.2026

Код: `3550cc8fc81002cd0fcb127a398d73a5536f31bb`, база `57f956d`.
[CI базы 38170218508](https://github.com/Michael-edel/FitFocus/actions/runs/38170218508)
прошёл: 846 unit в 178 файлах, 145 browser passed / 9 skips, без flaky.
Он предшествует этому исправлению; прежний CI с flaky сохранён выше.

Первая версия теста удерживала Save до окончания state-sync и проверяла
только viewport-координату. Она прошла на исходном коде: компенсация
прокрутки могла удержать кнопку на экране, хотя раскладка документа менялась.
Проверка усилена координатой в документе и ожиданием фактического исчезновения
notice. До исправления она упала на Chromium, Firefox и iPhone PWA:
сдвиг 86/86/106 px. Нативный жест выполняется один раз; повторного клика нет.

[StateStorageNotice](../ui/StateStorageNotice.tsx) теперь всегда имеет область
с содержащимися внутри неё margin. Пока есть активные указатели, её высота
зафиксирована, а изменение очереди продолжает обновлять содержимое. Размер
освобождается после жеста; pointercancel, blur, pagehide, смена account и
unmount также завершают удержание. Пустая область в покое не занимает места.
HTTP, IDB/outbox и алгоритм сохранения профиля не изменены.

Результаты:

- 846 unit-тестов / 178 файлов, три typecheck, admin/auth/API guards,
  schema/privacy и audit прошли; 0 известных уязвимостей.
- Новый сценарий прошёл во всех семи проектах Playwright. Исходный конфликт
  профиля и новый сценарий прошли 20 повторов Safari/PWA с двумя workers,
  без retries. Финальная версия дополнительно проверяет, что после жеста
  notice конфликта целиком входит в viewport.
- Полная матрица на `3550cc8`: **151 passed / 1 failed / 9 skips**, без retries.
  Все семь новых сценариев прошли. Единственное падение — profile-conflict
  iPhone Safari: имя, одна операция, один PUT и 409-конфликт сохранены;
  затем проверка ошибок увидела `/api/me due to access control checks` на reload.
  Полная приёмка остаётся открытой.

Дополнительная диагностика находится вне репозитория. Шесть Safari/PWA
сценариев задерживали `/api/me` или `/api/profile` и перезагружали страницу.
Они подтвердили `Load request cancelled`, обработанный `TypeError: Load failed`
или abort сигнала, без pageerror и unhandledrejection. Обычная отмена запроса
не воспроизвела исходное сообщение, поэтому оно не объявляется ожидаемым
и фильтр CORS/pageerror не расширен. В установленном WebKit-адаптере Playwright
JS console errors также передаются через pageerror; этот event сам по себе
не доказывает необработанный Promise.

Отдельная диагностика focus при навигации дала один пригодный прогон;
оставшиеся четыре прервались после штатного завершения общего preview-сервера
полной матрицы. Эти четыре результата не являются проверкой приложения
или свидетельством исправления. При повторе нужен отдельный жизненный цикл
сервера, а не подключение к завершающемуся прогону.

Browser plugin not available: использован repository Playwright и mock API,
`http://127.0.0.1:4173`. Новый сценарий проверяет URL/title, содержимое формы,
отсутствие Vite overlay, ошибки браузера, координаты и результат одного жеста.
Desktop screenshot показывает целиком notice конфликта и локальное имя.
Реальные устройства, настоящий OAuth, staging и production не проверены.
Контракт: [сохранение профиля](profile-persistence.md#стабильность-формы-при-изменении-уведомления).
Открытая диагностика Safari и остальные P0 остаются в [TASKS](../TASKS.md).

## Сверка опубликованных MD-файлов и CI 12.10.2026

Опубликованная ревизия:
`45315d9120a2e6d05b658560b20a901e19ac57b3`, включает исправление UI
`3550cc8` и его описание. [CI 38172605267](https://github.com/Michael-edel/FitFocus/actions/runs/38172605267)
завершился с `success`; результат и лог проверены для этого точного SHA:
846 unit-тестов в 178 файлах, 152 browser passed / 9 skips, без flaky.
Обязательные проверки проекта прошли. Девять пропусков остаются пропусками,
они не включены в число пройденных сценариев.

README, TASKS, текущий статус и контракт bootstrap/hydration теперь ссылаются
на этот результат. Исторические локальные 151 passed / 1 failed / 9 skips
сохранены выше: успешный CI не объясняет Safari page error при reload.
Диагностика Safari, остальные callbacks, runtime legacy, staging и выпуск
остаются открытыми. Незавершённые локальные диагностические заготовки
не входят в `45315d9` и не получают его результат проверки.

На дату сверки PR #93 открыт как draft, база — `fix/state-generations`,
слияния нет. Защищённая GitHub main остаётся на
`c939ae6f3dbdb802478ea8a305b180eefb0b90f8`; deploy этим CI не подтверждён.
Эта сверка меняет Markdown-документы; исполняемый код не изменён.

## Серверная привязка AI и списка покупок 12.10.2026

Предыдущая опубликованная ревизия `6fcce1b`:
[CI 38173869573](https://github.com/Michael-edel/FitFocus/actions/runs/38173869573)
завершился с success. Лог подтверждает 846 unit / 178 файлов,
152 browser passed / 9 skips, без flaky; все обязательные проверки прошли.
Это результат до следующих серверных изменений.

Код: `16d3c34fb3c659c2b51a1473d241bfc438c46291`.
Проверка оставшихся AI callbacks выявила скрытый HTTP writer:
`generateWeeklyMenu` после AI-ответа записывает `/api/weekly_menu/items`.
Оба endpoint, включая `/api/ai`, ранее игнорировали переданную исходную
account/session-привязку. Защита React callback сама по себе не закрыла бы
гонку смены cookie перед такой записью.

Теперь оба handlers используют `requireStateUser`. При переданной привязке
другой аккаунт, повторный вход того же аккаунта, неполная пара и неверный
proof дают 401 до прикладных эффектов. `/me` объявляет отдельные capabilities,
ответы подтверждают версию guard и возвращают публичный scope. Запрос без
обоих заголовков остаётся прежним. [Контракт и дальнейшая приёмка](ai-session-guard.md).

Регрессионный набор до изменения: **13 failed / 7 passed**. После:
**22 passed** в трёх файлах. Полная локальная проверка: **860 unit / 179 файлов**,
три typecheck, admin/auth/API guards, schema (21 migrations, 30 tables), privacy
(27 tables), build и audit (0 известных уязвимостей) прошли. Новый HTTP-набор
проверяет отсутствие access/DB/items-вызовов после отказа в привязке; обычная
аутентификация замокана и её D1-чтения этим утверждением не исключаются.
Полная браузерная матрица проверяется в CI итогового опубликованного HEAD.
Локальный E2E не повторялся: клиент и UI здесь не менялись, mock API не
подтверждает работу этих серверных handlers.

Диагностика Safari остаётся открытой. Отдельные синтетические fetch при
pagehide/unload дали native access-control pageerror при перехваченном Promise,
без window.error/unhandledrejection. Это не установило реальный callback
приложения. Прототип классификатора также выявил, что Firefox не сообщает
исключение в pagehide так же, как другие браузеры: 1 passed / 2 failed.
Эти диагностические заготовки сохранены вне репозитория; общий фильтр CORS
не добавлен, данный результат не считается приёмкой приложения.

Клиентская передача proof, lifetime menu/report/retry/family callbacks,
постоянный profile commit и явный порядок вторичного items writer остаются
следующим шагом P0.5. Серверный компонент не объявляется защитой текущего
клиента, завершением P0 или deploy. Схема IDB/D1 и зависимости не менялись.

## 12.10.2026 — сверка Markdown и текущей локальной работы

Повторно проверен опубликованный `8fc0b1b1adc44975396578e2ee60a4e7d1873eb7`:
[CI 38175438277](https://github.com/Michael-edel/FitFocus/actions/runs/38175438277)
завершён с success. Лог подтверждает **860 unit / 179 файлов**,
**152 browser passed / 9 skips**, без flaky; обязательные проверки прошли.
PR #93 открыт как draft, база `fix/state-generations`, слияния нет.
Этот результат включает серверный guard `16d3c34`, но не локальное
подключение персонального меню.

В рабочем дереве добавляются свежий AI proof, action/page/login lifetime,
атомарный guarded generated-profile commit и отдельная отправка items после
сохранения. [Текущая реализация и оставшиеся условия](ai-session-guard.md#клиентское-подключение-в-работе).
Код и новые тесты ещё не закоммичены и не опубликованы.

Целевой unit-прогон: **51 passed / 6 файлов**. Браузерный прогон пяти новых
сценариев в desktop-chromium, desktop-firefox и iphone-pwa:
**11 passed / 4 failed**, workers=2, retries=0. Четыре desktop-падения
остановились на `settings()` при `locator.click` по «Настройкам» с timeout;
assertions logout и независимой правки не достигнуты. Это не доказательство
их корректности или дефекта приложения. Полная браузерная матрица не пройдена.
Первый typecheck дал TS2322 в `tests/ai_session_transport.test.ts` для
`Promise<unknown>`; тип исправлен локально, повторная проверка ещё не записана.

Логи диагностики находятся вне репозитория: `weekly-menu-client-targeted-fixed-unit.log`,
`weekly-menu-client-targeted-e2e.log`, `weekly-menu-client-typecheck.log`.
Результат старого CI не переносится на это рабочее дерево. Публикация меню,
version/CAS вторичной проекции, остальные callbacks, Safari reload, runtime
legacy-импорт, staging и выпуск остаются открытыми.

README, карта документов, краткий статус, TASKS, правила помощника,
API и карта кода синхронизированы с этой границей. Подробная история
сохраняется здесь; статус содержит только текущую сводку и следующие шаги.
Проверка Markdown: 27 документов, 570 ссылок и 27 закреплённых путей
исходников, ошибок нет; `git diff --check` для Markdown прошёл.
Этот этап меняет только документацию и не подтверждает приёмку локального кода.

## 12.10.2026 — персональное меню, generated commit и desktop-навигация

Код: [`f4b4eee`](https://github.com/Michael-edel/FitFocus/commit/f4b4eee1e577292019481b711b097941df27558e). CI предшествующего документирующего `59a3630`:
[38178142888](https://github.com/Michael-edel/FitFocus/actions/runs/38178142888),
success, 860 unit / 179 файлов, 152 browser passed / 9 skips, без flaky.
Этот CI не проверял новый menu-код; workflow нового HEAD проверяется отдельно.

Свежий proof и capabilities теперь передаются в AI и явный items writer.
Guarded generated-profile commit проверяет account/session/epoch/auth-fence
и актуальность редактора одной транзакцией. UI ждёт постоянного сохранения;
quota, конфликт и старая попытка не запускают items/achievement успешного меню.
Для вторичного отказа показано отдельное предупреждение.

Первый браузерный набор дал 11 passed / 4 failed. Трасса и screenshot выявили
реальную ошибку: desktop-панель fixed, нижние пункты вне viewport и прокрутки нет.
Добавлены desktop overflow-y и запрет сжатия элементов; тест использует обычный
scroll/click с viewport assertion. Следующий прогон дал 9 passed / 6 failed:
все падения были новым неверным ожиданием `#settings` — приложение переключает
React tabs, не записывая hash. Ожидание убрано по фактическому контракту,
видимая форма по-прежнему проверяется. Затем 18/18 целевых сценариев прошли.

Первая полная матрица: 200 passed / 1 failed / 9 skips, workers=2, retries=0.
Все 49 menu-сценариев прошли. Прежний plan-task reload на iPhone Safari
прочитал transient sending до legacy-паузы. Тест теперь ждёт pause=legacy
и status=pending по одному снимку IDB; конечная проверка pending не ослаблена.
Десять повторов iPhone Safari/PWA с двумя workers прошли без retries.

Отдельный red unit подтвердил неправильную классификацию отмены `/me`:
1 failed / 13 passed. После исправления отмена означает смену действия,
не транспортный fallback. Ещё один red unit (1 failed / 14 passed) выявил,
что deadline HTTP отменял action-controller и мог оставить loading навсегда.
Теперь отдельный request-controller наследует явную отмену действия, а timeout
позволяет показать ошибку, снять loading и повторить генерацию.

Итоговые локальные проверки: **900 unit / 183 файла**, три typecheck,
admin/auth/API guards, schema (21 migrations, 30 tables), privacy (27 tables),
audit (0 известных уязвимостей) и build прошли. Полная браузерная матрица:
**200 passed / 1 failed / 9 skips**, workers=4, retries=0. Все 49 новых menu-проверок
прошли в семи проектах; добавлены pagehide/pageshow и timeout/retry.
Unit проверяет две IDB connections и same-account relogin; browser lifecycle
events синтетические. Это не реальный BFCache, old/new bundles или OAuth.

Browser plugin not available: repository Playwright, mock API,
`http://127.0.0.1:4173`. URL/title, содержимое, overlay, ошибки и viewport
проверены; desktop/mobile screenshots сохранены вне Git. Разрешена только
инъецированная HTTP 503 resource-ошибка items-сценария; CORS/pageerror не скрыты.
Полный лог: `weekly-menu-client-final-full-e2e.log`; unit: `weekly-menu-client-final-unit.log`.

Открыты version/CAS и durable-порядок secondary items, остальные AI/report/retry/family
writers, причина прежних Safari reload errors, runtime legacy provenance/barrier/import,
конфликты/export/clear, staging и выпуск. Полная локальная матрица не прошла;
причина Safari-сообщения остаётся открытой. Схема и зависимости не менялись.

Read-only сверка обнаружила ещё один writer: `useAchievements.ts` после
положительного menu commit может отправлять POST через throttle-очередь без
scope/lifetime. Его серверный handler тоже ещё не сверяет requested session.
Это явно оставлено открытым в TASKS и AI-контракте; успешные menu-тесты
не считаются подтверждением безопасности achievement HTTP при смене cookie.

Повторная полная матрица с четырьмя workers: **200 passed / 1 failed /
9 skips**, retries=0. Все новые menu-сценарии прошли. Старый profile reload на
desktop WebKit воспроизвёл native `/api/me due to access control checks`;
имя и локальная операция были сохранены. Raw stack: `requestJson` → `verify`
sender. Reload начался в 172214.473 ms трассы, pageError — в 172337.693 ms.
Предшествующие plain `/api/me` отражены в network trace со status 200;
это не устанавливает причину отмены body. Общий фильтр не добавлен.
Следующий шаг — воспроизвести и проверить lifecycle именно этого sender request.
Полная приёмка не объявляется успешной; результат CI не заменяет эту диагностику.

Проверка Markdown: 27 документов, 612 ссылок и 27 закреплённых путей
исходников, ошибок нет; `git diff --check` прошёл. Обновлены контракты,
навигация по коду, статус, задачи и границы проверок этого компонента.

## 12.10.2026 — автоматический profile flush без повторного proof

Код: [`f3930ec`](https://github.com/Michael-edel/FitFocus/commit/f3930ec64f7fa74f3aad352246aa18b92d2542b7). CI предыдущего `cd2e923`:
[38181152086](https://github.com/Michael-edel/FitFocus/actions/runs/38181152086),
success, 900 unit / 183 файла, 200 browser passed / 1 flaky / 9 skips.
Flaky — registration reload desktop WebKit с native `/api/me` после успешных
функциональных проверок, успешный retry не устанавливал исправление.

Внешний диагностический набор воспроизвёл native ошибку 3 раза из 16
(13 passed / 3 failed). Стек и события: profile debounce → `syncNow` →
`verify` → `/api/me` после `beforeunload`, до `pagehide`.
Например, beforeunload=9226 ms, fetch=9236 ms, pagehide=9326 ms.
Прототип приостановки sender по blur дал 14 passed / 2 failed и удалён:
он не устранял воспроизводимый путь. Background/BFCache не ограничивались.

Автоматический profile callback теперь вызывает `flushPending` для уже
сохранённого намерения. Ручной `syncNow` по-прежнему проверяет свежий proof.
Auth-пауза не снимается таймером; чужой аккаунт и старое поколение не могут
отправить или подтвердить очередь. Red unit: 4 failed / 39 passed;
после добавления API целевой набор: 63 passed в 4 файлах.

Повтор внешней диагностики: 14 passed / 2 failed, native ошибок нет.
Оба падения — initial form timeout под одновременным unit/typecheck;
screenshot показывает загрузку. Этот набор не объявляется зелёным и сам
по себе не доказывает исправление. Полная матрица затем запускалась отдельно.

Первый полный набор после queued flush: 199 passed / 2 failed / 9 skips.
Native `/me` не повторился; два clean-refresh сценария PWA сохранили старое
имя. Причина: автосинхронизация чистого профиля до готовности sender ставила
error, и recovery выбирал flush вместо refresh. Теперь debounce требует
pending changes; suppress-флаг всё равно потребляется. Добавлен unit;
целевой набор с recovery: 66 passed / 5 файлов.

Итог: 905 unit / 183 файла, три typecheck, admin/auth/API guards, schema
(21 migrations, 30 tables), privacy (27 tables), audit (0 известных
уязвимостей), build прошли. Полная Playwright-матрица: **201 passed / 9 skips**,
workers=3, retries=0. E2E профиля проверяет auth-паузу и pending одним IDB
снимком, один PUT/401 до reload, второй после свежего входного proof и
сохранение того же opId. Меню, регистрация, конфликты и прочие сценарии
входят в эту общую матрицу.

Browser plugin not available: repository Playwright, mock API,
`http://127.0.0.1:4173`, семь проектов. Фильтры CORS/pageerror не расширялись;
новый beforeunload listener не добавлялся. Логи и диагностические artifacts
сохранены вне Git. Основные логи: `profile-queued-flush-final-full-e2e.log`,
`profile-queued-flush-final-full-unit.log`, `sender-reload-diagnostic.log`.
CI нового опубликованного HEAD проверяется отдельно. Настоящий OAuth,
физические устройства, BFCache/staging и остальные P0 не закрыты.

Визуальная проверка desktop WebKit screenshot отдельно обнаружила низкий
контраст native select «Цель» в тёмной теме: светлый текст на светлом фоне.
Добавлено в P1; успешная функциональная матрица не считается исправлением
этого визуального дефекта. Форма и локальное имя читаются, auth-пауза видима.

Проверка Markdown: 27 документов, 637 ссылок и 27 закреплённых путей
исходников, ошибок нет; `git diff --check` прошёл.

## 12.10.2026 — CI автоматического profile flush

Workflow [38184851075](https://github.com/Michael-edel/FitFocus/actions/runs/38184851075)
для опубликованного head `bf01d87f754eb553689c7479ca9739da35a76263` завершился
success. PR workflow проверял merge `60d01019117b0381b9444bd27cc3ab96303e7cdb`
с базой `237f862`; job `114604881706`: 905 unit / 183 файла,
201 browser passed / 9 skips, без flaky, обязательные проверки прошли.
Дублирующий push run отменён штатной concurrency-группой. В защищённую main
эти изменения ещё не объединены. Этот CI предшествует следующему компоненту.

## 12.10.2026 — исходная сессия и временная очередь достижений

Код [`57da2cf`](https://github.com/Michael-edel/FitFocus/commit/57da2cf3d8bcb682242db87994126d1c816158d4).
Прежде GET/POST выбирали аккаунт по текущей cookie, а throttle-очередь
очищалась только при unmount. Добавленные server-регрессии до исправления:
13 failed / 2 passed. Scope проверяется до feature/application DB effects;
`/me` объявляет независимую achievement capability, ответ подтверждает scope.
Повреждённый POST JSON получает 400 до check use case.

Клиент получает исходную login-привязку из принятого hydration proof,
проверяет свежий proof и IDB epoch/auth-fence каждой попытки. Он не принимает
другой serverSessionId, включая same-account login и восстановленную страницу.
Очередь, снимки контекста, таймеры и ожидающие вызовы принадлежат своему
экземпляру. Cleanup/pagehide завершают их без unlock; late GET/POST не меняют
UI другого lifetime. Auth-пауза не переавторизуется; явный resume того же
серверного входа разрешает новую попытку. Поздний GET не стирает успешный unlock.

Первый новый E2E прогон: 21 failed — каждый на предупреждении Recharts
`width(-1)/height(-1)` при первом render графиков обзора. Функциональные
assertions прошли. Вместо фильтра console в двух `ResponsiveContainer`
задана фактическая высота существующих контейнеров 220 px. Следующий кандидат:
21 passed во всех семи проектах, 3 workers, retries=0, console errors/warnings
пусты. Затем login proof закреплён в App, добавлены регрессии уже сменившегося
IDB login, явного resume и гонки GET/POST; итоговые unit: 948 passed / 186 файлов.
Три typecheck, guards, schema/privacy, audit прошли; известных уязвимостей 0.
Полная браузерная матрица compiled bundle `57da2cf` завершилась:
219 passed / 3 failed / 9 skips, 3 workers, retries=0. Все 21 achievement
E2E прошли. Падения: Android profile auth-pause, iPhone Safari menu logout,
iPhone PWA profile conflict. Это не успешная приёмка компонента.

Последующая проверка до React cleanup обнаружила незавершённый caller:
таймер видел устаревший login lifetime и возвращался без завершения очереди.
Регрессия `achievement-queued-expiry-red.log` дала 1 failed; поправка
[`a407373`](https://github.com/Michael-edel/FitFocus/commit/a4073731ea2d30c107b49ff8cf7170dbffc8ed83)
отменяет именно своё поколение и завершает ожидающие вызовы. Все 14 client
тестов прошли (`achievement-queued-expiry-green.log`). Полный прогон,
который уже выполнялся, относится к compiled bundle `57da2cf`; результат
не переносится на новую поправку без её отдельных проверок.

Диагностика Android показала `/me` после PUT/profile 401. Отдельно новый unit
подтвердил реальный дефект: уже запущенный scoped proof мог снять auth-паузу,
появившуюся во время HTTP. В working tree приём scoped proof проверяет previous
account/session/epoch и pause в той же IDB-транзакции. RED: 1 failed;
после поправки прошли 62 storage/read/AI/achievement tests. Это ещё не
устанавливает caller Android `/me`: sender также умеет намеренно получать
свежий proof на focus/online. Сбор событий продолжен отдельно.

Доказательства вне Git: `achievement-guard-red.log`, `achievement-e2e.log`,
`achievement-e2e-clean-console.log`, `achievement-final-unit.log`,
`achievement-final-full-e2e.log`. Browser plugin not available: используется
repository Playwright/production preview `http://127.0.0.1:4173` с mock API.
Настоящие BFCache/devices/OAuth/staging этим не подтверждены. Временная
achievement-очередь и best effort localStorage counters не стали durable outbox;
остальные producers, items CAS/order, runtime legacy, conflict/backup и main
остаются открытыми. [Подробный контракт](achievement-session.md).

## 12.10.2026 — поздний proof и положение формы до нажатия

Код: [`4528e2b`](https://github.com/Michael-edel/FitFocus/commit/4528e2bba08c7868ad2b24be2285c9547140b865)
и [`724ecf1`](https://github.com/Michael-edel/FitFocus/commit/724ecf1aad05461d86644789f773ffca73f6efad).
Первый сохраняет auth-паузу при позднем автоматическом proof; второй резервирует
максимальную высоту уведомления, включая отсутствие сообщения. Контракты:
[достижения](achievement-session.md), [профиль](profile-persistence.md#дополнительная-проверка-до-pointerdown-12102026).

Повторная диагностика трёх прежних падений: 18 selected passed, 198 исключённых
сценариев, без retries. Это отдельный диагностический прогон, не полная матрица
и не доказательство исправления. Детерминированная проверка до pointerdown
выявила сдвиг кнопки Save на iPhone PWA на 106 px: 1 failed до поправки.
После поправки положение кнопки сохранилось во всех семи проектах.

Auth-fixture уточнён: после profile PUT/401 `/me` возвращает 401 до следующей
загрузки документа. Focus проверяет отказ proof без повторного PUT; reload
получает новый действующий proof и сохраняет opId. Промежуточный прогон:
85 passed / 6 failed. Все шесть ошибок относились к учёту намеренного HTTP 401
`/api/me?t=…`: сравнение URL по окончанию строки не учитывало query, а проверка
флага текущего document lifetime была нестабильна при отложенном console event.
Теперь сверяется pathname и факт инъекции отказа proof. Общие CORS/pageerror,
неожиданные статусы и другие URL не фильтруются.

Итоговые unit: 950 passed / 186 файлов. Три typecheck, admin/auth/API guards,
schema (21 migrations, 30 tables), privacy (27 tables) и audit прошли;
0 известных уязвимостей по audit. Unit/guards выполнены на рабочем дереве
с теми же исполняемыми изменениями до их коммита. Production build затем
скомпилировал `724ecf1`; полная матрица этого runtime прошла:
229 passed / 9 explicit skips, 7 проектов, workers=3, retries=0, 12.8m.
Включены 21 achievement, 42 profile и 49 menu-сценариев. Это локальный результат;
CI нового опубликованного HEAD проверяется после push отдельно.

Markdown: сокращено дублирование истории в README и индексе документов;
добавлен контракт достижений, обновлены карта кода, правила помощника,
API, задачи, статус, чек-лист выпуска и границы приёмки. История SHA и неуспешных проверок сохранена.

Просмотрены `profile-stable-notice-idle.png` (первый viewport desktop)
и `profile-stable-notice-conflict.png` (desktop Chromium и Android).
Предупреждение читается и целиком видно; проверяются title/URL, отсутствие
Vite overlay, актуальные console errors и реальный Save → persistent conflict.
Среда: production preview `http://127.0.0.1:4173`, mock API, Playwright;
Browser plugin not available в текущем наборе skills.
На снимках светлой темы видны тёмные подписи sidebar/нижней навигации на
тёмном фоне. Дефект записан в P1, наряду с прежним WebKit native select.
Его не относим к исправленному notice и не объявляем весь визуальный QA успешным.


## 12.10.2026 — сверка Markdown и следующего рабочего компонента

Проверен итог [CI `42ee434`](https://github.com/Michael-edel/FitFocus/actions/runs/38189490979):
success, 950 unit / 186 файлов, 229 browser passed / 9 skips, 2 workers;
в итоговом browser summary нет flaky. Это подтверждение опубликованного
компонента достижений и формы, а не текущей незакоммиченной переработки.

Добавлены [матрица проверок P0](verification-matrix.md) и
[рабочий контракт личных покупок](personal-menu-projection.md).
Обновлены точки входа, TASKS, краткий статус и граница API. Матрица связывает
существующий план с тестами и открытыми условиями, не создавая нового плана.

Текущие изменения кода на базе `42ee434` сохраняют личные покупки как проекцию
принятого profile CAS. Два регрессионных RED-прогона подтвердили прежний список
после успешного CAS и ложный отказ CAS при учёте trigger-записей. После поправок
выборочно прошли 22 unit-теста / 5 файлов, включая 9 проверок проекции на SQLite.
Полный набор и браузеры новой реализации не пройдены. Известные следующие
поправки — capability clean refresh в StateSync и устаревший menu E2E.
Эти результаты не переносятся на SHA документационного коммита.

Проверены 30 основных MD-документов, 735 ссылок/якорей и 28 закреплённых
исходников; ошибок нет. `git diff --check` прошёл. Контрольные суммы всех
33 ранее изменённых файлов исполняемого кода и тестов сохранены; они
не входят в документационный коммит. Новый CI проверяется после push отдельно.


## 12.10.2026 — личные покупки следуют принятому profile CAS

Код [`4736ff5`](https://github.com/Michael-edel/FitFocus/commit/4736ff51b06f0062a6cb45a98169f4a4d0c39895),
[контракт](personal-menu-projection.md), [ADR-007](adr/ADR-007-personal-menu-projection.md).
Profile-outbox остаётся единственной очередью; вторичный личный POST удалён.
AFTER-triggers записывают историю покупок в том же SQL statement, что profile.
Ack использует RETURNING; старый личный POST отклоняется без изменения покупок.
Пустая генерация, отсутствие канонической недели и повреждение различаются.
GDPR export/delete и schema/privacy охватывают новую таблицу.

Регрессионные RED-прогоны подтвердили прежние покупки после успешного CAS,
ложный отказ CAS с trigger-записями и блокировку clean refresh без новой
write-capability. После разделения флагов все 18 profile-sender тестов прошли.
Первый общий unit-прогон: 962 passed / 2 failed — Huawei mock ожидал run,
а release contract требовал обновить DB_MIGRATION_VERSION. Следующий:
964 passed / 2 failed — новые проверки ожидали ненормализованное название
банана и неэкспортируемый user_id. Исправлены ожидания контракта тестовых
данных; проверки изоляции сравнивают собственный JSON и сохранность второго аккаунта.

Итог: 966 unit / 187 файлов; три typecheck, admin/auth/API guards,
schema (22 migrations / 31 tables), privacy (28 tables) прошли.
Audit: 0 известных уязвимостей. Unit/gates выполнены на рабочем дереве
с теми же исполняемыми изменениями до коммита. Негативная проверка на внешней
копии подтвердила отказ schema verifier при отсутствии update-trigger.

Изолированный workerd/D1, Wrangler 4.149.0, синтетическая БД/аккаунт:
16 HTTP-запросов прошли. Подтверждены capability, legacy fallback, profile CAS
с triggers, конкурентные 200/409, соответствие покупок принятому profile,
CSV, отказ старого личного POST, пустая генерация и откат некорректного меню.
Это локальный D1, не remote/staging. В Chromium прошли 8 menu E2E;
полная matrix с production build `4736ff5`, 3 workers, retries=0 ещё проверяется.

Просмотрены screenshots восстановления меню на desktop Chromium и отказа
без новой capability на Android Chrome: восстановленное блюдо и cloud saved
видны, предупреждение читается, кнопка генерации доступна. Title/URL,
содержимое страницы, отсутствие Vite overlay и console/pageerror проверяются
в E2E. Ожидаемый 503 учитывается только на инъецированном profile endpoint;
общие ошибки не фильтруются. Среда: production preview 127.0.0.1:4173,
mock API; Browser plugin not available, использован репозиторный Playwright.
Прежние P1-дефекты светлой навигации/native select этим компонентом не закрыты.

Условие выпуска уточнено: подготовительный CAS-сервер с RETURNING до 0020,
затем сервер проекции и capability smoke до клиента. Старый CAS после triggers
может ложно сообщить конфликт; старый reader при откате может скрыть проекцию.
Подготовительный выпуск, старые bundles, staging и совместимый откат ещё открыты.
P0 целиком не закрыт. CI нового опубликованного HEAD проверяется отдельно.


## 12.10.2026 — итог browser matrix и явный отказ неверного меню

Production build скомпилировал `4736ff51b06f0062a6cb45a98169f4a4d0c39895`.
Полная матрица: 236 passed / 9 explicit skips, 7 проектов, workers=3,
retries=0, 16.2m. Включены все 56 menu-сценариев с восстановлением opId после
503/reload и отказом до AI без новой capability. Ошибок в полном прогоне нет.

Локальный Worker выявил, что SQL-откат неверного меню приводил к общей
серверной ошибке. Поправка `830caf43895fe00bd9eddf2b58cf254afbe847c8`
проверяет input до persistence, итоговый profile до CAS и возвращает guarded
422 PROFILE_INVALID_WEEKLY_MENU. Десять новых RED-кейсов подтвердили дефект.
Неверная унаследованная форма не сохраняется при несвязанном patch; явное
удаление разрешено без угадывания недели. SQL trigger остаётся последней защитой.

После поправки прошли 976 unit / 187 файлов, три typecheck, admin/auth/API
guards, schema/privacy и повторный 16-request локальный Worker/D1 smoke с
точным 422 и неизменённой версией. Затем 47 targeted tests прошли с усиленным
assert явного удаления. Frontend и E2E не отличаются от `4736ff5`; новый полный
локальный browser-прогон не запускался для исключительно серверной поправки.
CI итогового опубликованного HEAD проверяется после push отдельно.

Обновлены текущий контракт, ADR-007, API, карта кода, модель данных, задачи,
статус, правила разработки и выпуск. Старые результаты сохранены выше
с их ревизиями; этап не объявляет main/deploy/staging выполненными.

Markdown: 31 основной документ, 771 ссылка/якорь и 28 закреплённых исходников
проверены без ошибок; git diff --check прошёл. Временные логи и screenshots
сохранены вне репозитория.

## 12.10.2026 — CI проекции и подготовка перехода 0020

[CI `2d1f480a71b4c8d6cb90e90e1308074a08082371`](https://github.com/Michael-edel/FitFocus/actions/runs/38194485398)
завершился success: 976 unit / 187 файлов, 236 browser passed / 9 skips,
workers=2; итоговый summary не содержит flaky. Обязательные проверки и build
прошли. Этот результат относится к указанному SHA.

Подготовлен код `dde4c7132a0a810f8c358c5935b084ff31e2cb43`, ветка
`fix/profile-cas-rollout`, база `14ca6380b6bb5bd918c5c71c68b0ca68a5ffb5d5`.
Промежуточная версия сохраняет прежние schema/items-контракты и меняет
profile CAS на `RETURNING version`. Пять файлов diff; frontend, зависимости
и миграции относительно базы не изменены. Это намеренная зависимая версия
до проекции, которую нельзя целиком сливать поверх итоговой ветки.

До поправки два trigger-регрессионных теста падали; после неё прошли
952 unit / 186 файлов, три typecheck, admin/auth/API guards, schema/privacy,
production build и сборка функций. Схема: 21 миграция / 30 таблиц,
privacy: 27 таблиц. CI опубликованного подготовительного HEAD проверяется
отдельно от CI итоговой ветки.

На одном локальном origin и изолированной D1 с синтетическим аккаунтом
пройден переход: 0019 + подготовительные функции → установка 0020 при
работающем сервере → функции проекции. 30 HTTP-запросов, включая readiness.
Подтверждены CAS после trigger, активация capability, отказ старого POST,
пустая генерация, последовательность прежнего клиента и неизменённая версия
после 422/401. Негативный откат функций показал legacy 999 г вместо принятых
400 г; возврат проекции восстановил 400 г без удаления данных.

Добавлена [инструкция перехода](profile-cas-rollout.md), обновлены точки
входа MD, задачи, release checklist и матрица. Проверка HTTP-последовательности
не заменяет реальный прежний bundle. Staging, production, совместимый откат,
семейные writers и общая приёмка P0 остаются открытыми.

Документационная проверка: 32 основных MD-файла, 795 ссылок/якорей и
28 закреплённых исходников; ошибок нет. Проверены имена npm-команд,
JSON-примеры и `git diff --check`. Исполняемый код в этом изменении не менялся.

## 12.10.2026 — семейные запросы и исходный login proof

Подтверждены CI предыдущих опубликованных веток:
[основной `d7ef1af`](https://github.com/Michael-edel/FitFocus/actions/runs/38196327356) —
976 unit / 187 файлов, 236 browser passed / 9 skips;
[подготовительный `c39904c`](https://github.com/Michael-edel/FitFocus/actions/runs/38196258543) —
952 unit / 186 файлов, 229 browser passed / 9 skips. Оба success, workers=2,
без flaky в итоговых summary. Это не подтверждает новый семейный код.

Код `9c44c2118749275cbb8ecaa11c520c43e4220000` добавляет семейную capability,
server scope до эффектов, fresh proof каждой HTTP-попытки и исходный login
guard из hydration для `useFamilyCloud`. React-state/setters и controllers
принадлежат своему входу/странице; покупки дополнительно проверяют familyId.
Неверные family/week и повреждённые ответы отклоняются до применения.
Отказ отметки восстанавливает её состояние и обрабатывается в UI.
[Контракт и границы](family-session.md).

До поправки 14 server regression tests падали. Первоначальный targeted прогон
после изменения: 32 passed / 1 failed — тест вызывал несуществующий helper
`pauseAccount`; он исправлен на фактическую IDB-транзакцию auth-паузы.
После исправления 33 targeted tests прошли. Пять Chromium-сценариев прошли
до последующего усиления target/data validation и добавления отказа checkbox.

Итоговый unit-прогон: 1009 passed / 189 файлов. Три typecheck,
admin/auth/API guards, schema (22 миграции / 31 таблица), privacy (28 таблиц)
и audit (0 известных уязвимостей) прошли. Production browser matrix `9c44c21`:
семь проектов, workers=3, retries=0; 272 passed / 6 failed / 9 skips (20,4 мин).
Все 42 семейных сценария прошли. Отказы profile/storage/weekly-menu на iPhone
сохранены вместе с trace/screenshots. В трассировках видны ожидания отсутствующих
контролов и общего timeout; новый page создавался до 12 секунд, click занимал
до 16 секунд. Неожиданных page/console errors в этих трассировках нет;
один 409 — намеренный конфликт. Диагностический прогон шести сценариев на обоих
iPhone-проектах прошёл: 12 passed (3,8 мин), workers=1, retries=0, без изменения
кода и без увеличения timeout. Нагрузка хоста — возможное объяснение по
трассировкам; успешная диагностика не заменяет полную проверку нового HEAD в CI.

На локальном workerd/D1 код `9c44c21` прошёл 23 HTTP-запроса с двумя
синтетическими аккаунтами, одним origin и одной базой. Проверены capability,
десять ранних отказов неверного scope, отсутствие случайного создания семьи,
create/invite/join/member, save/generate/read, shared shopping/check и
чужая account/session-привязка. Приватный sid не появляется в ответах.
Собственные процессы fixture остановлены, порт 8799 закрыт; удалённая база
и production не использовались.

Browser plugin not available: repository Playwright на `127.0.0.1:4173`,
mock API. Desktop, Android и iPhone screenshots просмотрены; сценарии проверяют
приглашение/checkbox, неверную capability, новый login того же аккаунта,
logout и синтетические pagehide/pageshow. Это не реальный BFCache/OAuth/D1/staging.
AI-путь `useFamilyMenu`, семейные CAS/durable-порядок, остальные callbacks,
runtime legacy и общая приёмка P0 остаются открытыми. Main/deploy не выполнялись.

MD-контракты и точки входа обновлены вместе с компонентом. Проверены
33 документа, 830 ссылок/якорей и 33 закреплённых исходника; ошибок нет.
Проверены имена npm-команд, JSON-примеры и `git diff --check`.

## 12.10.2026 — полный CI семейного компонента и обновление MD

[CI `3baac01c98bd82ab7a87c0e9c2999914db194590`](https://github.com/Michael-edel/FitFocus/actions/runs/38200234936)
завершился success: audit 0, schema/privacy/auth/API checks, 1009 unit / 189 файлов,
три typecheck, build и полная browser matrix — 278 passed / 9 skips.
Семь проектов, workers=2, browser 10,4 мин; flaky в итоговом summary нет.
Исполняемый код — `9c44c21`; timeouts и код после локальной диагностики не менялись.
Отдельный push-run отменён штатной concurrency, PR-run успешно завершён.
Первый локальный неуспешный прогон и диагностика сохранены в предыдущей записи.

Статус, README, TASKS и матрица ссылаются на подтверждённый CI конкретного SHA.
Последующие документационные HEAD проверяются отдельно. В контракт и release
checklist добавлены границы явной семейной цели, CAS/доставки и staging;
account/session proof не фиксирует членство в семье. Новая схема/зависимости
в этом MD-обновлении не вводятся. Общий P0, merge и deploy остаются открытыми.

После обновления проверены 33 MD-файла, 834 ссылки/якоря и 33 закреплённых
исходника; ошибок нет. Имена npm-команд, JSON-примеры и diff проверены.

## 12.10.2026 — подтверждение опубликованных MD и границы текущей работы

[CI `0eae743a33544d4cd707efb825ea24ae30c2a7fd`](https://github.com/Michael-edel/FitFocus/actions/runs/38201311011)
завершился success. Лог job `114655139035` подтверждает 1009 unit / 189 файлов,
три typecheck, audit/schema/privacy/auth/API checks, build и полную browser
matrix: 278 passed / 9 skips (8,9 мин). Семь проектов, workers=2;
flaky в итоговом summary нет. Отдельный push-run отменён штатной concurrency.

В MD обновлены опубликованный CI и граница незавершённой реализации
семейного меню: family/week CAS и доставка через ту же outbox начаты
локально, но AI-клиент ещё не подключён и полная проверка нового кода
не выполнена. Результаты `0eae743` не подтверждают эти правки. Открытые
критерии остаются в TASKS; новый контракт будет сверяться с завершённым
кодом и его тестами. Этот документационный коммит не публикует локальные
изменения исполняемого кода или схемы. Merge, staging и deploy не выполнялись.

Проверены 33 MD-файла, 843 ссылки/якоря и 33 закреплённых исходника;
ошибок нет. Имена npm-команд, JSON-примеры и `git diff --check` проверены.
Содержимое 27 ранее изменённых файлов кода и схемы сверено по SHA-256:
документационная задача их не изменила.

## 12.10.2026 — семейное меню: CAS, одна очередь и guarded AI

В рабочей версии после dbb22aa реализованы единое family/week поколение,
SQL CAS RETURNING и покупки из того же JSON. AI и server-preview сохраняют
одно familyMenu intent в существующей IDB-outbox. Убраны два прямых family
writers и общий snapshot кэша аккаунтов; shared profiles строятся только из
явных family данных. Personal weekly AI дополнительно передаёт исходный
login guard вместо возможного принятия другой текущей IDB-сессии.

1039 unit / 191 файл прошли. Первые три real-SQL теста CAS были RED до
реализации; новая проверка частичной миграции не включает legacy writer.
Три typecheck, guards, schema (23 миграции / 32 таблицы), privacy (29 таблиц)
и полный npm audit (0) прошли. IDB тесты v2→v3 сохраняют старые values,
pending, ledger, quarantine и fence; это ещё не две настоящие сборки.

Первый Chromium-прогон: 4 passed / 1 failed. Logout показал реальный
стартовый экран FitFocus, а тест искал отсутствующую Google-кнопку.
Ожидание исправлено по DOM без изменения runtime. После добавления recovery,
profile-edit и pagehide сценариев: 16 passed, Chromium/iPhone Safari,
workers=2, retries=0, 2,0 мин. Browser plugin not available: repository
Playwright/mock API на 127.0.0.1:4173. Новые сценарии проверяют реальные UI
контролы, loading/error и данные/операции IDB, а не только число HTTP.
В логах preview при teardown есть один native `/api/me?t=…` proxy
ECONNREFUSED. Page/console health прошёл; причина этого запроса отдельно
не доказана и сообщение не скрыто. Реальные BFCache/OAuth не подтверждены.

Актуальный серверный bundle на локальном workerd/D1 повторно прошёл 33 HTTP
с двумя синтетическими аккаунтами на одном origin/database: capability,
ранние 401, preview без persistence, CAS/409, member read/owner-only write,
чужая цель, старые menu/items/generate=409, generic state=403, empty generation.
Собственные fixture-процессы остановлены, порт 8799 закрыт; remote/production
не использовались. Полная browser matrix, новый CI, actual bundles, staging,
compatible rollback и recovery повреждённых/конфликтных данных ещё открыты.

Добавлены [контракт](family-menu-state.md) и [ADR-008](adr/ADR-008-family-menu-generation.md).
Результат предыдущего документационного CI dbb22aa — success; он проверяет
прежний семейный session-код и не относится к новым локальным исходникам.

## 12.10.2026 — публикация и приёмка семейного поколения 405238b

Код опубликован: `405238b9fd4d59b9ed76fcc4563b7850943df1a4`, ветка
fix/durable-outbox, draft PR #93 с базой fix/state-generations (#94).
[CI точного SHA](https://github.com/Michael-edel/FitFocus/actions/runs/38208076392)
завершился success: 1039 unit / 191 файл, все guards/typecheck/schema/privacy,
audit/build, 334 browser passed / 9 skips. Семь конфигураций, два worker,
13,9 мин browser, без flaky в итоговом summary. Дублирующий push-run
отменён штатной concurrency.

Полный локальный production-preview прогон того же кода:
332 passed / 2 failed / 9 skips, workers=2, retries=0, 30,8 мин.
Registration/desktop WebKit превысил общий timeout 45 с; trace показывает
newPage 9,2 с, click 9,1 с и ожидания AI-экрана 12,5/5,5 с. Введённый profile
401 присутствовал; неожиданных console/page ошибок не обнаружено.
Family server-preview/iPhone PWA не дождался названия семьи за 10 с:
снимок оставался loading, API ответили 200, console/page errors отсутствовали.
В preview также зарегистрированы native `/api/me` и `/api/achievements`
proxy ECONNREFUSED рядом с teardown; причина отдельно не доказана и логи
не фильтровались ради зелёного статуса.

Те же два сценария на desktop WebKit и iPhone PWA с одним worker,
retries=0 и неизменными кодом/таймаутами прошли 4/4 (1,8 мин).
Это диагностический результат; полный локальный прогон остаётся 332/2/9.
Нагрузка хоста — предположение. Скриншоты успешных desktop/iPhone покупок
проверены визуально: 700 г видны, мобильная навигация не перекрывает строку.

Actual bundles: 2/2 Chromium, один origin/context/IDB, старый `3baac01`
и текущий `405238b`, отдельно pending и conflicted. Старые исходники из
git archive собраны без изменения исполняемого кода; lockfile совпадает.
После versionchange 2→3 реальный старый v2-код получил VersionError при
reopen; старые мутации после upgrade=0. После reload сохранились family
opId/value/status и remote version 8 для conflict, прежний pending profile,
пять stores, marker ledger/quarantine, account/session и неубывающий fence.
Manifest содержит реальные script requests и SHA-256 assets/HTML.
Page errors=0, console errors соответствуют введённым 503/409.

Первый внешний bundle-fixture получил protocol pause от неполного общего
state mock ack. После явного state=503 итоговый запуск прошёл 2/2;
продуктовый код не менялся. Исходный неудачный лог и итоговые артефакты
сохранены вне Git. Собственный preview остановлен, порт 4173 закрыт.

Границы: mock API, Service Worker blocked; настоящий legacy import,
Map/localStorage writer, SW/PWA-кэш, BFCache/OAuth, staging, совместимый
rollback artifact и protected-main интеграция ещё открыты. Точная область —
[контракт семейного меню](family-menu-state.md). После `405238b` этот follow-up
меняет только Markdown и не переносит CI реализации на новый MD HEAD.

MD-проверка: 35 документов, 885 ссылок/anchors и 33 pinned source paths,
ошибок нет; diff проверен, изменений исполняемого кода после `405238b` нет.

## Сверка MD-файлов проекта — 12.10.2026

База документации — опубликованный `1d9cb89340eab012c2fac926663853a00b2bac77`,
ветка `fix/durable-outbox`, draft PR #93 с базой `fix/state-generations`.
[CI точного SHA](https://github.com/Michael-edel/FitFocus/actions/runs/38211291529)
завершился success: 1039 unit / 191 файл, 334 browser passed / 9 skips
(14,2 мин browser), без flaky в итоговом summary. Проверены статус workflow
и логи job 114685828639. Это результат опубликованного MD-коммита после
семейного кода `405238b`, а не проверка текущего рабочего дерева.

README и карта документов теперь ведут к семейному CAS и его приёмке;
устаревшие указания на ещё не реализованные CAS/доставку исправлены.
CONTRIBUTING содержит шаблон записи результата с SHA, окружением,
неуспешными проверками, ограничениями и статусом выпуска. Контракт
legacy-нормализатора сверён с `storage/legacyQueue.ts`: непустой key,
обязательная строка для put, отсутствие value для delete, отсутствующие
счётчики нормализуются в 0, присутствующие требуют целого неотрицательного
числа; все семь причин отказа сохраняются в типе карантина.

Незакоммиченные изменения PWA и последний неуспешный браузерный сценарий
отмечены [в статусе рабочего дерева](project-status.md#рабочее-дерево--обновление-pwa).
В этом изменении обновляются только MD-файлы; runtime и тестовые правки
PWA сохраняются отдельно. Следующий шаг — разобраться с формой после
реального SW reload и подтвердить сохранность pending-операций.
Приёмка P0, runtime legacy-импорт, staging, совместимый откат, merge и deploy
не объявляются завершёнными.

MD-проверка: 35 документов, учтено 895 ссылок; проверены локальные
ссылки/якоря и 33 закреплённых source paths, ошибок нет; `git diff --check` прошёл.
Unit/browser повторно не запускались для этого изменения документации.

## Явное обновление PWA — 12.10.2026

База — `60c54219c98069099d7125225c4332a7a00f1b05`, ветка `fix/durable-outbox`.
[CI базы](https://github.com/Michael-edel/FitFocus/actions/runs/38214518560)
завершился success: 1039 unit / 191 файл, 334 browser passed / 9 skips,
11,3 мин browser, без flaky в итоговом summary. Проверены workflow и логи
job 114696036391. Этот результат не относится к следующему PWA-компоненту.

`injectManifest` переведён на prompt. `sw.ts` принимает `SKIP_WAITING` только
после явного действия; `pwa.ts` предлагает обновление и обрабатывает отказ
фонового availability check. Уведомление предупреждает сохранить все вкладки,
не сдвигает форму и использует непрозрачный фон темы. Повторное нажатие
блокируется; timeout/ошибка разрешают повтор, поздний ответ завершённой
попытки не меняет новую. [Контракт](pwa-updates.md).

Proper RED старого поведения: новый настоящий worker установлен в `waiting`,
семейное намерение сохранено, кнопка обновления отсутствует. Промежуточные
ошибки fixture сохранены: путь под node_modules менял manualChunks, затем
обнаружена подмена SW общим push mock. После переноса старого build в temp
и сохранения настоящих SW объектов тест воспроизвёл продуктовую проблему.
Первый green-attempt не нашёл форму после reload: исходный deep link оставался
`#family`, выбор экрана менял только React state. Проверка теперь открывает
настройки явно и читает owned profile из IDB до/после активации.

Две unit-регрессии сначала подтвердили ошибку позднего отказа; после защиты
завершённой попытки все четыре проверки прошли. Первый browser-прогон с route
mock: 3 passed / 4 failed. WebKit SW-запрос bootstrap обходил page.route и
получал 500 от fixture; API перенесён на native HTTP. Native-прогон: 6/1,
Firefox сообщил layout-warning из debugger eval code при раннем обращении
к перезагруженной странице. Ожидание load исправило порядок; Firefox и
iPhone Safari прошли 2/2 без фильтра этого предупреждения.

Итоговый связанный прогон: 63 passed, семь конфигураций, workers=1/retries=0,
12,2 мин. Семь real-SW сценариев проверяют настоящий v2 `3baac01`, текущий
v3 на том же origin/context, ожидание, «Позже», ввод до обновления, commit
профиля, reload обеих вкладок, прежний family opId/700 г и отсутствие API
в CacheStorage. Остальные 56 — прежние семейные проверки с mock API.
В native flow ошибки приложения отсутствовали, 503 family state введён намеренно.
В общем логе preview сохранились ECONNREFUSED для /api/me и /api/achievements
около завершения отдельных семейных сценариев. Причина отдельно не доказана;
сообщения не отфильтрованы и не объявляются исправленными PWA-компонентом.

Усиленный сценарий с потерей первого SKIP_WAITING прошёл 7/7 на тех же
конфигурациях, workers=1/retries=0, 5,1 мин. Настоящие SW/registration/HTTP
сохранены; перехвачено только первое отправление сообщения, затем исходный
postMessage восстановлен. До deadline reload обеих вкладок=0, черновик и
семейный payload сохранены; после локального profile commit повтор активировал
worker и перезагрузил обе вкладки. Profile, family opId/value и IDB v3 сохранены;
неожиданного API и ошибок приложения нет. Введённые 503 сохранены в диагностике.
Desktop-уведомление и mobile retry-state визуально проверены: непрозрачный фон,
читаемый текст, поле черновика и доступные кнопки. Прежний низкий контраст
native select WebKit остаётся отдельной задачей P1.

Полный unit-прогон: 1043 passed / 192 файла, maxWorkers=2, 37 с. Все три
typecheck прошли; admin/API/auth guards, schema parity (23 миграции/32 таблицы),
privacy coverage (29 таблиц) и npm audit (0) прошли. Production build выполнен
browser-прогонами. Новый CI точного опубликованного SHA ещё требуется.
Логи pwa-family-final-seven, pwa-native-retry-seven и pwa-final-* и изображения
находятся во внешнем outputs рабочей задачи; исполняемые изменения кандидата
сверены по SHA-256 перед коммитом.
MD-проверка: 36 документов, учтено 924 ссылки; локальные ссылки/якоря
и 33 закреплённых source paths проверены, ошибок нет. Diff проверен.
Артефакты — вне Git,
Browser plugin not available; используется repository Playwright/production
build. Реальные устройства/OAuth/BFCache, old Map writer, runtime legacy,
совместимый rollback artifact, staging, protected-main merge и deploy открыты.

## Сверка MD и диагностики teardown — 12.10.2026

Ветка `fix/durable-outbox`, опубликованный код
`8d32f12279039e5d549c6e3534f741b601084812`. В этом изменении обновляется
документация: карта MD получила рабочий цикл, README/TASKS/статус/контракт PWA
различают опубликованный код, локальные проверки и подтверждённый CI.
[Workflow 38224847501](https://github.com/Michael-edel/FitFocus/actions/runs/38224847501)
завершился success: 1043 unit / 192 файла, 341 browser passed / 9 skips,
16,6 мин browser, без flaky в итоговом summary. Проверены статус workflow
и логи job 114730233874. Этот результат относится к `8d32f12`;
следующий MD-коммит проверяется отдельно.

Legacy-нормализатор повторно сверен с `storage/legacyQueue.ts` и
`tests/legacy_queue.test.ts`: согласованные проверки присутствуют, delete
возвращается без value, fingerprint не зависит от retryCount. Это проверка
исходников; unit-тесты для изменения MD повторно не запускались. Runtime
определение владельца legacy и остановка старых writers остаются открытыми.

Завершены два ранее запущенных диагностических прогона двух семейных
сценариев на desktop WebKit/iPhone Safari: workers=1, retries=0, trace=on.
В обоих 4 passed, но по три preview `http proxy error`/`ECONNREFUSED`.
В первом `/api/me` появился через 132 мс после начала context.close, пока
страница ещё не закрылась. В сравнительном прогоне явный page.close перед
teardown контекста не устранил ошибки. Логи `pwa-proxy-close-observe.log`
и `pwa-proxy-close-page.log` сохранены во внешнем outputs рабочей задачи.
Временные диагностические hooks удалены; файл теста совпадает с HEAD.
Исправление fixture не объявляется выполненным, ошибки не фильтруются.

Для текущего MD-изменения проверяются содержание, UTF-8, ссылки/якоря,
закреплённые исходники и diff; повторный production build не требуется.
Результат: 36 документов, учтено 938 ссылок; локальные ссылки/якоря
и 33 закреплённых source paths проверены, ошибок нет; diff прошёл.
Приёмка P0, реальные устройства, staging, совместимый откат, merge и deploy
остаются открытыми.

## MD-файлы и сверка первого SW-клиента — 12.10.2026

Ветка `fix/durable-outbox`, опубликованный SHA на момент сверки —
`574de761e8ecf8017f7b111e9a48da66f59aa6c1`. Обновлены точки входа,
задачи, карта кода, архитектура и gate выпуска; добавлен контракт артефакта
отката с явной пометкой незавершённого рабочего компонента. Исполняемые
изменения, lockfile и workflow не включаются в этот MD-коммит.

[Workflow 38234201581](https://github.com/Michael-edel/FitFocus/actions/runs/38234201581)
для `574de76` завершился success. Проверены head_sha, статус job 114761279116
и его логи: 1047 unit / 193 файла, 341 browser passed / 9 skips, 15,9 мин.
Два preview `ECONNREFUSED` для `/api/me` остались в логах; задача teardown
не закрыта. CI прежнего `15b29c8` также подтверждён: 1043 unit / 192 файла,
341 browser passed / 9 skips, job 114738545822, 16,2 мин.

Локальный артефакт базы `574de76` содержит 82 файла; архив размером
12 498 944 байта сохранён вне Git. SHA-256 архива:
`091cda3b2bd887ea27c5aa76eb941cf0b224fc929b2464127df54fbebcb21818`.
С базой `574de76` диагностическая проверка свежей установки и pending
прошла 6/6 на desktop Chromium/Firefox/WebKit. Предыдущая база `8d32f12`
не прошла свежую установку → явное обновление: controller менялся без reload.
Она не выбрана итоговой базой. Полные прогоны с прежней базой дали 19/21;
они не считаются полной приёмкой нового артефакта.

В `rollback-retry-after-red.log` новый Chromium-сценарий с намеренным
HTTP `Retry-After: 20` завершился 1 failed. После ручной синхронизации
`nowMs=1791800428029`, `nextAttemptAtMs=1791800442182`, retryCount=1.
В конце 10-секундного ожидания `nowMs=1791800437989`: до разрешённой
попытки оставалось 4193 мс. Это подтверждает ошибку фиксированного бюджета
ожидания именно этого прогона. Причины прежних двух pending-падений этим
не устанавливаются. Следующий шаг — учитывать persisted backoff/lease
в тесте, сохраняя production claim и retry guards, затем повторить матрицу.

Локальная HTTP-проверка распакованного архива прошла 23 запроса с общей D1.
Последняя пара кандидат/архив имеет один SHA `574de76`: доказан перезапуск
из архива, а разные серверные ревизии предстоит проверить новым кандидатом.
Логи `rollback-574-diagnostic.log`, `rollback-retry-after-red.log` и
`rollback-http-574-final.log` сохранены во внешнем outputs рабочей задачи.
Полная приёмка артефакта, его публикация из CI, реальные устройства/OAuth,
runtime legacy, staging, protected-main merge и deploy остаются открытыми.

Для MD-изменения проверены 37 документов, 965 ссылок и 33 закреплённых
source paths: ошибок нет. `git diff --check` прошёл. Runtime-тесты для
изменения документации повторно не запускались; новый CI проверяется
после commit/push именно этого набора MD-файлов.

## Сохранённый client/SW/Pages Worker — 12.10.2026

База реализации — `d3a9496d8bdc40c8389ff5fbba0df142b3a0dbbc`,
ветка `fix/durable-outbox`. [Её CI](https://github.com/Michael-edel/FitFocus/actions/runs/38236933880)
завершился success: 1047 unit / 193 файла, 341 browser passed / 9 skips,
16,6 мин browser. Проверены head_sha, статус и логи job 114770239074;
в summary нет flaky, в этом логе нет preview `ECONNREFUSED`. Прежняя
воспроизведённая проблема teardown остаётся открытой.

Добавлены `release:build`, `release:verify`, `release:check`, точный
Wrangler 4.149.0 в devDependencies и CI gate сохранения проверенного архива
на 90 дней. Упаковка берёт точный Git SHA, полный Pages Worker и client/SW,
сохраняет исходники/миграции/config/lockfile и inventory с SHA-256.
Артефакты находятся вне Git. Существующие записи lockfile не изменены;
добавлены только Wrangler и его зависимости. Контрольные суммы подтверждают
целостность, но не заменяют проверку совместимости.

Локальные unit: 1053 passed / 194 файла, maxWorkers=2, 56,57 с.
Шесть новых проверок покрывают inventory/tamper/extra/missing, junction,
неподдерживаемую схему, mutable ref и путь output внутри checkout.
Три typecheck, guards/schema/privacy и audit (0) прошли;
общий typecheck повторён после последних изменений E2E и прошёл.
Схема: 23 миграции / 32 таблицы, privacy: 29 таблиц.

`release:check` распаковал сохранённый `.tar`, сверил manifest, собрал
кандидат из Git, затем поочерёдно запустил два настоящих Pages Worker
на одном локальном origin/D1. Для `d3a9496` → `574de76` прошли 23 HTTP:
canonical profile/family и покупки, CAS после отката, owner/session guard,
отказ старых writers, пустые поколения без legacy fallback, сохранность
legacy 333/999. SHA различаются, но server functions/migrations одинаковы.
Лог: `rollback-http-d3a9496-final.log`; worker-процессы остановлены своим
finally, production и удалённая D1 не использовались.

После доказанного RED с Retry-After 20 с исправлен бюджет восстановления
pending по сохранённому nextAttemptAtMs/startedAtMs и lease. HTTP-фикстура
фиксирует acceptedAtMs; приём проверяется не раньше persisted deadline.
Production sender/claim/backoff не изменены. Диагностика: 3/3 desktop-движка,
`rollback-retry-budget-green.log`, 2,5 мин.

Первый полный прогон новой базы `574de76`: 26 passed / 2 failed,
14,9 мин, workers=1/retries=0 (`rollback-574-seven-final.log`). Firefox
forward-сценарий получил layout-warning от Playwright after-action snapshot
во время reload (debugger eval line 393). Android pending-сценарий сохранил
и доставил операцию после deadline, но получил четыре DNS-ошибки
`accounts.google.com/gsi/client`; это подтверждено network trace.
Консоль не фильтровалась. Успешный click теперь возвращается до навигации;
сценарии отдельно ждут framenavigated/load перед чтением нового DOM.
Forward-сценарий проверяет JS кандидата в обеих вкладках. Временная подмена
внешнего GIS-loader дала 4/4 Firefox/Android, workers=1/retries=0, 1,9 мин
(`rollback-reload-oauth-diagnostic.log`). Второй полный прогон
`rollback-574-seven-acceptance.log`: 26 passed / 2 failed, 15,0 мин.
Свежая установка и pending на iPhone Safari снова получили DNS-ошибки SDK;
запросы после SW control обходили page.route. Подмена удалена из appHarness;
общая синтетическая замена SDK не считается решением. Assets/API/SW
не перехватываются. Архив `574de76` не принят; продуктовая поправка ниже.

Browser plugin not available; использованы repository Playwright и production
build. Скриншоты уведомления desktop/Android визуально проверены: читаемый
текст, непрозрачный фон, доступные кнопки. Реальные устройства, OAuth/BFCache,
runtime legacy ownership/writers-stopped, staging, protected main и deploy
этим компонентом не закрываются. CI его точного опубликованного SHA требуется.

## Удаление лишней сетевой зависимости PWA — 12.10.2026

Изменение поверх `d3a9496d8bdc40c8389ff5fbba0df142b3a0dbbc`.
Из `index.html` удалён безусловный `accounts.google.com/gsi/client`:
в клиенте нет вызовов GIS, а [кнопка входа](../OAuthSignInButton.tsx)
переходит на [серверный OAuth start](../functions/api/auth/google/start.ts).
Лишний запрос мог падать по DNS даже в авторизованной PWA. Удаление SDK
не заменяет реальный Google OAuth или его staging-проверку.

Расширенный [auth-shell E2E](../e2e/pwa-shell.spec.ts) проверяет отсутствие
запросов к Google при загрузке, manifest/настоящий SW, нажатие Google-входа,
invite/redirect и pending-oauth в sessionStorage. API и подставной OAuth
endpoint обслуживаются native HTTP; page.route не подменяет SW-запросы.
RED до исправления: один запрос к GIS, `oauth-unused-sdk-red.log`.
Первое расширение с page.route дало 3 passed / 4 failed из-за обхода маршрута
SW. Первый native HTTP прогон двух сценариев: 13/14, единственный отказ —
Firefox Quirks Mode у тестового endpoint без doctype. Фикстура исправлена.
Финальная auth-shell матрица: 7/7, workers=1/retries=0;
`oauth-unused-sdk-auth-final.log`. Консоль не фильтруется.

[Forward E2E](../e2e/pwa-update.spec.ts) прошёл 7/7 в native HTTP прогоне:
старые v2 app/SW bytes сохранены; только внешний неиспользуемый SDK старого
первого uncontrolled-клиента получает синтетический ответ. Текущий клиент
вообще не запрашивает GIS. Перед активацией подписаны navigation listeners;
click не ждёт навигацию, затем обе вкладки дожидаются load. Их JS сверяется
с кандидатом; pending opId/value, профиль и IDB v3 сохраняются. Это исправляет
гонку trace-снимка при reload без фильтрации Firefox warning.

Шесть unit-проверок OAuth start/state прошли; typecheck прошёл. Production
build выполнен browser-прогонами. Реальные Google OAuth/устройства/staging
не проверены. Артефакт `574de76` ещё содержит лишний SDK и не принимается
итоговой базой: после публикации этого исправления нужна новая сохранённая
сборка и её полная приёмка. Исправление опубликовано отдельным коммитом
`98d49101e15ad652e1960381ce00e00e8dac0d44`;
[CI](https://github.com/Michael-edel/FitFocus/actions/runs/38243684629) завершился
success: 1047 unit / 193 файла, 340 browser passed / 1 flaky / 9 skips,
16,9 мин browser. Сверены head_sha, статус run/job 114792725549 и его лог.
Firefox PWA-update в первой попытке превысил 90 секунд на `saved(page)`
(`familyHarness.ts:11`, вызов `pwa-update.spec.ts:56`) до активации SW,
затем прошёл с retry. Это не устанавливает причину IDB-зависания; trace
и lifecycle требуют отдельной диагностики. В логе также один preview
`ECONNREFUSED` на `/api/me`; исправление teardown не подтверждено.
Незакоммиченный артефактный компонент пока закрепляет прежний `574de76`.

## Сверка CI документации 5828f29 — 12.10.2026

[Run 38246462224](https://github.com/Michael-edel/FitFocus/actions/runs/38246462224)
завершился success; сверены head_sha `5828f29a519d7350241f24c6acb8f83f78aac13e`,
terminal job 114801439248 и лог. 1047 unit / 193 файла; browser — 341 passed /
9 skips, 11,1 мин, без flaky в summary. В логе четыре preview `ECONNREFUSED`;
teardown и прежний Firefox timeout не считаются исправленными MD-коммитом.
Артефакты run `98d4910` отдельно запрошены через GitHub: список пустой,
поэтому trace первой неуспешной Firefox-попытки этим run не сохранён.
Следующий workflow добавляет сохранение browser report/test-results на 14 дней.

## Новый архив 98d4910: browser-приёмка — 12.10.2026

Рабочий компонент на HEAD `5828f29a519d7350241f24c6acb8f83f78aac13e`
переносит preparer/HTTP checker/workflow на точную базу
`98d49101e15ad652e1960381ce00e00e8dac0d44`. Старый v2 `3baac01` не заменён.
Добавлены упаковщик, HTTP checker, шесть integrity unit и 21 rollback/install
сценарий; Wrangler 4.149.0 закреплён как devDependency. Старые записи lockfile
не изменены/не удалены; добавлены 85 записей Wrangler и его зависимостей.

Архив `rollback-98d4910-v1.tar` во внешнем outputs: 12529664 байта,
SHA-256 `d1778970dbd34313c7c9f9b849bb1c8e549d9fb39ea04218446e6671f8f86060`. Manifest: 82 файла,
Node v24.19.0/Wrangler 4.149.0,
IDB v3/D1 0021. Сборка через точный git archive, полный Pages Worker успешно
скомпилирован; release:verify прошёл. Source, lock, migrations, assets и worker
сохранены вместе. Безусловный Google SDK отсутствует в HTML.

`npm run test:e2e -- e2e/pwa-rollback-install.spec.ts e2e/pwa-rollback.spec.ts
e2e/pwa-update.spec.ts --workers=1 --retries=0 --reporter=list` с
FITFOCUS_ROLLBACK_ARTIFACT, указывающим на этот архив: **28 passed (13,2 мин)**,
по четыре сценария на Chromium/Firefox/WebKit/Android/Android PWA/iPhone Safari/
iPhone PWA. Лог `rollback-98d4910-seven-final.log`, процесс завершился exit 0.
Проверены fresh install/явное обновление, pending/conflicted rollback,
обе вкладки, JS артефакта/кандидата, профиль, IDB v3, opId/value/serverSnapshot,
ledger/quarantine/auth-fence. Pending доставлен после восстановления API
не раньше сохранённого Retry-After; production claim/backoff не изменены.
Новый rollback-клиент не запрашивает Google SDK; подмены SDK в этих тестах нет.
Исторический v2 forward-тест сохраняет только ранее описанную внешнюю подмену.

Root typecheck и шесть integrity unit прошли; предыдущий полный прогон этого
компонента — 1053 unit / 194 файла — сохранён выше. Browser plugin not available;
использован repository Playwright, production build и настоящий SW/native HTTP.
Desktop/Android screenshots просмотрены: читаемый непрозрачный баннер,
доступные кнопки, framework overlay отсутствует. API synthetic; это не OAuth,
реальное устройство или staging. Прежний CI Firefox timeout не воспроизведён
этой матрицей и не считается исправленным. Сохранение browser diagnostics
на 14 дней добавлено для будущих CI-падений, rollback .tar — на 90 после приёмки.
HTTP/D1-переход точного нового кандидата и CI компонента ещё выполняются отдельно.
Runtime legacy/old writers, protected main, staging и deploy остаются открытыми.

## HTTP/D1 нового сохранённого архива — 12.10.2026

Компонент опубликования подготовлен коммитом
`bd763ece5897e5718eb05dd6567bb986f3a34f45` (21 файл, включая инструменты,
npm/lock, workflow, проверки и MD). После коммита `npm run release:check --
<outputs/rollback-98d4910-v1>` завершился exit 0: **23 HTTP** для кандидата
`bd763ece5897e5718eb05dd6567bb986f3a34f45` → сохранённого `.tar` `98d49101e15ad652e1960381ce00e00e8dac0d44`.
Архив распакован и проверен; два полных Pages Worker запущены поочерёдно
на `http://127.0.0.1:62511` с одной локальной D1 и синтетическими аккаунтами.
Canonical profile/family и shopping читают 700 вместо legacy 333/999,
CAS и новый commit после отката работают; stale=409, не-владелец=403,
неверная session=401, старые writers=409. Пустые canonical поколения
возвращают пустой список, legacy строки 333/999 сохранены. Inventory worker
после выполнения проверен. Процессы остановлены собственным finally.
Server functions/migrations между SHA одинаковы (git diff --quiet); этот
результат подтверждает сохранённые release bytes и совместимость данных,
но не разные серверные алгоритмы. Лог `rollback-98d4910-http-final.log`,
worker log `C:\Users\User\AppData\Local\Temp\fitfocus-rollback-http-37zvMz\worker.log`; внешнее outputs/temp, production не использован.
Следующий MD-коммит фиксирует доказательства без изменения исполняемого кода.
CI точного итогового HEAD и загрузка `.tar` ещё проверяются отдельно.
Реальные устройства/OAuth/BFCache/staging, runtime legacy, main и deploy открыты.

## Поправка контекста workflow артефакта — 12.10.2026

Первый push `66b4de7` создал [run 38249159418](https://github.com/Michael-edel/FitFocus/actions/runs/38249159418),
который завершился failure до создания jobs (список jobs пуст). В добавленном
job-level env использовался runner.temp. По [таблице контекстов GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability)
runner недоступен в jobs.<job_id>.env, но доступен в steps.env/with.
Переменная FITFOCUS_ROLLBACK_ARTIFACT перенесена в env шагов E2E и HTTP;
путь upload-artifact в with остаётся тем же. Версия upload-artifact v7.0.2
проверена через официальный Git ref; тег существует. Приложение, архив и
тестовые сценарии не менялись; повторная browser matrix не требуется.
Новый push должен подтвердить создание job и полный CI; предыдущий failure
не скрыт перезапуском и не считается успешной приёмкой компонента.
## Сверка MD и рабочей mock-фикстуры — 12.10.2026

Документация сверена с опубликованным HEAD
`5b902499705e17b85045234ff952b0ede8944a70`, ветка `fix/durable-outbox`.
Устранены устаревшие отметки о незакоммиченном компоненте отката:
код опубликован в `bd763ec`, HTTP-результаты — в `66b4de7`, CI-поправка —
в `5b90249`. На 12:54 UTC [его workflow](https://github.com/Michael-edel/FitFocus/actions/runs/38249434753)
создал job 114812141481; audit/schema/privacy/guards/unit/typechecks/build
прошли, E2E ещё выполняется. HTTP-check и upload архива в этом CI пока не
подтверждены. Последний завершённый подтверждённый CI остаётся `5828f29`.

Рабочая общая mock-фикстура не входит в опубликованный SHA. Исходные четыре
семейных сценария прошли с четырьмя preview ECONNREFUSED. Те же условия
после настоящей выгрузки документа дали 4 passed без proxy-ошибок.
После подключения общей фикстуры расширенный семейный прогон завершился:
97 passed / 1 failed, 8,0 мин, workers=2/retries=0, proxy-ошибок нет.
Падение iphone-pwa — ожидание семейного заголовка в familyHarness.ts:95;
причина пока не установлена. Две вкладки без Web Locks прошли 3/3 на desktop
Chromium/Firefox/WebKit, workers=1/retries=0, без proxy-ошибок.
Намеренный INJECTED_CAPTURE_PROBE подтвердил PNG-вложение до unload.
Условия, локальные логи и дальнейшие критерии — в
[отдельном документе](mock-api-lifecycle.md).

Этот MD-компонент не изменяет runtime, тесты или схему. Рабочие E2E-изменения
сохранены отдельно и не объявлены принятыми. Main, deploy и оставшиеся P0 открыты.

## CI компонента и скачанный архив — 12.10.2026

Позднее той же сверки [run 38249434753](https://github.com/Michael-edel/FitFocus/actions/runs/38249434753) завершился success,
head_sha `5b902499705e17b85045234ff952b0ede8944a70`, job 114812141481.
1053 unit / 194 файла; browser 361 passed / 1 flaky / 9 skips, 20,2 мин.
Flaky — desktop-webkit fresh rollback installation: access-control ошибка
`/api/family/menu/state`, затем успешный retry. В preview один ECONNREFUSED.
Это отдельная нестабильность; причина прежнего Firefox timeout не установлена.

HTTP/D1: 23 запроса passed, PR merge-кандидат `61bd073` → retained `98d4910`.
Архив отката ID 11748940847 и browser diagnostics ID 11748676231 загружены.
Rollback ZIP скачан; SHA-256 совпала с GitHub digest, `.tar` извлечён вне
репозитория и verify подтвердил 82 файла. Точные hashes/даты/Node и команды —
в [контракте артефакта](release-artifacts.md#артефакт-из-ci).
CI проверяет опубликованный компонент; незакоммиченная mock-фикстура в него
не входит. Неуспешный локальный прогон 97/1 и прежние результаты сохранены.
Main/deploy/staging и полная приёмка P0 остаются открытыми.

## Завершение mock API и фазовое ожидание экрана — 12.10.2026

Рабочее дерево поверх `3bf595fc80cc14da76f120bc93438cbb6f82ef85`.
Общая test-фикстура выгружает живой документ до закрытия context, при
действующих routes; при падении прикладывает PNG до unload. Подключены
12 mock-наборов, native PWA-наборы сохранены на стандартном test.
Вторая вкладка storage-теста выгружается до своего явного close.
Ни API, ни lifecycle приложения, ни логи не подавляются.

Семейная диагностика до фикстуры: 4 passed / 4 proxy errors. После unload:
4 passed / 0 proxy errors. Первый расширенный прогон: 97 passed / 1 failed,
0 proxy errors; trace показал ожидание данных ещё до bootstrap. Отдельный
повтор iPhone без изменения кода: 2/2. Затем familyHarness стал отдельно
ожидать заголовок экрана перед семейными данными; таймауты/retries/assertions
данных не менялись. Итог: **98 passed, 7,8 мин, workers=2/retries=0**, семь
конфигураций, **0 ECONNREFUSED**. Исходный 97/1 не удалён и не заменён.
Две вкладки без Web Locks ранее прошли 3/3 с той же unload-фикстурой.
Root typecheck/15 admin guards: exit 0. PNG контролируемого намеренного
падения просмотрен: meaningful auth UI вместо about:blank. Desktop/Android
скриншоты доставки и quota просмотрены; отсутствие overlay и сохранение
прежнего меню дополнительно проверены assertions. [Логи и границы](mock-api-lifecycle.md).

Тем временем [CI `3bf595f`](https://github.com/Michael-edel/FitFocus/actions/runs/38252938795) завершился success,
head_sha проверен, terminal job 114823598359: 1053 unit / 194 файла,
362 browser passed / 9 skips, 15,8 мин, без flaky в summary. В preview один
ECONNREFUSED `/api/family`. HTTP/D1 23 запроса passed: merge `a33ed5f` → `98d4910`.
Архив ID 11749801093 и diagnostics ID 11750405380 загружены, metadata сверены.
Этот CI не содержит текущую mock-фикстуру; её новый SHA проверяется отдельно.

Скачанный browser ZIP прежнего CI `5b90249` проверен по digest. Trace native
WebKit показывает pageerror старого sender после update-click и до reload.
Внешняя проверка с удержанным native PUT прошла 1/1, сохранив opId, без pageerror;
она не воспроизводит и не устраняет исходный CI-сбой. Начальный диагностический
setup с дефолтными 5 с и окончательный 10-секундный вариант сохранены вне Git.
Причины прежних Firefox/WebKit ошибок и задержки приложения остаются открытыми.
Текущий компонент меняет только E2E-инфраструктуру и MD; storage/schema,
production retry/claim, main/deploy и остальные критерии P0 не менялись.

Компонент опубликован в `085fcc14d87fbcf06a1e6a1e65ff2f0f023ede68`.
Следующая MD-поправка фиксирует факт публикации: отметка «незакоммиченная»
в карте документации устарела после commit/push. Она не меняет тестовую
фикстуру; workflow итогового MD HEAD проверяется отдельно от CI `3bf595f`.

## Preview origin и обновление MD — 12.10.2026

Компонент поверх `aefc46320de11b83ffdb274e7dae1a911e69612e`.
Entry point переводил branch/commit `*.pages.dev` на production до монтажа
приложения. RED на прежнем коде дал 1 failed: preview HTML=200, затем
запрещённый самим тестом production-переход=502. После удаления redirect
тот же сценарий прошёл 1/1. Реальные Pages и production не запрашивались.

Первая расширенная матрица — 25 passed / 3 failed: Firefox-фикстура сохраняла
исходный Host при загрузке байтов с localhost, и Vite возвращал 403.
Исправлен заголовок локального fetch, allowedHosts не менялся. Повтор Firefox
прошёл 3/3. Итоговая матрица — 28 passed, 2,8 мин, workers=1/retries=0:
21 origin-сценарий и семь native PWA-shell на семи конфигурациях.
В итоговом логе нет preview ECONNREFUSED/proxy errors. Root typecheck и
15 admin guards прошли после исправления фикстуры. Итоговые desktop/iPhone
снимки просмотрены; успешное переключение темы не доказывает её серверный ack.

Добавлен [контракт preview/staging](staging-origin.md), обновлены карта MD,
правила разработки, карта кода, статус, TASKS, матрица и release checklist.
Документы разделяют локальный код, завершённый CI и фактический deployment.
При подготовке записи CI базы `aefc463` ещё выполнялся; до публикации
подтверждено его завершение success. Этот результат не перенесён на новый компонент.
D1 binding, APP_URL, provider callbacks, edge rules и реальный lifecycle
остаются открытыми критериями staging. Основной план P0 не закрыт.

## Полный CI mock-фикстуры aefc463 — 12.10.2026

[Run 38256100623](https://github.com/Michael-edel/FitFocus/actions/runs/38256100623),
head `aefc46320de11b83ffdb274e7dae1a911e69612e`, job 114834593231:
success, terminal updated 13:53:52 UTC (18:53:52 Екатеринбург).
1053 unit / 194 файла; browser — 362 passed / 9 skips, 19,6 мин.
В полном логе нет flaky, ECONNREFUSED и preview proxy errors. Это подтверждает
общую mock-фикстуру `085fcc1`; прежние native WebKit/Firefox причины остаются
неустановленными. HTTP/D1 прошёл 23 запроса, PR merge-кандидат `218d47e`
→ retained `98d4910`. Оба артефакта загружены;
[ID, digest и ограничения проверки](release-artifacts.md#ci-mock-фикстуры-aefc463).
Новый preview-компонент проверен локально отдельно и требует своего CI.

## Диагностика Firefox PWA IndexedDB после preview CI — 12.10.2026

Preview-коммит `076f4aca8e9855bb328a3fe695cb0bcd085ddd6f` прошёл
[CI 38261672999](https://github.com/Michael-edel/FitFocus/actions/runs/38261672999),
job 114853979454: success, 1053 unit / 194 файла, 383 browser passed / 9 skips,
20,3 мин; без flaky, preview ECONNREFUSED и proxy errors. HTTP/D1 завершился
23 запросами, кандидат `8a2a9e9525799d76403c07aeeb5b4463900c3aa8` → retained
`98d49101e15ad652e1960381ce00e00e8dac0d44`. Artifacts metadata:
browser ZIP `11753738236`, 57115503 bytes, SHA-256
`aa19f9abc5cc9362c02f2feaa64b5c3744f6901293013b3bea2f0f6aff100a83`,
expiry 26.10.2026 14:40:12 UTC; rollback ZIP `11754550614`, 3890891 bytes,
SHA-256 `f49f990499cd821de18a407030654431b1cbac63eb094ac0d04e2b5f08e74a3a`,
expiry 10.01.2027 14:16:13 UTC. Metadata checked; ZIPs from this run were not
downloaded or locally reverified.

Firefox diagnostic run on exact published base `076f4ac` reproduced the older
`saved(page)` timeout once in three attempts with retries disabled. It timed out
inside `page.evaluate` at `indexedDB.open`; the page snapshot remained on the
family screen and held API returned expected 503s. This trace did not show
whether open, readonly requests or a versionchange was stalled. Further E2E-only
instrumentation now records IDB open events; a second layer records transaction/read
stages on failure. Seventeen open-instrumented runs and one fully instrumented run
passed with `retries=0` (3+6+8+1); no new failure trace was captured. Root typecheck
and the final focused run passed. This narrows
the failure boundary but does not prove its cause or fix; P0.9 remains open.
Evidence directories are recorded in [the PWA contract](pwa-updates.md#повторное-исследование-firefox-indexeddb-timeout--12102026).

## Повторная проверка WebKit sender при обновлении PWA — 12.10.2026

Опубликованный `7109dcfe13d1c8d065c8de11f842d34ffc894fa6` прошёл
[CI 38274180638](https://github.com/Michael-edel/FitFocus/actions/runs/38274180638),
job 114896068538: 1053 unit / 194 файла, 383 browser passed / 9 skips,
20,1 мин; в итоговых логах нет flaky, ECONNREFUSED и preview proxy errors.

После CI рабочая E2E-проверка на этой базе задерживает native family PUT
на 5 секунд и запускает настоящее SW-обновление при `status: sending`.
Desktop WebKit прошёл 3/3 (`workers=1/retries=0`), 1,5 мин; операция сохранила
`opId` и payload, fixture подтвердила разрыв задержанного native-ответа,
pageerror не было. Проверка сценария не установила причину
исторического pageerror из `5b90249`; P0.9 открыт. E2E fixture и diagnostics
опубликованы в `47da77c`; полный CI ниже включил этот сценарий.

## Повтор Firefox IndexedDB без диагностических listeners — 12.10.2026

После push `47da77c` точечный `pwa-update.spec.ts` в desktop Firefox
прошёл 3/3 и затем 8/8 с IDB-инструментацией (`workers=1/retries=0`). Чтобы
проверить её влияние на тайминг, тест и `familyHarness.ts` были временно
восстановлены из опубликованного `076f4ac`, а затем возвращены к HEAD.
Без listeners тот же Firefox сценарий прошёл 3/3 и 8/8; приложение и
rollback artifact остались текущими. Все 22 попытки на этой ветке прошли,
но исторический timeout остаётся необъяснённым и не считается исправленным.

## CI WebKit rollback и Firefox диагностики `47da77c` — 12.10.2026

Опубликованный `47da77cdf6a7a8c72223a914545fa2724ab6263d` прошёл
[CI 38280645353](https://github.com/Michael-edel/FitFocus/actions/runs/38280645353),
job 114917387935: success, 1053 unit / 194 файла, 383 browser passed / 9 skips,
20,6 мин. Полный job log не содержит flaky, preview proxy errors или
ECONNREFUSED. HTTP/D1 завершился 23 запросами: merge-кандидат
`cf310dd305fd15a957ab24188f40060f3790f9fe` → retained
`98d49101e15ad652e1960381ce00e00e8dac0d44`.

Локальный held-PUT WebKit rollback test прошёл 3/3 с подтверждённым разрывом
native HTTP response. Firefox `pwa-update` на той же ветке прошёл 3+8 раз с
IDB diagnostics и 3+8 раз без них, все `workers=1/retries=0`.
Эти результаты не объясняют прежние WebKit/Firefox сбои и не закрывают P0.9.
Browser ZIP ID 11761719261 и rollback ZIP ID 11762830605 сохранены GitHub;
их metadata приведена в [реестре артефактов](release-artifacts.md#ci-webkit-pwa-update-47da77c).

## 13.10.2026 — runtime P0.8 и all-client writer fence

На базе `ca9482f` runtime legacy-импорт подключён к `StateSync`. Владельцем
становятся только записи с точным префиксом accountId из свежего `/api/me`;
прочие записи остаются в карантине. Service Worker перед отправкой требует
ответ всех same-origin вкладок с одним текущим build id. Параллельные проверки
одной вкладки объединяются, sender ждёт завершения миграции, а после неё
повторно проверяется read guard.

Проверки рабочего дерева:

- 1068 unit-тестов в 196 файлах — passed;
- `typecheck`, domain-strict и storage-strict — passed;
- API invariants, auth scope, schema parity, privacy coverage и 15 admin guards — passed;
- production build — passed;
- настоящий old/new PWA update smoke с durable family intent: Chromium, Firefox и WebKit — 1/1 каждый, без retries.

В браузерном smoke старая открытая вкладка держит send gate закрытым; после
обновления обе вкладки доказывают текущий build id. Family operation и профиль
переживают reload. Legacy source содержит 0 записей в этой фикстуре: реальная
pending запись из старого Map/legacy bundle ещё не проверена. Firefox сообщает
о прерванном навигацией IndexedDB transaction, но тест отдельно проверяет
сохранённые данные и допускает только точное сообщение browser warning.
WebKit access-control сообщение для `/api/me` не совпало с failed request;
same-origin ответ `/api/me` успешен, поэтому учитывается только этот точный
console текст. Все остальные ошибки остаются фатальными.

Результаты локальные, незакоммиченные; CI новой ревизии ещё не запускался.
Следующий критерий P0.8 — old/new bundle smoke с реальной legacy-записью,
подтверждением владельца, карантином и сохранением источника.

## Повтор E2E после полного CI `d28b3e4` — 13.10.2026

Полный [CI 38295991884](https://github.com/Michael-edel/FitFocus/actions/runs/38295991884)
проверил `d28b3e43dda13c29c99a20a5aa70e3c153f79fa9` и завершился failure.
Проверки npm audit, schema parity, privacy, auth scope, API invariants,
1068 unit-тестов в 196 файлах, три typecheck и production build прошли.
E2E дал 360 passed, 22 failed, 9 skipped и один flaky за 26,5 минуты.

Причины были в новых E2E-ожиданиях и браузерной диагностике: `owned-state`
ожидал legacy-паузу вместо `protocol` после намеренно не подтверждаемой mock API
записи; weekly-menu один раз превысил timeout в Firefox; iPhone-проекты не
распознавались как WebKit по `browserName`; PWA rollback не классифицировал
отменённые навигацией запросы `/api/me` и точный Firefox IDB warning.
Обновлены только E2E-проверки: ожидания `protocol`, ожидание завершения readonly
IDB-транзакции, определение WebKit по имени проекта, точные фильтры ожидаемых
предупреждений и проверка свежего `/api/me` обеими вкладками после rollback.

После этих изменений локальные прогоны с `retries=0` прошли: owned-state и
weekly-menu — 77/77 на семи Playwright-проектах; PWA update — 7/7; PWA rollback —
14/14. Таймаут weekly-menu повторно не проявился; это не устанавливает его
первопричину. Настоящая запись legacy-очереди в old/new bundle smoke по-прежнему
не проверена, поэтому P0.8 не закрыт.

Commit `a048289287b90e752b1db47bdab3f0f502f5a5c9` прошёл
[полный CI 38305940088](https://github.com/Michael-edel/FitFocus/actions/runs/38305940088):
1068 unit / 196 файлов, 382 browser passed / 9 skips, 17,6 мин. Сводка CI
пометила один flaky в desktop WebKit conflicted rollback: операция оставалась
`pending` в первой попытке, повтор прошёл. По последовательности теста вероятна
гонка между offline 503, восстановлением backend и сроком повтора очереди;
лог не устанавливает точный момент. Обновлённая E2E-фикстура
возвращает намеренный 409 на первой family-записи, чтобы проверить перевод
операции в `conflicted` без ожидания сетевого backoff. Три локальных повтора
этого сценария в desktop WebKit прошли без retries; полный CI фикстуры ожидается.

## Sender IDB stability — 13.10.2026

Commit `649056db8ebbcfc3b9a62b7864c74d0d118dde79` прошёл
[CI 38309057601](https://github.com/Michael-edel/FitFocus/actions/runs/38309057601),
job 115010066010: success, 1068 unit / 196 файлов, 382 browser passed / 9 skips,
14,9 мин. Предыдущая WebKit rollback гонка не повторилась после ответа 409 на
первый family PUT. Сводка CI отметила один Firefox weekly-menu flaky: первая
попытка не отправила durable profile operation в пределах timeout, retry прошёл.

Повтор локально показал `TransactionInactiveError` в IndexedDB sender при
последовательном добавлении независимых чтений после `await`. Исправление
`storage/durableOutbox.ts` заранее ставит чтения `sessionState`, принятия сессии,
claim и finish; ack и retry-пауза также читают нужные записи в той же группе.
На commit `8fae1008d2a9b220cc0052499271b07441ac29ac` прошли 193 профильных unit-теста
в пяти файлах, `typecheck`, `storage-strict` и все 56 weekly-menu browser-сценариев
в семи проектах без retries. Повтор Firefox — 12/12 при включённом тестовом
сборе диагностики. Полный [CI run 38316655963](https://github.com/Michael-edel/FitFocus/actions/runs/38316655963)
на опубликованной ревизии `ca8ecb1` завершился success: 1068 unit / 196 файлов,
383 browser passed / 9 skips за 13,9 мин. В этом CI проверен тот же код sender;
`ca8ecb1` добавляет документацию поверх `8fae100`.

В наборе на `ca8ecb1` настоящий legacy pending record из old bundle ещё не
создавался; последующий old/new smoke зафиксирован ниже.

## P0.8 — реальная запись из old bundle, 13.10.2026

Добавлен [old/new migration smoke](../e2e/legacy-outbox-migration.spec.ts) на
закреплённой legacy-сборке `22a77889f131b554f52519515efc7ac811f6169f` и текущей
сборке. Обе отдаются native HTTP сервером с одного origin в одном browser
context. Старая страница создаёт pending запись настоящим действием плана через
старый Map/localStorage writer; тест не подставляет эту основную запись вручную.

До обновления current bundle импортирует известный ключ с точным owner из
`/api/me`, оставляет синтетический foreign-owner ключ в quarantine, сохраняет
точный исходный legacy snapshot и не отправляет очередь, пока открыта старая
вкладка. Старый single-key запрос до обновления отклоняется по scope. После
обновления обе вкладки показывают одинаковый build id; новая очередь отправляет
известный ключ пакетным `/api/state`, получает ack/version 1 и удаляет только
outbox operation после подтверждения. Исходный localStorage ключ остаётся
неизменным; foreign-owner запись не уходит на сервер.

Smoke прошёл на всех семи Playwright-проектах — Chromium, Firefox, WebKit,
Android Chrome, Android PWA Chrome, iPhone Safari и iPhone PWA — `7/7`,
`workers=1/retries=0`; Android Chrome дополнительно прошёл 3/3 повторных запусков.
API fixture возвращает временный 503 новым пакетным writes до подтверждения
текущего build id обоими окнами и паузы после навигации, а затем принимает их.
Проверки рабочего дерева также прошли: 1068 unit в 196 файлах, общий/domain-
strict/storage-strict typecheck, admin guards, API invariants, auth scope, schema
parity и privacy coverage. PWA E2E использовал production build. HTTP API fixture
не подтверждает реальный OAuth/D1, staging или полный P0.8 lifecycle. CI на
предыдущем docs commit `c724bce` завершился success (run 38318876304); новый
коммит со smoke ожидает workflow.

## P0.8 — JSON backup всех IDB stores, 13.10.2026

В рабочей ветке экспорт переведён на формат v3. Один readonly snapshot включает
`values`, `outbox`, migration items, неизвестные legacy-записи и durable meta;
временные `active-session`/`auth-fence` в файл не входят. Исправлен экспорт,
который раньше сериализовал уже сериализованный текст и создавал файл-строку.

Restore проверяет структуру и владение записей до изменения IDB, сливает точные
повторы идемпотентно и применяет все пять stores одной транзакцией. Divergent
primary key отменяет транзакцию целиком и возвращает прежние значения
localStorage. Импорт v1/v2 сохранён. Migration `sendAllowed` сбрасывается при
restore: записанный в файле writer proof не считается текущим, пока runtime
не перепроверит legacy source и все открытые окна.

Проверки опубликованного `2aff6c33d638052d9a084902895df822efb269e5`:
полный unit — 1073 passed / 196 файлов; общий, domain-strict и storage-strict
typecheck, 7/7 backup unit и production build прошли. Old/new smoke предыдущего
SHA `00cd005` [прошёл CI](https://github.com/Michael-edel/FitFocus/actions/runs/38324638965):
390 browser passed / 9 skipped, 20,1 минуты; он не содержит backup-код.
[CI backup-коммита](https://github.com/Michael-edel/FitFocus/actions/runs/38327323270)
завершился success на PR-head `2aff6c3`: 1073 unit / 196 файлов, 390 browser
passed / 9 skips за 15,7 минуты; dependency audit (0 уязвимостей), guards,
schema/privacy, три typecheck и build прошли. Последующая HTTP/D1 rollback-
проверка прошла 23 запроса; rollback artifact сохранён в [workflow](https://github.com/Michael-edel/FitFocus/actions/runs/38327323270/artifacts/11781863243).
Контракт: [backup/restore](backup-restore.md). Очистка stores, conflict UI,
остальные callbacks и staging остаются открытыми.

## Account-scoped локальная очистка — 13.10.2026

Коммит [`b53a55e`](https://github.com/Michael-edel/FitFocus/commit/b53a55eaf272ca8ad6ba8653760f502b0e993b6b)
опубликован в `fix/durable-outbox`. Реализована очистка точных account-owned
localStorage keys и строк всех пяти долговечных IDB stores. IDB-удаление
выполняется одной транзакцией; она удаляет outbox и разрешённые migration rows
владельца, увеличивает auth-fence при очистке его активной сессии и оставляет
чужие/конфликтные строки нетронутыми. Вызовы ждут очистку и предупреждают при
неполном результате.

Общий legacy localStorage source и snapshots остаются без изменений согласно
ADR-005. Если там найдены записи целевого аккаунта или повреждённые данные,
результат отмечается как неполный. Это сохраняет миграционную evidence, но
означает, что полное локальное стирание не подтверждено; безопасное подавление
legacy-записей после удаления и защита от повторного импорта остаются открытыми.

Точный [CI run 38334411131](https://github.com/Michael-edel/FitFocus/actions/runs/38334411131)
завершился success: 1079 unit-тестов / 197 файлов; 390 browser passed / 9 skipped
за 20,1 минуты; dependency audit, guards, три typecheck и build прошли. Локальный
HTTP/D1 rollback smoke прошёл 23 запроса. [Артефакт отката](https://github.com/Michael-edel/FitFocus/actions/runs/38334411131/artifacts/11784907304).
Локально также прошли новые целевые тесты: 4 файла / 12 тестов, `git diff --check`
и относительные Markdown-ссылки. Staging, merge в main и выпуск не выполнялись.
Подробности и ограничения: [контракт account cleanup](account-data-cleanup.md).

## P0.8 — tombstone после удаления аккаунта, CI `57e0a93`, 13.10.2026

Коммиты `c7700eb` (реализация) и `57e0a93` (фиксация локальной проверки)
отправлены в `fix/durable-outbox`. Точный
[CI run 38340805337](https://github.com/Michael-edel/FitFocus/actions/runs/38340805337)
завершился success на SHA `57e0a93`. Прошли 1082 unit-теста / 197 файлов и
390 browser-тестов; 9 сценариев пропущены, E2E занял 21,1 минуты. Dependency
audit сообщил 0 уязвимостей; schema parity, privacy/auth/API guards, общий,
domain-strict и storage-strict typecheck, production build и rollback-check
также прошли. Последний проверил 23 HTTP/D1-запроса на локальном Pages
worker/workerd/D1 с двумя синтетическими аккаунтами.

CI сохранил [browser diagnostics](https://github.com/Michael-edel/FitFocus/actions/runs/38340805337/artifacts/11787457599)
и [проверенный rollback artifact](https://github.com/Michael-edel/FitFocus/actions/runs/38340805337/artifacts/11787357946).
Staging, merge в `main` и выпуск не выполнялись. Общий legacy source и snapshots
по-прежнему не стираются физически; tombstone обеспечивает локальное подавление
повторного импорта и отправки. Остаются полный P0.8 lifecycle и UI разрешения
конфликтов.

## P0.8 — восстановление очереди в UI, `80dc1cf`, 13.10.2026

Коммит [`80dc1cf`](https://github.com/Michael-edel/FitFocus/commit/80dc1cfa20249ce099f94f3d406455cc547c0819)
добавляет ручной retry failed-записей и два способа разрешения обычного конфликта:
сохранить последнее локальное намерение или принять проверенный серверный снимок.
Изменения values/outbox выполняются атомарно после свежей проверки сессии и
сверки полного набора operation IDs. Legacy-записи не изменяются через UI;
ответ 409 без проверенного scope/snapshot ставит sender на protocol-паузу.

Локально прошли 1092 unit-теста / 197 файлов, общий/domain-strict/storage-strict
typecheck, admin guards, production build и `git diff --check`. Полный
`e2e/storage-durability.spec.ts` прошёл 42/42 на семи browser/PWA-проектах;
целевой сценарий новой кнопки после уточнения подписи прошёл 7/7. В тесты
outbox добавлена проверка rollback при отказе IDB во время принятия серверного
снимка. GitHub CI для этого SHA ещё не подтверждён; полный P0.8 lifecycle,
приёмка других ресурсов и действий, staging и выпуск остаются открытыми.

## P0.5 — scoped coach, plan и plateau callbacks, 13.10.2026

Коммит [`75e4d35`](https://github.com/Michael-edel/FitFocus/commit/75e4d35bb7ba48970eac6f20898f73108116215e)
в ветке `fix/durable-outbox` включает следующие изменения поверх базового `d3f5c8a`:
действия coach,
личного плана и объяснения плато подключены к свежему `AiSession` и собственному
attempt/lifecycle guard. Повтор получает ожидаемый action и проверяет его после
proof; weekly retry также сверяет новый actionId перед и после запроса и в
durable commit. Для coach карточка и usage коммитятся с guard до UI/achievement;
план сохраняется функциональной profile-операцией. При смене session/fence
сетевой сбой не запускает локальный fallback. Регистрация получает initial proof
только при пустой active-session и атомарно отказывает гонке с другим входом.
Daily plateau task в hydration использует тот же scoped transport и pagehide
abort до завершения.

Локальная проверка прошла: 1115 unit-тестов / 198 файлов; общий, domain-strict и
storage-strict typecheck; browser onboarding, registration durability и weekly
AI report — 32 passed / 3 skipped на 7 профилях, `workers=1/retries=0`.
Сборка приложения прошла в webServer каждого E2E запуска. Первый E2E запуск
выявил, что registration mock не возвращал AI protocol/guard headers; фикстура
исправлена. Повтор выявил шум от ожидаемого `WEEKLY_REPORT_SESSION_CHANGED` при
отмене страницы; отмена добавлена в классификатор soft error, после чего полный
targeted прогон завершился чисто.

Push run 38379441325 отменён concurrency после старта PR-события. Точный
[PR CI run 38379449644](https://github.com/Michael-edel/FitFocus/actions/runs/38379449644)
того же SHA завершился с ошибкой E2E: 463 passed / 9 skipped, один failed и три
flaky. Audit, schema/privacy/auth/API checks, unit, три typecheck и build прошли.
Единственный failed — Firefox weekly-menu: E2E fixture не отвечал на фоновый
`/api/ai` feature `wis_text`, поэтому console assertion получал ошибку
недельного AI-отчёта. Добавлен явный mock-ответ и расширена диагностика; после
этой локальной поправки весь weekly-menu spec прошёл 8/8 в desktop Firefox,
основной сценарий — 5/5 повторов (`workers=2`, `retries=0`). Фикс тестовой
фикстуры опубликован в [`ec29f41`](https://github.com/Michael-edel/FitFocus/commit/ec29f41c88045c1d7a933a461260744f9a641070).
Точный [PR CI run 38385161995](https://github.com/Michael-edel/FitFocus/actions/runs/38385161995)
завершился success: 1115 unit / 198 файлов, 466 browser passed / 9 skipped,
audit без уязвимостей, guards, все три typecheck, build и остальные jobs прошли.
В полном прогоне остался один flaky — iPhone PWA preview-origin: `route.fetch`
получил `socket hang up`, retry прошёл. Причина не установлена; три flaky из
предыдущего SHA в этом прогоне не повторились.
Прямые браузерные тесты задержанного coach/plateau ответа и смены аккаунта ещё не добавлены.
Staging, merge в `main` и выпуск не проверены. Детальный контракт и границы —
[client AI callbacks](ai-callback-sessions.md); остаются пункты P0.5 в
[TASKS](../TASKS.md).

## Исправление Firefox IndexedDB snapshot, 13.10.2026

Документационный SHA `75159f5` прошёл [CI run 38388730336](https://github.com/Michael-edel/FitFocus/actions/runs/38388730336)
с одним flaky в сценарии `weekly menu preserves an independent profile edit
made while AI is pending`: фоновое чтение завершилось `STATE_STORAGE_TRANSACTION`.
Локальный прогон того же Firefox-сценария без retries воспроизвёл 2 ошибки из 20.
Stack указывал на `DurableOutbox.snapshot()`: три независимых запроса в одной
read-only транзакции ожидались последовательно, и Firefox иногда завершал
транзакцию до постановки следующего запроса.

В рабочем дереве запросы owner, value и metadata ставятся в очередь до
`Promise.all`. После изменения сценарий прошёл 20/20 повторов, полный
`weekly-menu-durability.spec.ts` в desktop Firefox — 8/8 без retries. Unit
прошёл 1115/1115 (198 файлов), общий, domain-strict и storage-strict typecheck
и production build прошли. Новый код и документация пока не закоммичены;
результат CI исправленного SHA ещё не подтверждён.

## Follow-up — Firefox IndexedDB write, 13.10.2026

CI [`4c3ab5a`](https://github.com/Michael-edel/FitFocus/commit/4c3ab5a2c9b1975f1f05c311f7cea7465e435259)
([run 38393913597](https://github.com/Michael-edel/FitFocus/actions/runs/38393913597))
завершился success, но оставил один flaky в тесте logout: запись weekly report
вызвала `STATE_STORAGE_TRANSACTION`. Stack указал на `writeOutboxInTransaction`.
При `readGuard` транзакция последовательно ожидала session proof, затем owner,
value и metadata. Каждое из чтений независимо; Firefox мог закрыть транзакцию
между запросами.

Follow-up ставит active-session, auth-fence, owner, value, metadata и операции
по ключу в очередь до первого `await`, затем проверяет parent/head по этому
снимку. E2E-сериализация теперь сохраняет вложенный `cause`. После изменения
logout и независимая правка профиля прошли 30/30 Firefox повторов, полный
weekly-menu spec — 8/8; unit 1115/1115, общий/domain-strict/storage-strict
typecheck и production build прошли. На момент этой записи CI follow-up SHA
ещё ожидался; итог приведён в следующем разделе.

## Полный CI для outbox transaction follow-up — 13.10.2026

Кодовый commit [`2539c8c`](https://github.com/Michael-edel/FitFocus/commit/2539c8c8a5f30776c486b0b274903dc70d191dbc)
прошёл [полный CI run 38398403703](https://github.com/Michael-edel/FitFocus/actions/runs/38398403703),
job `115300046192`: workflow success. Dependency audit сообщил 0 уязвимостей;
schema parity, privacy/auth/API guards, 1115 unit-тестов в 198 файлах, общий,
domain-strict и storage-strict typecheck и production build прошли. E2E summary:
466 passed / 9 skipped; rollback HTTP/D1 проверил 23 запроса и сохранил артефакт.
Cloudflare preview и GitGuardian также завершились success.

В первой попытке полного E2E один тест был flaky в desktop WebKit:
`real service worker waits for an explicit update and preserves durable family
intent` не нашёл кнопку «Обновить приложение»; retry прошёл. Целевой локальный
прогон этого теста в WebKit с `workers=1`, `retries=0`, `repeat-each=3` прошёл
3/3. Причина CI-сбоя не установлена и локально не воспроизведена. Firefox
IndexedDB race, ради которой сделан follow-up, не повторилась: два затронутых
сценария прошли 30/30, полный weekly-menu spec — 8/8.

PR #93 остаётся draft в `fix/durable-outbox`; изменения не слиты в `main`.
Staging и release-приёмка не выполнялись. Следующий шаг по workflow — после
публикации документационного коммита сверить CI именно для его SHA.

## P0.5 — поздний AI-ответ при смене аккаунта, `9bc98ee`, 13.10.2026

Коммит [`9bc98ee`](https://github.com/Michael-edel/FitFocus/commit/9bc98ee43e14559fa9fd1578fdf939ba9292acbc)
добавил `e2e/ai-callback-account-switch.spec.ts`. В двух same-origin вкладках
удерживается Coach retry или объяснение плато аккаунта A; вторая вкладка
принимает сессию аккаунта B, после чего тест отпускает старый ответ. Проверяется,
что он не меняет профиль и карточку Coach ни A, ни B, не добавляет операции этих
ключей в outbox, не запускает achievement и не появляется в старой UI.

Локальный запуск без retries прошёл 6/6: оба сценария в desktop Chromium,
Firefox и WebKit. Для WebKit фиксируется, что ответ освобождён раньше 10 секунд,
до 12-секундного transport timeout; исходные запросы WIS и их сохранение
завершаются до запуска удерживаемого действия. Также прошли `npm run typecheck`,
admin guards и `git diff --cached --check`. Полный [CI run 38410002498](https://github.com/Michael-edel/FitFocus/actions/runs/38410002498)
для точного SHA `9bc98ee` завершился success: audit, schema/privacy/auth/API,
unit, typechecks, build, E2E, browser diagnostics, canonical readers/CAS после
rollback и сохранение rollback-артефакта прошли.

Приёмка охватывает coach retry и прямое объяснение плато, но не повтор личного
плана, все callbacks, реальный OAuth, устройство/BFCache, staging или выпуск.
P0.5 и P0.8 в целом остаются открытыми; PR #93 остаётся draft, `main` не менялся.

## P0.5 — задержанный family callback при смене аккаунта, `f9c8425`, 13.10.2026

Коммит [`f9c8425`](https://github.com/Michael-edel/FitFocus/commit/f9c8425272804b0bf9fc5963bcfb015e2926e469)
добавил `e2e/family-callback-account-switch.spec.ts`. Вкладка A начинает создание
приглашения и получает удержанный ответ. В соседней вкладке тот же origin
принимает вход аккаунта B; после этого тест отпускает ответ A и проверяет, что
код приглашения A не появился в старой вкладке, а active-session остаётся B.

Локально `npm run typecheck` прошёл. Команда
`npx playwright test e2e/family-callback-account-switch.spec.ts --project=desktop-chromium --project=desktop-firefox --project=desktop-webkit`
завершилась 3/3 без retries; production preview использовался на
`http://127.0.0.1:4173`. Первый Chromium прогон выявил только неполные AI
capabilities в тестовом mock; после исправления fixture чисто прошли все три
браузера. Это не требовало изменения runtime-кода. Документационный HEAD
`b66dcb4`, включавший этот сценарий, прошёл полный CI run `38420925386`.
Явная цель invite/member, остальные callbacks, staging, merge и release
остаются открытыми.

## P0.5 — задержанный family AI menu callback при смене аккаунта, `bca2eda`, 13.10.2026

Коммит [`bca2eda`](https://github.com/Michael-edel/FitFocus/commit/bca2edaf8c4bee1f465dfc3cb6bfabaa08960ea5)
добавил account-switch acceptance в `e2e/family-menu-durable.spec.ts`. Пока AI
генерация меню A удерживается, в соседней вкладке принимается сессия B; после
освобождения ответа тест проверяет, что active-session остаётся B, исходное
family меню не меняется, новая `familyMenu` outbox-операция и achievement
не создаются.

`npm run typecheck` прошёл. Целевой Playwright сценарий прошёл 3/3 без retries
на desktop Chromium, Firefox и WebKit. Полный CI для этого SHA ещё ожидается;
остальные family/AI callbacks, явная цель invite/member, staging и выпуск
остаются открытыми.

## P0.5 — повтор личного плана после смены аккаунта, локальная приёмка, 13.10.2026

В `e2e/ai-callback-account-switch.spec.ts` добавлена проверка задержанного
personal-plan retry. Вкладка A начинает повтор; в соседней same-origin вкладке
выполняется вход B; после освобождения ответа проверяются active session,
профиль, значения, outbox и профильные/state записи обоих аккаунтов, а также
отсутствие achievement и позднего плана в UI.

`npm run typecheck` и целевой сценарий прошли. Команда с desktop Chromium,
Firefox и WebKit завершилась 3/3 без retries. Кодовый commit `eae1ce1` и MD
обновления опубликованы в `c48ce1b`. Точный PR CI [run `38429247879`](https://github.com/Michael-edel/FitFocus/actions/runs/38429247879)
завершился success: 1115 unit / 198 файлов, 485 E2E passed / 25 skipped,
guards, три typecheck, build и rollback/CAS на 23 HTTP-запросах прошли.
В итоговом E2E была одна flaky-попытка в desktop Firefox:
`legacy-outbox-migration.spec.ts` не дождался состояния импорта за 10 секунд;
retry прошёл.

Диагностика зафиксировала корректные импортированную операцию и карантин, но
проверка сравнивала всю legacy source строку, включая меняющийся retryCount.
Миграционный fingerprint намеренно включает только type/key/value/baseVersion.
Проверка исправлена в `e2e/legacy-outbox-migration.spec.ts` и сверяет тот же
набор нормализованных полей. После правки прошли 5/5 Firefox повторов с одним
worker, 3/3 с тремя workers и 7/7 на всей browser/PWA-матрице; typecheck прошёл.
Исправление пока локальное, точный CI follow-up ещё предстоит. Предыдущий run
`38425515018` для `c6ebbdc` отменён concurrency при push нового HEAD. Staging,
OAuth, BFCache, другие callbacks и общий P0.5 остаются открытыми.

## Полный CI migration fingerprint follow-up — `7c50f08`, 13.10.2026

PR CI [run `38435173387`](https://github.com/Michael-edel/FitFocus/actions/runs/38435173387)
завершился success для точного HEAD `7c50f08`: 1115 unit / 198 файлов,
483 browser passed / 25 skipped, audit сообщил 0 уязвимостей; guards, три
typecheck, build и rollback/CAS-проверка на 23 запросах прошли. Исправленный
`legacy-outbox-migration` Firefox сценарий больше не отмечен flaky.

CI сообщил 3 другие flaky попытки: две проверки weekly-menu в desktop Firefox
(локальная profile commit и повтор генерации после timeout) и подтверждение
settings sender в Android PWA после reload. Все три прошли retry. Целевые
локальные повторы прошли: 5/5 и 3/3 для двух Firefox тестов, 5/5 для Android
PWA; совместный параллельный прогон двух browser-проектов завершился 18/18.
Причина CI сбоев не воспроизведена; это не подтверждает, что их источник устранён.

Rollback/CAS job прошёл 23 HTTP-запроса на merge candidate `19a63dd62e065d360e6a4606134fed58f07fb2df`
→ retained source `98d49101e15ad652e1960381ce00e00e8dac0d44`. Browser diagnostics
artifact `11834122683` сохранён на 14 дней; tested rollback artifact
`11833354840` — на 90 дней. Staging, OAuth/BFCache, прочие callbacks и общий
P0.5/P0.8 остаются открытыми.

## Полный CI и локальные повторы flaky сценариев — `e96025d`, 13.10.2026

PR CI [run `38440675173`](https://github.com/Michael-edel/FitFocus/actions/runs/38440675173)
для документационного HEAD `e96025d` завершился success за 18,7 минуты:
1115 unit / 198 файлов, 483 E2E passed / 25 skipped; audit сообщил 0
уязвимостей, guards, три typecheck, build и rollback/CAS-проверка на 23
HTTP/D1 запросах прошли. В E2E отмечены 3 flaky, все прошли retry:

- desktop Chromium, `storage-durability.spec.ts`: после reload проверка
  `verified sender confirms settings and preserves them after reload` не
  дождалась исчезновения `Cloud: pending` за 10 секунд;
- desktop Firefox, `profile-durability.spec.ts`: в `profile recovery can accept a
  checked server snapshot after explicit confirmation` попало предупреждение
  `IndexedDB transaction that was not yet complete has been aborted due to page
  navigation`;
- iPhone PWA, `legacy-outbox-migration.spec.ts`: после all-client update/release
  проверка server `stateWriteKeys` не дождалась `targetKey` за 10 секунд.

Изолированные локальные повторы целевых случаев прошли: Chromium 5/5, Firefox
5/5, iPhone PWA 3/3. Это не устанавливает причину нестабильности под CI-нагрузкой.
Предыдущий flaky fingerprint assertion в legacy migration не повторился.
Browser diagnostics artifact `11836633164` доступен до 27.10.2026; rollback
artifact `11836213753` — до 11.01.2027. Ветка остаётся draft; P0.5/P0.8,
staging и полная release acceptance открыты.

## P0.5 — поздний achievement callback при смене аккаунта, `b44d46e`, 14.10.2026

В [`e2e/ai-callback-account-switch.spec.ts`](../e2e/ai-callback-account-switch.spec.ts)
добавлена проверка для ещё не принятого cross-account producer: тест удерживает
положительный `app_open` POST достижений аккаунта A, открывает в том же origin
вкладку с аккаунтом B, дожидается записи B в active-session и только затем
отпускает ответ A со старым scope. Он проверяет, что обе вкладки не показывают
устаревший unlock/toast, а durable active-session остаётся B.

Точный сценарий прошёл 7/7 настроенных browser/PWA-проектов с `workers=3` и
`retries=0`; `npm run typecheck` прошёл. Кодовый commit —
[`b44d46e`](https://github.com/Michael-edel/FitFocus/commit/b44d46eb78255b4b5da0fcbb58cd442e0b2d2eb3).
Это локальная приёмка; полный CI этого SHA ожидается.

Последний завершённый CI до этого кода — [run `38444933538`](https://github.com/Michael-edel/FitFocus/actions/runs/38444933538)
на `92a5be2`: success, 1115 unit / 198 файлов, 484 browser passed / 25 skipped,
audit без уязвимостей, guards, три typecheck, build и 23 rollback/CAS HTTP/D1
запроса прошли. Два E2E прошли retry, но отмечены flaky:

- desktop Chromium, `storage-durability.spec.ts:19`: первая попытка ожидала
  `pending`, но IndexedDB уже сообщала `sending`;
- desktop WebKit, `family-menu-durable.spec.ts:195`: первая попытка записала
  access-control warning для `/api/family/menu/state`.

Изолированные повторы обоих сценариев прошли 5/5; первопричины не установлены.
Browser diagnostics artifact `11838963458` доступен до 27.10.2026; rollback
artifact `11839378221` — до 11.01.2027. Следующий шаг P0.5 — продолжить
оставшихся family callbacks и writers по той же границе попытки/аккаунта;
staging и общий lifecycle остаются открытыми.

## P0.5 — явная семья для invite/member, `2bbec11`, 14.10.2026

Новые `createFamilyInvite` и `updateFamilyGoal` передают `familyId` выбранной
семьи. `/api/me` рекламирует `familySync.target: 1`; клиент без этой capability
не отправляет invite/member mutations. Сервер сверяет точное активное членство,
для invite — также владение, а SQL update ограничен той же семьёй и участником.
Invite code/error принадлежат ID выбранной семьи; запоздавший ответ не меняет
UI, если семья переключилась в той же login-сессии.

На кодовом SHA `2bbec1143bb850cbf73bf0e2820d64be9d89db10` прошли 1128 unit-тестов
/ 198 файлов, три typecheck, admin/auth/API guards, schema (23 миграции /
32 таблицы), privacy (29 user-related tables), `npm audit` (0) и production
build. Две family E2E suites прошли 27/27 на desktop Chromium, Firefox и WebKit;
тест отсутствующей capability прошёл 7/7 browser/PWA-проектов. Полный
`release:check` сравнил кандидата `2bbec11` с retained `98d4910`: 23 HTTP
запроса на одном локальном workerd/D1, включая сохранение profile/family CAS,
отказы legacy writers и проверку session/owner guards.

На момент этого кодового коммита точный workflow ещё ожидался. Последующая
проверка полного CI на документирующем HEAD приведена ниже. Staging, старые/новые
bundles именно для family target и общий lifecycle P0.5/P0.8 остаются открытыми.

## Полный CI после family target — `9bdeb47`, 14.10.2026

Полный PR workflow [run `38459458051`](https://github.com/Michael-edel/FitFocus/actions/runs/38459458051)
завершился success на точном SHA
[`9bdeb47dfd21c5e5d5366bb5fe47f8e5862cda11`](https://github.com/Michael-edel/FitFocus/commit/9bdeb47dfd21c5e5d5366bb5fe47f8e5862cda11).
Unit прошли во всех 198 файлах; Playwright выполнил 532 сценария: 501 passed,
29 skipped и два flaky, прошедших retry. Rollback/CAS job прошёл; rollback
artifact `11847145964` сохранён в workflow.

Flaky были в двух независимых E2E:

- Android PWA Chrome, `storage-durability.spec.ts:316`: проверка quota fault
  увидела фоновый `WEEKLY_AI_REPORT_FAILED` с `StateStorageError` в сборе ошибок.
- iPhone PWA, `weekly-menu-durability.spec.ts:185`: после reload helper `healthy()`
  зафиксировал WebKit access-control warning для `/api/profile`.

Оба сценария локально повторены по 10 раз с `workers=1/retries=0`; каждый прошёл
10/10. Точная причина CI-only нестабильности не установлена, поэтому повторы
не считаются доказательством устранения flaky. Следующий шаг — отдельно проверить
синхронизацию фонового weekly-report в первом тесте и завершение profile route
до reload во втором, не ослабляя проверку неожиданных ошибок. Полный CI
подтверждает включённые family-target и account-switch изменения, но staging,
old/new family bundle smoke и общая lifecycle-приёмка остаются открытыми.

## Локальный E2E follow-up двух CI flaky — `7753d87`, 14.10.2026

Диагностика показала, что счётчик `profileFailures` увеличивался до
`route.fulfill(503)`, и тест мог вызвать reload до завершения ответа. В тесте
теперь ожидается `Response.finished()` для точного `PUT /api/profile` с HTTP 503.
В quota fault сценарии тест ждёт завершения `wis_text` response и появления
сохранённого weekly report в IndexedDB до внедрения искусственного отказа
записи настроек; проверка неожиданных ошибок сохранена.

На точном локальном follow-up SHA
[`7753d87fe99a07b7fa555dac5ab2a5c487d44d54`](https://github.com/Michael-edel/FitFocus/commit/7753d87fe99a07b7fa555dac5ab2a5c487d44d54)
целевые сценарии прошли 10/10 каждый с `workers=1/retries=0`. Полный
`storage-durability.spec.ts` прошёл 10/10 на Android PWA Chrome; полный
`weekly-menu-durability.spec.ts` прошёл 8/8 на iPhone PWA; `npm run typecheck`
прошёл. Это подтверждает детерминированность тестового порядка локально, но не
устраняет неизвестность CI-only причины до полного CI exact SHA.

## CI follow-up для flaky-тестов — `a99ab7b`, 14.10.2026

Документационный HEAD [`a99ab7b`](https://github.com/Michael-edel/FitFocus/commit/a99ab7beea367df76154faa53747aed2aa473d98)
содержит локальные результаты синхронизации двух E2E-сценариев из `7753d87`.
Полный [CI run `38466153712`](https://github.com/Michael-edel/FitFocus/actions/runs/38466153712)
был запущен для этого SHA, затем отменён после следующего документационного
push. Cloudflare preview завершился успешно; это не подтверждает CI или
production-релиз. Эффект тестовых барьеров под CI остаётся неподтверждённым;
актуальные проверки находятся на [странице checks PR #93](https://github.com/Michael-edel/FitFocus/pull/93/checks).
