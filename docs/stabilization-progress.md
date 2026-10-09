# Стабилизация: проверяемые изменения

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

CI на `1363ec7` был промежуточным. Финальные уточнения проверены на
[`4c16088569871df3c8b22a78f94e6e3e482c0e56`](https://github.com/Michael-edel/FitFocus/actions/runs/37914508279):
GitHub CI completed/success. [PR #92](https://github.com/Michael-edel/FitFocus/pull/92)
ещё открыт; mergeable_state=blocked, хотя mergeable=true. Конкретное
невыполненное правило защиты через доступный API не установлено.
Защита main не изменялась, слияние и выпуск не заявляются.

### Перенос в интеграционную ветку

На `e35cbf6` изменения перенесены в код переработки с сохранением всех
API-инвариантов выделенных use cases и fake-indexeddb. Устаревшее ожидание
`signal: controller.signal` внутри push.ts заменено проверкой подключения
помощника. 162 unit-файла / 498 тестов прошли; три проверки типов,
API/auth/admin/schema/privacy и production build прошли. Playwright:
19 passed / 9 explicit skips; шесть новых skips относятся к Chromium-only
forced-colors тесту, ещё три — к ранее ограниченному onboarding smoke.
На `cc880d952f7872b52099947ff02d13e4992031cf` изменена только документация
поверх этой проверенной реализации. [CI на точном SHA](https://github.com/Michael-edel/FitFocus/actions/runs/37915083725)
завершился success. [PR #90](https://github.com/Michael-edel/FitFocus/pull/90)
пока открыт, mergeable_state=blocked. Эти проверки не закрывают весь P0.

## P0.8 — первый компонент legacy-импорта

Ревизия: [`149e4d403a0b7986f2b98e8a2da6409d4289d117`](https://github.com/Michael-edel/FitFocus/commit/149e4d403a0b7986f2b98e8a2da6409d4289d117),
ветка `fix/durable-outbox`, зависит от интеграционной ревизии PR #90.

Добавлен нормализатор `storage/legacyQueue.ts`: непустой key, обязательная
строка value для put, отсутствие свойства value у delete, целые
неотрицательные metadata либо 0 при отсутствии. Все семь причин отказа
сохранены в типе UnknownLegacyRecord.

Fingerprint использует SHA-256 от JSON-массива нормализованных
type/key/value-or-null/baseVersion с префиксом legacy:v1:. Порядок записей,
порядок свойств и retryCount не меняют идентификатор. 62 unit-проверки
и storage-strict typecheck прошли локально.

На этой ревизии это самостоятельный компонент. IDB-stores, атомарный импорт,
карантин, claim/lease и подключение к сохранению ещё не реализованы. Тип
UnknownLegacyRecord сам по себе не сохраняет повреждённые записи.
P0.8 остаётся открытым; следующая реализация сверяется с ADR-005.


## P0.8 — транзакционный фундамент на 61d256e

Проверено: 09.10.2026. Ревизия: [`61d256e84e92225c45535e917c4ff424a5904aba`](https://github.com/Michael-edel/FitFocus/commit/61d256e84e92225c45535e917c4ff424a5904aba).
[Черновой PR #93](https://github.com/Michael-edel/FitFocus/pull/93),
база — `fix/dependency-audit` / PR #90. Слияние и выпуск не подтверждены.

Первый CI нормализатора выявил TS2339 в тестовом помощнике. Проверка
`ok === false` на `f32c5ad19768ea3e8962195d83bc69e09afba547` устранила ошибку;
[CI этой ревизии](https://github.com/Michael-edel/FitFocus/actions/runs/37917864872)
завершился success. Первоначальные 62 проверки относятся к нормализатору.

Следующий компонент добавляет `stateDatabase.ts`: схема v2 с сохранением
values, outbox/migration/meta stores, blocked, versionchange, повтор открытия
и завершение транзакции. `indexedUserState.ts` использует этот менеджер.
DurableOutbox добавляет атомарные value/операцию, сохранение независимых
снимков как конфликтов, явного владельца, claim/lease и проверку завершения.
Подтверждение меняет версию только явного зависимого потомка того же автора.

[GitHub CI на точном SHA 61d256e](https://github.com/Michael-edel/FitFocus/actions/runs/37919548774) — **completed/success**:

- 165 unit-файлов / 590 тестов;
- общая, domain-strict и storage-strict типизация;
- dependency audit, schema/privacy, auth/API/admin guards;
- production build;
- Playwright: 19 passed / 9 explicit skips.

30 новых unit-проверок покрывают менеджер IDB и DurableOutbox. Конкуренция
проверена отдельными fake-IDB соединениями, quota/abort — внесёнными отказами.
Это не реальное заполнение браузерного хранилища и не проверка старого/нового
bundle. Browser API в существующих E2E подменён; staging не подтверждён.

На этом SHA stores миграции ещё не содержат импортера/карантина. Прежние
UserStateRepository и HTTP sender не переведены на DurableOutbox. Остаются
импорт с доказанным владением, auth/hydration, UI ошибок, экспорт/очистка,
реальные вкладки и P0.7. DELETE API пока не возвращает возрастающую версию,
которую требует новый finish; клиент не должен выдумывать подтверждение.
Более поздние наработки импортера не входят в приведённый CI.
P0.2–P0.9 остаются открытыми. [Следующие изменения](outbox-implementation.md#следующие-изменения).

## P0.8 — возобновляемый компонент legacy-импорта на 51a789c

Проверено: 09.10.2026. Ревизия:
[`51a789c5c0d8b724a54071ecf10232ecc58a42df`](https://github.com/Michael-edel/FitFocus/commit/51a789c5c0d8b724a54071ecf10232ecc58a42df),
[draft PR #93](https://github.com/Michael-edel/FitFocus/pull/93),
база — PR #90. Эта запись дополняет предыдущий этап `61d256e`.

Добавлен LegacyQueueMigration: атомарные операция/карантин, migration item
и прогресс порции, подтверждённые владельцы, стабильная идентификация
и точные снимки readonly-источника. Параллельные импорты одного снимка
используют общий runId; другой снимок может завершить старый запуск
ошибкой LEGACY_MIGRATION_SUPERSEDED, сохранив закоммиченные данные.
Прежние необработанные снимки восстанавливаются после изменения источника.

Финальный audit проверяет backing operation или ack receipt, ledger,
карантин и снимки; processed marker недостаточен. Claim/finish проверяют
разрешение и ledger транзакционно, ack receipt коммитится вместе с удалением
операции. Исходный ключ не изменяется. [Подробный контракт](legacy-migration.md).

Тесты сначала воспроизвели 11 дефектов первоначального компонента:
конкурентное замещение запуска, ложный completed, неполное подтверждение,
смену payload, оставшееся разрешение после отказа чтения, повтор операции
при уточнении владельца, размножение карантина и потерю приоритета коллизии.
Исправления и восстановление старых снимков покрыты регрессиями.

[GitHub CI на точном SHA 51a789c](https://github.com/Michael-edel/FitFocus/actions/runs/37925347789)
— **completed/success**:

- 166 unit-файлов / 649 тестов, включая 59 проверок импортера;
- общая, domain-strict и storage-strict типизация;
- dependency audit, API/auth/admin guards, schema/privacy;
- production build;
- существующие Playwright E2E: 19 passed / 9 явных skips.

GitGuardian и Cloudflare Pages этого PR также завершились success.
Дублирующий push workflow отменён механизмом concurrency.
Fake IndexedDB, внесённые quota/abort и отдельные соединения дают проверку
компонента; они не подтверждают реальную quota или старый/новый browser bundle.

Runtime не переключён. Остаются источники доказанного владения, остановка
старых writers, UserStateRepository/HTTP sender, auth/hydration, UI ошибок,
экспорт/очистка новых stores, реальные вкладки и серверный P0.7.
writersStopped — предусловие интеграции, а не механизм обнаружения вкладок.
P0.8 и весь P0 остаются открытыми; слияние и выпуск не подтверждены.
