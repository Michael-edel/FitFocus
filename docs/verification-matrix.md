# Матрица проверки стабилизации FitFocus

Сверено: 12.10.2026. Это указатель на критерии [TASKS](../TASKS.md),
контракты и доказательства. Он не вводит новый план и не закрывает P0
по наличию тестового файла.

## Проверенная граница

Последний подтверждённый [CI `3bf595f`](https://github.com/Michael-edel/FitFocus/actions/runs/38252938795):
1053 unit / 194 файла, 362 browser passed / 9 skips, workflow success.
В summary нет flaky; один preview `ECONNREFUSED` на `/api/family`.
Прежние WebKit access-control и Firefox timeout остаются открытыми.
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
Это не результат опубликованного CI и не закрытие P0;
[условия и незакрытое падение](mock-api-lifecycle.md).

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
| P0.2 — конфликты и ошибки | Outbox сохраняет конфликт и payload для 15 state-ключей, profile и familyMenu | [Outbox tests](../tests/durable_outbox.test.ts), [profile sender](../tests/profile_sender.test.ts), [контракт](profile-persistence.md) | UI разрешения/повтора, runtime legacy и полный lifecycle |
| P0.3 — auth-пауза | Локальная запись продолжается; отправка требует подтверждения владельца | [State sender](../tests/state_sync.test.ts), [profile E2E](../e2e/profile-durability.spec.ts), [контракт](state-sender.md) | Остальные callbacks и legacy; реальный повторный вход на staging |
| P0.4 — облачная загрузка | Managed hydration и profile seed проверяют pending, revision и auth-fence; `useFamilyCloud` сохраняет исходный login и проверяет family/week | [Hydration](../tests/session_hydration_durable.test.ts), [bootstrap E2E](../e2e/bootstrap-session.spec.ts), [семейный контракт](family-session.md) | Остальные cloud callbacks и cache; сценарии приглашения/смены членства и явной цели семьи |
| P0.5 — поздние ответы | Claim/finish и readGuard; guarded bootstrap, меню, достижения и `useFamilyCloud`; личные покупки следуют profile CAS на `4736ff5`, familyMenu использует исходный guard и family/week CAS на `405238b` | [Read guard](../tests/session_read_guard.test.ts), [menu E2E](../e2e/weekly-menu-durability.spec.ts), [family E2E](../e2e/family-session.spec.ts), [achievement E2E](../e2e/achievement-session.spec.ts) | Остальные AI/report/retry producers; явная цель/членство семьи и полный lifecycle |
| P0.6 — аккаунты и вкладки | Постоянный accountId операции, session попытки; транзакционная координация IDB без обязательных Web Locks | [Outbox](../tests/durable_outbox.test.ts), [lifecycle](../tests/state_sync_lifecycle.test.ts), [контракт](sync-model.md) | Доказанное владение legacy и барьер реально работающих старых writers |
| P0.7 — серверные поколения | State protocol 2, tombstones и версия своей мутации | [State generations](../tests/state_generations.test.ts), [серверный контракт](state-generations.md) | Совместимый выпуск сервера/клиента, staging и интеграция в main |
| P0.8 — постоянная очередь | Одна IDB-outbox; value/операция и import/ledger атомарны; legacy-нормализатор реализован | [Legacy queue](../tests/legacy_queue.test.ts), [migration](../tests/legacy_migration.test.ts), [ADR-005](adr/ADR-005-durable-outbox.md) | Runtime-импорт с доказательствами владельца и барьера старых writers; итоговый rollback artifact; backup/экспорт/очистка всех stores |
| P0.9 — приёмка | Есть unit и браузерные сценарии отдельных компонентов | [Матрица lifecycle](sync-model.md#матрица-приёмки), [release checklist](../RELEASE_CHECKLIST.md) | Чистая browser-приёмка точного release SHA, Firefox PWA timeout и mock teardown, реальные устройства/BFCache/OAuth/staging и проверка отката |

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
