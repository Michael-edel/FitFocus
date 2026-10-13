# Защита недельного AI-отчёта сессией

Обновлено: 13.10.2026. Реализация недельного отчёта входит в commit `0b7062d`.
После ошибки его E2E CI fixture исправлен в `ec29f41`; полный CI этого SHA
завершился success в run `38385161995` (466 browser passed / 9 skipped, один
flaky на iPhone PWA preview-origin). Последующая проверка docs SHA `75159f5`
выявила отдельную Firefox race в IndexedDB; её диагностика и текущий локальный
результат приведены ниже.
Общий P0.5 остаётся открытым: этот документ описывает только генерацию
недельного AI-отчёта и её повтор.

Проверка 13.10.2026 обнаружила отдельную проблему хранения: при параллельной
правке профиля Firefox иногда завершал чтение weekly report ошибкой
`STATE_STORAGE_TRANSACTION`. Причина была в последовательном ожидании owner,
value и metadata из одного IndexedDB read-only transaction. В текущем рабочем
дереве все три запроса ставятся в очередь до ожидания результата. После правки
целевой Firefox-сценарий прошёл 20/20 повторов, весь weekly-menu spec — 8/8,
unit — 1115/1115, все typecheck и production build. CI `4c3ab5a` затем нашёл
ещё один flaky в Firefox logout-сценарии: последовательное чтение в
`writeOutboxInTransaction`. Follow-up в текущем дереве ставит независимые
owner/value/metadata/operation reads в очередь до ожидания; E2E сохраняет
вложенную ошибку `cause`. После этого оба сценария прошли 30/30 повторов,
weekly-menu spec — 8/8, unit — 1115/1115, typecheck и build прошли. CI нового
изменения ещё ожидается.

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
