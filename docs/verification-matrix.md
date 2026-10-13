# Матрица проверки стабилизации FitFocus

Сверено: 14.10.2026. Это указатель на критерии [TASKS](../TASKS.md),
контракты и доказательства. Он не вводит новый план и не закрывает P0
по наличию тестового файла.

Последний полный CI проверил SHA [`9bdeb47`](https://github.com/Michael-edel/FitFocus/commit/9bdeb47dfd21c5e5d5366bb5fe47f8e5862cda11)
и завершился success ([run `38459458051`](https://github.com/Michael-edel/FitFocus/actions/runs/38459458051)):
unit прошли во всех 198 файлах; Playwright сообщил 501 passed / 29 skipped и
два flaky-теста, прошедших retry; rollback/CAS job прошёл. Локальные повторы этих
двух сценариев прошли 10/10 каждый, но первопричины не установлены; см.
[журнал](stabilization-progress.md). P0.5 achievement account-switch acceptance
из `b44d46e` включена в этот HEAD; профильный локальный прогон прошёл 7/7
browser/PWA-проектов с `retries=0`.

После CI локально проверен E2E follow-up [`7753d87`](https://github.com/Michael-edel/FitFocus/commit/7753d87fe99a07b7fa555dac5ab2a5c487d44d54):
оба flaky-сценария повторены 10/10 каждый; полные затронутые specs прошли 10/10
на Android PWA Chrome и 8/8 на iPhone PWA; `npm run typecheck` прошёл. Полный
CI этого follow-up выполняется для кодовой ревизии [`a99ab7b`](https://github.com/Michael-edel/FitFocus/commit/a99ab7beea367df76154faa53747aed2aa473d98):
[run `38466153712`](https://github.com/Michael-edel/FitFocus/actions/runs/38466153712).
Cloudflare preview успешен, но не подтверждает полный CI или production-выпуск.

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
| P0.4 — облачная загрузка | Managed hydration и profile seed проверяют pending, revision и auth-fence; `useFamilyCloud` сохраняет исходный login и проверяет family/week; delayed invite и family AI callbacks после входа другого аккаунта проверены на `f9c8425`/`bca2eda`; invite/member используют явную семью на `2bbec11` | [Hydration](../tests/session_hydration_durable.test.ts), [bootstrap E2E](../e2e/bootstrap-session.spec.ts), [family callback E2E](../e2e/family-callback-account-switch.spec.ts), [family menu E2E](../e2e/family-menu-durable.spec.ts), [семейный контракт](family-session.md) | Остальные cloud callbacks и cache; приёмка смены членства и целей семьи в оставшихся writers |
| P0.5 — поздние ответы | Claim/finish и readGuard; guarded bootstrap, меню, достижения и `useFamilyCloud`; личные покупки следуют profile CAS на `4736ff5`, familyMenu использует исходный guard и family/week CAS на `405238b`; недельный AI-отчёт и его retry защищены; Coach/plateau account-switch E2E прошло локально 6/6 в трёх desktop engines, точный CI `9bc98ee` — success ([run 38410002498](https://github.com/Michael-edel/FitFocus/actions/runs/38410002498)); delayed family invite/AI, personal-plan retry, achievement account-switch и explicit family target включены в полный CI `9bdeb47` ([run 38459458051](https://github.com/Michael-edel/FitFocus/actions/runs/38459458051)); этот запуск сообщил 2 flaky E2E, оба прошли retry | [Read guard](../tests/session_read_guard.test.ts), [AI account-switch E2E](../e2e/ai-callback-account-switch.spec.ts), [family callback E2E](../e2e/family-callback-account-switch.spec.ts), [family menu E2E](../e2e/family-menu-durable.spec.ts), [menu E2E](../e2e/weekly-menu-durability.spec.ts), [weekly report unit/E2E](weekly-ai-report-session.md), [family E2E](../e2e/family-session.spec.ts), [achievement E2E](../e2e/achievement-session.spec.ts) | Остальные AI retry и family producers; staging, общий lifecycle и приёмка release |
| P0.6 — аккаунты и вкладки | Постоянный accountId операции, session попытки; транзакционная координация IDB без обязательных Web Locks; runtime проверяет владельца legacy и build id всех вкладок | [Outbox](../tests/durable_outbox.test.ts), [lifecycle](../tests/state_sync_lifecycle.test.ts), [runtime migration](../tests/state_sync_legacy_migration.test.ts), [legacy browser smoke](../e2e/legacy-outbox-migration.spec.ts), [контракт](sync-model.md) | Конкурентные записи old/new разных и одинаковых ключей, повтор после reload, logout/login и смена аккаунта |
| P0.7 — серверные поколения | State protocol 2, tombstones и версия своей мутации | [State generations](../tests/state_generations.test.ts), [серверный контракт](state-generations.md) | Совместимый выпуск сервера/клиента, staging и интеграция в main |
| P0.8 — постоянная очередь | Одна IDB-outbox; атомарные import/ledger; свежий auth proof владельца; Service Worker all-client fence; old/new smoke прошёл локально 7/7 и включён в успешный CI `00cd005`; JSON backup v3 экспортирует и атомарно восстанавливает все пять stores; CI `2aff6c3` passed | [Legacy queue](../tests/legacy_queue.test.ts), [migration](../tests/legacy_migration.test.ts), [runtime integration](../tests/state_sync_legacy_migration.test.ts), [backup](backup-restore.md), [browser smoke](../e2e/legacy-outbox-migration.spec.ts), [ADR-005](adr/ADR-005-durable-outbox.md) | Staging и полный rollback/release acceptance; account-scoped очистка всех stores и conflict UI |
| P0.9 — приёмка | Есть unit и browser сценарии отдельных компонентов; mock teardown проходит CI без preview proxy errors; опубликованный WebKit held-PUT rollback прошёл CI | [Матрица lifecycle](sync-model.md#матрица-приёмки), [release checklist](../RELEASE_CHECKLIST.md), [mock lifecycle](mock-api-lifecycle.md), [PWA диагностика](pwa-updates.md#повторная-проверка-webkit-pageerror-при-pwa-update--12102026) | Firefox PWA timeout и исторический WebKit sender error с неизвестными причинами, реальные устройства/BFCache/OAuth/staging и проверка отката |

Предыдущий полный CI на проверенном HEAD `e96025d` завершился success
([run `38440675173`](https://github.com/Michael-edel/FitFocus/actions/runs/38440675173))
с тремя flaky E2E, прошедшими retry. Его симптомы и повторы сохранены в
[журнале](stabilization-progress.md); актуальная проверка — `9bdeb47` выше.

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
