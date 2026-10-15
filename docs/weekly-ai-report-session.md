# Защита недельного AI-отчёта сессией

Обновлено: 15.10.2026. Реализация недельного отчёта входит в commit `0b7062d`;
его E2E fixture исправлен в `ec29f41`. Последний общий кодовый SHA [`2539c8c`](https://github.com/Michael-edel/FitFocus/commit/2539c8c8a5f30776c486b0b274903dc70d191dbc)
прошёл [полный CI run 38398403703](https://github.com/Michael-edel/FitFocus/actions/runs/38398403703):
1115 unit, 466 browser passed / 9 skipped; две затронутые Firefox race-проверки
прошли 30/30 без retries. В CI остался один flaky desktop WebKit PWA update;
локальный повтор прошёл 3/3, причина не установлена.
Общий P0.5 остаётся открытым: этот документ описывает только генерацию
недельного AI-отчёта и её повтор.

В `d2cbb25` добавлен двухвкладочный account-switch сценарий: ответ `wis_text`
аккаунта A удерживается, пока соседняя вкладка входит в аккаунт B. После
отпускания проверяются durable report values и outbox обоих аккаунтов, отсутствие
чужого текста в UI и ошибки браузера. Сценарий прошёл 3/3 на desktop Chromium,
Firefox и WebKit с `workers=1,retries=0`; профильные auto-engine/retry unit-тесты
прошли 11/11, общий typecheck прошёл. Полный CI следует сверять по точному SHA
PR, а этот тест не закрывает остальные callback-контракты или lifecycle.

Проверка 13.10.2026 обнаружила отдельную проблему хранения: при параллельной
правке профиля Firefox иногда завершал чтение weekly report ошибкой
`STATE_STORAGE_TRANSACTION`. Причина была в последовательном ожидании owner,
value и metadata из одного IndexedDB read-only transaction. В текущем рабочем
дереве все три запроса ставятся в очередь до ожидания результата. После правки
целевой Firefox-сценарий прошёл 20/20 повторов, весь weekly-menu spec — 8/8,
unit — 1115/1115, все typecheck и production build. CI `4c3ab5a` затем нашёл
ещё один flaky в Firefox logout-сценарии: последовательное чтение в
`writeOutboxInTransaction`. Коммит `2539c8c` ставит независимые
owner/value/metadata/operation reads в очередь до ожидания; E2E сохраняет
вложенную ошибку `cause`. После этого оба сценария прошли 30/30 повторов,
weekly-menu spec — 8/8, unit — 1115/1115, typecheck и build прошли. Полный CI
`2539c8c` завершился success в run `38398403703`; один посторонний к этому
контракту flaky зафиксирован в desktop WebKit PWA update и описан в [статусе](project-status.md).

## Контракт

Перед генерацией клиент получает свежую AI-сессию через `prepareAiSession`.
Запрос использует account/session scope и отправляется через session-aware
transport. Результат принимается только пока актуальны login guard, scope и
lifetime конкретного действия.

Сгенерированный отчёт записывается в существующую IndexedDB outbox с
`OutboxCommitGuard`. Проверка текущей сессии и запись выполняются на границе
durable storage. Поэтому ответ, пришедший после logout или смены сессии, не
может создать локальное значение или операцию синхронизации. React-состояние
обновляется только для всё ещё текущей попытки.

Повтор недельного отчёта следует тому же правилу. Маркер выполняющейся
генерации принадлежит конкретному login scope и попытке: запоздалое завершение
очищает только собственный маркер и не блокирует генерацию нового аккаунта.
Lifecycle pagehide/pageshow создаёт новую проверяемую попытку; старое действие
не оживает после возврата страницы.

Основные исходники: [hook](../features/ai/useWeeklyAiReport.ts),
[AI transport](../geminiService.ts), [durable repository](../storage/userStateRepository.ts),
[weekly engine](../weeklyAutoEngine.ts), [retry](../features/ai/aiRetry.ts).

## Проверки и границы

Локально прошли профильные unit-тесты недельного hook, auto engine, AI retry и
IndexedDB repository: 24 теста в четырёх файлах. Полный unit-набор прошёл:
1095 тестов / 197 файлов. Прошли общий typecheck, `domain-strict`,
`storage-strict` и admin guards. Новый browser spec прошёл 14/14 на семи
проектах (`workers=1`, `retries=0`); запуск также собрал production build.
GitHub CI для коммита `0b7062d` завершился ошибкой E2E в [run 38357547143](https://github.com/Michael-edel/FitFocus/actions/runs/38357547143);
Unit, typecheck и build прошли, но E2E завершился с 343 failed из 476. По
логу, fixtures не возвращали AI-capabilities; штатные auth/session отказы
также попадали в error console. Локальный follow-up исправил fixtures и
классификацию ожидаемого отказа: 49/49 связанных E2E прошли в desktop
Chromium; полный прогон и CI нового SHA ожидаются.

Browser-сценарии проверяют успешный guarded save и поздний AI-ответ после
logout. Во втором случае отчёт и новая outbox-операция не появляются.

Не входят в этот компонент: повторы личного плана, плато и coach; семейные
callbacks; полная проверка всех AI writers, реального OAuth/staging и всего
lifecycle приложения. Их статус остаётся в [P0.5](../TASKS.md) и
[контрактах клиентских callbacks](ai-callback-sessions.md) и
[AI API](ai-session-guard.md).
