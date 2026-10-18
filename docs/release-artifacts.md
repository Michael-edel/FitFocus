# Совместимый артефакт отката

## Барьер редактора перед rollback — 18.10.2026

В независимой `fix/dashboard-readiness-20261018` вручную адаптирована только
проверка имени из опубликованного `7f76a8e`: дождаться исходного `E2E User`,
выполнить fill и проверить точное новое имя до Save. Постороннее исправление
conflict-details selector не переносится. Это дополнение к приёмке редактора,
а не изменение rollback/storage или повторное внедрение в owner checkout.

Исторический trace `39114947822` уже до Save содержал составное имя
`E2E UserПрофиль перед откатом` и одновременно изменённую цель. Он локализует
ошибку до сохранения/отката, но не раскрывает точный порядок selection и React
hydration. Исходный сценарий локально прошёл один раз; это не доказательство
отсутствия гонки. Проверки точного имени в IDB после Save сохранены.


Обновлено: 12.10.2026. Компонент добавляет упаковщик, npm-команды,
browser/HTTP-проверки и CI-хранение; ветка `fix/durable-outbox`.
Точная база — `98d49101e15ad652e1960381ce00e00e8dac0d44`,
с поправкой первого SW-клиента и удалением неиспользуемого Google SDK.

Новый сохранённый архив проверен локально: 82 файла; 28/28 browser-сценариев,
семь конфигураций, workers=1/retries=0, 13,2 мин. HTTP/D1-переход
`bd763ece5897e5718eb05dd6567bb986f3a34f45` → этот архив прошёл 23 запроса
на одном локальном origin/D1. Server functions/migrations SHA одинаковы;
это проверка сохранённого release, а не изменения серверных алгоритмов.
Компонент опубликован в `bd763ec`; поправка workflow — в `5b90249`.
Его [CI](https://github.com/Michael-edel/FitFocus/actions/runs/38249434753) завершился success:
1053 unit / 194 файла; browser — 361 passed / 1 flaky / 9 skips.
HTTP/D1-проверка прошла 23 запроса, архив и browser diagnostics загружены.
Скачанный rollback ZIP проверен по digest, inventory `.tar` — 82 файла.
WebKit fresh rollback install прошёл с retry после access-control ошибки
`/api/family/menu/state`; в preview один `ECONNREFUSED`. Прежний Firefox
timeout также не объяснён. Staging и выпуск не подтверждены.

Последующий [CI `3bf595f`](https://github.com/Michael-edel/FitFocus/actions/runs/38252938795) завершился success:
1053 unit / 194 файла; 362 browser passed / 9 skips, 15,8 мин, без flaky
в summary, один preview ECONNREFUSED на `/api/family`. HTTP/D1 — 23 запроса,
merge-кандидат `a33ed5f5af1bee055f64d92ae04d86c0bbb3803d` → `98d4910`.
Архив ID [11749801093](https://github.com/Michael-edel/FitFocus/actions/runs/38252938795/artifacts/11749801093)
и browser diagnostics ID [11750405380](https://github.com/Michael-edel/FitFocus/actions/runs/38252938795/artifacts/11750405380)
загружены (metadata проверены); локально ниже скачан и проверен именно архив
предыдущего run `5b90249`. Зелёный MD-прогон не устраняет прежнюю нестабильность.

Прежний архив `574de76` сохранён для диагностики и не принят:
оба его полных прогона дали 26/28 из-за внешнего SDK/предыдущего trace race.
История сохранена в [журнале](stabilization-progress.md).

## Артефакт из CI

Проверен run [38249434753](https://github.com/Michael-edel/FitFocus/actions/runs/38249434753), head `5b90249`, job 114812141481,
terminal success. HTTP-check выполнялся на PR merge-кандидате
`61bd073b4c5fe22fe5e80aac7e36227815e73235` → retained source
`98d49101e15ad652e1960381ce00e00e8dac0d44`, одном локальном origin/D1.

- [Rollback artifact](https://github.com/Michael-edel/FitFocus/actions/runs/38249434753/artifacts/11748940847):
  `fitfocus-rollback-98d4910-38249434753-1`, ID 11748940847,
  ZIP 3 890 931 байт; expires 10.01.2027 по metadata GitHub.
- ZIP SHA-256 (совпала с GitHub digest):
  `00ce587920b50a243e3fe2b0538aa4fdaf09355735d6fce68cb25e814b03c7c5`.
- SHA-256 содержащегося `.tar`:
  `2fc554c80227cd86e3afb9747bfff440a07fadea233cbea0f5328d11d8e4b959`.
- Manifest: source `98d4910`, builtAt `2026-10-12T12:34:27.253Z`,
  Node v24.21.0, Wrangler 4.149.0, IDB 3 / D1 0021.
- [Browser diagnostics](https://github.com/Michael-edel/FitFocus/actions/runs/38249434753/artifacts/11748676231):
  ID 11748676231, ZIP 58 532 184 байта; expires 26.10.2026.

Rollback ZIP скачан через GitHub connector, digest сверена, `.tar` извлечён
в отдельную внешнюю папку и проверен командой:

```text
node scripts/release-artifact.mjs --verify "C:/Users/User/Documents/Codex/2026-09-17/yf/outputs/fitfocus-rollback-ci-38249434753/release"
```

Результат: `Verified 98d49101e15ad652e1960381ce00e00e8dac0d44: 82 files`.
Этот CI-архив отличается от прежней локальной сборки (Node v24.19.0);
их хеши и байты не отождествляются. Скачивание и hash inventory не закрывают
flaky WebKit, реальные устройства или staging. Browser ZIP также скачан, его SHA-256 совпала с GitHub digest. Извлечён
trace desktop-webkit fresh install: pageerror старого sender возник после
нажатия обновления, до окончания reload. Проверка с удержанным native PUT
локально прошла, но CI-ошибка не воспроизведена и не считается устранённой.

## Что сохраняется

`scripts/release-artifact.mjs` берёт исходники через `git archive` точного
40-символьного commit SHA, собирает Vite/PWA и компилирует все Pages Functions
через закреплённый Wrangler 4.149.0. Артефакт содержит:

- `dist/`: клиент, настоящий SW, `_headers`, `_routes.json`,
  скомпилированный Pages Worker `_worker.js/index.js` и остальные assets;
- `source.tar`, исходный `package-lock.json`, `wrangler.toml`, миграции;
- `release.json`: исходный SHA, инструментальная среда, контракт IDB v3 / D1 0021,
  размер и SHA-256 каждого сохраняемого файла.

Рядом создаётся `.tar` всего артефакта. Исходники рабочего дерева,
`node_modules`, локальные `.env` и `.dev.vars` в него не копируются.
Публичные Vite-параметры сборки берутся из среды; перед staging нужно
подтвердить соответствие OAuth client IDs целевой среде. Секреты, bindings
и данные базы остаются настройкой проекта Cloudflare.

Упаковщик отказывается перезаписывать существующий результат или писать
внутрь исходного checkout. Проверка отклоняет недостающие, лишние, изменённые
файлы и symlink/junction. Контрольные суммы обнаруживают повреждение или
смешение файлов; совместимость подтверждается выполнением сценариев ниже,
а происхождение — проверенным SHA и CI выбранного артефакта.

## Подготовка и проверка

Требуются Node.js 24, зависимости из `npm ci`, Git и tar. Выберите новый
каталог вне репозитория; пример для Windows:

```text
npm run release:build -- --source 98d49101e15ad652e1960381ce00e00e8dac0d44 --output D:/FitFocus-artifacts/rollback-98d4910
npm run release:verify -- D:/FitFocus-artifacts/rollback-98d4910
npm run release:check -- D:/FitFocus-artifacts/rollback-98d4910
```

Сборка использует зависимости сохранённого lockfile; установленный набор
переиспользуется только при совпадении lockfile. Упаковщик пока поддерживает
проверенный контракт IDB v3 / D1 0021; новую схему нужно принять отдельно.
`release:check` собирает текущий HEAD из Git и запускает два настоящих локальных
Pages Worker по очереди на одном origin и одной D1: сначала кандидат,
затем неизменённый worker из артефакта. Он не разворачивает код в Cloudflare
и не обращается к удалённой D1. Синтетические аккаунты и локальная конфигурация
создаются в отдельном temp-каталоге; логи сохраняются там же. Проверяется
распаковка сохранённого `.tar`; его manifest и файлы должны совпадать
с исходным артефактом.

## Какие гарантии проверяются

HTTP-сценарий оставляет legacy меню/покупки с отличающимися значениями,
принимает новые canonical profile/family поколения, затем перезапускает сервер
из артефакта. Проверяются canonical readers, личная и семейная проекции,
новый CAS и конфликт, account/session и owner guard, отказ старых writers,
пустые canonical поколения без legacy fallback и сохранность старых строк.

`e2e/pwa-rollback.spec.ts` использует собранный клиент артефакта, настоящий SW
и native HTTP API-фикстуру. Клиент кандидата создаёт pending либо conflicted
family intent, сохраняет профиль и IDB-маркеры ledger/quarantine. После
явной активации rollback SW проверяются загрузка именно JS артефакта,
IDB v3, opId/payload/remote snapshot, профиль, маркеры и auth-fence.
Pending доставляется v3-aware sender после восстановления API; введённый
`Retry-After: 20` сохраняется через откат. Бюджет ожидания теста выводится
из persisted `nextAttemptAtMs`/lease, HTTP-время приёма не раньше deadline.
Production claim/retry не изменяются. Conflicted сохраняется для разрешения
пользователем. Обе открытые вкладки
переходят на JS артефакта. Отдельный `e2e/pwa-rollback-install.spec.ts`
проверяет первую установку самого rollback-клиента и его последующее
явное обновление до кандидата с сохранением pending family intent.
IDB-маркеры проверяют
сохранность stores; они не доказывают runtime legacy-импорт или владельца.
Временная общая подмена GIS через page.route удалена: SW-запросы обходили
её, и повторный полный прогон снова упал. В `98d4910` лишний SDK удалён
из HTML. Rollback-тесты проверяют отсутствие Google-запросов
без подмены SDK. Только исторический v2-клиент forward-теста сохраняет
подмену внешнего SDK до первого SW control; старые app/SW bytes неизменны.
Assets приложения, SW и HTTP API не перехватываются. Это не проверка OAuth.
После явной активации тест ждёт навигацию и load обеих вкладок до чтения DOM;
сам click не ждёт навигацию, чтобы trace не снимал новый DOM до загрузки CSS.

Сценарий также воспроизвёл дефект первого SW-клиента: Workbox помечал
его первоначальную регистрацию как install, поэтому замена controller
не приводила к reload. Текущая регистрация отслеживает реальную смену
controller: первое управление не перезагружает форму, замена worker
перезагружает вкладку. Установка нового worker сама не активирует его;
сохраняется предупреждение [сохранить все вкладки](pwa-updates.md).
Поэтому `8d32f12` сохранён только для отрицательной диагностики первой
установки. `574de76` содержит исправление reload, но не принят из-за SDK;
следующая база `98d4910` сохраняет поправку регистрации и удаляет SDK.

## Хранение и использование

Браузерный HTML-отчёт и `test-results` сохраняются независимо от исхода E2E
на 14 дней. Это диагностика, а не принятый rollback artifact. У run `98d4910`
trace-артефакты отсутствовали; новое хранение не восстанавливает старый trace.


Workflow готовит baseline-артефакт перед browser-тестами. После успешных E2E
и HTTP-проверки он сохраняет именно проверенный `.tar` через
`actions/upload-artifact@v7.0.2` на 90 дней. Это не бессрочное хранение:
перед выпуском скачайте выбранный архив и сохраните его отдельно вместе
с SHA, run ID и результатами приёмки. Повторная сборка может отличаться
по времени и хешам; откат выполняют из сохранённого проверенного архива.

После распаковки в новый каталог выполните `release:verify`, подтвердите
Pages runtime/bindings и публичную конфигурацию, пройдите staging smoke.
Pages использует скомпилированный `_worker.js` из output directory;
[официальный формат](https://developers.cloudflare.com/pages/functions/advanced-mode/).
Порядок Pages/D1-настроек описан в
[документации Cloudflare](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).
В этом компоненте deploy и переключение production не выполняются.

При откате оставьте IDB v3, canonical SQL-таблицы, triggers, legacy-источники
и pending/conflicted операции. Не выполняйте down-migration или очистку
хранилищ. Клиент v2 и reader только прежних weekly_menu_items для отката
после новых canonical записей несовместимы.

## CI mock-фикстуры aefc463

[Run 38256100623](https://github.com/Michael-edel/FitFocus/actions/runs/38256100623)
и job 114834593231 завершены success; head
`aefc46320de11b83ffdb274e7dae1a911e69612e`.
1053 unit / 194 файла, 362 browser passed / 9 skips, без flaky/proxy-ошибок.
HTTP/D1: 23 запроса, кандидат `218d47eba96720d3079c966ec71a4a37bbd5030c`
→ retained `98d49101e15ad652e1960381ce00e00e8dac0d44`.

| Артефакт | GitHub ID | ZIP bytes | SHA-256 ZIP | Срок хранения |
|---|---|---|---|---|
| fitfocus-browser-38256100623-1 | 11751831312 | 53953602 | b3878851be33b294bec59c58f41749062247adf55d2f89541d69153674d66604 | 26.10.2026 13:53:24 UTC |
| fitfocus-rollback-98d4910-38256100623-1 | 11751596969 | 3888249 | b1f60fd266a7682491498dbb1cb57fe541c1bc2b39d26b1f03f099aeb817622e | 10.01.2027 13:30:02 UTC |

Проверены завершение run/job, логи и metadata загрузки. Эти ZIP не скачивались
в рамках данной сверки; digest из metadata не объявляется локальной проверкой
их содержимого. Ранее скачанный архив `5b90249` остаётся отдельным артефактом.
Этот CI не содержит последующего preview-origin компонента и не подтверждает deploy.

## CI preview-origin 076f4ac

[Run 38261672999](https://github.com/Michael-edel/FitFocus/actions/runs/38261672999),
job 114853979454, завершился success на head
`076f4aca8e9855bb328a3fe695cb0bcd085ddd6f`: 1053 unit / 194 файла,
383 browser passed / 9 skips. HTTP/D1 прошёл 23 запроса, candidate
`8a2a9e9525799d76403c07aeeb5b4463900c3aa8` → retained
`98d49101e15ad652e1960381ce00e00e8dac0d44`.

| Артефакт | GitHub ID | ZIP bytes | SHA-256 ZIP | Срок хранения |
|---|---:|---:|---|---|
| fitfocus-browser-38261672999-1 | 11753738236 | 57115503 | aa19f9abc5cc9362c02f2feaa64b5c3744f6901293013b3bea2f0f6aff100a83 | 26.10.2026 14:40:12 UTC |
| fitfocus-rollback-98d4910-38261672999-1 | 11754550614 | 3890891 | f49f990499cd821de18a407030654431b1cbac63eb094ac0d04e2b5f08e74a3a | 10.01.2027 14:16:13 UTC |

Значения взяты из GitHub artifact metadata; ZIP-файлы этого запуска не
скачивались и не проверялись локально. Download digest не заменяет проверку
содержимого. Артефакты предыдущего CI `5b90249` проверены отдельно.

Результаты конкретных прогонов — в [журнале](stabilization-progress.md),
оставшаяся приёмка — в [TASKS](../TASKS.md) и [RELEASE_CHECKLIST](../RELEASE_CHECKLIST.md).
Реальные устройства, OAuth/BFCache, runtime legacy, удалённая D1, staging,
защищённая main и production-выпуск этим локальным компонентом не закрываются.

## CI WebKit PWA update `47da77c`

[Run 38280645353](https://github.com/Michael-edel/FitFocus/actions/runs/38280645353),
job 114917387935, завершился success на head
`47da77cdf6a7a8c72223a914545fa2724ab6263d`: 1053 unit / 194 файла,
383 browser passed / 9 skips, 20,6 мин. В job log нет flaky, preview proxy
errors или ECONNREFUSED. HTTP/D1 прошёл 23 запроса; кандидат
`cf310dd305fd15a957ab24188f40060f3790f9fe` → retained
`98d49101e15ad652e1960381ce00e00e8dac0d44`.

| Артефакт | GitHub ID | ZIP bytes | SHA-256 ZIP | Срок хранения |
|---|---:|---:|---|---|
| fitfocus-browser-38280645353-1 | 11761719261 | 57091750 | 2aa9d8b2c7ffc3d4fe7fa6675b3c039ea0cb54fb4a33a37ff61563e7f581015e | 26.10.2026 17:18:26 UTC |
| fitfocus-rollback-98d4910-38280645353-1 | 11762830605 | 3889665 | 8f872545b63f418aedb0dd00ec8ce8563ac00ce709aac4303c088cf24f805e13 | 10.01.2027 16:54:30 UTC |

Значения взяты из GitHub artifact metadata; ZIP-файлы этого запуска отдельно
не скачивались и локально не проверялись. Эта CI включает delayed native PUT
rollback-test, но не воспроизводит исторический WebKit pageerror. Диагностика
Firefox на той же ветке дала 11/11 повторов как с IDB-логами, так и без них;
причина timeout `076f4ac` остаётся неизвестной.
