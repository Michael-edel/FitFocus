# Стабилизация: проверяемые изменения

## P0 — fail-closed проверка batch PUT /api/state, 19.10.2026

Commit [`8579486`](https://github.com/Michael-edel/FitFocus/commit/8579486)
исправляет нормализацию batch: null/примитивные элементы, объекты без строкового
`key` и значения `key` нестрокового типа теперь отклоняют весь пакет с
`BAD_ITEM` до записи в D1. Явно пустой строковый ключ по существующему контракту
по-прежнему пропускается. Добавлены unit- и route-level регрессии, а
`API_CONTRACTS.md` описывает 400-ответ. Локально прошли 39 целевых тестов,
root typecheck, API invariants и `git diff --check`. Commit опубликован в draft
PR #93; точный [CI #1688](https://github.com/Michael-edel/FitFocus/actions/runs/39193899739)
для HEAD `ba78ba0` выполняется.

## P0.9 — read-only branch-preview smoke точного HEAD `1546073`, 19.10.2026

`npm run test:e2e:staging` выполнен на
`https://fix-durable-outbox.fitfocus.pages.dev/` и прошёл **7/7 GET-only** тестов.
`/`, `/api/env` и анонимный `/api/me` вернули 200; защищённые bootstrap/profile/
state/push-status — 401 без redirect и `Set-Cookie`. Загрузка JS bundle
`/assets/index-CmecaeC0.js` подтвердила полный SHA
`1546073d72d8c81bb8628bf5dbedfab0c6430d12`.

Это опубликованный branch preview, не отдельный staging origin. Реальные OAuth,
авторизованные операции, D1/миграции, устройства и release checklist остаются
открытыми. Локальная переменная staging origin не настроена; проверка выполнена
явным временным origin из контракта без изменения persistent окружения.

## Повторная проверка PWA update timeout в Firefox, 19.10.2026

Код приложения в HEAD `1546073d72d8c81bb8628bf5dbedfab0c6430d12` совпадает с
runtime `5250190`; follow-up после него меняли тесты и документацию. Плановый
сценарий `pwa-update.spec.ts` прошёл сначала 3/3, затем 10/10 в `desktop-firefox`
с `workers=1,retries=0` (13/13 суммарно, 6.3 минуты). Исторический timeout в
`saved(page)` не воспроизвёлся; эта выборка не доказывает первопричину и не
закрывает P0 пункт. Точный [CI #1686](https://github.com/Michael-edel/FitFocus/actions/runs/39190724688)
для HEAD `1546073` завершился успешно, включая browser matrix, rollback/CAS
checks и сохранение артефактов. Предыдущий #1684 для `5250190` отменён по
concurrency policy после обновления PR.

## Удаление всех account-scoped localStorage ключей, 19.10.2026

В test-only commit [`ef5d66a`](https://github.com/Michael-edel/FitFocus/commit/ef5d66a5e660236eeb957a9bdbdfc86531bbec73)
расширена регрессия удаления аккаунта: тест заполняет каждый текущий
account-scoped localStorage namespace, включая UI-настройки, черновики,
achievement counters, telemetry, recipe usage и user-state. Он проверяет
URL-кодированный recipe usage key, очищение `__ffv` sidecar и сохранение похожих
ключей другого аккаунта. Runtime-код не менялся; это дополнительная гарантия
для уже существующей очистки.

Целевой privacy spec прошёл 8/8; полный unit suite — **1427/1427** в 216 файлах,
root typecheck/admin guards и `git diff --check` прошли. Test-only commit входит
в точный CI #1686 для HEAD `1546073`, который завершился success, включая
browser matrix и rollback/CAS gate.
Общая account deletion/lifecycle приёмка остаётся открытой.

## PR CI #39183159791 — пять ошибок browser acceptance, 19.10.2026

Точный workflow для опубликованного `4281ccb` завершился **1105 passed / 311
skipped / 5 failed**. Dependency audit, schema/privacy/auth/API guards, unit
suite, три typecheck и production build прошли. Новая проверка delayed family
menu account switch была зелёной; браузерные сбои относились к другим тестам.

Trace семейного списка A → B показал два удержанных запроса A, начатых до того,
как соседняя вкладка зафиксировала сессию B. Тест снимал baseline после первого
запроса, поэтому считал второй запрос во время перехода новой ошибкой. Теперь
baseline фиксируется после записи аккаунта B в общей сессии; поздние ответы A
всё ещё освобождаются, а после перехода не допускается новый запрос A.

Trace owned-state показал ровно один settings PUT с payload `light`, отправленный
соседней вкладкой как транспорт первой операции. Проверка считала любой запрос
со второй вкладки ошибкой, хотя отправитель выбирается общей очередью. Теперь
обе вкладки учитываются, а тест запрещает именно потерявший конфликтный payload
`premium` и подтверждает, что первая операция `light` отправлена один раз.

В миграционном тесте CI сохранились imported/quarantine данные, а `currentStatePutAccepted`
остался равен нулю. После обновления обеих вкладок общий прогресс на момент
проверки снова оказался `importing` или `partial` с закрытым `sendAllowed`; это
соответствует незавершённой повторной проверке Service Worker fence и не
подтверждает ошибочную отправку. Локальные WebKit и iPhone прогоны завершились
успешно. Так как приложение повторно проверяет all-client fence с backoff, обе
строгие проверки миграционного состояния теперь ждут до 60 секунд; ожидаемые
записи, причины quarantine и запрет неподтверждённой отправки не ослаблены.

Follow-up `ddba485` прошёл 5/5 затронутых browser-проектов локально, typecheck,
production build и `git diff --check`. Runtime-код не менялся. Точный полный CI
этого follow-up должен подтвердить исправления после push.

## P0.9 — конфликт двух вкладок с одним полным JSON-снимком, 19.10.2026

Добавлен browser acceptance для строки матрицы «Две вкладки, один полный
JSON-снимок, второй edit пока первый PUT в полёте». Web Locks отключены; первый
settings PUT удерживается, независимое изменение соседней вкладки остаётся
`local-revision-conflict`. После ответа первой операции подтверждённая версия
сохраняется, конфликт с его полным payload остаётся в IndexedDB, а второй PUT
не отправляется. Роут установлен на обе вкладки, поскольку трассы Firefox и
Android показали, что запрос может отправить вкладка-сосед.

Сценарий прошёл **7/7** desktop/mobile/PWA Playwright-проектов без retries;
используется mock API, поэтому staging и реальный offline остаются отдельными
проверками. Тест и отметка матрицы включены в [`de93fa0`](https://github.com/Michael-edel/FitFocus/commit/de93fa0c5d7b5a46a4258ee80fbe8783be6bb5a2)
и опубликованы в PR. Точный CI #1677 для этой ревизии поставлен в очередь; CI
#1675 проверяет предыдущий HEAD.

## CI #1673 — дождаться окончания общей миграции после обновления вкладок, 19.10.2026

Точный workflow опубликованного SHA `8ffa9e4` завершился с результатом
**1099 passed / 307 skipped / 1 failed** за 32.4 минуты. Единственный сбой —
iPhone Safari, `legacy-outbox-migration.spec.ts`, после обновления двух вкладок.
Финальный снимок сохранил ожидаемые imported/quarantine records и операции;
разошлись только общие поля прогресса: CI увидел `importing`,
`sendAllowed: false`, `writersStopped: false` вместо terminal `partial/true/true`.
На этом снимке отправка оставалась запрещённой; тест не показал потерю данных или
разрешённую неподтверждённую отправку.

Вероятная причина — повторная проверка миграции при запуске обеих новых вкладок.
Каждая проходит свежие `/api/me` и Service Worker fence, а состояние миграции
общее для IndexedDB; новая проверка временно сбрасывает progress в `importing`.
Это вывод из кода и порядка сценария, отдельная CI-трасса события не подтверждает.
Исходный Safari-тест прошёл 3/3 локальных повторов. Его финальный polling теперь
ждёт до 30 секунд terminal state вместо стандартных 10, не ослабляя проверку
записей, операций и итоговых флагов. Изменение только в E2E-тесте; обновлённый
сценарий прошёл 1/1 локально. Тестовая корректировка включена в `17b96fb` и
отправлена в `fix/durable-outbox`. Новый точный [CI #1675](https://github.com/Michael-edel/FitFocus/actions/runs/39179182135)
идёт: зависимости, браузеры, audit, schema/privacy/auth/API и unit завершились
успешно; typechecks и production build завершились, выполняются browser tests.

## P0.8 — не считать глобальную legacy-запись чужой при удалении аккаунта, `4e8adff`, 19.10.2026

Проверка удаления аккаунта учитывала только legacy-ключи с префиксом этого
аккаунта. Поэтому отдельная глобальная запись без владельца оставалась в
`fitfocus.remote-kv-outbox.v1`, но `clearLocalUserData` возвращал
`complete: true`. Две регрессии в localStorage и IndexedDB воспроизвели это
поведение до исправления.

Общая проверка legacy-записей теперь считает global и malformed key
неразделяемым evidence: payload остаётся без изменений, `legacyEvidenceRetained`
становится `true`, а локальный результат удаления — неполным. Явно
account-scoped ключи другого пользователя не блокируют очистку текущего
аккаунта. Предупреждение в App теперь говорит о неподтверждённом владельце.

Полный unit suite прошёл **1426/1426** (216 файлов), связанный migration/backup/
cleanup набор — **100/100**. Общий, `domain-strict` и `storage-strict` typecheck,
privacy coverage (29 таблиц), API invariants, production build и `git diff --check`
прошли. Это исправляет только ложное сообщение о полной очистке: общий legacy
source/snapshot физически не удаляется и может содержать payload. Коммит пока
локальный; точный CI #1673 для предыдущего опубликованного SHA завершился одним
Safari timeout, разобранным выше.

## P0.9 — облачная гидратация при локальной pending-правке, 19.10.2026

В [`64f4430`](https://github.com/Michael-edel/FitFocus/commit/64f4430)
добавлен браузерный сценарий строки `Cloud hydration при pending` из матрицы:
IndexedDB сначала получает серверную тему `dark` версии 7, локальная правка
`light` получает scoped 503 с `Retry-After`, затем страница перезагружается при
ещё несовпадающем серверном снимке. После reload остаются локальное значение,
исходные `opId`, payload, baseVersion 7, retryCount и deadline; повторный PUT до
deadline не выполняется, сервер остаётся на версии 7.

Сценарий прошёл **7/7** desktop/mobile/PWA профилей (`workers=1,retries=0`),
`npm run typecheck` и `git diff --check` прошли. Это browser acceptance с mock
API; физический offline и staging не проверялись. Точный CI запускается после
push.

## P0.5 — изолировать проверку позднего Coach-ответа от старта приложения, 19.10.2026

В CI #1665 единственный desktop WebKit failure был в сценарии отмены Coach retry:
`achievementChecks` вырос с 1 до 2. Проверка выполнялась уже после повторного
открытия приложения, поэтому могла учитывать штатный achievement-check при
инициализации новой страницы. Проверка теперь выполняется сразу после получения
освобождённого позднего ответа и до повторного открытия; это сохраняет проверку
отсутствия побочного эффекта от старого ответа и не смешивает её с запуском
приложения.

Исправленный сценарий прошёл **3/3** на desktop WebKit (`workers=1,retries=0`).
Runtime-код не менялся. Точный CI новой ревизии ветки ожидает полного прогона.
Предыдущий CI #1667 на SHA `0faaddc` дошёл до
браузерной матрицы, но не включает эту корректировку.

## P0.6 — реальный Chrome BFCache restore для `/api/env`, 19.10.2026

Сборка с runtime SHA `856e3f5` открыта на локальном HTTP origin в отдельной
Chrome-сессии без входа и пользовательских данных. При переходе на второй
same-origin URL и возврате назад наблюдатель зафиксировал `pagehide` исходной
страницы с `persisted=true`, затем `pageshow` восстановленной страницы с
`persisted=true`. Локальный mock сервер записал повторный запрос `/api/env`
через 27 мс после восстановленного `pageshow`. `build-info.generated.ts`
подтверждает, что bundle собран из `856e3f5`; текущий локальный `3894ada`
содержит только тесты и документацию поверх того же runtime.

Это подтверждает один реальный desktop Chrome BFCache сценарий для публичной
конфигурации и её повторного запроса. Это не покрывает авторизованные API,
OAuth, установку на устройстве, старые bundles или staging. Playwright CI
продолжает отключать BFCache через `BackForwardCacheDisabledForDelegate`, поэтому
этот ручной smoke не заменяет автоматическую браузерную матрицу.

## P0.8 — гонка восстановления legacy-профиля с повторной проверкой сессии, 19.10.2026

Точный [CI #1663](https://github.com/Michael-edel/FitFocus/actions/runs/39166463413)
на старом опубликованном merge SHA `d039538` завершился одним browser-сбоем на
Android Chrome: `resolves a legacy profile through its guarded profile CAS endpoint`.
Трасса показала успешный scoped `GET /api/profile`, после которого параллельная
проверка `/api/me` временно очищала in-memory `readGuard`; восстановление затем
ошибочно отказывало, хотя та же сессия оставалась активной в IndexedDB. Другие
проверки CI, включая audit, unit, typecheck и production build, прошли.

В локальном изменении после ответа сервера проверяются поколение и account, а
захваченный read guard повторно проверяется атомарно в транзакции outbox по
`active-session` и `auth-fence`. Это сохраняет отказ при фактической смене сессии
и устраняет ложный отказ при параллельном reverify. Добавлен unit-регрессионный
тест, который воспроизводит гонку: до исправления он падал, после — проходит.
Профильная migration E2E прошла **49/49** на семи browser/PWA-профилях без
retries; точный Android Chrome сценарий прошёл **10/10**. Полный unit —
**1421/1421** на опубликованном коммите [`856e3f5`](https://github.com/Michael-edel/FitFocus/commit/856e3f5),
root/domain/storage-strict typecheck, admin/auth/API/schema/privacy guards и
production build прошли. Дополнительный negative unit проверяет, что реальная
смена server session во время profile GET всё ещё отклоняет старый guard; с ним
локальный unit suite прошёл **1422/1422**. Exact [CI #1665](https://github.com/Michael-edel/FitFocus/actions/runs/39171936916)
для `856e3f5` выполняется; дополнительный regression test пока не входит в этот
run. P0.8 и общая P0-приёмка остаются открыты.

## P0.5 — ранняя отмена callbacks поддержки, `d9317f7`, 19.10.2026

`requestSupportJson` и чтение вложений в `requestSupportAttachmentBlob` раньше
реагировали только на `pagehide`. Теперь `beforeunload` отменяет и активный
transport, и controller действия; `pagehide` сохраняется как дополнительная
защита. Оба временных listener снимаются после завершения запроса, чтобы idle-
страница не удерживала lifecycle handler. Это не даёт SupportScreen обработать
поздний результат во время ухода со страницы.

Профильные transport-тесты прошли **15/15**, browser acceptance отображения
ticket/reply вложений — **7/7** на семи browser/PWA проектах без retries;
root и storage-strict typecheck, `git diff --check` прошли. Реальные backend,
staging и BFCache не проверялись. Точный CI после push ожидает проверки.

## P0.5 — navigation abort во время hydration задачи плато, `aab209f`, 19.10.2026

Новый E2E запускает session hydration с профилем плато и удержанным scoped
`/api/ai` запросом. Он выполняет реальный переход на другую страницу до
завершения запроса, освобождает поздний mock response и проверяет порядок
`beforeunload → abort → pagehide`, неизменность durable profile/state/outbox и
отсутствие profile/state writes и achievement checks. Так проверяется отдельный
AI writer, который запускается автоматически при входе, до появления экрана.

Сценарий прошёл **7/7** на desktop Chromium/Firefox/WebKit, Android Chrome,
Android PWA Chrome, iPhone Safari и iPhone PWA (`workers=1,retries=0`);
`npm run typecheck` и `git diff --check` прошли. Runtime-код не менялся:
проверка подтвердила существующую отмену scoped transport. Это mock API, не
доказательство отмены работы внешнего AI-провайдера, реального BFCache или
staging. Точный CI новой ревизии проверяется после push.

## P0.5 — навигация во время AI-генерации семейного меню, `e22b2bf`, 19.10.2026

Новый E2E удерживает `/api/ai` для family-menu, затем выполняет реальную
навигацию и освобождает старый ответ. Проверяется порядок
`beforeunload → abort → pagehide`, отсутствие новой familyMenu operation,
неизменность сохранённого семейного снимка и отсутствие menu PUT/achievement.
Сценарий прошёл **7/7** на desktop Chromium/Firefox/WebKit, Android Chrome,
Android PWA Chrome, iPhone Safari и iPhone PWA (`workers=1,retries=0`).
`npm run typecheck` и `git diff --check` прошли. Это mock API; отмена работы
внешнего AI-провайдера, реальный BFCache и staging не подтверждены. Точный CI
новой ревизии запускается после push.

## CI unload-исправлений, `a739c1e`, 19.10.2026

Точный [CI #1642](https://github.com/Michael-edel/FitFocus/actions/runs/39155718399)
завершился success на кодовом SHA `a739c1e`: dependency audit, schema/privacy/
auth/API guards, **1391 unit в 215 файлах**, три typecheck и production build
прошли. Browser matrix завершилась с **1058 passed / 307 skipped** за 44,7 минуты,
без retries. Rollback/CAS gate выполнил и сохранил 23 HTTP/D1-запроса.
[Browser diagnostics](https://github.com/Michael-edel/FitFocus/actions/runs/39155718399/artifacts/12148361054)
и [rollback artifact](https://github.com/Michael-edel/FitFocus/actions/runs/39155718399/artifacts/12148176564)
доступны в run. Этот результат подтверждает опубликованный код `a739c1e`;
отдельный staging, OAuth и интеграция в защищённую `main` остаются открыты.

## P0.5/P0.9 — unload недельного AI-отчёта, 18.10.2026

`useWeeklyAiReport` больше не держит постоянный `beforeunload` listener в
неактивной странице. На время генерации отчёта listener отменяет transport и
инвалидирует именно эту попытку; `finally` снимает listener. При обычном переходе
активный отчёт не может записаться в durable outbox после ухода со страницы.

Проверки: weekly-report unit — **9/9**; `weekly-ai-report-session.spec.ts` —
**6/6** в desktop Chromium и WebKit (`workers=1,retries=0`), включая реальную
навигацию с удержанным `/api/ai`; root typecheck и `git diff --check` прошли.
На момент проверки эти изменения ещё не входили в опубликованный HEAD. Точный
CI предшествующего `961c895` — [#1636](https://github.com/Michael-edel/FitFocus/actions/runs/39151491224) —
завершился success: 1388 unit / 215 файлов, 1044 browser passed / 307 skipped,
audit, guards, три typecheck, build и 23 HTTP/D1 rollback/CAS-запроса.
[Browser diagnostics](https://github.com/Michael-edel/FitFocus/actions/runs/39151491224/artifacts/12146635676)
и [rollback artifact](https://github.com/Michael-edel/FitFocus/actions/runs/39151491224/artifacts/12146590323)
сохранены. Точный CI follow-up запускается после push.

Реальный BFCache этим E2E не подтверждается. Попытка проверить
`pageshow.persisted` через Playwright показала, что браузерный delegate отключает
BFCache; экспериментальный падающий тест убран. Документация Playwright прямо
говорит, что BFCache по умолчанию отключён и восстановление через `page.goBack()`
не поддерживается их навигационной моделью: [Playwright — BFCache](https://github.com/microsoft/playwright/blob/main/docs/src/navigations.md#backforward-cache).
Проверка BFCache на реальном браузере/устройстве и staging остаётся открытой.

## P0.5 — реальная навигация во время обычного Coach retry, `b4336d8`, 18.10.2026

Новый сценарий удерживает пользовательский Coach retry на `/api/ai`, выполняет
реальную навигацию на `about:blank` и возвращается в приложение. Проверяется,
что активный browser `AbortSignal` отменён на `beforeunload`/`pagehide`, а поздний
ответ не меняет профиль, coach value, outbox или achievement effects. Он дополняет
регистрационный unload acceptance, покрывая обычный retry AI-сессии.

Целевой Playwright-сценарий прошёл **3/3** на desktop Chromium, Firefox и WebKit
без retries; весь callback spec — **48/48** на desktop Chromium
(`workers=1,retries=0`); AI transport unit — **25/25**, `npm run typecheck` и
`git diff --check` прошли. Фикстура освобождает задержанный mock response после
навигации, чтобы проверить поздний результат; отменённый fetch не обновляет
profile, coach value, outbox или achievement effects. Это не доказывает, что
внешний сервер прекращает уже начатую AI-работу.

`b4336d8` опубликован последующим документирующим commit `961c895`. Точный PR CI
для `961c895` — [#1636](https://github.com/Michael-edel/FitFocus/actions/runs/39151491224) —
завершился success: 1388 unit / 215 файлов, 1044 browser passed / 307 skipped,
audit, guards, три typecheck, build и 23 HTTP/D1 rollback/CAS-запроса.
Реальные OAuth, BFCache и staging остаются открытыми.

## P0.8 follow-up — ограничить invite-запросы регистрации, `f4dcce8`, 18.10.2026

Регистрационные `/api/me` и `/api/invite/redeem` теперь используют общий
`requestJson` с таймаутом 12 секунд и сигналом контроллера регистрации. `pagehide`
отменяет ожидающий invite-запрос; redeem/profile/AI шаги после такой отмены не
запускаются. Таймаут даёт повторяемое сообщение, а invite POST не повторяется
автоматически. Повтор пользователем безопасен при потерянном ответе, потому что
серверное `consumeInviteCode` идемпотентно для того же кода и аккаунта. Если
`pagehide` прерывает AI уже после durable commit базового профиля, профиль остаётся
восстанавливаемым, но вход в приложение не выполняется.

Локальная проверка `f4dcce8`: registration unit **16/16**, полный unit suite
**1384/1384** в 215 файлах, root и storage typecheck, auth-scope guard,
production build и registration durability E2E **2/2** в desktop Chromium.
Кодовый коммит `f4dcce8` опубликован в PR; точный CI этого обновления запущен.

Test-only follow-ups `32d58d7`, `f4a4140` и `c219f17` удерживают начальный `/api/me`,
invite redeem и AI-ответ. Проверяются timeout/pagehide abort, отсутствие auto-retry
POST, отсутствие локального профиля после отмены invite и отсутствие login после
сохранения профиля. `registration_flow.test.ts` прошёл **19/19**, полный suite —
**1387/1387** в 215 файлах; root typecheck прошёл. Эти follow-ups пока локальные.

Точный [PR CI #1628](https://github.com/Michael-edel/FitFocus/actions/runs/39139902243)
для опубликованного HEAD `5d5dca8` прошёл audit, guards, unit, три typecheck и
production build; browser matrix ещё выполняется. Он содержит код `f4dcce8`, но
не тестовые follow-ups `32d58d7`, `f4a4140` и `c219f17`. Предыдущий родительский
[CI #1624](https://github.com/Michael-edel/FitFocus/actions/runs/39136081427)
для `702b4d1` завершился success, включая browser matrix и rollback compatibility.

Read-only smoke branch preview проверил bundle с полным SHA `702b4d1`:
`/`, `/api/env` и анонимный `/api/me` вернули 200, защищённые bootstrap/profile/
state/push-status — 401 без redirect и `Set-Cookie`. Smoke не проверяет отдельный
staging, OAuth, авторизованные записи или D1.

## P0.8 follow-up — показывать неперенесённые legacy-записи, `e91c134`, 18.10.2026

После полной миграции повреждённая запись правильно сохранялась в
`outbox_migration_unknown`, а прогресс получал статус `partial`. При этом
`sendAllowed` мог оставаться `true`: проверенные операции безопасно продолжали
синхронизацию. Если других очередей или ошибок не было, интерфейс не сообщал о
записях, оставшихся в карантине.

Добавлен отдельный информационный статус для аккаунта. UI показывает, что
неперенесённые записи сохранены для проверки, отдельно от блокировки отправки;
пауза и разрешение на отправку не меняются. Счётчик берётся только из
неразрешённых записей карантина, а не из общего числа несинхронизированных
legacy-операций.

Новая browser-регрессия на настоящем IndexedDB/Service Worker с синтетическим
HTTP API прошла **7/7** desktop/mobile/PWA проектов без retries. Связанные
legacy migration unit-тесты прошли **78/78**, полный suite — **1368/1368**;
root/domain/storage typecheck и production build прошли. Один параллельный запуск
unit suite превысил локальный 5-секундный timeout; изолированный повтор, целевой
suite и полный suite прошли.

Коммит опубликован в `e91c134`. Точный [CI #1607](https://github.com/Michael-edel/FitFocus/actions/runs/39107245314)
прошёл audit, guards, unit, три typecheck и build; E2E завершился одним Desktop
WebKit отказом. Trace показывает, что после reload `/api/me` занял около 5,5
секунды; весовое поле с черновиком `98.765` появилось уже после истечения
десятисекундного ожидания. Данные не потеряны: screenshot сохранил dashboard и
восстановленное значение.

Локальный test-only follow-up увеличивает ожидание восстановления поля до 30
секунд. Целевой сценарий прошёл **5/5** на WebKit и **3/3** по трём desktop
браузерам без retries. Новый точный CI ожидает публикации. Предыдущий
[CI #1605](https://github.com/Michael-edel/FitFocus/actions/runs/39105107242)
для `05bf14b` завершился success. Read-only branch preview отдаёт полный SHA
`e91c134`; `/`, `/api/env`, анонимный `/api/me` — 200, а защищённые bootstrap,
profile, state и push — 401. Это не подтверждает D1, OAuth или staging.
Остальные P0.8/P0.9 lifecycle, staging, выпуск и интеграция в защищённую `main`
остаются открытыми.

## P0.8 — не терять edit при source re-verification и полном storage clear, `152b7af`, 18.10.2026

Desktop WebKit воспроизвёл гонку старой вкладки: её неудачная попытка отправки
обновляла legacy source и запускала `/api/me` re-verification в новой вкладке.
Пока запрос был открыт, новый runtime получал keyed `StorageEvent` от последующей
пользовательской правки, но игнорировал её, потому что re-verification временно
очищает текущую in-memory session. Событие приходило корректно, однако durable
`legacy-writer-local-only` operation не создавалась.

`StateSync` теперь сохраняет последнюю принятую local-commit session отдельно от
временной proof для отправки. Перехваченный edit записывается как `conflicted`;
`DurableOutbox` в IndexedDB проверяет владельца, server session и sessionEpoch
внутри транзакции. Новая или чужая эпоха не принимается, операция не становится
sendable. Это сохраняет локальную правку во время повторной проверки, не открывая
сетевую отправку по устаревшему proof.

Отдельный реальный old/new browser acceptance вызывает `localStorage.clear()` в
старой вкладке. Новый клиент получает единый `StorageEvent` с `key=null`, повторно
проверяет source и сохраняет исходный migration snapshot, quarantine и операции
в IndexedDB. Очистка не интерпретируется как серия per-key DELETE. Browser clear
и сценарий старой записи прошли 7/7 Playwright-проектов без retries; old-bundle
`council_history` keyed DELETE — 7/7. Добавленная unit-регрессия сначала упала
при удержанном `/api/me`, затем прошла в составе 12/12. Полный unit suite —
1368/1368 тестов / 213 файлов; root, domain-strict, storage-strict typecheck,
production build и `git diff --check` прошли.

Опубликованный parent `2e56910` проверяется точным [CI #1597](https://github.com/Michael-edel/FitFocus/actions/runs/39097545128): audit,
schema/privacy/auth/API guards, unit, три typecheck и build прошли; E2E ещё
выполняется. Этот run не содержит `152b7af`; точный CI нового SHA ожидает push.
Остальные P0.8 callbacks, общий lifecycle P0.8/P0.9, staging, выпуск и защищённая
`main` остаются открытыми.

## P0.8 — сохранять keyed DELETE из старой вкладки, локальная проверка `bf29ec8`, 18.10.2026

Настоящий old/new bundle smoke воспроизвёл незакрытый delete lifecycle. Старый UI
AI Совета удаляет `council_history` из localStorage, но после 403 от scoped
state endpoint его auth-paused sender не может записать DELETE в legacy Map queue.
Новая вкладка ранее игнорировала `StorageEvent` с `oldValue` и `newValue: null`;
значение исчезало из старой сборки без durable delete intent.

В `bf29ec8` `StateSync` теперь сохраняет keyed removal управляемого ключа
подтверждённого аккаунта как `conflicted` DELETE с причиной
`legacy-writer-local-only`. Текущая durable value остаётся на месте, DELETE не
отправляется автоматически. Повторная проверка избегает дубликата, если валидный
DELETE уже находится в legacy source; устаревшая source-запись не подавляет
удаление, если после неё была более новая локальная запись. Поздний storage
event также отбрасывается, если ключ уже восстановлен.

До исправления old-bundle acceptance упал: UI удалил ключ, но ни DELETE operation,
ни соответствующая source запись не появились; проверка оставалась красной до
исправления. После него настоящий старый UI и новый клиент на одном origin прошли
**7/7** Playwright-проектов без retries. `tests/state_sync_legacy_migration.test.ts`
прошёл **11/11**, весь unit suite — **1367/1367** тестов / 213 файлов. Root,
domain-strict, storage-strict typecheck, production build и `git diff --check`
прошли локально.

Опубликованный parent HEAD `8b7983c` проверял точный [CI #1595](https://github.com/Michael-edel/FitFocus/actions/runs/39095376856),
который завершился успешно; этот run не включает `bf29ec8`. Открыты profile
callbacks, полный lifecycle P0.8/P0.9, staging, выпуск и интеграция в защищённую
`main`.

## P0.8 follow-up — CORS в weekly-menu recovery mock, `b69935b`, 18.10.2026

Exact [PR CI #1585](https://github.com/Michael-edel/FitFocus/actions/runs/39088517281)
на опубликованном родителе `e6612bc822729c56d44d435a099508af4a903fea` прошёл
dependency audit, schema/privacy/auth/API checks, 1363 unit, root/domain/storage
strict typecheck и production build. E2E завершился **995 passed / 299 skipped /
1 failed**: iPhone PWA weekly-menu recovery попал в access-control error для
`/api/profile` после reload. Trace установил, что test-specific HTTP mock
возвращал намеренный 503 без CORS-заголовков: первый PUT получил 503, durable
операция и исходный `opId` сохранились, повторный PUT после reload получил 200;
отдельного `/api/weekly_menu/items` запроса не было.

Коммит [`b69935b`](https://github.com/Michael-edel/FitFocus/commit/b69935b1b1163d52ee21967454c9986474d0409f)
добавляет `Access-Control-Allow-Origin`, credentials и `Vary: Origin` только
если заголовок Origin совпадает с origin запроса. Это меняет только E2E mock.
После исправления сценарий прошёл **5/5** повторов на iPhone PWA без retries;
полный `weekly-menu-durability.spec.ts` прошёл **56/56** на семи проектах,
workers=1/retries=0. Root typecheck и `git diff --check` прошли. Exact CI
нового SHA ожидается после push. Последний read-only preview smoke до фикса
обслуживал опубликованный `e6612bc`; он не подтверждает staging, OAuth или D1.
P0.8/P0.9, staging, выпуск и интеграция в защищённую `main` остаются открыты.

## P0.8 follow-up — точный CI #1583 выявил два iPhone E2E отказа, `5003a28`, 18.10.2026

Exact [CI #1583](https://github.com/Michael-edel/FitFocus/actions/runs/39085373286)
на HEAD `22b010d` завершился 994 browser passed / 299 skipped / 2 failed. Audit,
schema parity, privacy, auth/API guards, 1363 unit tests, три typecheck и build
прошли. iPhone PWA failure возникал из-за гонки самого теста: периодическая
same-server re-verification успевала снять auth pause до проверки промежуточного
fence. Регрессия в `5003a28` удерживает `/api/me` proof до проверки fence, затем
отпускает ответ и подтверждает обновление UI guard фактическим profile save.
Сценарий прошёл 7/7 Playwright-проектов и 5/5 iPhone PWA повторов без retries.

Второй отказ iPhone Safari был access-control console error при ожидаемом
`INJECTED_OFFLINE` 503. Trace показал, что test-specific `route.fulfill` заменял
ответ общего API mock и не добавлял CORS-заголовки. Route теперь отражает request
origin в `Access-Control-Allow-Origin` и задаёт `Vary: Origin`, не фильтруя ошибки
консоли. Settings durability сценарий прошёл 7/7 проектов; iPhone Safari и PWA
прошли 10/10 повторов без retries. `git diff --check` прошёл. Новый точный CI для
`5003a28` ожидает push; P0.8/P0.9, staging, выпуск и интеграция в `main` открыты.

## P0.8 — публиковать свежий guard повторно проверенной сессии в UI, `7fa3649`, 18.10.2026

После auth-паузы `/me` мог подтвердить ту же серверную сессию и атомарно снять
паузу, выдав новый локальный `sessionEpoch`/`authFence`, но App сохранял прежний
`loginReadGuard`; интерфейс оставался fenced. `StateSync` теперь уведомляет
подписчиков только после принятия проверенного read guard, а App применяет его,
только если совпадают `accountId` и `serverSessionId`. Добавлены unit и E2E
регрессии. В PWA update acceptance убрано ложное требование о наличии legacy
запроса в сценарии, который может не отправить legacy-запись; отдельный
`legacy-outbox-migration` acceptance по-прежнему проверяет 426 на реальном старом
writer. Также retry-тест импорта файла теперь ожидает async серверную мутацию,
а profile recovery сохраняет диагностику неудачного `/api/state` запроса.

CI предыдущего опубликованного HEAD `6ed72cd` —
[run #1581](https://github.com/Michael-edel/FitFocus/actions/runs/39082070863) —
завершился 988 browser passed / 299 skipped / 1 failed. Все audit,
schema/privacy/auth/API, unit, три typecheck и build gates прошли; единственная
ошибка была в ожидании PWA legacy-отказа. Локально на `7fa3649`: unit 1363/1363,
root/domain/storage strict typecheck, build и admin guards прошли; новая guard
регрессия — 7/7 браузерных/PWA проектов, PWA update — 7/7, импортный retry — 5/5.
Полный `profile-durability.spec.ts` завершился 146/147: один desktop WebKit run
получил временную CORS/request failure на `/api/state`; тот же recovery-сценарий
прошёл 5/5 повторов. Это не полный зелёный профильный suite. Новый exact CI для
`7fa3649` ещё не запущен; staging, выпуск и интеграция в защищённую `main` открыты.

## P0.8 follow-up — завершать запись недельного AI-отчёта до reload, локальная проверка, 18.10.2026

Точный CI #1579 на `4c03b68` завершился одной ошибкой WebKit E2E после успешных
audit, unit, typecheck и build gates (988 browser passed / 299 skipped / 1 failed).
Trace показал, что тест перезагружал страницу, пока отдельный state PUT для
`weekly_reports`, созданный ответом `wis_text`, ещё выполнялся. Проверка теперь
ждёт ответ AI, успешный state PUT и пустую outbox перед намеренным reload.
Проблемный сценарий прошёл 7/7 Playwright-проектов и 10/10 повторов desktop WebKit
без retries. Расширенный `profile-durability.spec.ts` завершился 138/140; два
других сценария (WebKit profile recovery и iPhone Safari повтор импорта файла)
упёрлись в active-session fence. В отдельном повторе шесть целевых WebKit/iPhone
запусков дали 5/6, а wearable-file сценарий на iPhone Safari прошёл 3/5; эти
отказы не относятся к новому AI-сценарию, но требуют отдельной диагностики.
Полный профильный suite и точный CI новой ревизии ещё не подтверждены; staging,
полный lifecycle, выпуск и интеграция в защищённую `main` остаются открыты.

## P0.8 — fallback AI-план показывается после durable commit, `6bcbdd2`, 18.10.2026

Вход и чистое обновление профиля раньше подставляли локальный AI-план в
отображаемое состояние до сохранения. Теперь профиль остаётся без `aiPlan`, пока
функциональное изменение не пройдёт guarded durable commit; при quota/abort
экран сохраняет состояние подготовки без outbox-записи и облачной мутации.
После восстановления хранилища действие повторяется при reload.

Регрессия прошла 3/3 на desktop Chromium, Firefox и WebKit. Unit — 1360/1360;
root, domain-strict и storage-strict typecheck, production build и
`git diff --check` прошли. Chromium и Firefox прошли полный профильный E2E по
20/20. Первый WebKit прогон дал 18/20, затем два сценария прошли точечный
повтор 2/2 и полный WebKit повтор — 20/20 без retries. Родительский CI #1573 на
`bb94957` завершился с 980 E2E passed, 299 skipped и двумя ошибками: повторный
family-list GET в Firefox и quota-сообщение в Android PWA при ожидаемом 403.
Оба сценария не воспроизвелись в локальных повторных проверках (по 5/5).
Новый exact CI запускается после push. Общий P0.8/lifecycle, staging, выпуск и
интеграция в защищённую `main` остаются открыты.

## P0.4 — убрать неиспользуемую локальную аналитику здоровья, `43c3b8c`, 17.10.2026

Onboarding, WIS-share и food-streak события сохранялись в `localStorage`, хотя
приложение нигде их не читало. В общих ключах оставались goal, вес, рост, возраст,
активность и WIS; маркеры отправки серии еды имели отдельные ключи. Удалены
сборщики событий и их вызовы, при этом сам экран food streak и вычисление серии
сохранены. При старте удаляются только известные устаревшие telemetry-ключи и
маркеры; профиль и пользовательские настройки не затрагиваются.

Privacy-регрессия проверяет очистку четырёх старых ключей с сохранением профиля
и настроек: 4/4. Root, domain-strict и storage-strict typecheck, production build
и `git diff --check` прошли локально. Точный CI этой ревизии ещё не завершён.
Предыдущий опубликованный parent `f317d53` имеет [PR CI #1559](https://github.com/Michael-edel/FitFocus/actions/runs/39034972927):
static gates и unit прошли, E2E на момент последней проверки выполнялся. Этот
прогон не проверяет изменение `43c3b8c`.

### P0.4 follow-up — очищать owner-scoped marker при удалении аккаунта, `8df9270`

Перенос очистки старых food-streak markers на запуск приложения оставлял
owner-scoped `fitfocus.analytics.sent.v1:<userId>` до перезапуска, если аккаунт
удаляли в уже открытой вкладке. Префикс добавлен обратно в список ключей
аккаунта для удаления; startup cleanup также продолжает удалять markers старых
аккаунтов. Тест проверяет удаление `user-1` и сохранение sibling `user-10`, не
затрагивая профиль или настройки. Privacy suite прошёл 4/4, root/domain/storage
typecheck, production build и `git diff --check` прошли. Точный CI для этого
follow-up ещё не завершён.

### P0.4 follow-up — удалить global telemetry при account deletion, `df26714`

Удаление только owner-scoped ключей оставляло три прежних global event logs в
открытой вкладке до следующего старта приложения. Так как новые сборки их уже не
читают, `clearLocalUserData` теперь удаляет эти известные unscoped ключи вместе с
аккаунтными данными, сохраняя при этом маркеры и данные других пользователей.
Privacy suite прошёл 4/4; root, domain-strict, storage-strict typecheck,
production build и `git diff --check` прошли. [CI #1563](https://github.com/Michael-edel/FitFocus/actions/runs/39036677274)
относится к предыдущему SHA `48f62bb`; его static gates прошли, E2E на момент
проверки выполнялся и не включает `df26714`.

## P0.8 — не показывать незафиксированную настройку после локального отказа, `5204b41`, 17.10.2026

`useSettingsPersistence` раньше сразу отмечал новое значение как уже записанное,
а запись IndexedDB запускал без ожидания результата. При quota fault state notice
показывал ошибку, но экран оставлял новую тему выбранной; повтор выбора того же
значения не создавал новую запись. Теперь hook хранит последний успешно
зафиксированный локальный снимок, возвращает к нему UI после отказа и допускает
повтор. Scope guard исключает обновление настроек после смены account/repository
или login attempt. При валидном `loginGuard` commit привязан к read-session; если
сессия ушла в auth-паузу, новая локальная операция сохраняется для отправки после
повторной проверки.

Расширен E2E quota сценарий: экран возвращается к сохранённой теме, а после
восстановления storage пользователь успешно повторяет выбор. Проверки включают
401 auth-паузу, durable reload, server confirmation, multi-edit, quota failure и
transaction abort: 18/18 на desktop Chromium/Firefox/WebKit, workers=1,
retries=0. Полный unit suite — 1347/1347; root, domain-strict и storage-strict
typecheck, production build и `git diff --check` прошли. Точный CI для нового SHA
ожидает push; остальные callbacks/lifecycle, staging и release gates остаются
открыты.

## P0.8 — durable writes дневника питания, `2c94596`, 17.10.2026

`useFoodDiary` менял React state до подтверждения записи и запускал persistence
без ожидания: quota failure мог оставить на экране несохранённое блюдо, а bulk
action очищал выбор при неудаче. Add/edit/delete, перенос/удаление выбранных
записей и удаление фото теперь сначала фиксируются через сериализованный
`UserStateRepository.updateJson`, затем обновляют экран. Guard привязывает запись
к владельцу repository, account и актуальной login session; после async-записи
повторно проверяются scope и read session. При отказе поиск и draft редактирования
остаются открытыми, а bulk selection сохраняется для повтора. История остаётся
вторичным durable update после commit дневника.

Quota-failure/retry acceptance для ручного добавления, редактирования и bulk
переноса прошла 3/3 сценария на desktop Chromium, Firefox и WebKit (9/9 без
retries). Полный unit suite — 1347/1347; root, domain-strict и storage-strict
typecheck, production build и `git diff --check` прошли. Точный CI для этого SHA
проверяется после push; остальные callbacks/lifecycle, staging и release gates
остаются открыты.

## P0.6 — сохранять фото прогресса после отказа локальной записи, 17.10.2026

`saveProgressPhotos` раньше не возвращал результат `onPatchUser`. Если запись
profile operation в IndexedDB отклонялась, `addProgressPhoto` продолжал как после
успеха: очищал выбранный файл и подпись, не показывая ошибку этого действия.
Теперь handler различает сохранённое, неуспешное и устаревшее выполнение. При
отказе файл и подпись остаются доступны для повтора; удаление фото также показывает
ошибку и блокируется во время другой записи. Смена account/session scope
инвалидирует попытку и очищает выбранный файл, поэтому поздний callback не меняет
новый экран.

Новый browser regression внедряет quota failure при записи profile outbox и
проверяет видимую ошибку, сохранность исходного profile snapshot и выбранного
файла, отсутствие сетевой мутации. Целевой сценарий прошёл 3/3 на desktop
Chromium/Firefox/WebKit без retries. Полная `profile-durability.spec.ts` прошла
30/30 на этих движках без retries; три typecheck и `git diff --check` прошли.
Это mock-IDB/client acceptance, не staging и не реальное исчерпание диска. Код
опубликован в [`980aaa1`](https://github.com/Michael-edel/FitFocus/commit/980aaa16f4278b1d1526d6a263ca017297e975ee);
его точный [CI #1547](https://github.com/Michael-edel/FitFocus/actions/runs/39022819941)
ожидает запуска. Run #1545 проверяет предыдущий SHA `feaf74c`. Общий P0.6 и
остальные callbacks остаются открытыми.

## P0.7 — request-level barrier для state writers, 17.10.2026

Коммит [`b105510`](https://github.com/Michael-edel/FitFocus/commit/b105510a94a6a05cfc630ccd085380b3098ff6ab)
требует `X-FitFocus-State-Protocol: 2` для `PUT/DELETE /api/state` после
проверки исходной сессии и доступа, но до чтения тела и D1. Отсутствующий или
несовместимый протокол возвращает `426 STATE_PROTOCOL_REQUIRED`. Текущий sender
передаёт заголовок; при 426 сохраняет intent и ставит protocol-паузу. State GET
остаётся доступен. Контракт обновлён в `API_CONTRACTS.md` и
[`state-generations.md`](state-generations.md).

Проверки на code SHA `b105510a94a6a05cfc630ccd085380b3098ff6ab`: полный unit suite
1333/1333 (212 файлов), три typecheck, production build, API invariants и
auth-scope guards; route/sender набор 86/86. Native-SW legacy migration E2E
прошёл 2/2 на desktop Chromium, workers=1, retries=0; фикстура также отклоняет
state writes без request protocol. В route-тестах подтверждён 426 для старого
PUT и DELETE до обращения к write/delete persistence.

Это локальная приёмка кода и synthetic API; она не подтверждает реальную D1,
staging, device/OAuth lifecycle или отдельную установку старого bundle через
production server. Точный PR CI для опубликованного code SHA и old/new bundle
barrier остаются открытыми; merge/deploy не выполнялись.

## P0.7 — old/new state writer barrier, 17.10.2026

Добавлен browser acceptance для настоящих pinned old/current bundles на одном
origin и в одном browser context. Старый sender получает `426` от HTTP fixture;
его settings intent остаётся в IndexedDB как failed `http-426`, а сервер не
принимает запись. После обновления через ожидающий Service Worker текущая сборка
сохраняет тот же `opId`, payload и baseVersion, повторяет запись с protocol v2,
сервер принимает исходный payload, а операция исчезает из outbox. Сценарий прошёл
7/7 Playwright-проектов без retries; весь
`legacy-outbox-migration.spec.ts` прошёл 3/3 на desktop Chromium.

Проверка использует synthetic API и не подтверждает Cloudflare/D1 или staging.
Полный CI run #1517 проверяет опубликованный родительский SHA `8787465`; новый
E2E входит только в последующий commit. Staging и защищённый `main` остаются
открытыми.

## P0.5 — late enhanced recipe-photo analysis after same-account login, 17.10.2026

Добавлен E2E для `foodphoto_enhanced` в Recipes: пока ответ удержан, аккаунт A
входит с новой `serverSessionId`. Ответ прежней сессии не создаёт временный recipe
draft и не меняет profile, values, outbox или achievements. Production-код не
менялся; дефекта не обнаружено.

Сценарий прошёл 3/3 на desktop Chromium, Firefox и WebKit (`workers=1,retries=0`);
`npm run typecheck` и `git diff --check` прошли. Точный CI проверяется на
опубликованном SHA. Общий P0.5 остаётся открытым.

## P0.5 — позднее объяснение Plateau после same-account login, 17.10.2026

Добавлен отдельный acceptance для Plateau `Объяснить`, помимо уже проверенного
retry: пока AI-ответ удержан, аккаунт A входит с новой `serverSessionId`. Старый
текст не появляется в обеих вкладках; профиль, coach state, outbox, achievements
и account-scoped action/status metadata не меняются. Runtime-код не менялся;
дефекта в сценарии не обнаружено.

E2E прошёл 3/3 на desktop Chromium, Firefox и WebKit (`workers=1,retries=0`);
`npm run typecheck` и `git diff --check` прошли. Точный CI проверяется на
опубликованном SHA. Другие P0.5 callbacks остаются открытыми.

## P0.5 — late Coach и Plateau retry после same-account login, 17.10.2026

Добавлены проверки удержанных AI retry `coach_advice` и `plateau`: аккаунт A
входит с новой `serverSessionId`, затем освобождается ответ старой сессии. Оба
ответа не меняют coach state, профиль, очередь, achievements или account-scoped
action/status metadata и не появляются в новой вкладке. Production-код не менялся;
дефектов в сценариях не выявлено.

Оба E2E прошли 3/3 на desktop Chromium, Firefox и WebKit (`workers=1,retries=0`);
`npm run typecheck` и `git diff --check` прошли. Точный CI будет проверен на
опубликованном SHA. Остальные callbacks и общий P0.5 lifecycle открыты.

## P0.5 — поздний ответ пошагового рецепта после same-account login, 17.10.2026

Добавлено E2E-покрытие генерации рецепта из дневникового фото: во время
удержанного AI-ответа аккаунт A входит с новой `serverSessionId`. Поздний рецепт
не меняет diary/profile/outbox, recipe usage или achievements и не появляется в
обеих вкладках. Runtime-код не менялся; дефекта в этом сценарии не обнаружено.

Сценарий прошёл 3/3 на desktop Chromium, Firefox и WebKit
(`workers=1,retries=0`); `npm run typecheck` и `git diff --check` прошли.
Точный CI будет проверен на опубликованном SHA. Общий P0.5 остаётся открытым.

## P0.5 — поздний фотоанализ после same-account login, 17.10.2026

В `ai-callback-account-switch.spec.ts` добавлена проверка удержанного фотоанализа
еды: тот же аккаунт входит с новой `serverSessionId`, после чего освобождается
ответ прежней сессии. Проверяются diary/history, profile usage, outbox, achievements
и UI обеих вкладок. Устаревший анализ не записывает блюдо и не показывает его;
production-код не менялся, дефекта в сценарии не выявлено.

E2E прошёл 3/3 на desktop Chromium, Firefox и WebKit (`workers=1,retries=0`);
общий `npm run typecheck` и `git diff --check` прошли. Точный CI этой ревизии
запускается после push. P0.5 остаётся открытым для остальных callbacks и lifecycle.

## P0.5 — поздний retry персонального плана после same-account login, 17.10.2026

В `ai-callback-account-switch.spec.ts` добавлена проверка удержанного AI retry
персонального плана: аккаунт A входит повторно с новой `serverSessionId`, после
чего освобождается ответ прежнего входа. Проверяются неизменность профиля,
managed values и outbox, отсутствие позднего плана в обеих вкладках и отсутствие
повторных profile/state writes и achievements. Runtime-код не менялся; дефекта
в этом сценарии не выявлено.

E2E прошёл 3/3 на desktop Chromium, Firefox и WebKit (`workers=1,retries=0`);
общий `npm run typecheck` и `git diff --check` прошли. Новый сценарий входит в
точный CI после push. Общий P0.5 и остальные callbacks остаются открытыми.

## P0.4/P0.8 — побочные эффекты вне React state updaters в дневнике, 17.10.2026

В `useFoodDiary` и `useFoodSelection` persistence вызывался внутри functional
`setFoodDiary` updater. Корневой app использует `React.StrictMode`; в dev updater
может вызываться повторно, поэтому одна пользовательская правка могла поставить
лишнюю durable outbox operation. Add/update/delete и bulk meal move теперь
вычисляют новый массив по последнему snapshot ref, ставят готовое значение в
React и записывают его в repository после вычисления, вне state updater.

Новый browser acceptance гидратирует два одинаковых food entry id для аккаунтов
A и B, выбирает две записи A и проверяет ровно один scoped `PUT /api/state` на
bulk move и один на bulk-delete. После входа B обе его записи остаются без
изменений. Повторный прогон прошёл 3/3 на desktop Chromium, Firefox и WebKit,
четыре мобильных профиля пропущены по условию теста (`workers=1,retries=0`).
Первый запуск превысил общий 45-секундный timeout в WebKit на завершающих
действиях; после удаления необязательных ожиданий и screenshot контрольный прогон
прошёл без изменения лимита. Полный
unit suite — 1326/1326 в 212 файлах; root,
domain-strict и storage-strict typecheck прошли; Playwright preview сборка и
`git diff --check` прошли. Первый запуск E2E разрешил `title="Выбрать"` в label
загрузки фотографии; селектор уточнён до checkbox элемента. После расширения
сценария на две записи WebKit превысил общий timeout; повтор после сокращения
завершающих необязательных проверок прошёл без retries.

Изменение закоммичено и опубликовано как [`7ff579d`](https://github.com/Michael-edel/FitFocus/commit/7ff579d051f7431cd0ba23cb1599863a467b0cc3)
в PR #93. Точный [CI run #1501](https://github.com/Michael-edel/FitFocus/actions/runs/39006074443)
завершился success: 1326 unit / 212 файлов, 850 browser passed / 263 skipped
за 38,1 минуты; audit, guards, typechecks и build прошли. Rollback/CAS прошёл
23 HTTP/D1-запроса. Browser diagnostics и [rollback artifact](https://github.com/Michael-edel/FitFocus/actions/runs/39006074443/artifacts/12091852535)
сохранены. Общий аудит P0.4/P0.8, остальные callbacks, staging и release
acceptance остаются открытыми.

## P0.8/P0.9 — отмена profile refresh при Safari reload, 17.10.2026

Кодовый коммит [`264bc4f`](https://github.com/Michael-edel/FitFocus/commit/264bc4f)
добавил native HTTP gate для GET `/api/profile` в существующую реальную PWA
фикстуру. Тест инициирует refresh, удерживает ответ, перезагружает страницу и
проверяет браузерное `requestfailed` с причиной cancel, сохранность локального
профиля и отсутствие pageerror, console error и неожиданных API-запросов.

Сценарий прошёл 3/3 на desktop WebKit, iPhone Safari и iPhone PWA при
`workers=1,retries=0`; `npm run typecheck` и `git diff --check` прошли.
Первая попытка через `page.route` не моделировала native HTTP отмену, поэтому её
заменили серверной фикстурой. Полный CI точной опубликованной ревизии ещё не
завершился успешно; он проверяется на актуальном PR HEAD. Это подтверждает
корректную обработку текущего reload-cancel, но не
устанавливает историческую первопричину Safari-сообщения; общий CORS-фильтр не
добавлялся.

## P0.8/P0.9 — гидратация профиля перед вводом в PWA update acceptance, 17.10.2026

Полный [CI run #1491](https://github.com/Michael-edel/FitFocus/actions/runs/38996003342)
для `0af2c30` прошёл предварительные проверки, включая audit, guards, unit,
typecheck и build, но завершился одной E2E-ошибкой в
`pwa-update.spec.ts`: после перехода в настройки поле ещё содержало начальное
значение `E2E User`, когда тест начал вводить `Черновик перед обновлением`; итогом
стало склеенное значение `E2E UserЧерновик перед обновлением`.

Это та же гонка начальной гидратации профиля, ранее найденная в profile recovery.
Production-поведение не менялось: PWA-сценарий теперь ожидает исходное имя из
`buildMockProfile()` перед `fill()`. Исправленный сценарий прошёл 5/5 на desktop
WebKit (`workers=1`, `retries=0`), `npm run typecheck` и `git diff --check`
прошли. Исправленный SHA `b67beee` прошёл полный
[CI run #1493](https://github.com/Michael-edel/FitFocus/actions/runs/38999390586):
1324 unit tests / 212 файлов, 844 browser tests passed / 255 skipped (37,5 мин),
все guards, typecheck и build успешны. Rollback-check прошёл 23 HTTP/D1-запроса;
browser diagnostics и tested rollback artifact сохранены. Дублирующий push-run
#1492 отменён concurrency-защитой после старта PR-run #1493.

## P0.8/P0.9 — WebKit отменяет family-menu GET во время reload, 17.10.2026

Полный [CI run #1489](https://github.com/Michael-edel/FitFocus/actions/runs/38992296616)
для опубликованного `584b257` прошёл проверки до E2E, но завершился одной ошибкой
в сценарии `a delayed durable menu-state read from the previous same-account
session cannot hydrate after reauthentication` на desktop WebKit. Trace показал
три сообщения об отказе same-origin fetch через ~45 мс после начала `page.reload()`;
спорным было сообщение `/api/family/menu?week=2026-10-12`. Reload завершился
штатно примерно через 440 мс, сохранённое меню совпало с исходным, а session
identity перешла на повторно авторизованную. Сетевой trace содержит успешные
ответы этого GET до reload, но не содержит неуспешного HAR-запроса; браузерное
сообщение WebKit возникло только в интервале reload.

В helper добавлен только этот loopback GET в уже существующий WebKit-фильтр
ожидаемых same-origin отмен при reload. Фильтр по-прежнему ограничивает маршруты
регулярным выражением, применяется только к трём WebKit-проектам и ограничивает
суммарное число сообщений четырьмя; остальные ошибки остаются фатальными.
Проблемный сценарий прошёл 5/5 повторов на desktop WebKit, полная
`family-menu-durable.spec.ts` — 16/16 (`workers=1`, `retries=0`). Это E2E-only
изменение; полный CI нового HEAD ещё не запускался.

## P0.8/P0.9 — дождаться гидратации формы в profile recovery acceptance, 17.10.2026

Полный [CI run #1487](https://github.com/Michael-edel/FitFocus/actions/runs/38988720215)
для опубликованного `61c461b` прошёл dependency audit, schema/privacy/auth/API
guards, unit, три typecheck и production build. Исправленный offline reopen PWA
прошёл в E2E; единственная ошибка осталась в
`profile-durability.spec.ts`: после recovery поле содержало
`E2E UserПрофиль после разрешения конфликта`.

Trace показал, что `openApp()` ожидал только видимости `#root`, а тест начинал
`fill()` до того, как SettingsScreen выставил исходное имя профиля. Во время
ввода WebKit применил значение `E2E User` из начальной гидратации и дописал к
нему текст теста. Соседний conflict-тест уже ожидал `profile.name`; та же
предпосылка добавлена в recovery-сценарий. Исправлен только тест:
[`6b38bb3`](https://github.com/Michael-edel/FitFocus/commit/6b38bb3c23d58b6b7ac2b4ee373621244e880496).
Он прошёл 9/9 на desktop Chromium, Firefox и WebKit (`--repeat-each=3`, один
worker, без retries). Trace не показал ошибку в самой rebase-операции: outbox
опустел, сервер получил baseVersion `[2, 8]`, а локальное значение сохранилось.

Точный CI нового HEAD запускается после push; до этого profile recovery
остаётся локально проверенным, но не подтверждённым полным CI.

## P0.8/P0.9 — повтор auth bootstrap при возврате сети после offline reopen, 17.10.2026

Полный [CI run #1485](https://github.com/Michael-edel/FitFocus/actions/runs/38984560848)
для `2e6d854` прошёл audit, schema/privacy/auth/API guards, unit tests, три
typecheck и production build; E2E завершился 843 passed / 255 skipped / 1 failed.
Три падения предыдущего run #1483 больше не возникли. Единственная ошибка была
в `pwa-offline-durability.spec.ts` на desktop WebKit: после offline reopen
сохранилась settings операция, но не отобразился экран приложения и outbox не
синхронизировался.

Trace показал, что восстановление соединения произошло во время первичного
bootstrap. Обработчик `online` устанавливался лишь после перехода `authState` в
`auth_choice`, поэтому раннее событие пропускалось, а запущенный до переключения
сети retry завершался сообщением WebKit `internal error`. Listener теперь
устанавливается при начальном `loading`, читает актуальные auth-state и
подтверждённую identity через refs и запускает обычный guarded bootstrap, если
сессия ещё не подтверждена. Исправление: [`4b041f1`](https://github.com/Michael-edel/FitFocus/commit/4b041f194504068775d661b63a24f047e0e07bb1).

Локально `npm run typecheck`, production build и `git diff --check` прошли.
Сценарий с настоящим Service Worker прошёл 6/6 повторов на desktop WebKit и
iPhone PWA (`--repeat-each=3`, `--workers=1`, `--retries=0`). Точный полный CI
исправленного HEAD запускается после push; физическое устройство, staging,
выпуск и общий P0.9 остаются открытыми.

## P0.8/P0.9 — три E2E сбоя WebKit CI #1483, 17.10.2026

Полный [CI run #1483](https://github.com/Michael-edel/FitFocus/actions/runs/38979801402)
для опубликованного `e370f61a8b10ee4de3d869905435bfc42ca4608a` прошёл dependency
audit, schema/privacy/auth/API guards, unit tests, три typecheck и production
build. E2E завершился 841 passed / 255 skipped / 3 failed. Сохранённые trace
показали три конкретных причины:

- Desktop WebKit weekly-menu: предупреждение `/api/achievements/check` появилось
  во время `page.reload()`. Клиентский achievement transport привязывает запрос
  к `pagehide` и прерывает его при смене документа; тест теперь учитывает только
  точное сообщение WebKit в интервале reload, не более одного такого сообщения.
- iPhone Safari family-menu: во время reload пришли три одинаковых сообщения
  для `/api/me?t=…`. Перекрывающиеся session refreshes могут отмениться на одном
  маршруте, поэтому тест убрал неверное требование уникальности маршрутов, но
  сохранил точное множество loopback URL и общий предел в четыре отмены.
- iPhone Safari legacy recovery: асинхронный PWA update banner появился после
  разовой проверки `isVisible()` и перехватил клик по раскрытию recovery panel.
  Тест устанавливает `addLocatorHandler` и нажимает штатное «Позже», когда баннер
  появляется перед действием.

Follow-up [`96c21c3`](https://github.com/Michael-edel/FitFocus/commit/96c21c3e199cc8b5abf04ee9bef3d1e39175054b)
изменяет только E2E. Все три сценария прошли 18/18 суммарных запусков на desktop
WebKit и iPhone Safari (`--repeat-each=3`, `--workers=1`, `--retries=0`).
`npm run typecheck` (включая admin guards) и `git diff --check` прошли. Полный
CI exact follow-up пока не подтверждён; предыдущий #1483 остаётся неуспешным.
Merge, staging и выпуск не выполнены; общий P0 остаётся открытым.

## P0.8 — ожидание durable weekly report после same-account reauth, 17.10.2026

Опубликованный `0592ffe4dfa8a2004f1634608c4449d8aede33ad` завершил полный
[CI run #1481](https://github.com/Michael-edel/FitFocus/actions/runs/38971572116):
audit, guards, unit, три typecheck и production build прошли; E2E завершился
843 passed / 255 skipped / 1 failed. Единственный сбой был в сценарии
`held weekly report cannot write after the same account starts a new server
session`. Trace показал отложенный `/api/ai` старой сессии `aaaa…` и отдельную
запись `weekly_reports` новой сессии `ffff…`; поздняя запись старой сессии не
произошла. Тест снимал baseline до подтверждения фоновой записи новой сессии.

Follow-up E2E ждёт завершения AI-ответа нового входа, подтверждённую запись
отчёта и удаление его операции из outbox отдельной проверкой ключа. Проверки
остальных account-switch сценариев не включают независимый weekly report в
сравнение их baseline. Целевой weekly-report сценарий, recipe-photo сценарий и
profile-refresh сценарий прошли по пять повторов каждый на desktop Chromium,
Firefox и WebKit: 45/45, без retries. `npm run typecheck` (включая admin guards)
и `git diff --check` прошли. Production-код не менялся; полный CI нового
опубликованного HEAD ожидается. P0.8/P0.9 и общий P0 остаются открытыми.

## P0.8/P0.9 — guard профильного refresh и отменённые WebKit GET, 17.10.2026

Полный [CI run #1477](https://github.com/Michael-edel/FitFocus/actions/runs/38960924367)
на `87739e7` прошёл dependency audit, schema/privacy/auth/API guards, 1320 unit,
три typecheck и production build; E2E завершился тремя сбоями. Firefox не
применил профиль, хотя серверный снимок уже был принят в IndexedDB: `StateSync`
прошёл session re-verification, а React editor сохранил старый login read guard.
Два WebKit-теста завершили проверки данных, но сочли ошибками точные сообщения
об отмене GET `/api/family` и `/api/shopping/list` во время reload.

Code commit [`67fd871`](https://github.com/Michael-edel/FitFocus/commit/67fd871)
возвращает вместе с профилем guard принятого IndexedDB snapshot. Перед применением
UI guard повторно проверяется на актуальность, затем React принимает его вместе с
обновлённым профилем. Добавлены проверки порядка принятия и отказа от устаревшего
guard. Для двух WebKit-переходов добавлены только точные bounded исключения для
отменённых GET; неожиданные ошибки и повторы маршрутов остаются фатальными.
Локально: unit — 1322/1322, основной и два строгих typecheck, admin guards,
production build; profile refresh — 7/7 проектов и ещё 5/5 повторов Firefox;
два семейных сценария — 6/6 на desktop WebKit, iPhone Safari и iPhone PWA.
Точный полный CI опубликованного follow-up ожидается; P0.8/P0.9 и общий P0
остаются открытыми.

## P0.8/P0.9 — необязательный PWA update banner при восстановлении профиля, 17.10.2026

Полный CI опубликованного snapshot `ba3ee9421c686f80b8547ab46c2b1cbb11e41d3c`
завершился в [run #1475](https://github.com/Michael-edel/FitFocus/actions/runs/38954705906)
с 838 passed / 255 skipped / 6 failed. Audit, schema/privacy/auth/API guards,
1320 unit tests, три typecheck и production build прошли. Все шесть ошибок были
в одном тесте `resolves a legacy profile through its guarded profile CAS endpoint`:
он ожидал update banner, который необязателен и не показывался в desktop Chromium,
desktop Firefox, Android Chrome, Android PWA, iPhone Safari и iPhone PWA.

В [`2d30fdc`](https://github.com/Michael-edel/FitFocus/commit/2d30fdc2ddc4c460ed95165e9c2ae2710bb10c29)
проверка закрывает баннер, если он уже появился, и прокручивает recovery summary
в центр страницы. Так сценарий работает как при отсутствии уведомления, так и при
его позднем появлении над страницей. Изменён только E2E-тест. Он прошёл 21/21
(`--workers=1 --retries=0 --repeat-each=3`) на семи desktop/mobile/PWA профилях;
также прошли 1320 unit tests, `npm run typecheck` (включая admin guards) и
`git diff --check`. Точный полный CI опубликованного follow-up ещё ожидается;
P0.8/P0.9 и общий P0 остаются открытыми.

## P0.8/P0.9 — четыре E2E сбоя CI #1473, 17.10.2026

Опубликованный HEAD `244b9db5fe0804c17bef3a2d85306af3c6e4f6ca` завершил
[run #1473](https://github.com/Michael-edel/FitFocus/actions/runs/38947315275)
с 840 passed / 255 skipped / 4 failed. Audit, guards, unit, три typecheck и
production build прошли. Четыре трассы указали на разные причины:

- PWA после offline reopen не отправлял settings. Новый документ не мог
  получить `/api/me` без сети и оставался на auth choice после online. В
  [`f5f5ebd`](https://github.com/Michael-edel/FitFocus/commit/f5f5ebd1a2f6a9984b5dfe66c1e17607a7e2c3e9)
  добавлен повтор обычного guarded bootstrap по online; точный real-SW сценарий
  прошёл 7/7 browser/PWA профилей.
- Android profile refresh вместо редактора показал защиту от смены активной
  сессии. Локально сбой не воспроизвёлся: профиль прошёл 8/8 повторов до
  доработки и ещё один после неё. Тест теперь явно поднимает вкладку на передний
  план, проверяет видимую страницу и прикладывает active-session identity при
  отказе; причина CI-снимка остаётся непроверенной до повторного CI.
- iPhone Safari legacy recovery завис на раскрытии conflict panel: update banner
  появился поверх summary уже после проверки его видимости. Тест теперь ждёт
  асинхронный баннер и закрывает его до клика; целевой тест прошёл 1/1 локально.
- iPhone Safari weekly-menu recovery функционально продолжился после reload,
  но WebKit вывел два CORS/access-control сообщения для GET `/api/me`, отменённых
  при перезагрузке. Функциональная проверка уже видит восстановленную profile
  запись. В тесте принимается только точный WebKit URL-шаблон и максимум два
  таких сообщения; остальные ошибки остаются фатальными. Целевой тест прошёл
  1/1 локально.

На code commit локально прошли 1320 unit tests, основной и два strict typecheck,
admin guards, `git diff --check`; все изменённые браузерные сценарии прошли на
целевых проектах. Статусная документация обновлена; точный полный CI
опубликованного snapshot ещё ожидается. P0.8/P0.9 и общий P0 не закрыты.

## P0.8 — Android PWA reload ждёт завершения weekly report, 16.10.2026

Точный CI опубликованного `72ac769` — [run #1469](https://github.com/Michael-edel/FitFocus/actions/runs/38937798139):
audit, guards, unit, typechecks и build прошли; E2E дал 843 passed, 255 skipped,
1 failed. Единственный сбой — `storage-durability.spec.ts` на Android PWA:
после reload интерфейс показал `Cloud: pending`. Trace подтверждает, что PUT
настроек уже завершился и settings operation была очищена. Отдельный PUT
автоматически созданного weekly AI-отчёта оставался активным и был отменён
перезагрузкой; его durable операция объясняет pending badge.

В `402f7ba` тест теперь ждёт появления weekly report на сервере, пустой очереди
аккаунта и подтверждённой версии настроек перед reload. Изменён только E2E-тест;
продуктовый код не менялся. Целевой Android PWA тест прошёл 1/1, весь
`storage-durability.spec.ts` — 19/19 (`workers=1,retries=0`), typecheck вместе с
admin guards и `git diff --check` прошли. Точный полный CI этого follow-up SHA
был запущен после публикации кода (`402f7ba`) и статуса (`1e9dd69`) как run
#1471. Его результат необходимо сверить на GitHub перед дальнейшей приёмкой.

## P0.9 — Firefox legacy migration probe reuses app connection, 16.10.2026

CI exact published head [`e34544d`](https://github.com/Michael-edel/FitFocus/commit/e34544da4f42cf545a9de26dac7e62eee8d42270)
failed only in desktop Firefox `legacy-outbox-migration.spec.ts`: 840 browser
passed / 251 skipped / 1 failed; dependency audit, schema/privacy/auth/API guards,
unit tests, typechecks and build passed in [run 38903745625](https://github.com/Michael-edel/FitFocus/actions/runs/38903745625).
The failing inspector started a separate `indexedDB.open()` while old and current
clients shared the origin. A local stress run of the old probe produced 18/20
passes; one failure reproduced the same migration timeout and its trace stopped
after `open:start`. A second test-level timeout occurred during a later storage
read in that stress run; its cause is not established.

Code commit [`0efec93`](https://github.com/Michael-edel/FitFocus/commit/0efec93ffaf905ace3c020ad1b70c398da89a571)
captures the database connection opened by the application, reads migration
state through that connection, and records open/blocked/upgrade/versionchange/
close plus request/transaction stages. This follows the existing PWA update
diagnostic, which avoids additional opens behind an old same-origin client.
After the change, the complete migration spec passed 14/14 across seven
desktop/mobile/PWA profiles with `workers=1,retries=0`; the desktop Firefox
pending-intent case passed 10/10 repeats. Typecheck, admin guards and
`git diff --check` passed. No production storage or migration code changed.
The full CI for the exact follow-up SHA is not yet confirmed; the local result
does not establish that the workflow failure is closed. Staging and full P0.9
remain open.

## P0.9 — реальный PWA offline во всех движках, 16.10.2026

`e2e/pwa-offline-durability.spec.ts` проверяет сохранение settings intent и
исходного `opId` после закрытия вкладки и offline cold-reopen контролируемой
Service Worker страницы, затем подтверждает ту же операцию после восстановления
сети. Playwright 1.61.1 воспроизводил upstream WebKit defect; после обновления
на 1.64.1 и исправления [`#42894`](https://github.com/microsoft/playwright/pull/42894)
все семь desktop/mobile/PWA профилей прошли без retries, включая WebKit с
`context.setOffline(true)` и `navigator.onLine === false`. PWA update matrix на
1.64.1 также прошла 7/7; `npm run typecheck`, `npm audit` (0 уязвимостей) и
`git diff --check` прошли.

Обновление runner и тестовые правки локальные, ожидают commit/push; CI #1459 на
предыдущей опубликованной ревизии `754b793` использует Playwright 1.61.1, все
проверки до E2E успешны, E2E ещё выполняется. Версию 1.64.1 и настоящий offline
нужно подтвердить точным CI после публикации. Это browser/mock acceptance, не
физическое устройство, staging или полное закрытие P0.9.

## P0.9 — DELETE-конфликт после reload, 16.10.2026

`e2e/owned-state.spec.ts` теперь проверяет реальное удаление истории Council из
UI: scoped DELETE получает `409 KV_CONFLICT` с серверным snapshot версии 9.
Локальное значение остаётся удалённым, outbox сохраняет ту же tombstone-операцию
с прежним `opId`, `status: conflicted` и `serverSnapshot`; поле `value` отсутствует.
После reload тест явно принимает серверную версию: IDB получает серверное значение,
`confirmedVersion` становится 9, operation удаляется, повторный DELETE не
отправляется. Матрица прошла 7/7 desktop/mobile/PWA проектов без retries;
`npm run typecheck` и `git diff --check` прошли. Это mock API acceptance для одного
ключа; полный P0.9, точный CI, staging и реальные устройства остаются открытыми.
Первый тест-коммит — `ed4a1e8`, расширенная проверка resolution — `2592492`.

Полный локальный `owned-state.spec.ts` прогон завершился 34/35: iPhone Safari один
раз записал console warning `/api/ai due to access control checks` во время reload
сценария изменения задачи плана. Изолированный повтор этого сценария прошёл 3/3
без retries; источник предупреждения не установлен, проверка ошибок не ослаблена.

## P0.9 — account-switch проверяет устойчивые настройки, 16.10.2026

CI run [#38874079703](https://github.com/Michael-edel/FitFocus/actions/runs/38874079703)
для опубликованного SHA `7fbd324` завершился `809 passed / 254 skipped / 1 failed`.
Единственный сбой сравнивал `activeSection` до и после смены аккаунта; раздел
прогресса следует за прокруткой через `IntersectionObserver`, поэтому точное
сравнение зависело от момента открытия второй вкладки. E2E сохраняет проверки
остальных account-scoped UI-параметров и очистки черновика, но не фиксирует
viewport-зависимый раздел. Обновлённый целевой тест прошёл 3/3 на Chromium без
retries; commit `9594638`. Все gates CI до E2E на прежнем SHA были успешны.
Полный CI новых commits ещё не запущен.

## 16.10.2026 — различение 403 access pause и keyspace failure

Локальный коммит [`1d54049`](https://github.com/Michael-edel/FitFocus/commit/1d540498a6fa05db348b6fd870d695ccde38a00c)
добавляет browser acceptance для `403 ACCESS_REQUIRED`: локальная settings
operation остаётся в IndexedDB с прежним opId/payload, sender не повторяет её,
пока доступ закрыт, а после свежего proof той же account и новой server session
operation отправляется и подтверждается. Полная browser/PWA матрица прошла 7/7
без retries; targeted `state_sync` и account-scoped UI unit прошли 65/65,
`npm run typecheck` прошёл.

Существующий E2E `FORBIDDEN_KEYSPACE` проверяет сохранение неповторяемой
operation как failed и ручное восстановление с тем же payload. Первый отдельный
прогон всей матрицы прошёл 6/7: на iPhone Safari operation не появилась в IDB.
Немедленный targeted повтор на iPhone Safari и следующий полный прогон без
retries оба прошли; последний результат — 7/7. Первопричина первого отказа не
воспроизведена и не установлена, поэтому это остаётся наблюдением о стабильности
теста, а не подтверждённым дефектом приложения. Оба сценария используют mock
API и browser emulation; реальные устройства, D1/OAuth и staging ими не
подтверждены.

Удалённая ветка PR #93 остаётся на `b6e3be5`; CI run
[#38870748569](https://github.com/Michael-edel/FitFocus/actions/runs/38870748569)
для этого SHA выполняется и не включает `1d54049`. После публикации нового HEAD
нужен точный полный CI.

## 16.10.2026 — локальные правки остаются доступны во время auth-паузы

После фактического 401 тест `401 → новая правка → login` падал только на
iPhone Safari: приложение повышало `authFence`, а `AppWorkspace` принимал
изменение fence за смену account session и скрывал экран настроек. Fence
по-прежнему проверяет свежесть guarded reads/commits; scope экрана и черновиков
теперь использует account, server session и session epoch. Это сохраняет локальный
экран при паузе, пока sender не получает свежий proof.

Коммит [`cb22abe`](https://github.com/Michael-edel/FitFocus/commit/cb22abe40740ed8b1f55b6d0d7c716d9c4d7364c)
добавляет регрессионный unit и браузерный acceptance: после 401 новая Violet
settings правка остаётся в IndexedDB, отправка стоит на паузе, затем исходные
две операции с теми же opId подтверждаются последовательно под тем же аккаунтом
и новой server session (baseVersion 0, затем 1; confirmedVersion 2). Все 7
Playwright browser/PWA проектов прошли без retries; account-scoped UI unit — 9/9,
`npm run typecheck`, production build и `git diff --check` прошли. Проверка
использует mock API и browser emulation, не реальный OAuth, устройство или staging.
Точный CI этого SHA ещё не подтверждён и должен быть проверен после push.

## 16.10.2026 — atomic rollback при IndexedDB transaction abort

Коммит [`bf6b142`](https://github.com/Michael-edel/FitFocus/commit/bf6b142b47e595dd9ba2947a312d9a03aeaa2a19)
добавляет browser acceptance в `e2e/storage-durability.spec.ts`: после сохранения
подтверждённой settings версии тест abort-ит настоящую readwrite-транзакцию на
success-событии добавления outbox operation. Проверка подтверждает полный
rollback value, operation и metadata; остаются предыдущие settings, UI показывает
storage error, необработанных browser errors нет. Прошло 7/7 desktop/mobile/PWA
проектов (`workers=1,retries=0`). `npm run typecheck` и `git diff --check`
прошли. Это локальная browser acceptance без staging и физического устройства;
предыдущий run #1439 на `c8280e6` не содержит этот тест, нужен точный CI нового
HEAD.

## 16.10.2026 — PWA сохраняет outbox после offline холодного открытия

Коммит [`252bd08`](https://github.com/Michael-edel/FitFocus/commit/252bd082946ea86dbd51f4c862f6aad08a9d3f8a)
добавляет `e2e/pwa-offline-durability.spec.ts`, который запускает production bundle с
настоящим Service Worker и HTTP fixture. После сохранения settings operation
браузер переводится в offline, исходная вкладка закрывается, а новая страница
того же PWA открывается из управляемого Service Worker. Проверка подтверждает,
что IndexedDB сохраняет те же opId, payload и baseVersion, а после возврата сети
подтверждается именно исходная операция и outbox очищается. Прошло 4/4 профиля:
Chromium, Firefox, Android Chrome и Android Chrome PWA (`workers=1,retries=0`).
Три WebKit профиля пропущены: Playwright завершает и offline reload, и cold
offline navigation внутренней ошибкой WebKit; ошибки продукта по этим
профилям результат не устанавливает. `npm run typecheck` и `git diff --check`
прошли. Коммит опубликован в `fix/durable-outbox`. Полный run #1435 на
`1d7fc1c` отменён после обновления PR; run #1437 на `f4d170b` был в работе
при обновлении журнала. Последующий документационный коммит потребует CI на
новом HEAD. Реальное устройство, staging и полный P0.9 остаются открытыми.

## 16.10.2026 — полный quarantine normalizer и global legacy evidence после удаления

В [`7504a2c`](https://github.com/Michael-edel/FitFocus/commit/7504a2ceb10e36c80cee1d9d17c35fc0579f9033)
реальный old/new bundle migration принимает семь повреждённых legacy-записей
одновременно: `not-an-object`, `invalid-type`, `invalid-key`,
`put-without-value`, `delete-with-value`, `invalid-baseVersion` и
`invalid-retryCount`. Для каждой исходный `rawRecord` остаётся в quarantine с
точной причиной; ни одна запись не становится outbox operation или сетевой
отправкой. Даже после writer fence статус остаётся `partial`. Матрица прошла
7/7 desktop/mobile/PWA конфигураций без retries.

В [`82d5f27`](https://github.com/Michael-edel/FitFocus/commit/82d5f27dddb47ef374c0c1dd24835e5d2dfd26df)
добавлена совместная проверка удаления аккаунта и миграции глобального ключа
`ff_ai_last_status_v1`. Очистка удаляет account-owned operation, но сохраняет
неразделимую глобальную запись как `unknown-owner`; после повторной аутентификации
операция удалённого аккаунта не восстанавливается, исходный источник сохраняется,
а migration status остаётся `partial`. Три целевые unit suite
(`legacy_migration`, `legacy_queue`, `account_state_cleanup`) прошли 132/132;
общий typecheck и `git diff --check` также прошли.

Эти acceptance уточняют quarantine и удаление, но не закрывают P0.8: физическое
удаление общего payload не выполняется, старые clients, остальные callbacks,
staging и полная lifecycle/release-приёмка остаются отдельными gates. Полный CI
для объединённой ревизии следует подтвердить на точном PR SHA.

## 16.10.2026 — quarantine повреждённой legacy-записи в настоящем bundle migration

Browser acceptance [`2e7f024`](https://github.com/Michael-edel/FitFocus/commit/2e7f024b0706d82155859e7f9955d033bf338972)
добавляет объектный `value` в legacy-запись `put` при запуске старого и нового
bundle на одном origin. Проверка подтверждает, что мигратор сохраняет исходный
`rawRecord` в `outbox_migration_unknown` с причиной `put-without-value`, не
создаёт outbox operation и не отправляет этот ключ; после открытия writer fence
миграция остаётся `partial`. Это закрывает браузерную проверку одного из
обязательных malformed legacy форматов, но не закрывает весь P0.8.

В полной browser/PWA матрице первоначальное 10-секундное ожидание открытия
writer fence оказалось коротким под параллельной нагрузкой WebKit. Изолированный
WebKit сценарий подтвердил, что сам quarantine проходит; ожидание именно этого
barrier увеличено до 30 секунд, сохранив обязательное условие и `retries=0`.
Повторный прогон прошёл 7/7: desktop Chromium/Firefox/WebKit, Android
Chrome/PWA, iPhone Safari/PWA. Дополнительно прошли 128/128 тестов
`legacy_migration` и `legacy_queue`, `npm run typecheck` и `git diff --check`.
Follow-up опубликован в [`d11e8f9`](https://github.com/Michael-edel/FitFocus/commit/d11e8f92aea4aac4a64db4701da22bac39967900).
Точный [CI run #1423](https://github.com/Michael-edel/FitFocus/actions/runs/38855720907)
ожидает в очереди; старый run #1421 продолжает выполняться на `706910f`, а
дублирующий push-run #1422 отменён concurrency. Staging и остальные legacy
lifecycle cases остаются открытыми.

## 16.10.2026 — повторный вход того же аккаунта из другой вкладки

`AppWorkspace` разрешал восстановление account UI, проверяя только
`accountId`. Поэтому старая вкладка могла считать прежний proof активным после
повторного входа того же пользователя с новым `serverSessionId`, `sessionEpoch`
и auth fence. В [коммите `5042db8`](https://github.com/Michael-edel/FitFocus/commit/5042db8adca01a58bcaff9c044d516b3d15394fb)
разрешение кэша сравнивает полный tuple durable-сессии с `loginGuard`. При
несовпадении account-зависимые экраны блокируются; временный черновик AI Council
становится недоступен, старые setters остаются вне нового scope, а долговечная
история аккаунта не очищается.

Новый E2E до исправления показал старый черновик и отсутствие session notice;
после исправления он прошёл 3/3 на desktop Chromium, Firefox и WebKit
(`workers=1,retries=0`). Семь смежных account-switch E2E прошли на desktop
Chromium. Обновлены прежние проверки, которые ожидали открытый экран старого
аккаунта: теперь они подтверждают session notice, сохранность A-кэша и отсутствие
его значений на странице B. Полный unit suite — 1318/1318 в 212 файлах; общий,
domain-strict и storage-strict typecheck, production build и `git diff --check`
прошли. Это mock-API приёмка; P0.4, остальные callbacks/cache и staging остаются
открытыми. CI проверяется по текущему опубликованному HEAD.

## 16.10.2026 — временное состояние AI Council изолировано по сессии

В `useCouncilChat` корневые черновик вопроса, ошибка, этап/индикатор загрузки и
раскрытые мысли сбрасывались только по `currentUser.id`. Повторный вход того же
аккаунта меняет `sessionEpoch`/server session, но сохраняет id; поэтому root
состояние могло пережить старую login session. Теперь эти поля хранятся в
`useAccountScopedUiState` под `accountSessionRenderKey` и доступны только после
разрешения `allowCachedUiStateRestore`. Старые setters не применяются в новом
scope; смена session scope инвалидирует ожидающее поколение запроса. История
сообщений остаётся долговечной account-owned записью и не очищается при новом
входе.

Добавлены проверки изоляции и обновления scope в `account_scoped_ui.test.ts`.
Полный unit suite прошёл 1318/1318 в 212 файлах; root, domain-strict и
storage-strict typecheck, production build и `git diff --check` прошли.
Существующий поздний ответ AI Council при переходе A → B прошёл 3/3 на desktop
Chromium, Firefox и WebKit (`workers=1,retries=0`). Это не моделирует повторный
вход в том же браузере; lifecycle-приёмка и остальной P0.4 audit открыты.
Кодовый follow-up опубликован коммитом `2f6afdc`; PR-run #1397 для этого SHA
pending без созданных jobs на момент проверки. Push-run #1396 был отменён,
когда concurrency policy оставила PR-событие как один текущий запуск ветки.
Перед слиянием необходимо проверить статус уже актуального exact HEAD.

## 16.10.2026 — изоляция выбора блюд по account/session

`useFoodSelection` хранил выбранные id в корневом состоянии приложения, вне
ключа экрана питания. При смене account/session старый выбор мог остаться
доступен новому экрану, а сохранённый bulk callback мог попытаться изменить
дневник после перехода. Теперь selection state маркируется актуальным
`accountSessionRenderKey` только после разрешения account cache; другой или
неподтверждённый scope не видит старые id. Отложенные setters используют общий
account-scoped guard, bulk update повторно проверяет владельца внутри React
updater, а bulk delete отклоняет callback прежней сессии. Props выбора еды
теперь имеют read-only тип `ReadonlySet`.

Добавлены пять regression unit-тестов на изоляцию аккаунтов и сессий, сброс,
неподтверждённый scope и отказ старому bulk callback. Полный unit suite прошёл
1316/1316 в 212 файлах; root, domain-strict и storage-strict typecheck,
production build и `git diff --check` прошли. Это локальная проверка; P0.4
остаётся открытым для других callbacks/cache, browser acceptance и staging.
Предыдущий GitHub CI `38826274663` проверяет SHA `3bfa84b`, не содержит это
изменение и остаётся in progress; точный CI нового SHA проверяется после push.

## 16.10.2026 — WIS-share результат не пересекает границу сессии

Завершение системного share API происходило после `await`; при последовательном
переходе A → B → повторная активация A старый callback мог показать уведомление
об успешной карточке в текущем UI. WIS notice теперь привязан к account/session
scope и номеру поколения, поэтому отключение и повторная активация scope не
оживляет старый результат. Исходный durable read guard проверяется до передачи
карточки системному API и повторно после его возврата, прежде чем обновлять
уведомление, телеметрию или достижение.

Регрессионный сценарий сначала воспроизвёл появление старого success notice,
после исправления прошёл 3/3 на desktop Chromium, Firefox и WebKit с
`workers=1,retries=0`; дополнительный unit подтверждает, что после смены сессии
во время рендеринга PNG не запускается системная передача. Полный unit suite
прошёл: 1309/1309 в 210 файлах;
общий, domain-strict и storage-strict typecheck, production build и
`git diff --check` также прошли. Точный GitHub CI для нового SHA проверяется
после push. Остальной P0.4 audit и приёмка полного lifecycle остаются открытыми.

## 16.10.2026 — скрыть account-зависимые экраны вне активной сессии

Ранее сохранённая история AI-отчётов и профильное приветствие оставались в root
React state, пока другая вкладка уже активировала account B. Регрессия
воспроизводила оба значения на dashboard старой вкладки. Теперь account-зависимые
экраны заменяются сообщением о проверке/смене сессии, а user-owned root overlays
и storage notice скрыты, пока IndexedDB-аккаунт не совпадает с пользователем UI.
Статические «Гид», «Политика» и «Обновления» остаются доступны; данные account A
не удаляются. Оставшиеся root hooks для settings/theme, отметок плана,
refeed/adaptation, избранного и invite code также получают account id только
после этой проверки. До исправления violet-тема A оставалась применена в старой
вкладке после входа B; теперь настройки возвращаются к безопасному default и
повторно загружаются при подтверждении владельца.

Account-switch сценарий прошёл на desktop Chromium, Firefox и WebKit,
`workers=1,retries=0`; root, domain-strict и storage-strict typecheck и
production build прошли. Точный CI проверяется для опубликованного HEAD; новый
follow-up после push будет ждать отдельного CI. P0.4 остаётся открытым для
остальных callbacks, staging и полного lifecycle.

## 16.10.2026 — скрывать открытые модалки еды вне активной сессии (`66a7362`)

Разбор фото еды и редактор блюда хранились в корневом React state. Они переживали
смену активной IndexedDB-сессии в другой вкладке, потому что не размонтировались
вместе с экраном. Теперь обе модалки отображаются и открываются только при
разрешённом account cache; содержимое A не показывается, пока активен B.

Регрессия до исправления оставляла после входа B разбор `Тестовый омлет` и
редактор блюда в старой вкладке. После исправления сценарий прошёл 3/3 на desktop
Chromium, Firefox и WebKit без retries. Полный unit suite — 1308/1308 в 210
файлах; общий, domain-strict и storage-strict typecheck, production build и
`git diff --check` прошли. Точный CI этого коммита проверяется после push.
Остальные cloud callbacks/cache, staging и полный P0.4 lifecycle открыты.

## 16.10.2026 — скрывать AI activity до подтверждения аккаунта (`ca49b0d`)

AI badge и retry metadata читались по `currentUser.id`, даже если в другой
вкладке уже активировалась другая IndexedDB-сессия. App теперь передаёт AI hook
аккаунт только после разрешения account cache. В старой вкладке скрываются
статус и возможность повтора; исходные account-scoped записи остаются в своём
пространстве.

Регрессионный E2E до исправления показал `AI: online` и `Retry: Coach` после
активации B; после исправления тест прошёл 3/3 на desktop Chromium, Firefox и
WebKit без retries. Полный unit suite — 1308/1308 в 210 файлах; общий,
domain-strict и storage-strict typecheck, production build и `git diff --check`
прошли. Точный CI нового HEAD проверяется после push. Общий P0.4 остаётся
открытым.

## 16.10.2026 — account gate для выбранного дня личного меню (`c1f8180`)

`PlanScreen` восстанавливал выбранный день личного недельного меню напрямую из
localStorage. Ключ уже содержал account id, но старая вкладка продолжала
показывать выбранное значение после того, как другая вкладка активировала новый
IndexedDB-аккаунт. Restore и отображение теперь ждут разрешения account cache и
гидратации точного storage key; setters также отклоняют обновления прежнего
scope. При переключении сохранённое значение аккаунта A остаётся в его кэше и
снова доступно при возврате к A.

Регрессионный E2E сначала воспроизвёл проблему, затем прошёл 3/3 на desktop
Chromium, Firefox и WebKit без retries. Полный unit suite — 1308/1308 в 210
файлах; общий, domain-strict и storage-strict typecheck, production build и
`git diff --check` прошли. CI run 1359 был запущен на родительском SHA
`85fbf0a` и не проверяет это исправление; точный CI нового HEAD проверяется
после push. Остальные cloud callbacks/cache, staging и полный P0.4 lifecycle
остаются открытыми.

## P0.5 — blank screen при logout во время family AI, 16.10.2026

Полная family-menu матрица обнаружила runtime `TypeError: Cannot read properties
of null (reading 'id')` сразу после logout. Stack trace указал на `useCouncilChat`:
render-key условие допускало сравнение двух отсутствующих account id, затем
обращалось к `currentUser.id`. Хук теперь формирует account/session scope только
при непустом `currentUser.id` и совпадающем `loginGuard.accountId`.

Regression удерживает ответ family AI, выполняет настоящий logout через mock
endpoint и только после появления auth screen освобождает старый ответ. Проверены
отсутствие pageerror, операции family-menu и achievement. Chromium, Firefox и
WebKit прошли 3/3; общий и строгие typecheck, admin guards и production build
прошли локально. CI точного нового SHA ещё предстоит подтвердить.

## 15.10.2026 — account/session lifecycle для всех профильных экранов (`cdc872b`)

Несколько account-aware экранов оставляли локальное React state между входами:
в частности, editor рецепта, выбранный день плана и раскрытые разделы архива.
Теперь dashboard, plan, progress/archive, nutrition, recipes, family, council и
course монтируются с ключом активной login scope. При смене account, session
epoch, server session или auth fence старый экран размонтируется; его локальные
черновики не передаются новому входу. Static help, changelog и policy screens
этим ключом не затронуты.

Полный unit suite — 1305/1305 в 210 файлах; typecheck, production build и
`git diff --check` прошли. Recipe photo account-switch acceptance прошёл 3/3,
family-menu durable suite — 39/39 на desktop Chromium, Firefox и WebKit,
`workers=1,retries=0`. Точный GitHub CI этого SHA проверяется после push. Полная
браузерная приёмка перехода между аккаунтами для каждого локального черновика и
остальной P0.4 аудит остаются открытыми.

## 15.10.2026 — сброс локальных черновиков прогресса при смене login-scope (`f814234`)

Экран прогресса содержал несохранённые замеры и данные импорта в React state.
Теперь React key экрана включает account id, session epoch, server session id
и auth fence; после смены аккаунта или входа старое состояние уничтожается.
Общий helper render key также используется экранами настроек, поддержки и
администрирования. Гидратация черновиков прогресса повторяется при смене id
профиля или его текущего значения глюкозы.

Проверки: account-scope unit — 4/4; полный unit suite — 1305/1305 в 210 файлах;
общий typecheck, production build и `git diff --check` прошли. Два целевых Push
E2E на текущем рабочем дереве прошли 1/1 каждый в desktop Chromium без retries.
Точный CI `f814234` будет проверен после push. Браузерный account-switch
acceptance для экрана прогресса и остальные cloud callbacks/cache остаются в
аудите P0.4.

## 15.10.2026 — account-scope для локальных UI preferences (`32818d1`)

Несколько account-keyed localStorage hooks сразу после смены профиля возвращали
React state предыдущего профиля до завершения `useEffect`. Теперь UI отображает
такие значения только после загрузки exact storage key активного аккаунта.
Защита применяется к черновику веса и PDF-флагу, поисковому запросу дневника,
выбранной дате, направлению камеры и раскрытиям плана; `planScope` в App также
связан с owner id. Setter, захваченный старым рендером, отклоняет обновление,
если его storage scope уже сменился. Course lesson/quiz state получил эту же
проверку в [`64d14a4`](https://github.com/Michael-edel/FitFocus/commit/64d14a4a87fa1f8a163309c60f34d081bae75e73).

Тесты покрывают скрытие значений до гидратации, точное совпадение scope и
отклонение отложенного updater после смены профиля. Полный unit suite прошёл
1304/1304 в 210 файлах; общий typecheck и production build прошли. Точный CI для
`32818d1` запускается после push; браузерная проверка UI-переключения и остальные
cloud callbacks остаются в общем аудите P0.4.

## 15.10.2026 — изоляция локального состояния курса при смене аккаунта (`64d14a4`)

`useCourseUiState` сохранял snapshot урока и викторины в React state между
сменами профиля. Пока effect не загружал localStorage нового аккаунта, один
render мог показать предыдущий урок, раскрытое окно или выбранный ответ.
Hook теперь показывает эти значения только после гидратации storage key
текущего аккаунта; при выходе и во время перехода A→B возвращается пустое
состояние. Снимок нового аккаунта не перезаписывается промежуточным значением.

Регрессионный unit проверяет, что состояние A скрыто для B и при logout, но
остаётся видимым в своём scope. Course UI unit прошёл 3/3. Полный запуск unit
прошёл 1297 тестов в 207 файлах; две suite сначала не загрузились из-за
временного Windows `EBUSY`, затем прошли отдельно с `--maxWorkers=1` (4/4
теста). Typecheck и production build прошли. Коммит пока локальный; точный CI
для `64d14a4` начнётся после push.

## 15.10.2026 — повторная проверка Safari, Firefox PWA и Push на `404b3da`

После сохранения правок из auth-paused старой вкладки (коммит `404b3da`)
повторно проверены три ранее открытых lifecycle-направления. `profile-durability.spec.ts`
прошёл 24/24: 8 desktop WebKit, 8 iPhone Safari и 8 iPhone PWA,
`workers=1,retries=0`; в этих прогонах pageerror не возник. Это подтверждает
текущую работоспособность сценариев, но не объясняет исторические Safari
`due to access control checks` при reload.

`pwa-update.spec.ts` прошёл в desktop Firefox 5/5 последовательных запусков,
`workers=1,retries=0`. Исторический timeout на `saved(page)` не повторился;
корневая причина остаётся неустановленной, поэтому число повторов не закрывает
диагностический пункт.

Push account-switch сценарий с задержанным status-ответом A и native Service
Worker recovery после logout прошли 2/2 на desktop Chromium без retries.
Проверки использовали синтетическую API/сессию и не заменяют provider,
устройство или staging. Полный CI [`38742243646`](https://github.com/Michael-edel/FitFocus/actions/runs/38742243646)
для source HEAD `404b3da` на момент записи ещё выполняет E2E; release и
staging gates остаются открытыми.

## 15.10.2026 — расследование native WebKit sender pageerror при обновлении PWA

Trace исторического CI run [`38249434753`](https://github.com/Michael-edel/FitFocus/actions/runs/38249434753)
(artifact `11748676231`) показывает `503` для семейного PUT в rollback-клиенте
и повтор отправки при активации обновления. В trace есть fetch pageerror из
старого `drain`; он сужает сценарий сбоя до пересечения offline retry и
обновления страницы, но точную первопричину WebKit по trace установить нельзя.

Регрессионный E2E теперь получает первый offline `503`, задерживает следующий
PUT и активирует обновление, пока операция находится в `sending`. Проверка
подтверждает тот же opId/payload, прерывание старого запроса и отсутствие
pageerror. На локальном кандидате поверх `9f09fb5` прошли desktop WebKit 4/4
(один запуск и `repeat-each=3`, `workers=1,retries=0`), Chromium 1/1, Firefox
1/1 и `npm run typecheck`. Полный точный CI для этого изменения ещё не запускался;
run [`38720252389`](https://github.com/Michael-edel/FitFocus/actions/runs/38720252389)
на `9f09fb5` всё ещё выполняет E2E и не содержит нового сценария. Реальная
установка на устройстве и staging этим тестом не проверяются.

## 15.10.2026 — lifecycle assertions и flaky E2E follow-up (`ad89020`, `aa4073c`)

`ad89020` проверяет не только Playwright `pageerror`, но и диагностические
`unhandledrejection`/`window.error`, накопленные в `sessionStorage` при update.
Rollback lifecycle прошёл локально 6/6 без retries на desktop WebKit, Chromium
и Firefox; общий typecheck прошёл.

Точный PR CI [`38729850933`](https://github.com/Michael-edel/FitFocus/actions/runs/38729850933)
для parent `96937ea` завершился success: 1277 unit / 208 файлов и 632 browser
passed / 143 skipped. Workflow отметил две flaky-проверки: в Firefox owned-state
delete оставался в корректном `sending` lease после reload, а WebKit delayed
family-menu GET печатал access-control warning, когда ответ удерживался вторым
`page.route` поверх общей API-фикстуры.

`aa4073c` считает для unacknowledged операции оба допустимых durable состояния
`pending` и `sending`, не считая активный lease подтверждением записи. Семейный
тест теперь задерживает GET в том же mock API handler и отпускает его только
после принятия сессии аккаунта B. Без retries прошли delayed WebKit сценарий
8/8, полный `family-menu-durable.spec.ts` 39/39 на Chromium/Firefox/WebKit и
`owned-state.spec.ts` 4/4 на Firefox. Новый точный CI `aa4073c` ещё ожидается.
Это тестовые изменения; production sender не менялся. Установка PWA на устройстве,
staging и точная причина исторического WebKit trace остаются открытыми.

## 15.10.2026 — обновление семейных данных после BFCache (`29b1e3a`)

`useFamilyCloud` инвалидировал callbacks при `pagehide`, но обработчик
`pageshow.persisted` только сбрасывал индикаторы загрузки. После возврата из
BFCache семейный контекст и список покупок могли оставаться устаревшими после
изменений в другой вкладке. Теперь hook повторно читает уже запрошенные
семейные данные и список покупок.
Старое поколение действий остаётся недействительным. Если вкладка не запрашивала
семейные данные, дополнительных запросов нет.

Новая регрессия до исправления падала: после `pagehide` и `pageshow` GET не
запускались; после исправления тест увидел обновлённые название семьи и покупку.
Полный `family-session.spec.ts` прошёл 24/24 на Chromium, Firefox и WebKit при
`workers=1,retries=0`. Unit-тесты прошли 1275/1275; общий, domain-strict и
storage-strict typecheck, production build и `git diff --check` прошли.
Тест использует синтетические lifecycle events и не проверяет BFCache на
устройстве, OAuth или staging. Точный GitHub CI ожидается после push.

## P0.5 — browser acceptance scoped media поддержки, локальный кандидат, 15.10.2026

К маршруту и session transport вложений добавлен E2E для изображения в исходном
обращении и отдельного изображения в ответе администратора. Mock route требует
парные account/session headers, отвечает Support-Attachment protocol/guard и
echo scope; браузер должен отобразить обе картинки из Blob URL с ненулевой
шириной. Это закрывает клиентское отображение этой границы в mock API, но не
реальный R2, admin UI, staging или старые bundles. Точный новый CI ещё ожидается.
[Тест](../e2e/family-callback-account-switch.spec.ts), [контракт](support-session.md).

## P0.5 — session proof для owner/admin attachment reads, `a396a30`, 15.10.2026

`GET /api/support/attachment` ранее принимал cookie-only запросы пользователя.
Теперь до проверки тикета и чтения файла требуется полный account/session proof;
после guard route проверяет владельца тикета или admin-доступ и возвращает
Support-Attachment protocol/guard markers с точным echo scope.

SupportScreen и AdminScreen больше не используют прямой media `src` к приватному
endpoint. Они загружают Blob через свои session-bound transports, сверяют
response markers и отзывают временные URLs при смене тикета/размонтировании.
Добавлены route regression tests для scoped владельца/admin, отказа owner/admin
без proof, transport proof и marker mismatch. В сетево-отключённом sandbox
прошли API invariants, auth-scope, admin guards и три typecheck. Unit и полный CI
SHA `a396a30` ещё не подтверждены; старые bundles и staging media smoke остаются
открытыми. [Контракт](support-session.md).

## P0.5 — guarded загрузка вложений из admin-поддержки, `f949842`, 15.10.2026

После того как `/api/admin/*` стал требовать account/session proof, media
элементы AdminScreen не могли загрузить attachment URL: браузер не позволяет
добавить scope headers в `<img>`, `<video>` или `<audio>`. AdminScreen теперь
запрашивает attachment через `requestAdminResponse` с proof исходной сессии,
проверяет `Support-Attachment` protocol/guard и точное echo scope, затем
показывает временный Blob URL и отзывает его при размонтировании компонента.
Endpoint возвращает соответствующие маркеры и сохраняет `private, no-store`,
`nosniff` и sandbox CSP; доступ по-прежнему ограничен владельцем тикета или
администратором, причём admin-вызов сверяется с обязательной парой proof.

Добавлены регрессии response markers для обычного маршрута, scoped admin read и
admin transport с выделенным resource marker; API invariants защищают response
wrapper. В сетево-отключённом sandbox прошли API invariants, auth-scope, admin
guard и три typecheck. Unit suite и полный CI SHA `f949842` ещё не подтверждены;
staging проверка открытия фотографий/видео/аудио в admin панели остаётся открытой.
[Контракт](../API_CONTRACTS.md).

## P0.5 — обязательный proof для GDPR export, `4edeb0a`, 15.10.2026

`GET /api/export` ранее проверял только пользователя, поэтому legacy-вызов без
привязки к сессии мог продолжить формирование личной выгрузки после смены
аккаунта. Теперь route требует парные account/session headers через
`requireScopedStateUser`; отсутствующая или неполная пара отклоняется до D1 и
`buildUserDataExport`. Все ответы получают Export protocol/guard markers и echo
предоставленного scope; успешный JSON download сохраняет `no-store`, `nosniff`
и `no-referrer`.

Добавлены regression cases для отсутствующей и account-only пары, beta denial,
guard markers и отсутствия чтения приватных данных при отказе. В sandbox без
сети прошли API invariants, auth-scope, admin guard и три typecheck. Полный unit
suite локально не запускался: общий Windows `node_modules` не содержит Linux
Rollup optional binary. Точный CI SHA `4edeb0a` запускается после push; staging
экспорт и проверка внешних потребителей остаются открытыми. [Контракт](../API_CONTRACTS.md).

## P0.5 — обязательный proof для обычного logout, `b2f6938`, 15.10.2026

`POST /api/logout` ранее сохранял legacy-путь: запрос без scope отзывал session
из текущей cookie и возвращал `Set-Cookie`, даже если он запоздал после входа в
другой вкладке. Теперь полный account/session proof обязателен. Missing/partial
proof отклоняется до чтения cookie и revoke; mismatched proof отклоняется после
проверки подписанного token, до side effects. Успешный и ошибочный ответы не
меняют cookie.

Добавлены профильные регрессии для запроса без cookie/proof, валидной cookie без
proof, account-only и session-only пары, а также существующие success/stale
cases. API invariants проверяют порядок proof gate перед cookie/revoke. В
сетево-отключённом sandbox прошли API invariants, auth-scope, admin guard и три
typecheck; unit suite и полный CI этого SHA ещё не подтверждены. Старые bundles,
OAuth/device и staging остаются открытыми. [Контракт](account-lifecycle-session.md).

## P0.5 — обязательный proof для всех admin routes, `90bd734`, 15.10.2026

`requireAdminRequest` раньше сравнивал scope только при наличии хотя бы одного
заголовка, поэтому cookie-only запросы старых admin bundles доходили до D1
проверки роли и admin-session activity. Теперь оба guard overload требуют полную
account/session пару; отсутствие или неполная пара отклоняются до D1 role query,
а устаревшая пара остаётся отклонённой. `/api/admin/*` middleware переводит оба
исхода в guarded 401. Клиент `AdminScreen` уже отправляет пару proof-заголовков.

Добавлены регрессии для missing/account-only/session-only proof, обоих стилей
вызова `requireAdminRequest`, успешной пары и guarded middleware 401. Regression
fixtures валидных admin endpoints теперь передают настоящий session digest. В
сетево-отключённом sandbox прошли API invariants, auth-scope, admin guard и три
typecheck. PR CI [`38706186324`](https://github.com/Michael-edel/FitFocus/actions/runs/38706186324)
на `01bfa05` дошёл до unit: 1263/1264 теста прошли. Единственное падение было
в тесте legacy subscription: helper уже добавлял proof, поэтому malformed body
дал 400 вместо ожидаемого 401. Follow-up [`478fc58`](https://github.com/Michael-edel/FitFocus/commit/478fc58)
явно отключает proof для этой фикстуры; полный CI нового HEAD ещё не завершён.
Старые bundles и staging остаются открытыми. [Контракт](admin-session.md).

## P0.5 — обязательный proof для глобального выхода, `c778515`, 15.10.2026

`POST /api/logout_all` отзывает все сессии аккаунта и истекал общую cookie,
но использовал `requireStateUser`, который принимал cookie-only legacy запрос.
Теперь endpoint требует полный account/session proof через
`requireScopedStateUser`; отсутствие или неполная пара завершается 401 до
`requireUser`, отзыва сессий и выдачи `Set-Cookie`. Текущий `AdminScreen`
использует `adminRequest` и уже отправляет proof.

Regression tests покрывают отсутствие proof и account-only пару с валидной
cookie; обе формы отклоняются до auth lookup и `revokeAllUserSessions`. API
invariants требуют строгий guard на route. В сетево-отключённом sandbox прошли
API invariants, auth-scope, admin guard и три typecheck; unit runner и полный CI
для этого SHA ещё не подтверждены. Старые AdminScreen bundles, которые вызывают
этот endpoint без proof, должны обновиться до rollout.

## P0.5 — обязательный Huawei session proof, `a127bf5`, 15.10.2026

До follow-up status/start/sync/disconnect использовали `requireStateUser`,
который проверял scope только если клиент его передал. Это оставляло старым
сборкам cookie-only путь и не закрывало гонку между действием Settings и сменой
входа. Все четыре route теперь используют `requireScopedStateUser`; для sync
проверка повторяется после внешнего запроса к Huawei перед profile CAS. OAuth
callback остаётся без клиентских headers и сверяет подписанные user/session
state и nonce до обмена и записи.

Добавлен regression test с валидной cookie и без proof для status, обоих start
вариантов, sync и disconnect. Он проверяет 401 до чтения oversized тела,
route-specific D1, provider fetch, Location и OAuth nonce-cookie. Follow-up
[`9782ef0`](https://github.com/Michael-edel/FitFocus/commit/9782ef02d94278ec31878ada3c14878f1d4aa0fa)
добавляет account-only partial-proof случай. API invariants теперь требуют
`requireScopedStateUser` на всех четырёх route-файлах.

В изолированном контейнере с выключенной сетью прошли API invariants, admin
guard и общий/domain-strict/storage-strict typecheck. Профильный Vitest не
запустился: Linux image использовал Windows `node_modules`, где отсутствует
`@rollup/rollup-linux-x64-gnu`; зависимости не скачивались. Точный PR CI
[`38703208009`](https://github.com/Michael-edel/FitFocus/actions/runs/38703208009)
на `a127bf5` подтвердил dependency/schema/privacy/auth/API checks, unit, три
typecheck и build; E2E выполнялся при добавлении follow-up. Точный CI с тестом
`9782ef0` и обновлённой документацией запускается после push. Старые Settings bundles без proof,
реальный OAuth, BFCache, устройство и staging остаются непроверенными.

## Итог полного CI и разбор двух flaky, `45575d2` / `636d2c7`, 15.10.2026

Точный workflow `38679312640` для опубликованного SHA `45575d2` завершился
success: audit, guards, 1188 unit-тестов / 203 файла, три typecheck, build,
E2E и rollback/CAS прошли; артефакт rollback сохранён. E2E отметил 614 passed,
133 skipped и два flaky, прошедших retry.

Flaky `storage-durability.spec.ts` ожидал только `pending`, хотя отправитель уже
назначил допустимое состояние lease `sending`. В `636d2c7` assertion допускает
`pending` и `sending` до и после reload и продолжает проверять сохранность
операции и незавершённый UI-статус. Сценарий прошёл 5/5 на Chromium и 7/7 по
browser/PWA-матрице; typecheck прошёл.

Flaky `family-menu-durable.spec.ts` на iPhone PWA записал WebKit `pageerror`
«due to access control checks» для отложенного GET после смены аккаунта.
Сохранённый trace показывает ответ HTTP 200 с правильными session markers и
ответом прежней сессии A; durable rows аккаунта B не изменились. Локальный
повтор сценария прошёл 5/5, но первопричина не установлена. Ошибка не
игнорируется; приёмка остаётся открытой до точного CI нового HEAD.

Commit `ba973c1` добавил native HTTP E2E для настоящего собранного Service
Worker: `pushsubscriptionchange` отправляет подписку с proof текущей сессии, а
после logout повторное событие не запускает `/api/me` и не отправляет подписку.
Локально push-сценарий прошёл 1/1 Chromium, соседний PWA regression pack — 6/6.
Commits `ba973c1` и `636d2c7` ещё не проверены точным CI.

## P0.3 — повторная приёмка profile reload в Safari, `45575d2`, 15.10.2026

Исторический Safari pageerror после сохранения профиля с ответом 409 повторно
не воспроизвёлся на текущем HEAD. `profile-durability.spec.ts` прошёл без retries:
8/8 desktop WebKit, 8/8 iPhone Safari и 8/8 iPhone PWA. Сценарии проверяют
локальный профиль после reload, 409-конфликт, разрешение конфликта, отказ
сохранения и обновление сессии; pageerror и неожиданные console error не возникли.
Эти результаты сужают воспроизведение, но не устанавливают историческую причину,
поэтому диагностика `/api/profile` остаётся открытой.

## P0.5 — запретить AI proxy без session proof, рабочее follow-up поверх `1b80734`, 15.10.2026

`callAiProxy` оставлял runtime fallback на обычный `/api/ai`, если внутренний
вызов передавал пустой `AiSession`. Хотя все текущие публичные AI-функции уже
передают сессию, такой fallback обходил контракт и мог принять cookie другого
аккаунта при смене входа. Теперь `AiSession` обязателен, отсутствие proof даёт
`LOGIN_SESSION_CHANGED` до сети, а запрос всегда проходит через
`postScopedAiJson` с исходными account/session headers и проверкой ответа.

Проверки коммита `45575d2`: AI transport — 24/24; полный unit suite —
1188/1188 в 203 файлах; `npm run typecheck`, `npm run check:auth-scope` и
production build прошли. Полный CI точного SHA завершился в
[run 38679312640](https://github.com/Michael-edel/FitFocus/actions/runs/38679312640):
614 E2E passed, 133 skipped, два flaky прошли retry; rollback/CAS также прошёл.
Подробный разбор flake приведён выше.

## P0.5 — привязка Stripe Checkout к login-сессии, `1b80734`, 15.10.2026

Paywall теперь получает `billingSync` из свежего `/api/me`, передаёт исходные
account/session headers в Checkout и административную смену тарифа, проверяет
response markers и повторно сверяет IndexedDB session до возврата URL или
локального обновления плана. Сервер использует `requireStateUser` до создания
Stripe session и административной записи, отвечает с Billing markers и
`Cache-Control: no-store`. Закрытие paywall и смена аккаунта инвалидируют поздний
checkout callback; Checkout URL разрешается только по HTTPS с `checkout.stripe.com`.
[Контракт](billing-session.md).

Полный workflow [38671885368](https://github.com/Michael-edel/FitFocus/actions/runs/38671885368)
завершился с ошибкой на предыдущем SHA `9fb0cff`: все проверки до E2E прошли.
Логи выявили три независимые причины в проверках: push-сценарий получал
протокольную паузу, потому что общий mock не подтверждал побочную запись
`/api/state` обязательным `ok: true`; backup restore мог получить `Execution context
was destroyed`, поскольку mock вычислял user-agent внутри route во время
навигации; account-switch с 1-секундным `Retry-After` зависел от того, успеет ли
Firefox завершить вход B до повторной отправки A.

Моки теперь подтверждают state/profile записи только в тесте настроек push и
снимают метку браузера до навигации. Account-switch acceptance оставляет
предыдущую epoch запись в `pending` или `sending` lease, требует прежние `opId`
и `accountId`, и использует 10-секундный `Retry-After`, чтобы не запускать
повтор до входа B. Локальная проверка: профильные billing unit-тесты — 18/18;
`typecheck`, API invariants, auth scope и admin guards прошли; delayed checkout
URL — 3/3 desktop; account-switch файл — 45/45 применимых desktop-тестов, 60
не-desktop конфигураций штатно пропущены; push и backup restore — 21/21 во всей
Playwright-матрице. Точный CI предыдущего billing-коммита `1b80734`
[run 38678287045](https://github.com/Michael-edel/FitFocus/actions/runs/38678287045)
отменён после нового push branch concurrency. Следующий полный CI `45575d2`
завершился success с двумя flaky E2E после retry в
[run 38679312640](https://github.com/Michael-edel/FitFocus/actions/runs/38679312640);
разбор приведён в начале журнала. До полной приёмки остаются старые bundles,
staging и реальный Stripe Checkout.

## P0.5 — session guard push-настроек и восстановления, код `daec94d`, 15.10.2026

Settings запрашивает свежий `/api/me` proof и capability `pushSync`, затем
передаёт account/session scope каждому push API и проверяет guard markers ответа.
Поздний ответ проверяется против текущего IDB auth-fence до обновления интерфейса;
`pagehide` отменяет попытку. Фоновое восстановление в PWA и Service Worker
начинается только с уже активной IDB-сессии. Серверные handlers проверяют scope
до побочных эффектов, сохраняя совместимость для запросов старых клиентов без
scope-заголовков. [Контракт](push-session.md).

На коммите `daec94d` прошёл полный unit suite: 1180 тестов / 202 файла,
включая 41 профильный тест / 5 файлов; общий, domain и storage strict typecheck,
admin guards, API invariants, auth-scope, schema parity, privacy coverage и
production build. Полный
`family-callback-account-switch.spec.ts` прошёл 42/42 на desktop Chromium,
Firefox и WebKit (`workers=1,retries=0`), включая новый push сценарий во всех
трёх движках. Проверки и сборка локальные; точный полный CI,
native PWA/Service Worker recovery, старые открытые bundle и staging отдельно
не проверены. CI предыдущего baseline `b2d787f` прошёл в
[run 38669030766](https://github.com/Michael-edel/FitFocus/actions/runs/38669030766),
но завершился до `daec94d` и этот код не проверяет. Весь P0.5 остаётся открытым.

Локальный follow-up для native Service Worker добавил
`e2e/push-session-pwa.spec.ts`. На production build и native HTTP fixture тест
диспетчеризовал `pushsubscriptionchange` в настоящий `/sw.js`, проверил POST
`/api/push/subscribe` с точными account/session headers активной IndexedDB-сессии,
затем выполнил logout и подтвердил, что повторное событие не делает `/api/me` и
не отправляет подписку. Сценарий прошёл 1/1 на desktop Chromium без retries;
шесть соседних PWA-регрессий прошли 6/6 (`workers=1,retries=0`), typecheck прошёл.
Это синтетическое событие и локальный HTTP backend: реальный push provider,
устройства, старые открытые bundle и staging не проверены. Новый тест пока не
входит в опубликованный SHA `45575d2`; точный CI для follow-up ещё предстоит.

## Native Push recovery после повторного входа — `04b61dd`, 15.10.2026

Тестовый API backend теперь может сменить session id. `push-session-pwa.spec.ts`
проверяет настоящий собранный Service Worker на одном origin: после logout
событие прекращается без запроса proof; после reload с новым session id приложение
обновляет active-session в IDB, а следующее `pushsubscriptionchange` получает
свежий `/api/me` proof и отправляет подписку с новым session header.
`tests/push_session.test.ts` отдельно проверяет поздний status response и
перепривязку фонового запроса к новому IDB session.

Проверки для `04b61dd`: полный unit suite — 1277/1277 (208 файлов); общий
typecheck прошёл; `family-callback-account-switch.spec.ts --grep "delayed push
status"` — 3/3 desktop Chromium/Firefox/WebKit без retries; native
`push-session-pwa.spec.ts` — 1/1 desktop Chromium без retries (6 других проектов
пропущены по конфигурации). Это локальный синтетический HTTP backend, не реальный
OAuth, push provider, установленное устройство или staging. Точный GitHub CI
ещё не запущен для `04b61dd`; run `38716861362` проверяет предыдущий SHA.

## P0.5 — генерация пошагового рецепта из фото с account/session guard, `71d2ca4`, 15.10.2026

`FoodInsightCard` вызывал `getRecipeFromPhoto` без `AiSession`, а после ответа
сразу обновлял локальный дневник и recipe usage. Это оставляло пошаговую генерацию
вне общих гарантий позднего AI callback, хотя соседние фотоанализы уже использовали
scoped-запросы.

Теперь `getRecipeFromPhoto` требует исходную `AiSession`; новый
`usePhotoRecipeGeneration` связывает попытку с login proof, открытой записью и
page lifecycle, повторно проверяет сессию до/после запроса и guarded commit.
`UserStateRepository.updateJson` читает актуальный JSON-снимок в per-key очереди;
параллельный независимый writer сохраняется конфликтом, а IDB value и operation
коммитятся вместе. Recipe usage увеличивается после успешного сохранения и второй
проверки сессии.

Проверки на code SHA `71d2ca4`: 1173 unit-теста / 201 файл; root и
storage-strict typecheck; admin guards; production build. Полный
`ai-callback-account-switch.spec.ts` на desktop Chromium, Firefox и WebKit прошёл
44/44 применимых сценария без retries, 4 Chromium-only случая корректно пропущены
в двух других engines. Success E2E прошёл в Chromium; late recipe response после
входа B прошёл во всех трёх engines. Точный CI для опубликованного HEAD ожидается;
остальные AI/family callbacks и общий P0.5/P0.8 lifecycle остаются открытыми.

## P0.5 — поздний family member update при входе другого аккаунта, `5d3e4d6`, 15.10.2026

В `e2e/family-callback-account-switch.spec.ts` добавлен сценарий: вкладка A
начинает `PATCH /api/family/member`, ответ удерживается, затем соседняя вкладка
входит в аккаунт B и принимает его семейный контекст. После освобождения ответа
проверяется, что запрос остался адресован целевой семье A, callback не запускает
повторную загрузку контекста семьи A, а активным остаётся B. Первый общий прогон
family account-switch suite дал 38/39: trace показал, что дополнительный GET A
произошёл во время стартовой загрузки до ответа PATCH. Точка сравнения в тесте
перенесена на момент после принятия аккаунта B, поэтому startup GET не считается
эффектом позднего callback.

Тест прошёл 3/3 в desktop Chromium, Firefox и WebKit (`workers=1,retries=0`);
`npm run typecheck` и admin guards прошли. Это acceptance-покрытие, runtime-код
не менялся. Полная suite не повторялась после поправки; точный CI после push
требуется. Остальные
family callbacks, полный P0.5 lifecycle и staging остаются открытыми.

## P0.8 — повтор Firefox PWA update без retries, `a3e5b6f`, 15.10.2026

На опубликованной до нового теста ревизии `a3e5b6f` настоящий Service Worker /
native HTTP сценарий `e2e/pwa-update.spec.ts` прошёл ещё 10 последовательных
раз в desktop Firefox (`workers=1,retries=0`), каждый запуск завершился за
26–29 секунд. Исходный timeout не воспроизвёлся. Результат подтверждает текущую
повторяемость, но не устанавливает причину исторического Firefox timeout;
пункт TASKS остаётся открытым до диагностического объяснения.

## P0.5 — session guard Huawei Health, `455cb01`, 15.10.2026

В `SettingsScreen` и `huaweiHealthApi` действия Huawei теперь принадлежат
исходным account/session proof и попытке страницы. Клиент требует capability
`huaweiSync` и scope/guard headers, ограничивает ответы по времени и размеру,
отменяет работу при смене входа или уходе со страницы и пишет профиль только
через guarded outbox commit. Серверный OAuth start принимает scoped POST; signed
state содержит публичный digest session id. Callback проверяет исходную сессию
до обмена кода и повторно перед записью credentials/profile. Sync повторно
проверяет вход после внешнего вызова Huawei и до CAS-записи профиля.
[Контракт](huawei-health-session.md).

На кодовом SHA [`455cb01`](https://github.com/Michael-edel/FitFocus/commit/455cb0160ee3c5fa3d8bb2b455f1aae385f7c5ae)
прошли `npm run test:unit` (1167/1167 в 200 файлах), общий и два strict
typecheck, production build, API/auth/schema/privacy/admin guards. Четыре
профильных transport/server/API файла дали 26/26 тестов. Выбранные пятисценарные
account-switch проверки завершились 15/15 в desktop Chromium, Firefox и WebKit
без retries (`workers=1,retries=0`), включая задержанный Huawei sync A после
входа B. Полный account-switch spec при первом запуске поймал отдельные
тайминговые нестабильности соседних сценариев; исправлены ожидания тестов,
целевая выборка после этого прошла без retries. Не утверждается, что полный
spec повторно проходил локально; после правок полный PR E2E job на `455cb01`
завершился success.

Полный PR CI точного source SHA [`455cb01`](https://github.com/Michael-edel/FitFocus/actions/runs/38656586334)
завершился success: E2E, unit, audit, schema/privacy/auth/API guards, три
typecheck, production build, canonical readers/CAS after rollback и сохранение
browser/rollback artifacts прошли. Cloudflare Pages preview успешно опубликован;
GitGuardian не обнаружил секретов. Локальная account-switch выборка дополняет,
но не заменяет полный E2E job. Настоящий Huawei OAuth, реальные устройства/BFCache,
staging и production не проверены; общий P0.5, staging и выпуск остаются
открытыми.

## P0.5 — обязательный proof для Push API, `1ac44fb`, 15.10.2026

`/api/push/status`, `subscribe`, `unsubscribe` и `test` теперь требуют
`requireScopedStateUser`. Старые открытые Settings/Service Worker сборки без
парных account/session headers получают 401. Проверка выполняется до чтения
JSON, чтения/изменения подписок и отправки test notification. Остальные ответы
сохраняют Push protocol/guard markers и публичный scope. Контракт и staging gate
обновлены; для прежнего клиента нужен rollout с обновлением клиента/worker.

На точном локальном SHA
[`1ac44fb`](https://github.com/Michael-edel/FitFocus/commit/1ac44fb0a821a44029d1265c49f0a5a72eac160a)
полный unit suite прошёл 1238/1238 в 208 файлах; прошли общий, domain-strict и
storage-strict typecheck, API invariants, auth-scope, schema parity, privacy,
production build и `git diff --check`. Push account-switch сценарий прошёл в
desktop Chromium, Firefox и WebKit; настоящий собранный Service Worker с HTTP
fixture прошёл в Chromium (4 passed, 2 ожидаемых skip). Полный CI этого SHA,
реальный push provider, device/BFCache и staging остаются открытыми.

## P0.6 — возобновление outbox после смены аккаунта, reload и logout/login, 15.10.2026

В `e2e/ai-callback-account-switch.spec.ts` добавлен desktop acceptance:
запись плана аккаунта A получает 503 и остаётся pending с `retryCount=1`;
после входа B проверяется, что операция сохраняет исходные `accountId` и
`opId`, и что просроченный retry не уходит при активном B. Возврат A с новым
server session возобновляет ту же операцию; в журнале запросов проверяется,
что отправка адресована A и содержит новый session id. Runtime-код не менялся.

Точечный локальный Playwright прогон завершился 3/3 без retries в desktop
Chromium, Firefox и WebKit (`workers=1,retries=0`). Точный PR CI source HEAD
`943d4c0`, merge-ref `75362ae`, [run 38641088114](https://github.com/Michael-edel/FitFocus/actions/runs/38641088114),
завершился success: 1153 unit-теста / 199 файлов, 587 browser passed / 99 skipped
за 30,3 минуты, audit с 0 уязвимостей, все guards, три typecheck, production
build, 23 rollback/CAS-запроса и rollback-артефакт. Предшествующий docs-only
run `38638704278` отменился при новом push из-за branch concurrency. Это закрывает
один acceptance P0.6, но не logout/login, reload и весь lifecycle.

В `ai-callback-account-switch.spec.ts` добавлен отдельный reload acceptance:
операция плана A принудительно остаётся pending на 503; после reload сервер
возвращает тот же account с новым session id. Тест проверяет сохранение `opId`,
попытку отправки под новой session и подтверждение операции.
Также добавлен logout/login acceptance: после 503 выход останавливает отправку,
операция остаётся в IndexedDB, а повторный вход аккаунта A с новой server
session возобновляет ту же операцию и подтверждает её.
Совместный прогон account-switch, reload и logout/login прошёл 9/9 в desktop
Chromium, Firefox и WebKit без retries (`workers=1,retries=0`). Все три сценария
вошли в полный CI `455cb01`, завершившийся success. Эти проверки подтверждают три сценария, но не закрывают
same-key/old-new гонки и полный lifecycle P0.6.

Дополнен [same-key browser acceptance](../e2e/storage-durability.spec.ts): первая
вкладка отправляет settings PUT, ответ удерживается; до его завершения вторая
вкладка записывает независимый полный снимок. Проверено, что первая операция
остаётся `sending`, вторая хранится как `local-revision-conflict`, успешный ack
не удаляет конфликт, а сервер принимает только первый PUT. Прогон прошёл 3/3
в desktop Chromium, Firefox и WebKit без retries. Проверенный diff поверх
`ce6ade0` вошёл в полный CI `455cb01`, завершившийся success.

## P0.8 — миграционный smoke при обновлении PWA, 15.10.2026

В PR CI `38621962929` один desktop Chromium прогон
`legacy-outbox-migration.spec.ts` не получил acknowledgement за 10 секунд.
Сохранённая диагностика показывает, что сервер принял запись, а навигация
прервала ответ: outbox оставил операцию `sending`, без `acknowledgedVersion`.
Это корректное сохранение неопределённого исхода; новая вкладка ждёт окончания
30-секундной lease, прежде чем повторять операцию. Сбой повторился только в
этом тесте и прошёл retry.

Чтобы smoke проверял штатный old/new переход без принятого запроса с потерянным
ответом, обновлён сценарий: пакетный API остаётся недоступным во время навигации
обоих окон. После подтверждения общего build id тест ждёт, пока целевая операция
вернётся в pending после 503 (либо истечёт её прерванная lease), затем открывает
API и требует подтверждённый ack и удаление операции. Проверка карантина чужой
записи и запрета старому sender сохраняются. Runtime-код не менялся.

Точный PR CI source HEAD `08618e3`, merge-ref `d10ec68`,
[run 38628487894](https://github.com/Michael-edel/FitFocus/actions/runs/38628487894),
завершился success: 1153 unit / 199 файлов, 577 browser passed / 95 skipped,
audit с 0 уязвимостей, schema/privacy/auth/API guards, три typecheck, production
build, 23 rollback/CAS-запроса и сохранение rollback-артефакта. В E2E summary
нет неуспешных тестов; browser прогон занял 29,7 минуты. Старый CI `38621962929`
с flaky retry остаётся исторической диагностикой; новый тест больше не зависит
от оборванного ответа при переходе PWA.

Добавлен второй old/new same-key шаг в `e2e/legacy-outbox-migration.spec.ts`.
Старый bundle создаёт первую pending запись через UI. После её импорта открытая
старая вкладка изменяет прежний value и legacy source; этот второй `safeSetItem`
смоделирован его парой localStorage-записей. Новый bundle повторно проверяет
снимок и сохраняет изменённое намерение отдельным `independent-snapshot`
конфликтом, не подменяя исходную запись и не отправляя её до all-client fence.
После обновления обоих окон исходная операция подтверждается версией 1,
изменённая остаётся конфликтом, foreign-owner остаётся в карантине. Точечный
локальный прогон завершился 3/3 без retries в desktop Chromium, Firefox и WebKit
(`workers=1`). Это browser acceptance source audit на одном origin; он не
проверяет второй пользовательский клик старого клиента. Сценарий вошёл в полный
CI `455cb01`, завершившийся success.

## P0.6 — параллельная запись разных ключей из двух вкладок, 15.10.2026

В `e2e/owned-state.spec.ts` добавлен браузерный acceptance для одного
origin и аккаунта: две вкладки без Web Locks одновременно записывают отметку
плана и настройки. Обе страницы затем читают из общей IndexedDB оба значения
и обе outbox-операции; проверяются account ownership и отсутствие потери одной
из записей. Статусы pending/sending допускаются, так как это намеренно не
проверка HTTP-подтверждения.

Сценарий добавлен в follow-up и прошёл точный PR CI на HEAD `a8f3219`, [run 38634080772](https://github.com/Michael-edel/FitFocus/actions/runs/38634080772). E2E: 583 passed / 95 skipped и один flaky retry в отдельном iPhone Safari rollback-тесте; он прошёл на повторе, причина первого падения не установлена. Эта проверка закрывает только конкурентную запись разных ключей: same-key
конфликт, old/new сборки, logout/login, callbacks и общий lifecycle остаются
отдельными критериями P0.6/P0.5/P0.8.

## P0.5 — локальные действия AI Совета при паузе отправки, 15.10.2026

CI на SHA 6305695, [run 38613219717](https://github.com/Michael-edel/FitFocus/actions/runs/38613219717),
завершился с 567 passed, 95 skipped, 8 failed и 2 flaky. Семь одинаковых
E2E-падений возникли в owned-state.spec.ts: очистка истории AI Совета не
создавала delete operation во время auth/protocol pause, потому что строгий
sender guard отклонял локальную пользовательскую запись. Это нарушало
контракт: пауза блокирует отправку, а не сохранение намерения. Отдельный
iPhone PWA failure в family-menu проверках остаётся самостоятельным вопросом.

Коммит [32bc410](https://github.com/Michael-edel/FitFocus/commit/32bc4101bc3e31bd272d610e1730a9ffa23b7ae9)
добавляет local commit guard, который внутри IDB-транзакции требует прежние
account, server session и epoch, но допускает локальную запись при sender
pause. Вопрос пользователя и очистка истории используют этот guard; ответ AI
сохраняет строгий guard. Тестовая временная база исправлена в
[0abb185](https://github.com/Michael-edel/FitFocus/commit/0abb185ed3ea227158c1eb2e732bfafd79abc141).

CI [38620253135](https://github.com/Michael-edel/FitFocus/actions/runs/38620253135)
на SHA f1f553d прошёл 1153 unit-теста, но typecheck выявил, что широкий
OutboxWriteGuard расширил API repository-записей. Коммит
[92ecaa3](https://github.com/Michael-edel/FitFocus/commit/92ecaa3cd1f97b643daf62ca44fd5d6b76a7670f)
разделил строгие writeJson/writeRaw/remove и явные writeLocalRaw/removeLocal.
Следующий CI [38621324053](https://github.com/Michael-edel/FitFocus/actions/runs/38621324053)
на SHA 010cf26 тоже прошёл unit, затем выявил пропущенные импорты этих типов;
они добавлены в [ce7b60d](https://github.com/Michael-edel/FitFocus/commit/ce7b60d9e6cd40201778fb399fbf1421c04630c5).

На точном PR CI для branch HEAD `7458ea0` (merge-ref `d805b1f`) завершились
success audit с 0 уязвимостей, schema/privacy/auth/API guards, 1153 unit-теста /
199 файлов, общий и два strict typecheck, production build, E2E и 23 rollback/CAS
запроса: [run 38621962929](https://github.com/Michael-edel/FitFocus/actions/runs/38621962929).
Playwright summary: 576 passed / 95 skipped и один flaky на первом запуске
`legacy-outbox-migration.spec.ts` в desktop Chromium; retry прошёл. Локальные
тесты не запускались по принятому порядку проверки. Это подтверждает local
commit при sender pause в CI; общий P0.5/P0.8 остаются открытыми.
## P0.5 — AI Совет использует account-scoped session, 14.10.2026

Кодовый follow-up [`500d83e`](https://github.com/Michael-edel/FitFocus/commit/500d83e3dd8856608ec7d9ab4330c05d661b4dd1)
в `fix/durable-outbox` связывает AI Совет с исходной login-сессией. В
`useCouncilChat` вопрос и ответ теперь проходят guarded durable commit в
`council_history`. `callAiCouncil` получает `AiSession`, проверяет соответствие
аккаунта профилю и передаёт тот же proof на каждый из 14 запросов `/api/ai`.
Поздний ответ после входа в аккаунт B не может изменить историю A или B; ошибки
сохранения видны в интерфейсе. Очистка истории также проверяет read guard внутри
outbox-транзакции. Проверки описаны в
[контракте AI Совета](ai-council-session.md).

`npx vitest run tests/ai_session_transport.test.ts tests/state_editor.test.ts`
прошёл 40/40; полный unit-набор — 1135 тестов / 198 файлов. Общий,
domain-strict и storage-strict typecheck прошли. Новый account-switch сценарий
прошёл на desktop Chromium, Firefox и WebKit; полный
`ai-callback-account-switch.spec.ts` завершился 28 passed / 2 skipped при
`workers=1,retries=0`. Первый запуск теста не дождался инициализации сессии и
lazy-экрана; после явного барьера активной сессии аккаунта A сценарий прошёл во
всех трёх браузерах. Точный CI этого follow-up запускается после push. P0.5,
P0.8, staging и выпуск остаются открытыми.

## P0.5 — поздний retry объяснения плато после смены аккаунта, 14.10.2026

Добавлен account-switch acceptance для ответа retry аккаунта A после входа B
в соседней вкладке. Проверяются profile, локальные values, outbox, active
session, achievement effects и UI обоих аккаунтов. Целевой тест прошёл 3/3 на
desktop Chromium, Firefox и WebKit; связанные unit-тесты — 11/11, typecheck
прошёл.

Первый полный `ai-callback-account-switch.spec.ts` завершился 24 passed /
1 failed / 2 skipped при `workers=1,retries=0`. Сбой был в ранее существовавшем
Coach retry desktop Firefox: после ответа A исходная вкладка не увидела account B
за 10 секунд. Targeted повтор прошёл; затем в Coach и новом plateau сценариях
добавлен барьер, который подтверждает активную сессию B в исходной вкладке до
освобождения ответа. Coach прошёл 5/5 повторов, а повторный полный spec завершился
25 passed / 2 skipped без retries. Новый тест ещё ждёт точного CI после push;
staging и весь P0.5 остаются открытыми.

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
и scope. Сервер отклоняет запрос без парных proof-заголовков до чтения body и
расходования приглашения; старые сборки без proof получают 401. Порядок
выкладки capability и guard добавлен в чек-лист; сама регистрация не заменяет
legacy writer barrier.

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

## Family late-response acceptance — текущая локальная проверка

В `e2e/family-callback-account-switch.spec.ts` добавлены два сценария P0.5:
запоздавший `/api/shopping/check` от A после входа B не запускает
`shopping_item_checked` и не меняет список B; задержанный `/api/family/member`
с target-семьёй A не применяется к UI другой семьи, загруженной тем же login.
Полный spec прошёл 12/12 на desktop Chromium, Firefox и WebKit, `workers=1`,
`retries=0`; общий `npm run typecheck` прошёл. Это локальное свидетельство;

## P0.8 — финальная сверка legacy-нормализатора, `48cf797`, 14.10.2026

Согласованный контракт из `docs/legacy-migration.md` сверён с текущими
`storage/legacyQueue.ts` и `tests/legacy_queue.test.ts`. Реализация принимает
только `put`/`delete`, требует непустой ключ, требует строковое значение для
`put` и запрещает поле `value` для `delete`, включая явно заданное `undefined`.
Отсутствующие `baseVersion` и `retryCount` нормализуются в `0`; присутствующие
поля должны быть целыми неотрицательными числами. Все семь причин отказа
типизированы и покрыты тестами. Fingerprint строится из нормализованных
`type/key/value-or-null/baseVersion`; индекс и `retryCount` на него не влияют.

На точном локальном HEAD `48cf797b2b08cd4b62bdf59c265c4d85a4db863f`
`npx vitest run tests/legacy_queue.test.ts tests/legacy_migration.test.ts`
завершился успешно: 2 файла, 124 теста. `npm run typecheck` также прошёл.
Полный PR workflow [38470475102](https://github.com/Michael-edel/FitFocus/actions/runs/38470475102)
при записи результата ещё выполнялся на этом SHA; push-run `38470467012`
отменён concurrency после запуска PR workflow. Это подтверждает проверку
нормализатора, но не полный CI, runtime lifecycle, staging или готовность P0.8.

Повторная проверка на рабочей ревизии `ce546c1` 14.10.2026 подтвердила тот же
контракт: `npm run test:unit -- tests/legacy_queue.test.ts tests/legacy_migration.test.ts`
прошёл 124/124. Точный PR workflow для этого SHA —
[run 38601101801](https://github.com/Michael-edel/FitFocus/actions/runs/38601101801) —
на момент сверки всё ещё выполняется на E2E; его полный результат не подтверждён.

## P0.5 — session guard личной корзины, `b56544e`, 14.10.2026

`ShoppingListCard` раньше читал `/api/shopping/list` и менял отметки через
`/api/shopping/check` только с cookie. Он не связывал запрос с исходными
account/session proof, а внутренний React state не был привязан к login scope.
Теперь `App` передаёт исходный read guard и проверку login attempt через
`AppWorkspace`/`PlanScreen`; карточка вызывает `requestFamilyJson`, который
перед GET и PATCH проверяет свежий `/api/me`, добавляет account/session headers,
проверяет серверный Family scope ответа и снова проверяет активную IDB-сессию.
GET дополнительно сверяет `week_start`. Каждая попытка отменяется при смене
scope/размонтировании и `pagehide`; возврат из BFCache начинает новое чтение.

Снимок списка изолирован по account, server session, epoch, auth-fence и неделе.
Fallback checkbox cache использует отдельный user/week ключ и не записывает
состояние прежнего аккаунта до чтения нового ключа. Оптимистический PATCH и
его rollback меняют только снимок исходного scope.

Проверки на commit `b56544e`: полный
`npx playwright test e2e/family-callback-account-switch.spec.ts --project=desktop-chromium --project=desktop-firefox --project=desktop-webkit --workers=1 --retries=0`
прошёл 18/18; два новых personal-shopping сценария отдельно прошли 6/6.
`npx vitest run tests/family_session_guard.test.ts tests/family_api.test.ts tests/shopping_list.test.ts`
прошёл 25/25; `npm run typecheck` и admin guards прошли. Для rendered-flow
использован repo Playwright; Browser plugin недоступен в этом сеансе. E2E
проверяет `/#plan` → загрузка списка → checkbox, поздний ответ после login B,
401 старого scope и неизменность списка B.

Это локальная клиентская приёмка; после push нужно проверить полный workflow
точного PR HEAD. Старые клиенты без scope сервер по-прежнему обслуживает по
прежнему протоколу; реальный staging/old-new bundle и вся P0.5 lifecycle-матрица
не закрыты. P0.8 также остаётся открытым.

## P0.5 — отложенный family join после смены аккаунта, `69c739a`

Добавлен browser-сценарий для незакрытого join callback. Аккаунт A открывает
экран семьи без активного членства, вводит код и отправляет `/api/family/join`;
ответ удерживается, пока соседняя вкладка входит в B. Fixture затем возвращает
успешный ответ со scope A, то есть проверяет клиентскую late-response границу,
а не только отказ сервера. Проверки подтверждают, что введённый код не
очищается, A не запускает повторную загрузку семьи и не вызывает
`family_join_or_create`, активный IDB-сеанс остаётся B.

Новый сценарий прошёл 3/3 на desktop Chromium, Firefox и WebKit. Полный
`family-callback-account-switch.spec.ts` после добавления прошёл 21/21 при
`workers=1/retries=0`; общий `npm run typecheck` и связанные 25 API unit-тестов
прошли. Изменение находится в [`69c739a`](https://github.com/Michael-edel/FitFocus/commit/69c739a).
Это mock-backed browser acceptance: реальная многовкладочная OAuth/staging
проверка и полный lifecycle P0.5 остаются открытыми. Точный GitHub workflow
этого HEAD будет проверен после push.

## P0.5 — отложенное создание семьи после смены аккаунта, `1b6444a`

Добавлен соседний browser-сценарий для `POST /api/family`. Аккаунт A создаёт
семью, ответ удерживается до входа B в соседней вкладке, затем fixture
возвращает успешный ответ со scope A. Сценарий подтверждает, что старый callback
не запускает повторную загрузку семьи и `family_join_or_create`, а активный
IDB-сеанс и состояние аккаунта B остаются неизменными.

Новый сценарий прошёл 3/3 на desktop Chromium, Firefox и WebKit; полный
`family-callback-account-switch.spec.ts` прошёл 24/24 при `workers=1/retries=0`.
`npm run typecheck` прошёл. Совместно с `69c739a` join/create и личные корзины
проверены четырьмя новыми сценариями, 12/12. Mock-backed acceptance не заменяет
реальный OAuth/staging или общий lifecycle P0.5; полный GitHub CI точного HEAD
ещё ожидается.

## P0.5 — отложенное чтение семейного контекста, `bb1866c`

Добавлена проверка initial `GET /api/family` аккаунта A, удержанного до входа B
в соседней вкладке. После освобождения fixture возвращает валидный ответ со
scope A; UI не показывает семью A после переключения, не запускает второй
family read, а active IDB-сеанс остаётся B. Это проверяет клиентскую обработку
позднего ответа, дополняя существующий logout и mutation acceptance.

Сценарий прошёл 3/3 на desktop Chromium, Firefox и WebKit; полный
`family-callback-account-switch.spec.ts` прошёл 27/27 при `workers=1/retries=0`.
Typecheck прошёл. Вместе с тестами `69c739a` и `1b6444a` пять новых acceptance
сценариев прошли 15/15. Mock-backed проверка не заменяет реальный OAuth/staging;
полный lifecycle P0.5 остаётся открытым. Точный GitHub workflow текущего HEAD
будет проверен после push.

## P0.5 — отложенный family shopping GET, `8f012e4`

Добавлена проверка семейного `/api/shopping/list?family_id=...`: начальные GET
аккаунта A удерживаются до входа B в соседней вкладке, затем возвращают список
A со scope A. Старые ответы не появляются в family UI; повторные ответы для A
не запускаются, а список B после обновления содержит только данные B.

Новый сценарий прошёл 3/3 на desktop Chromium, Firefox и WebKit. Полный
`family-callback-account-switch.spec.ts` прошёл 30/30 при `workers=1/retries=0`;
typecheck прошёл. В сумме personal/family shopping и family callbacks теперь
имеют шесть новых acceptance-сценариев, 18/18. Реальные OAuth/staging и полный
lifecycle P0.5 всё ещё открыты; точный workflow этого HEAD проверяется после push.

## Проверки текущего HEAD — `010805f`, 14.10.2026

Текущий PR HEAD `010805f447d49ff62f18f5e3a17b08d66f5edd63` включает эти
документированные browser acceptance. `family-callback-account-switch.spec.ts`
прошёл 30/30 на desktop Chromium, Firefox и WebKit; шесть новых сценариев
прошли 18/18. Локальные тесты legacy-нормализации и импорта
`npx vitest run tests/legacy_queue.test.ts tests/legacy_migration.test.ts`
прошли 124/124.

PR workflow [38528630120](https://github.com/Michael-edel/FitFocus/actions/runs/38528630120)
на момент записи выполняется. Audit, schema/privacy/auth/API checks, unit,
общий и два strict typecheck, а также production build завершились успешно;
E2E выполняется, canonical readers/CAS after rollback и сохранение rollback-
артефакта ещё не завершены. Полный CI для этого SHA пока не подтверждён.
Staging, production-релиз и закрытие P0.5/P0.8 этим результатом не подтверждаются.

## P0.5 — account-switch acceptance личного недельного меню, `562e20d`

Добавлен browser-сценарий для личной генерации недельного меню. Ответ AI
аккаунта A удерживается, пока соседняя вкладка входит в аккаунт B; после
освобождения тест проверяет, что профили и outbox обоих аккаунтов не меняются,
profile/state writes и achievement не запускаются, позднее меню не отображается.
Также существующие ожидания Coach/Plan/Plateau приведены к порогу 11,9 с,
оставляя запас до 12-секундного session transport timeout. Первый полный прогон
нашёл одну ошибку только из-за прежнего 10-секундного порога в WebKit Coach;
после поправки этот сценарий прошёл отдельно.

На `562e20d210695328bcd17309f9836a2e10c68935` новый weekly-menu сценарий прошёл
3/3 на desktop Chromium, Firefox и WebKit; полный изменённый
`ai-callback-account-switch.spec.ts` прошёл 15/15 при `workers=1,retries=0`.
`npm run typecheck`, admin guards и `git diff --check` прошли. Полный CI
[38531646756](https://github.com/Michael-edel/FitFocus/actions/runs/38531646756)
для этого SHA завершился success: audit, schema/privacy/auth/API checks, unit,
typecheck, domain/storage strict checks, build, E2E и canonical readers/CAS after
server rollback прошли. Browser diagnostics сохранены в артефакте `11879048388`,
rollback — в `11879443791`. OAuth/staging и весь P0.5 этим browser acceptance не
закрыты.

## P0.5 — session guard фотоанализа дневника и рецепта, `d93ff53`, 14.10.2026

`useFoodPhotoAnalysis` теперь получает исходный login guard и использует
`AiActionScope`, свежий `AiSession` и guarded commit для diary/history и
профильного счётчика использования. Смена аккаунта, закрытие страницы или новая
попытка инвалидируют старый callback; он не показывает insight, не запускает
achievement и не записывает данные. `useFoodDiary` перечитывает актуальные
значения из repository и передаёт один guard обоим ключам. Recipe photo flow
передаёт session в `analyzeFoodPhotoEnhanced`, повторно проверяет её после
сжатия и HTTP, очищает старый draft при смене сессии и не применяет поздний ответ.

На кодовом commit [`d93ff53`](https://github.com/Michael-edel/FitFocus/commit/d93ff53)
прошли `npx vitest run tests/food_photo_feature.test.ts tests/food_diary_feature.test.ts`
(11/11) и `npm run typecheck` с admin guards. Browser-команда
`npx playwright test e2e/ai-callback-account-switch.spec.ts --project=desktop-chromium --project=desktop-firefox --project=desktop-webkit --workers=1 --retries=0`
завершилась 22 passed / 2 expected skips. Поздние foodphoto и recipe callbacks
прошли на всех трёх движках; успешный фотоанализ с diary/history/usage commit
прошёл на Chromium. `git diff --check` прошёл.

Первый полный browser-прогон провалил только слишком широкое ожидание stateWrites:
WebKit записал независимый `weekly_reports` во время теста recipe photo. Snapshot
профиля, дневника, истории и outbox аккаунтов не изменился. Ожидание сужено до
`diary`/`history`; полный повтор прошёл без failed или flaky. Это локальная
приёмка; полный CI опубликованного HEAD описан в следующей записи. Реальные OAuth/BFCache,
staging, другие callbacks и весь P0.5 остаются открытыми.

## Проверки текущего HEAD — `a9e3096`, 14.10.2026

PR workflow [38540109329](https://github.com/Michael-edel/FitFocus/actions/runs/38540109329)
на точном HEAD `a9e309696be85414a6ca96697beec3d91c19718c` завершился success.
Unit: 1132 теста в 198 файлах; Playwright: 535 passed / 79 skipped. Audit,
schema/privacy/auth/API guards, три typecheck и production build прошли;
rollback и canonical readers/CAS после rollback прошли на 23 запросах.
Rollback-артефакт `11883487207` сохранён. Push-trigger run `38540101601`
отменён concurrency после запуска PR workflow; это ожидаемая отмена предыдущего
запуска, а не отказ проверки.

Два desktop Firefox теста в `e2e/weekly-menu-durability.spec.ts` были flaky на
первой попытке и прошли автоматический retry:

- `weekly menu and shopping intent are delivered by one durable scoped profile operation`;
- `weekly menu clears loading after a timeout and lets the user generate again`.

Первый локальный повтор обоих сценариев (`--repeat-each=5`, один worker, без
retries) дал 8/10; каждый сценарий один раз не достиг HTTP-успеха. В следующей
диагностической серии таймаутный сценарий снова воспроизвёл сбой: локальный
профиль и одна `pending` outbox operation были записаны, `profileAttempts=0`,
sender сообщил `StateStorageError:STATE_STORAGE_TRANSACTION` и остановился до
HTTP. Последующий повтор timeout-сценария 10/10 прошёл. Временное логирование
удалено. На момент этого исторического снимка точная внутренняя ошибка
транзакции ещё не была установлена; позднейшая трассировка и исправление
описаны в следующем разделе. Причинная связь с изменением фотоанализа не
подтверждена.

## Firefox IndexedDB finish follow-up — cae28bd, 14.10.2026

Диагностическая трассировка выявила первопричину двух flaky сценариев
weekly-menu в Firefox: IndexedDB выбрасывал TransactionInactiveError внутри
DurableOutbox.finish. Метод ставил чтения в очередь, ожидал Promise.all, а затем
в асинхронном продолжении добавлял зависимые записи. В некоторых Firefox
транзакция к этому моменту уже становилась неактивной, поэтому sender завершался
с STATE_STORAGE_TRANSACTION до HTTP, хотя профиль и pending operation были
сохранены.

В [коде cae28bd](https://github.com/Michael-edel/FitFocus/commit/cae28bd)
finish теперь ставит все чтения в очередь до ожидания, а зависимую проверку и
записи выполняет внутри success-события последнего запроса. Guard, ack, retry,
conflict и migration receipt остаются в одной транзакции.

Локальные проверки: unit — 1132/1132 в 198 файлах; целевые storage tests —
37/37; общий typecheck и storage-strict typecheck прошли; два исходных Firefox
сценария — 20/20 при десяти повторах каждого; полный weekly-menu spec —
24/24 на desktop Chromium, Firefox и WebKit. Полный CI нового коммита ожидается
после push; локальные результаты не заменяют его. P0.8 и выпуск остаются
открытыми до завершения остальных lifecycle-критериев.

## Outbox write и Android migration follow-up — 8d7aee0, 14.10.2026

Полный [CI run 38556748824](https://github.com/Michael-edel/FitFocus/actions/runs/38556748824)
на точном `8dc7f71` завершился success: 1132 unit / 198 файлов, 537 browser
passed / 83 skipped, guards/schema/privacy/build и rollback checks прошли.
Итог отметил три flaky: два desktop Firefox с `STATE_STORAGE_TRANSACTION`
и Android Chrome migration с timeout ожидания отправки.

Firefox stack указал на `DurableOutbox.write` → `writeOutboxInTransaction`:
запросы были поставлены до `Promise.all`, а в продолжении после их завершения
вызывался `tx.objectStore()` и ставились зависимые writes. Исправление
[`8d7aee0`](https://github.com/Michael-edel/FitFocus/commit/8d7aee0) выполняет
проверки и записи синхронно в success-событии последнего read request; при
ошибке вычисления readwrite-транзакция отменяется до выхода из события.

Android diagnostic показал, что миграция импортировала и разрешила отправку,
но test fixture восстанавливала backend через 750 ms после обновления. Медленный
Service Worker мог открыть gate раньше восстановления, получить retry и оставить
операцию `sending` в момент 10-секундной проверки. Теперь backend готов до
обновления; до него тест проверяет отсутствие state-write попыток, а затем ждёт
`writersStopped && sendAllowed` вместо таймера.

После поправок прошли 1132 unit / 198 файлов, общий, domain-strict и
storage-strict typecheck. Targeted runs без retry: Firefox timeout 5/5,
weekly-menu account switch 3/3, Android migration 5/5. Полный прогон этих трёх
файлов на desktop Firefox и Android Chrome: 27 passed / 9 skipped. CI точного
`8d7aee0` отдельно не запускался; его код включён в `35fceb4`, для которого
push CI приведён ниже. P0.8 и выпуск остаются открытыми.

## Outbox claim follow-up — 35fceb4, 14.10.2026

При аудите после `8d7aee0` найден аналогичный Firefox lifecycle-риск в
`DurableOutbox.claim`: после `Promise.all` метод проверял legacy gate/receipt и
записывал `sending`. Теперь начальные session/outbox reads ставятся в очередь
вместе; для каждого нужного legacy-кандидата запрос receipt ставится из
success-события предыдущего чтения, а claim — в success-событии последнего
нужного read request. Поздняя или устаревшая сессия по-прежнему не получает
lease. Legacy receipt читается только для рассматриваемого head intent, а не
для всей очереди на каждом claim.

На точном кодовом SHA
[`35fceb4`](https://github.com/Michael-edel/FitFocus/commit/35fceb467f7928be3f7df57f0f6b3d669f8265dc)
прошли 1132 unit-теста / 198 файлов, `npm run typecheck`,
`npm run typecheck:storage-strict` и production build. Без retries прошли 18
E2E из `weekly-menu-durability.spec.ts` и `legacy-outbox-migration.spec.ts` на
desktop Firefox и Android Chrome. Push CI
[run 38566246646](https://github.com/Michael-edel/FitFocus/actions/runs/38566246646)
для SHA `35fceb4` отменён concurrency после запуска PR
[run 38566257477](https://github.com/Michael-edel/FitFocus/actions/runs/38566257477),
который ещё выполняется. После push документации нужно проверить CI нового
branch HEAD. Полная P0.8 и выпуск остаются открытыми.

## P0.8 — остальные активные IDB-транзакции, `f3a9abf`, 14.10.2026

`afterIndexedRequests` перенесён в `storage/stateDatabase.ts` и применён к
оставшимся outbox/session readwrite-путям, включая hydrate, принятие и
инвалидацию сессии, conflict recovery, retry, indexed user-state backup restore и account
cleanup. Зависимые проверки и записи выполняются в активной IDB-транзакции.
Пустой backup не создаёт request success event, поэтому helper отдельно
обрабатывает пустой набор; соответствующая unit-проверка добавлена.

На точном кодовом SHA
[`f3a9abf`](https://github.com/Michael-edel/FitFocus/commit/f3a9abf796f9b3bedd969efc5f032bd8d4d370cf)
прошли 1133 unit-теста / 198 файлов, общий, domain-strict и storage-strict
typecheck, production build. Шесть связанных browser spec на desktop Firefox
и Android Chrome: 57 passed / 9 skipped. Workflow
[38566637885](https://github.com/Michael-edel/FitFocus/actions/runs/38566637885)
на прежнем docs SHA `933213d` оставался на E2E во время локальной проверки и
не проверял этот код. После push требуется CI на новом HEAD. Legacy importer и
durable backup callbacks, полный lifecycle, staging и выпуск этой работой
не закрываются.

## P0.8 — активные транзакции legacy migration, `37dc4b0`, 14.10.2026

В `storage/legacyMigration.ts` readwrite flows переведены с async-continuation
между IDB-запросами на заранее поставленные requests и синхронные callbacks
в success events. Проверки progress/snapshot, batch chaining, запись migration
ledger вместе с созданной outbox operation и финальный audit теперь используют
активные транзакционные события. В `storage/durableOutbox.ts` добавлен
синхронный `onOperationCreated` hook для ledger-записи внутри этой транзакции.

Проверено на code SHA [`37dc4b0`](https://github.com/Michael-edel/FitFocus/commit/37dc4b0c26326cb6f862ab7baa945a802a03990b),
ветка `fix/durable-outbox`; документация обновляется отдельным коммитом.
Команда `npx vitest run tests/legacy_migration.test.ts tests/durable_outbox.test.ts tests/account_state_cleanup.test.ts`
прошла 94/94. `npm run test:unit` — 1133/1133 в 198 файлах. Успешно прошли
`npm run typecheck`, `npm run typecheck:domain-strict`,
`npm run typecheck:storage-strict`, `npm run build` и `git diff --check`.

Первый совместный запуск migration и weekly-menu specs на desktop Firefox и
Android Chrome дал 17 passed / 1 failed: Firefox migration smoke превысил
ожидание. Изолированный Firefox migration spec прошёл 1/1; затем
`npx playwright test --project=desktop-firefox --project=android-chrome --workers=1 --retries=0 --repeat-each=3 e2e/legacy-outbox-migration.spec.ts`
прошёл 6/6. Это не скрывает исходный timeout. Точный CI документирующего HEAD
[`152d7d7`](https://github.com/Michael-edel/FitFocus/commit/152d7d729d84d9d86d1c3968911d075df23045d7)
завершился success в [run 38577353585](https://github.com/Michael-edel/FitFocus/actions/runs/38577353585):
1133 unit / 198 файлов, 540 browser passed / 83 skipped, audit сообщил 0
уязвимостей, guards, три typecheck, build и rollback/CAS (23 запроса) прошли.
Сохранены [browser diagnostics](https://github.com/Michael-edel/FitFocus/actions/runs/38577353585/artifacts/11903083122)
и [rollback artifact](https://github.com/Michael-edel/FitFocus/actions/runs/38577353585/artifacts/11902803403).
На кодовом SHA [`38d169c`](https://github.com/Michael-edel/FitFocus/commit/38d169c)
durable backup restore callback переведён на активные IDB request events; полный
lifecycle, staging и выпуск остаются открытыми.

## P0.8 — durable backup restore в активной транзакции, `38d169c`, 14.10.2026

`storage/durableStateBackup.ts::restoreDurableStateBackup` переведён с
последовательных `await` IndexedDB requests на три связанные стадии в активной
транзакции: чтение tombstone metadata, предварительное чтение всех candidate
primary keys, затем проверка и планирование всех отсутствующих `add` операций
из success-события последнего чтения. Различающийся existing row отменяет всю
транзакцию до commit; tombstone-фильтр, migration-gate reset и идемпотентный
повтор сохранены. Добавлен E2E через Settings для успешного импорта 64 значений,
outbox operation, quarantine и owner metadata, а также для полного rollback при
конфликте.

На кодовом SHA [`38d169c`](https://github.com/Michael-edel/FitFocus/commit/38d169c),
ветка `fix/durable-outbox`, прошли `npm run test:unit` — 1133/1133 в 198 файлах,
общий, domain-strict и storage-strict typecheck, production build и
`npx playwright test e2e/durable-backup-restore.spec.ts --project=desktop-firefox --project=android-chrome --workers=1 --retries=0`
— 4/4. Новый точный CI запускается после push; успех предыдущего run
38577353585 на SHA `152d7d7` не переносится на этот код. Полный P0.8 lifecycle,
staging и выпуск этим компонентом не закрыты.

## P0.5 — задержанный server preview семейного меню, `2c09825`, 14.10.2026

В `e2e/family-menu-durable.spec.ts` добавлен account-switch сценарий для
`/api/family/menu/generate`: ответ удерживается, пока другая вкладка принимает
аккаунт B, затем освобождается. Проверка подтверждает, что поздний preview не
создаёт familyMenu outbox operation и не меняет сохранённое меню аккаунта B.
В production-коде дефект не воспроизвёлся; это закрывает один пропуск browser
acceptance по family callbacks, но не весь P0.5.

Новый сценарий прошёл 3/3 на desktop Chromium, Firefox и WebKit. Полный
`family-menu-durable.spec.ts` прошёл 36/36 на тех же движках при
`workers=1,retries=0`; `npm run typecheck` и `git diff --check` прошли.
Точный CI предыдущего HEAD `23c8be6` завершился success в
[run 38586274014](https://github.com/Michael-edel/FitFocus/actions/runs/38586274014):
все шаги, включая E2E и rollback/CAS, прошли. E2E заняли 30 мин 43 сек, полный
job — около 33 мин. Новый тест не входил в тот run. Следующий PR CI
[38592830599](https://github.com/Michael-edel/FitFocus/actions/runs/38592830599)
проверяет SHA `1207f5c`, включающий `2c09825`; на момент добавления follow-up
он выполнялся на E2E. Остальные family callbacks, общий lifecycle, staging и
выпуск остаются открытыми.

## P0.4/P0.5 — задержанный durable family-menu read, `13e336d`, 14.10.2026

В `e2e/family-menu-durable.spec.ts` добавлен сценарий, удерживающий
`GET /api/family/menu/state` во время reload вкладки A. После того как соседняя
вкладка приняла аккаунт B, ответ A освобождается; проверка подтверждает, что
старый снимок не гидратирует меню и не меняет сохранённые durable rows. Это
проверяет guard на чтении вместе с последующим repository refresh; production
дефект не воспроизвёлся.

Новый сценарий прошёл 3/3 на desktop Chromium, Firefox и WebKit. После него
полный `family-menu-durable.spec.ts` прошёл 39/39 (`workers=1,retries=0`),
`npm run typecheck` и `git diff --check` прошли. PR CI
[38592830599](https://github.com/Michael-edel/FitFocus/actions/runs/38592830599)
проверяет предыдущий SHA `1207f5c` и не содержит этот follow-up; точный CI
`13e336d` ожидает push. Другие cloud callbacks, AI writers, staging и полный
lifecycle остаются открытыми.

## P0.5 — session guard пользовательской поддержки, `20a6d79`, 14.10.2026

В `SupportScreen` список, детали, создание тикета и ответ пользователя теперь
привязаны к login proof и IDB auth-fence. Серверные support handlers принимают
парные state account/session headers и проверяют их перед прикладными
операциями с тикетами/вложениями. Ответы помечаются Support protocol/guard и
эхом публичного scope; клиент требует совпадение и не применяет поздний
результат к другой сессии. Старые клиенты без scope сохраняют прежнюю
совместимость, но не получают эту защиту. Профильный контракт:
[support-session.md](support-session.md).

На кодовом SHA [`20a6d79`](https://github.com/Michael-edel/FitFocus/commit/20a6d799a6be02ff36e8be18b1210e1c10eb53a7)
полный unit suite прошёл 1148/1148 в 199 файлах; три support transport/server
файла — 29/29. Полный `family-callback-account-switch.spec.ts` прошёл 33/33 на
desktop Chromium, Firefox и WebKit при `workers=1,retries=0`; в том числе новый
задержанный support-list сценарий прошёл на каждом движке. Общий,
domain-strict и storage-strict typecheck, build, API invariants, auth scope,
schema parity (23 migrations/32 tables), privacy coverage (29 tables),
`git diff --check` и 424 локальные Markdown-ссылки прошли.

Скриншоты трёх desktop-движков сохранены вне репозитория; Chromium-снимок
визуально подтверждает видимый тикет B без тикета A. Browser plugin недоступен;
для проверки использован Playwright. [Предыдущий PR run 38604103098](https://github.com/Michael-edel/FitFocus/actions/runs/38604103098)
ещё выполнялся на родительском SHA `4f172a6` и не включает этот код. Точный CI
проверяется после push. Остальные P0.5 callbacks, полный lifecycle, staging,
merge и выпуск не закрыты.

## P0.8 — документирование финального контракта legacy-нормализатора, 14.10.2026

В [`legacy-migration.md`](legacy-migration.md) зафиксированы итоговые требования:
непустой `key`, строковый `value` только для `put`, запрет самого поля `value`
для `delete`, значения `0` для отсутствующих `baseVersion`/`retryCount`, проверки
присутствующих счётчиков и полный список семи причин карантина. Fingerprint
описан для нормализованного tuple без индекса и `retryCount`.

На branch HEAD [`659aebd`](https://github.com/Michael-edel/FitFocus/commit/659aebd9ac9e1b856caa3d660a53503311af0c69)
файлы `storage/legacyQueue.ts`, `tests/legacy_queue.test.ts` и
`tests/legacy_migration.test.ts` не менялись после `ce546c1`. Повторная команда
`npx vitest run tests/legacy_queue.test.ts tests/legacy_migration.test.ts`
прошла 124/124. Полный PR workflow
[38608666208](https://github.com/Michael-edel/FitFocus/actions/runs/38608666208)
проверяет тот же HEAD и пока выполняется. Это подтверждает локальные тесты
нормализатора/импорта, но не полный CI, P0.8 lifecycle, staging или выпуск.

## P0.5 — session guard административной панели, `5e163e6`, 15.10.2026

Все вызовы `AdminScreen`, включая CSV-журнал, теперь используют
`AdminSession`: исходный `loginGuard`, `/api/me`, публичные account/session
headers, проверяемые Admin response markers, IDB auth-fence и bounded response.
Компонент отменяет текущие запросы при размонтировании/смене guard. Серверный
guard проверяет proof до D1 role lookup и admin-session tracking; middleware
помечает ответы `/api/admin/*` и преобразует stale proof в 401. Admin GET/PATCH
обращений поддержки и `logout_all` также проверяют scope. Старые запросы без
proof остаются совместимыми.

Полный `npm run test:unit` прошёл 1203/1203 в 206 файлах; отдельно transport,
admin guard, middleware, `logout_all` и state-session regressions прошли 21/21.
Прошли общий, domain-strict и storage-strict typecheck, production build,
`check:admin-guards`, `check:api-invariants`, `check:auth-scope` и
`git diff --check`. Workflow [38684238196](https://github.com/Michael-edel/FitFocus/actions/runs/38684238196)
проверяет предыдущий SHA `5ea58df` и на момент публикации выполнял E2E; он не
подтверждает этот commit. Browser/admin account-switch acceptance, остальные
callbacks, полный P0.5 lifecycle, staging и выпуск остаются открытыми.

## P0.5 — session-bound export личной корзины, `bb4773b`, 15.10.2026

`ShoppingListCard` больше не открывает CSV URL с одной cookie. Файл строится из
уже загруженного account-scoped снимка; `assertReadSession` проверяет исходный
login guard до подготовки и перед скачиванием. CSV сохраняет серверные заголовки,
экранирование и формат количества. Серверный `/api/shopping/export` также
проверяет переданный proof перед `ensureUserRow` и помечает ответ Family markers;
старые запросы без proof остаются совместимыми.

Новый двухвкладочный acceptance прошёл 3/3 на desktop Chromium, Firefox и
WebKit: старая вкладка A после входа B не скачивает файл, экспорт B содержит
список B и не содержит A. Полный unit suite прошёл 1207/1207 в 208 файлах;
общий, domain-strict и storage-strict typecheck, production build,
`check:auth-scope`, `check:api-invariants`, `check:admin-guards` и
`git diff --check` прошли. CI [38685738198](https://github.com/Michael-edel/FitFocus/actions/runs/38685738198)
проверяет предыдущий SHA `acb561a` и на момент нового follow-up ещё выполняет
E2E; он не содержит `bb4773b`. Полный P0.5 lifecycle, остальные callbacks,
staging и выпуск остаются открытыми.

## P0.5 — session-bound logout и удаление аккаунта, `956cf96`, 15.10.2026

`deleteAccountSession` требует текущий `loginGuard`, сверяет аккаунт с Google
subject, проверяет guard до запроса и перед отправкой после prompt. `/api/account/delete`
теперь требует обязательный парный session scope через `requireScopedStateUser`
до правил/side effects и возвращает Account-Delete markers. Успех принимается
только с совпавшим echo scope. Удаление больше не отвечает `Set-Cookie`: сервер
отзывает аккаунтные сессии, а поздний ответ не должен стереть cookie соседнего
входа. Локальное удаление scoped на захваченный account; смена сессии между
удалением и logout не закрывает новую сессию.

`createLogoutSession` проверяет IDB guard перед локальным logout и передаёт
исходный scope. `/api/logout` отвергает несовпадающий proof до revoke и не
истекает cookie для scoped вызова. Legacy logout без scope сохраняет старую
совместимость и остаётся открытым риском до обновления всех вкладок.

Локально прошли 1215 unit / 208 файлов, общий/domain-strict/storage-strict
typecheck, production build, auth scope/API invariants/admin guards/privacy и
diff check. Точный workflow SHA `956cf96` ещё ожидает публикации; полный P0.5,
старые unscoped clients, OAuth/BFCache, staging и release gate не закрыты.

## P0.5 — обязательный session proof для invite redeem, `55bc09e`, 15.10.2026

`/api/invite/redeem` перешёл на `requireScopedStateUser`: отсутствие парных
account/session headers, неполная привязка и proof прежней сессии отклоняются
до чтения JSON и расходования invite. Тесты проверяют смену cookie/account,
отсутствующий и неполный proof, успешный consume с текущим scope и oversized
body. Старые сборки без proof получают 401 при регистрации с invite.

На точном локальном SHA `55bc09e` прошли полный unit suite — 1216/1216 в 208
файлах, `npm run typecheck`, `npm run check:api-invariants`, `npm run build`
и `git diff --check`. CI этого SHA ожидает push; staging-регистрация,
реальные OAuth/BFCache проверки и общий P0.5 lifecycle остаются открытыми.

## P0.5 — обязательный proof для family/shopping API, `2866985`, 15.10.2026

Все `/api/family/*` и `/api/shopping/*` endpoints теперь используют
`requireScopedStateUser`: отсутствующий, неполный или устаревший account/session
proof получает 401 до чтения тела запроса и прикладных D1-эффектов. Это включает
чтение/запись семьи и меню, CAS `family/menu/state`, список и отметки покупок,
старый bulk route и CSV export. Bulk, как и остальные routes, возвращает
проверяемые session markers. Тесты проверяют чужую cookie и старый запрос без
proof для каждого handler; бизнес-тесты передают корректный scope. Старым
сборкам нужно обновиться до rollout обязательного proof.

На точном локальном SHA
[`2866985`](https://github.com/Michael-edel/FitFocus/commit/2866985267adb3b9f36c40c28fe400e3696cee57)
полный unit suite прошёл 1234/1234 в 208 файлах; typecheck, API invariants,
auth-scope, production build и `git diff --check` прошли. Целевые family/session
тесты — 85/85; после форматирования bulk wrapper повторно прошли затронутые
тесты 34/34. Workflow [38691565994](https://github.com/Michael-edel/FitFocus/actions/runs/38691565994)
запущен для предыдущего SHA `e2e7020` и не проверяет этот код. CI точного SHA,
проверка в браузерах, staging rollout и полный family lifecycle остаются
открытыми.

## P0.5 — обязательный proof для AI и weekly-menu items, `7240fec`, 15.10.2026

`/api/ai` и `/api/weekly_menu/items` переведены на `requireScopedStateUser`.
Отсутствующий, неполный или устаревший account/session proof отклоняется с 401
до разбора JSON и прикладных эффектов. Это включает legacy-запрос без обоих
headers; старые открытые bundles нужно обновить до rollout. Целевые тесты
проверяют оба handlers, в том числе некорректное тело unscoped запроса.

На точном локальном SHA `7240fec` прошли профильные тесты (21/21), полный unit
suite (1240/1240 в 208 файлах), общий/domain-strict/storage-strict typecheck,
API invariants, auth-scope, schema parity, privacy coverage, production build и
`git diff --check`. Запущенный CI [38694820144](https://github.com/Michael-edel/FitFocus/actions/runs/38694820144)
проверяет только предыдущий `929573d`; его E2E не включает этот follow-up.
Точный CI, старые/новые bundles на staging и OAuth/menu lifecycle остаются
открытыми.

## P0.5 — обязательный proof для achievement API, `616f42c`, 15.10.2026

`GET /api/achievements` и `POST /api/achievements/check` используют
`requireScopedStateUser`. Отсутствующий, неполный или устаревший proof даёт 401
до feature/application effects; unscoped POST не разбирает body. Старые открытые
bundles нужно обновить до rollout.

На точном локальном SHA `616f42c` прошли профильные тесты (18/18), полный unit
suite (1242/1242 в 208 файлах), общий/domain-strict/storage-strict typecheck,
API invariants, auth-scope, schema parity, privacy coverage, production build и
`git diff --check`. Точный CI этого follow-up ожидает push; настоящий staging,
старые/новые bundles и BFCache остаются открытыми.

## P0.5 — обязательный proof для billing mutations, `28341ed`, 15.10.2026

`POST /api/billing/checkout` и `/api/admin/subscription` переведены на
`requireScopedStateUser`. Отсутствующий, неполный или устаревший proof даёт 401
до разбора body, Checkout creation, admin role lookup и записи тарифа. Старые
bundles без proof нужно обновить до rollout. API-invariants guard теперь также
требует обязательный helper; регрессии проверяют unscoped malformed body для
обоих endpoints.

На точном локальном SHA `28341ed` прошли профильные billing/admin тесты (16/16),
полный unit suite (1244/1244 в 208 файлах), общий/domain-strict/storage-strict
typecheck, API invariants, auth-scope, admin guards, schema parity, privacy
coverage, production build и `git diff --check`. Точный CI follow-up ожидает
push; старые bundles, staging и реальная Stripe-приёмка остаются открытыми.

## P0.5 — обязательный proof для mobile-token issuance, `a1e79ac`, 15.10.2026

`POST /api/mobile/token` теперь требует парный account/session proof через
`requireScopedStateUser`; unscoped legacy POST получает 401 до чтения source
session и mint bearer-токена. Beta-access regression передаёт валидный scope,
чтобы проверять именно access отказ, а API-invariants guard фиксирует mandatory
helper.

На точном локальном SHA `a1e79ac` прошли профильные тесты (9/9), полный unit
suite (1244/1244 в 208 файлах), общий/domain-strict/storage-strict typecheck,
API invariants, auth-scope, admin guards, schema parity, privacy coverage,
production build и `git diff --check`. Точный CI follow-up ожидает push; старый
Settings bundle, staging и настоящее устройство остаются открытыми.

## P0.5/P0.6 — обязательный proof для state/profile APIs, `3abb374`, 15.10.2026

`/api/state` GET/PUT/DELETE и `/api/profile` GET/PUT/PATCH используют
`requireScopedStateUser`. Отсутствующий, неполный или устаревший
account/session proof отклоняется до прикладного чтения/записи и, для writers,
до разбора тела. `StateSync` уже передаёт proof при profile refresh и отправке
outbox; сервер теперь отсекает старые unscoped bundles. Тесты покрывают каждый
verb, смену cookie, malformed body и отказ без side effects. API-invariants
фиксирует обязательный helper.

На точном кодовом SHA
[`3abb374`](https://github.com/Michael-edel/FitFocus/commit/3abb3740d8f550332b4d054e9d140de50999a6d0)
прошли профильные тесты (104/104), полный unit suite (1255/1255 в 208 файлах),
общий/domain-strict/storage-strict typecheck, API invariants, auth-scope,
admin guards, schema parity, privacy coverage, production build и
`git diff --check`. GitHub run [38699271370](https://github.com/Michael-edel/FitFocus/actions/runs/38699271370)
проверяет предыдущий опубликованный SHA `2206120`; точный CI этого кандидата
ожидает push. Старые/новые bundles на staging и общий callbacks lifecycle
остаются открытыми.

## P0.5 — обязательный proof для Support feedback, `bc3e7c2`, 15.10.2026

Пять user/admin handlers `/api/support/feedback` используют
`requireScopedStateUser`. Отсутствующий или неполный account/session proof
отклоняется с 401 до разбора тела, admin role lookup и прикладных запросов или
записей. Регрессии проверяют legacy GET/POST/PATCH с отсутствующим proof;
транспорт `SupportScreen` и административный `requestAdminResponse` уже
передают парный proof. В API-invariants добавлена проверка обязательного helper.

На точном кодовом SHA
[`bc3e7c2`](https://github.com/Michael-edel/FitFocus/commit/bc3e7c2c0be9009d017e928502d954af3d927c6f)
прошли профильные тесты (34/34), полный unit suite (1249/1249 в 208 файлах),
общий/domain-strict/storage-strict typecheck, API invariants, auth-scope,
admin guards, schema parity, privacy coverage, production build и
`git diff --check`. Проверка старых bundles, staging и полный P0.5 lifecycle
остаются открытыми. PR CI
[38699271370](https://github.com/Michael-edel/FitFocus/actions/runs/38699271370)
на опубликованном tip прошёл guards, unit, typechecks и build; E2E выполняется.

## P0.3/P0.5 — обязательный proof для bootstrap, `84e735c`, 15.10.2026

`GET /api/bootstrap` использует `requireScopedStateUser`: отсутствующая,
неполная или устаревшая account/session пара получает 401 до чтения профиля,
state и features. Действующий login transport уже передаёт scope и проверяет
bootstrap markers/ответ. Добавлен unscoped regression; beta-access тест теперь
передаёт валидный proof, чтобы проверять именно отказ доступа. API-invariants
фиксирует mandatory helper. Старые клиентские bundles должны обновиться до
rollout.

На точном кодовом SHA
[`84e735c`](https://github.com/Michael-edel/FitFocus/commit/84e735ccf58a1ae0f2dd3bea86a5af9b27993cb4)
прошли профильные bootstrap tests (29/29), полный unit suite (1256/1256 в 208
файлах), общий/domain-strict/storage-strict typecheck, API invariants,
auth-scope, admin guards, schema parity, privacy coverage, production build и
`git diff --check`. Текущий PR CI [38699271370](https://github.com/Michael-edel/FitFocus/actions/runs/38699271370)
проверяет предыдущий опубликованный tip `2206120`; точный CI этого кандидата
запустится после push. Старые bundles, login/OAuth на staging и полный callback
lifecycle остаются открытыми.
## Legacy intent без доказанного поколения — 15.10.2026

На локальной ветке `durable-outbox`, основанной на `24aa070`, старая операция
больше не становится автоматически отправляемой только из-за `baseVersion` из
legacy localStorage. Импортированная операция остаётся в IndexedDB как конфликт
`legacy-server-generation-unproven` с нормализованным `baseVersion: 0`.
Если новая миграция встречает ранее созданную pending/sending operation, она
атомарно снимает attempt, сбрасывает прежнее локальное подтверждение и отклоняет
поздний ack. Payload сохраняется в durable value только если это не вытесняет
активную операцию или другое значение; запись остаётся конфликтной и не может
быть claim-нута. Backup/restore сохраняет локальное намерение и его unresolved
статус. UI показывает причину по-русски.

Проверки текущего дерева: полный unit suite — 1279/1279 в 208 файлах; общий,
domain-strict и storage-strict typecheck; production build; настоящий old/new
bundle migration smoke — 7/7 desktop, Android, iPhone Safari и PWA проектов,
`workers=1`, `retries=0`; `git diff --check` прошёл. В первом полном прогоне
WebKit нашёл устаревшее ожидание теста, будто legacy source не содержит
изменяемый `retryCount`; проверка исправлена и повторная полная матрица прошла
7/7. Ранее опубликованный run `38745011909` проверял прежнюю ревизию и падал на
старом ожидании автоматической отправки legacy операции; точный CI текущей
правки начнётся после push.

Перед отправкой изменения добавлены в `docs/legacy-migration.md`,
`docs/state-generations.md` и `TASKS.md`. На этой базе открыто ещё 34 пункта
(20 P0, 7 P1, 7 прочих); этот follow-up закрывает только один критерий P0,
не общий lifecycle. Требуются точный CI, staging, безопасный ручной путь
разрешения конфликтов и интеграция в защищённую `main`.

## P0.8 — восстановление legacy-профиля через profile CAS, `5eeba7d`, 15.10.2026

Legacy-конфликт точного ключа `fitfocus_data_<accountId>_profile` теперь можно
разрешить в recovery-панели. Клиент требует capability `/api/me`, свежий guarded
GET `/api/profile`, совпадение account ID, профильный protocol/guard и целую
версию. «Оставить локальную версию» создаёт typed `profile` operation с этой
версией и отправляет её существующим profile CAS; «Принять серверную версию»
применяет снимок без PUT. Значение, outbox и migration ledger меняются в одной
IDB-транзакции; повторная миграция не воскрешает исходную операцию.

Проверка истории показала, что динамический key family-menu появился в typed
outbox после pinned legacy KV writer (`22a7788` → `405238b`); текущие family-menu
конфликты проходят отдельный typed recovery, неизвестные владельцы остаются
недоступны для разрешения.

На точном кодовом SHA
[`5eeba7d`](https://github.com/Michael-edel/FitFocus/commit/5eeba7de7031a16fc0bee12fc5317bca7535e285)
прошли полный unit suite (1291/1291 в 208 файлах), целевые legacy/state tests
(122/122), общий/domain-strict/storage-strict typecheck, auth-scope и API
invariants, production build, `git diff --check` и legacy migration E2E (14/14
на семи desktop/mobile/PWA-проектах, workers=2, retries=0). В iPhone PWA тест
откладывает штатное окно обновления, чтобы проверить доступность recovery панели
пока пользователь остаётся в приложении.

GitHub run
[`38762320204`](https://github.com/Michael-edel/FitFocus/actions/runs/38762320204)
проверял предыдущий опубликованный SHA `42e14c9` и был отменён при push новой
ревизии; он не включает этот profile recovery. Затем запущен CI `38766175287`
на `bf8bf40`; staging,
остальные callbacks, полная lifecycle-матрица и интеграция в защищённую `main`
остаются открытыми.

## Приёмка CI без автоматических повторов, 15.10.2026

В `playwright.config.ts` установлен `retries: 0` во всех средах: CI больше не
может скрыть flaky-сценарий успешным повтором. При `CI=true` выбранные Push/PWA
проверки прошли с настройкой из конфига: 5 passed, 1 штатный skip; отдельный
Firefox `pwa-update.spec.ts` — 1/1 без retries. `tests/push_session.test.ts` —
6/6. Это целевые проверки, полную матрицу они не заменяют.

CI run
[`38766175287`](https://github.com/Michael-edel/FitFocus/actions/runs/38766175287)
проверял SHA `bf8bf40` со старой настройкой `retries: 1` и был отменён при
отправке следующей ревизии. No-retry CI
[`38767363066`](https://github.com/Michael-edel/FitFocus/actions/runs/38767363066)
проверяет `f3bdccc`: dependency/schema/privacy/auth/API checks, unit, три
typecheck и build прошли; E2E ещё выполняется. Более старый run `38762320204`
для `42e14c9` также отменён при push новой ревизии.

## P0.5 — Huawei sync после повторного входа того же аккаунта, [`6fd0bb0`](https://github.com/Michael-edel/FitFocus/commit/6fd0bb0459f989f7c04de087d83d49ff6b7739e7), 15.10.2026

Добавлен двухвкладочный сценарий: пока старый вход account A ждёт ответа
Huawei sync, новая вкладка входит в тот же `accountId` с другим server session
id. После отпускания старого ответа его профиль и outbox остаются прежними;
проверяются обе вкладки. Это закрывает только локальную границу session
replacement для одного callback и не заменяет настоящий OAuth, BFCache,
устройство, staging или общий P0.5 lifecycle.

Точный тест прошёл 3/3 на desktop Chromium, Firefox и WebKit с
`workers=1,retries=0`; `git diff --check` прошёл. Полный CI этого SHA запускается
после push; run `38767363066` относится к родительскому `f3bdccc` и не включает
этот сценарий.

## P0.4 — recipe usage cache с областью аккаунта, [`baba226`](https://github.com/Michael-edel/FitFocus/commit/baba2261bf6610d0f76a22e0b84830ef1c53e093), 15.10.2026

Лимит пошаговой генерации рецептов раньше хранился в одном localStorage-ключе,
поэтому значение одного аккаунта влияло на другого. Счётчик теперь использует
ключ с encoded `accountId`; общий legacy-ключ не присваивается пользователю,
поскольку его владельца доказать нельзя. Ошибка localStorage не превращает
успешный guarded diary commit в ошибку рецепта. Корневой `usage.ts` повторно
экспортирует единственную реализацию из `domain/usage.ts`.

Новый unit набор проверяет изоляцию аккаунтов, отсутствие угадывания владельца
legacy-счётчика, отказ localStorage и поведение без accountId. Полный unit suite
прошёл 1295/1295 в 209 файлах; общий, domain-strict и storage-strict typecheck,
production build и `git diff --check` прошли. Два целевых account-switch E2E
сценария прошли 4 раза на Chromium/Firefox/WebKit; два ожидаемо пропущены
проектной конфигурацией. Точный GitHub CI запускается после push.

Закрыт только этот конкретный cache defect: общий критерий P0.4 остаётся открыт,
так как другие cloud callbacks/cache ещё требуют проверки. Всего в `TASKS.md`
остаётся 34 открытых пункта; staging и полная приёмка lifecycle/release не
выполнены.

## P0.5 — поздний weekly AI report при смене аккаунта, [`d2cbb25`](https://github.com/Michael-edel/FitFocus/commit/d2cbb25bb511ab518e95cb87f84baa90f9263f64), 15.10.2026

Новый сценарий удерживает `wis_text` ответ account A, пока в соседней вкладке
выполняется вход account B. После ответа проверяются неизменность weekly-report
value и outbox A/B, отсутствие late text в обеих вкладках и ошибок браузера.
Это дополняет прежнюю проверку logout: два сценария закрывают разные переходы.

Новый E2E прошёл 3/3 на desktop Chromium, Firefox и WebKit с
`workers=1,retries=0`; `weekly_auto_engine` и `ai_retry` unit-наборы — 11/11,
общий typecheck и `git diff --check` прошли. Точный GitHub CI должен быть
проверен на опубликованном HEAD. Остальные AI/family callbacks, staging и полный
P0.5 lifecycle остаются открытыми.

## P0.5 — AI retry metadata с областью аккаунта, [`18af4ee`](https://github.com/Michael-edel/FitFocus/commit/18af4ee48cf1cde471dd85cea892715a04691d2d), 15.10.2026

Последнее AI-действие теперь записывается в ключ аккаунта из самого action,
поэтому начальная генерация плана при регистрации не попадает в общий ключ до
обновления активного scope. Hook читает status/action по явному accountId и
скрывает сохранённое состояние предыдущего профиля уже на первом render после
переключения. Старый unscoped action принимается только если его поле `userId`
точно совпадает с выбранным аккаунтом; status без owner не мигрируется.

Полный unit suite прошёл 1300/1300 в 209 файлах; общий, domain-strict и
storage-strict typecheck, production build и `git diff --check` прошли. Адресный
Coach retry account-switch E2E прошёл 3/3 на desktop Chromium, Firefox и WebKit
с `workers=1,retries=0`; account B не показывает Retry: Coach из account A.
Точный GitHub CI этого SHA ожидает push. Это закрывает лишь локальный scope
retry metadata; общий P0.5, остальные AI/family callbacks, staging и lifecycle
остаются открытыми.

## P0.5 — явный accountId для AI action reads, [`0646e3d`](https://github.com/Michael-edel/FitFocus/commit/0646e3ddc699692d2f05e1bbe1b130e01b8cd8c0), 15.10.2026

После account-scoped записи retry metadata все проверки текущего действия в
Coach, Plateau и общем retry теперь читают запись по явному `currentUser.id`.
Это убирает зависимость сохранения/проверки текущей AI-попытки от момента, когда
React effect переключит ambient storage scope.

Профильные unit-наборы прошли 20/20; общий typecheck, production build,
`git diff --check` и Coach retry account-switch E2E прошли. E2E — 3/3 на desktop
Chromium, Firefox и WebKit с `workers=1,retries=0`. Полный unit suite 1300/1300
в 209 файлах прошёл на непосредственно предшествующем компоненте `18af4ee`;
полный CI для нового HEAD запускается после push. Остальные AI/family callbacks,
staging и общий P0.5 lifecycle остаются открытыми.

## P0.4 — повторная проверка profile conflict в Safari, `62bd28c`, 15.10.2026

После локальной смены имени сервер возвращает 409; тест проверяет, что локальная
операция и payload переживают reload. Полный повторный набор завершился **24/24**:
по 8 запусков на desktop WebKit, iPhone Safari и iPhone PWA, `workers=1`,
`retries=0`. Ни один запуск не дал `pageerror`.

Это подтверждает отсутствие воспроизведения в данном сценарии и на текущем HEAD,
но не устанавливает причину исторического WebKit `/api/me due to access control
checks`. Пункт P0.4 остаётся открытым; общий CORS-фильтр не добавлялся.

## P0.4 — production ID рецепта и черновик при cross-tab session switch, [`a67ed17`](https://github.com/Michael-edel/FitFocus/commit/a67ed177f7214bf41e02259f1602d2e72d8ddc9c), 15.10.2026

Новый recipe account-switch acceptance воспроизвёл два дефекта. Production
bundle компилировал optional call `globalThis.crypto?.randomUUID?.()` в код,
который обращался к необъявленному `n`; из-за исключения успешный AI-анализ не
открывал черновик. Генерация ID переведена на явную проверку метода и вызов.
Второй дефект был в том, что render key основывался только на guard текущей
вкладки: он не менялся, когда соседняя вкладка принимала новую active-session в
IndexedDB. Теперь workspace наблюдает авторитетную IDB-сессию, получает
advisory-сигнал через BroadcastChannel и сохраняет polling/focus fallback.
Поэтому account-aware экраны перемонтируются при смене активной сессии; channel
не несёт account data и не заменяет IndexedDB.

Проверки на `a67ed17`: полный unit suite — 1305/1305 в 210 файлах; общий,
domain-strict и storage-strict typecheck прошли; production build прошёл как
часть Playwright preview; новый unsaved-recipe-draft account-switch E2E прошёл
3/3 на desktop Chromium, Firefox и WebKit с `workers=1,retries=0`;
`git diff --check` прошёл. Точный GitHub CI ожидается после push. Эта локальная acceptance
закрывает только recipe-draft переход; остальные callbacks/cache, staging,
устройства и полный P0.4 lifecycle остаются открытыми.

## P0.4 — черновик измерения при cross-tab session switch, [`beedbee`](https://github.com/Michael-edel/FitFocus/commit/beedbeea594b8d501032ab10dfe80ad79f2f67fc), 16.10.2026

В соседней вкладке активируется account B, пока на экране прогресса account A
заполнен несохранённый вес. При смене active-session render key черновик
сбрасывается; snapshot профиля A и его операции outbox остаются неизменны,
account B не показывает значение из черновика A. Этот сценарий закрывает
browser acceptance только для черновика замера, а не весь audit P0.4.

Первый прогон также показал предупреждение Recharts при первоначальном размере
`-1×-1` двух responsive charts. Для первого paint теперь задаётся положительная
оценка размера по viewport; ResizeObserver затем устанавливает фактический
размер. Повторная browser matrix не дала предупреждений или ошибок.

Проверки на `beedbee`: progress-draft account-switch E2E — 3/3 на desktop
Chromium, Firefox и WebKit, `workers=1,retries=0`; полный unit — 1305/1305 в
210 файлах; общий, domain-strict и storage-strict typecheck прошли; production
build, выполняемый Playwright preview, и `git diff --check` прошли. Новый HEAD
ожидает push и точный GitHub CI. Остальные callbacks/cache, устройства, staging
и полный P0.4 lifecycle остаются открытыми.

## P0.4 — выбранная дата дневника при сбросе UI, [`a8d20ee`](https://github.com/Michael-edel/FitFocus/commit/a8d20ee), 16.10.2026

Аудит account-scoped UI-кэшей обнаружил, что полный сброс интерфейса не удалял
`fitfocus.nutrition.selected-day.v1:<accountId>`. Ключ добавлен в
`clearAppUiStorage`; сброс теперь возвращает дневник к выбору даты по умолчанию.
Регрессионный тест подтверждает, что очищается дата только выбранного аккаунта,
а дата другого аккаунта и синхронизированный профиль остаются на месте.

Проверки на кодовом коммите `a8d20ee`: адресный unit — 3/3; полный unit suite —
1306/1306 в 210 файлах; общий, domain-strict и storage-strict typecheck,
production build и `git diff --check` прошли. CI точного опубликованного HEAD
проверяется после push; общий аудит callbacks/cache P0.4 остаётся открытым.

## P0.4 — черновик профиля в старой вкладке после смены аккаунта, [`02a12e2`](https://github.com/Michael-edel/FitFocus/commit/02a12e2), 16.10.2026

Регрессионный сценарий воспроизвёл, что после входа account B в соседней вкладке
старая вкладка account A перемонтировала Settings и снова показывала сохранённый
черновик профиля A. Теперь Settings восстанавливает account-scoped draft только
после проверки текущего IndexedDB account. При несовпадении экран использует
профильный snapshot, не перезаписывает сохранённый черновик A и не показывает его
в B; reload при активном A по-прежнему восстанавливает введённые данные.

Проверки на `02a12e2`: новый Settings account-switch E2E — 3/3 на desktop
Chromium/Firefox/WebKit; recipe и progress account-switch E2E — 6/6; полный unit
suite — 1306/1306 в 210 файлах; общий, domain-strict и storage-strict typecheck,
production build и `git diff --check` прошли. CI точного опубликованного HEAD
проверяется после push; общий P0.4 audit остаётся открытым.

## P0.4 — account-scoped UI cache до подтверждения IndexedDB-сессии, [`6c53b68`](https://github.com/Michael-edel/FitFocus/commit/6c53b68fadb48ccc798b0ac25b8c197d5d18327d), 16.10.2026

Новый account-switch E2E сначала воспроизвёл, что старая вкладка account A
продолжает показывать сохранённый вес `98.765` после входа account B в соседней
вкладке. Причина: account-scoped UI-кэши загружались по `currentUser.id`, хотя
активная IndexedDB-сессия уже принадлежала B. Workspace теперь открывает
восстановление кэша только после совпадения активного durable account и
пользователя интерфейса. Пока сессия не подтверждена, UI-кэш скрыт, setters и
save effects закрыты; кэш A не удаляется. Проверка применяется к dashboard
weight/PDF, nutrition search и выбранной дате, camera preference, plan controls,
course UI и уже закрывает ранее исправленный Settings draft.

Проверки на `6c53b68`: до исправления новый тест падал, показывая `98.765`; после
исправления полный draft account-switch matrix прошёл 15/15 на desktop Chromium,
Firefox и WebKit с `workers=1,retries=0`. Полный unit suite — 1308/1308 в 210
файлах; общий, domain-strict и storage-strict typecheck, production build и
`git diff --check` прошли. CI точного опубликованного HEAD проверяется после
push. Общий P0.4 остаётся открытым до проверки остальных callbacks/cache,
staging и полного lifecycle.

## P0.4 — кэш экранов прогресса и покупок, [`2e2c1d1`](https://github.com/Michael-edel/FitFocus/commit/2e2c1d165e2d138d6d426052137b284e0500c381), 16.10.2026

Follow-up распространяет проверку активной IndexedDB-сессии на localStorage
настройки графика и разделов прогресса, а также на fallback-отметки списка
покупок. При несовпадении владельца view state возвращается к безопасным
значениям, кэш не читается и не перезаписывается; после возврата аккаунта его
настройки доступны снова. Progress account-switch acceptance теперь загружает
сохранённый показатель A, подтверждает его сброс в старой вкладке после входа B
и проверяет сохранность исходного account A cache.

Проверки на `2e2c1d1`: draft account-switch matrix — 15/15 на desktop Chromium,
Firefox и WebKit с `workers=1,retries=0`; полный unit suite — 1308/1308 в 210
файлах; общий, domain-strict и storage-strict typecheck, production build и
`git diff --check` прошли. Полный P0.4 audit остаётся открытым до проверки
остальных callbacks/cache, staging и общего lifecycle.

## P0.5 — блокировать поздний PDF download после смены аккаунта, [`e7d5a5c`](https://github.com/Michael-edel/FitFocus/commit/e7d5a5c), 16.10.2026

Аудит обнаружил, что PDF-отчёты захватывали данные аккаунта в обработчике,
затем ждали динамический импорт и загрузку шрифта, после чего вызывали
`doc.save()` без повторной проверки активной сессии. Это могло скачать файл со
снимком аккаунта A уже после переключения на B. Общая проверка PDF session
guard теперь вызывается непосредственно перед сохранением файла. Её подключили
к краткому и подробному health report, сравнению прогресса, архиву и недельному
WIS-отчёту; root и экранные обработчики также останавливаются при смене сессии
после динамического импорта.

Регрессионный unit задерживает загрузку шрифта, меняет session и подтверждает,
что `save` не вызван; отдельный случай подтверждает обычное скачивание при
неизменной сессии. Проверки на `e7d5a5c`: полный unit suite — 1311/1311 в 211
файлах, общий/domain/storage strict typecheck, production build и
`git diff --check` прошли. Точный GitHub CI ожидается после push. Этот follow-up
закрывает лишь один PDF callback; общий P0.5, staging и lifecycle остаются
открытыми.

Browser follow-up [`ad77aec`](https://github.com/Michael-edel/FitFocus/commit/ad77aec)
проверяет смену аккаунта на уровне приложения: Playwright удерживает реальный
запрос шрифта после нажатия «Краткий PDF», открывает account B в соседней
вкладке, дожидается его active-session и отпускает запрос. В account A не
возникает download; обе вкладки остаются без runtime errors и Vite overlay.
Сценарий прошёл 3/3 на desktop Chromium, Firefox и WebKit без retries; общий
typecheck и `git diff --check` прошли. Это acceptance одного PDF-пути, а не
закрытие общего P0.5. Точный CI нового HEAD запускается после push.

## P0.6 — поздний `/api/profile` ответ после смены аккаунта, [`e5a22df`](https://github.com/Michael-edel/FitFocus/commit/e5a22df), 16.10.2026

Новый account-switch E2E нажимает «Перезагрузить из облака» в Settings аккаунта A,
удерживает ответ GET `/api/profile`, активирует B в соседней вкладке и только
после смены общей IndexedDB-сессии выпускает ответ A с HTTP 200 и прежним
профилем A. Старая вкладка показывает session notice, а не данные профиля;
профиль B и durable value A остаются неизменны, B не получает чужую outbox
операцию. Обе страницы проходят проверки console/pageerror и Vite overlay.

Локально: 3/3 на desktop Chromium, Firefox и WebKit, `workers=1,retries=0`;
общий typecheck и `git diff --check` прошли. Воспроизводимого дефекта в этом
сценарии нет, поэтому изменён только browser acceptance. Это подтверждает один
путь reload профиля, но не закрывает остальные callbacks, старые writers,
реальный BFCache и staging. Точный CI этого SHA запускается после push.

## P0.4 — account-scoped кэш урока и викторины, 16.10.2026

Account-switch E2E предварительно сохраняет для account A урок и выбранный ответ
викторины, открывает курс, затем активирует B в соседней вкладке. После
переключения старая вкладка показывает уведомление о смене сессии, модалка A
закрыта, исходный кэш A не перезаписан; курс B открывается без урока и ответа A.
Обе страницы проходят проверки runtime errors и Vite overlay.

Сценарий прошёл 3/3 на desktop Chromium, Firefox и WebKit с
`workers=1,retries=0`; общий typecheck и `git diff --check` прошли. Скриншоты до
и после переключения визуально подтверждают выбранный ответ A и обычный список
уроков B. Дефект в production-коде не воспроизведён, добавлена acceptance одного
cache-пути. Общий P0.4 audit, остальные callbacks, staging и полный lifecycle
остаются открытыми.

## P0.6 — позднее подтверждение сохранения профиля, 16.10.2026

Account-switch E2E редактирует профиль A в Settings и удерживает его durable
PUT `/api/profile` после отправки. Соседняя вкладка активирует B; только после
появления session notice старой вкладки тест отпускает HTTP 200 с account/session
markers A. Outbox сохраняет исходный opId и payload A в состоянии `sending`:
ответ старой попытки не подтверждает запись под активной сессией B. Профиль B и
его очередь остаются неизменны; ошибок runtime и Vite overlay нет.

После подтверждения, что B не получил ack, тест штатно выгружает обе старые
страницы через `about:blank` при активных mock routes. Затем A входит снова с
новой server session. Удержанная повторная отправка сохраняет исходный opId и
payload, но получает новый `attempt.sessionEpoch`; HTTP-запрос содержит proof
новой сессии A. Только после его 200 очередь очищается. Таким образом тест
проверяет и безопасное сохранение при B, и восстановление прежнего намерения A.

Полный сценарий прошёл 3/3 на desktop Chromium, Firefox и WebKit с
`workers=1,retries=0`; общий typecheck прошёл. В первой диагностической версии
с `page.close()` Vite выдал один `ECONNREFUSED /api/state`; после перехода на
штатный `about:blank` unload повторная матрица прошла без proxy errors. В
production-коде дефект не воспроизведён, это regression acceptance для P0.6.
Остальные callbacks, writers, реальный BFCache и staging остаются открытыми.

## P0.6 — профильный sender после BFCache, 16.10.2026

Новый сценарий `profile-durability.spec.ts` удерживает первый durable PUT профиля,
отправляет `pagehide`, затем возвращает страницу синтетическим
`pageshow.persisted`. Сессия аккаунта подтверждается заново; операция сохраняет
тот же `opId` и payload, но получает новый `attempt.sessionEpoch` и отправляется
с новым server-session proof. После успешного ответа новой попытки запись
удаляется; позднее завершение старого mock-запроса не возвращает её в очередь.

Проверка прошла 3/3 на desktop Chromium, Firefox и WebKit при
`workers=1,retries=0`. Это проверяет app wiring и sender на синтетическом
BFCache lifecycle, но не реальное восстановление страницы на устройстве.
Изменений production-кода не потребовалось; P0.6 остаётся открытым для других
callbacks/writers, старых bundles и staging. CI предыдущего SHA `b49dd3f`
не содержит этот новый тест.

## P0.6 — мобильная проверка profile reload и полная профильная матрица, `d6946af`, 16.10.2026

Первый полный прогон `profile-durability.spec.ts` после предыдущей правки
локатора выявил неверное ожидание теста: поле настроек находится ниже первого
viewport на iPhone Safari/PWA. Значение профиля и outbox восстанавливались
правильно; runtime-ошибок не было. Проверка заменена с `toBeInViewport` на
`toBeVisible`, при этом тест по-прежнему сверяет точное значение поля через
`toHaveValue` и прежний opId в durable outbox. Production-код не менялся.

После изменения целевые проверки прошли 3/3 на desktop WebKit, iPhone Safari и
iPhone PWA. Полная profile matrix прошла 63/63 на семи Playwright-проектах при
`workers=1,retries=0`. Это mock-API acceptance: она не подтверждает полный E2E
набора, настоящий BFCache, OAuth, staging или deployment. Точный CI `d6946af`
проверяется после push.

## P0.5 — восстановление семейного списка после отказа toggle, `9e7f67d`, 16.10.2026

Новый регрессионный E2E удерживает первую попытку изменения checkbox, затем
возвращает ошибку на более позднюю попытку. До исправления React откатывался к
предыдущему optimistic значению, которое могло не подтверждаться сервером;
сценарий падал с отмеченным checkbox при исходном серверном состоянии `false`.
Теперь, пока account/session и `familyId` исходной попытки актуальны, callback
перечитывает список для того же зафиксированного `week` и отображает проверенный
снимок. Если повторное чтение не удаётся, остаётся прежний локальный fallback;
устаревшая попытка состояние не меняет.

Новый сценарий и смежная проверка позднего shopping-check после A → B прошли
3/3 на desktop Chromium, Firefox и WebKit (`workers=1,retries=0`). Полный unit
suite — 1318/1318 в 212 файлах; общий, domain-strict и storage-strict typecheck,
production build и `git diff --check` прошли. CI точного опубликованного HEAD,
staging и реальный backend остаются отдельными проверками; общий P0.5 не закрыт.

## P0.4 — поздняя загрузка семьи после same-account login, `88ca7e3`, 16.10.2026

Новый acceptance удерживает GET семейного контекста первой server session,
затем в соседней вкладке принимает новый `serverSessionId` того же account и
открывает другой семейный контекст. Старая вкладка показывает session notice;
после освобождения старый ответ не восстанавливает прежний экран. Счётчик
запросов допускает повторные GET новой сессии, но проверяет ровно один запрос
старой сессии.

Новый сценарий прошёл 3/3 на desktop Chromium, Firefox и WebKit
(`workers=1,retries=0`). Четыре соседних callback сценария прошли 12/12 в тех же
браузерах; `git diff --check` прошёл. Production-код не менялся, воспроизводимого
дефекта не выявлено. Общий P0.4 audit, оставшиеся callbacks/cache, staging и
полный lifecycle остаются открытыми; точный CI проверяется после push.

## P0.5 — поздний invite-ответ после same-account login, `b1c01ae`, 16.10.2026

Новый acceptance удерживает `POST /api/family/invite` старой server session,
затем в соседней вкладке принимает новый `serverSessionId` того же account.
После освобождения старый invite-код не отображается ни в прежней, ни в новой
вкладке; старая вкладка сохраняет session notice и не запускает новый GET семьи.
Фикстура дополнительно проверяет, что mutation ушла только с исходным session id,
а новая семья читается с новым proof.

Сценарий прошёл 3/3 на desktop Chromium, Firefox и WebKit
(`workers=1,retries=0`); полный локальный typecheck и `git diff --check` прошли.
Точный CI предыдущего SHA `c1aef67` завершился failure только на typecheck:
в новой family-context fixture отсутствовал обязательный `releasedMembers`.
Поле добавлено в `b1c01ae`; production-код не менялся, подтверждённого runtime
дефекта нет. Точный CI исправленного HEAD проверяется после push; общий P0.5 и
остальные family/AI/state callbacks остаются открытыми.

## P0.5 — поздний family-create ответ после same-account login, `3c49439`, 16.10.2026

Новый acceptance удерживает создание семьи из account A до ответа, затем
активирует новую server session того же account в соседней вкладке. После
освобождения старого ответа активная вкладка остаётся в своей семье; прежняя
сессия не запускает повторную загрузку family context и не выдаёт achievement.
Фикстура проверяет старый proof запроса и новый proof чтения контекста.

Три same-account acceptance (family context GET, invite, create) прошли 9/9 на
desktop Chromium, Firefox и WebKit (`workers=1,retries=0`); общий typecheck и
`git diff --check` прошли. Production-код не менялся, runtime-дефекта не выявлено.
CI #1409 создан для предыдущего SHA `aeb68e0`, поэтому новый create-тест требует
отдельного точного CI после push. Общий P0.5 и остальные callbacks остаются
открытыми.

## P0.5 — поздний family-join ответ после same-account login, 16.10.2026

Добавлен E2E для удержанного `POST /api/family/join`: после повторного входа
того же аккаунта с новым `serverSessionId` поздний ответ старой сессии не
публикует результат, не перечитывает семейный контекст и не выдаёт achievement.
Старая вкладка сохраняет session notice, а её форма скрыта. Фикстура проверяет,
что запрос отправлен только с исходным session id. Это уточняет существовавший
A → B тест: ожидание видимого поля после session guard заменено на проверку,
что устаревшая форма отсутствует; production-код не менялся.

Четыре same-account acceptance (family context GET, invite, create и join),
вместе со смежным A → B family-join acceptance, прошли 15/15 на desktop
Chromium, Firefox и WebKit (`workers=1,retries=0`). Полный typecheck и
`git diff --check` прошли; CI нового опубликованного HEAD запускается после
push. Общий P0.5, оставшиеся callbacks, staging, полный lifecycle и выпуск
остаются открытыми.

## P0.5 — поздний family-member PATCH после same-account login, 16.10.2026

Добавлен acceptance для удержанного `PATCH /api/family/member`: пока запрос
старой server session ожидает ответа, в соседней вкладке тот же account входит
с новым `serverSessionId` и загружает новую семью. После освобождения старого
ответа прежняя вкладка сохраняет session notice и не запускает новый family GET;
семейный экран новой сессии остаётся неизменным. Фикстура проверяет исходные
`familyId` и session proof. Production-код не менялся, подтверждённого runtime
дефекта не обнаружено.

Новый same-account acceptance вместе с проверками captured family target и A → B
прошёл 9/9 на desktop Chromium, Firefox и WebKit (`workers=1,retries=0`). Полный
typecheck и `git diff --check` прошли. CI #1413 проверяет опубликованный HEAD
`cb44a2b` и не включает этот локальный тест; точный CI follow-up запускается
после push. Остальные callbacks, staging и полный P0.5 lifecycle остаются
открытыми.

## P0.5 — поздний GET семейного списка после same-account reauth, 16.10.2026

Добавлен задержанный GET `/api/shopping/list`: после повторного входа того же
аккаунта новая сессия получает отдельный маркер списка; освобождённый ответ
старой сессии не появляется в её интерфейсе. Проверка прошла 3/3 на desktop
Chromium, Firefox и WebKit. Совместный прогон семи same-account family callback
acceptance прошёл 21/21 с `workers=1/retries=0`; typecheck и `git diff --check`
прошли. Производственный код не менялся, ошибка не обнаружена.

## P0.8 — позднее чтение family-menu snapshot после same-account reauth, 16.10.2026

Добавлен E2E для удержанного GET `/api/family/menu/state`: та же учётная запись
принимает новый `serverSessionId` и `sessionEpoch`, после чего освобождается
ответ прежней сессии. Значения, family-menu snapshot и outbox остаются равны
снимку до ответа. Сценарий прошёл 3/3 на desktop Chromium, Firefox и WebKit.
В `openSwitchAccount` добавлена поддержка тестовой identity с другим session id;
runtime-код не менялся. CI #1415 завершился failure на опубликованном HEAD
`64e46d6`: build/typecheck/unit прошли, E2E завершился с 72 failed и 651 passed;
локальные follow-up в эту ревизию не входили. Точный CI после push, staging и
old/new bundle lifecycle остаются открытыми проверками.

## P0.5 — поздний AI weekly-menu ответ после same-account login, 16.10.2026

Добавлен acceptance для удержанного `/api/ai` `weekly_menu`: пока AI-ответ
старой server session ожидает, тот же account входит с новым `serverSessionId`
в соседней вкладке. После освобождения ответа не меняются профиль, durable outbox,
achievement state или экран новой сессии. Фикстура проверяет, что вызов AI ушёл
с исходным account/session proof. Production-код не менялся.

Same-account и A → B acceptance прошли 6/6 на desktop Chromium, Firefox и WebKit
(`workers=1,retries=0`). Полный typecheck и `git diff --check` прошли. CI #1413
проверяет опубликованный `cb44a2b` и не включает этот тест; точный CI для всех
локальных follow-up запускается после push. Остальные AI/family callbacks,
staging и полный P0.5 lifecycle остаются открытыми.

## P0.5 — поздний ответ AI Совета после same-account login, 16.10.2026

Добавлен acceptance для удержанного ответа `council_chairman`: после того как
тот же account входит с новым `serverSessionId` в соседней вкладке, история
содержит исходный вопрос, но старый ответ не меняет history/outbox и не
показывается в новой сессии. Фикстура проверяет, что AI-запрос использовал только
исходный account/session proof. Production-код не менялся.

Same-account и A → B AI Council acceptance прошли 6/6 на desktop Chromium,
Firefox и WebKit (`workers=1,retries=0`). Полный typecheck и `git diff --check`
прошли. CI #1413 проверяет опубликованный `cb44a2b` и не включает этот сценарий;
точный CI для накопленных локальных follow-up запускается после push. Другие AI
и family callbacks, staging и полный P0.5 lifecycle остаются открытыми.

## P0.5 — поздний Push status после same-account login, 16.10.2026

Добавлен acceptance для удержанного Settings `GET /api/push/status`: соседняя
вкладка повторно входит в тот же account с новым `serverSessionId`, получает
отличающийся delivery-status marker, затем освобождается ответ старой сессии.
Старый marker не появляется и не заменяет состояние новой сессии. Фикстура
проверяет session id обоих запросов; production-код не менялся.

Same-account и A → B delayed-status сценарии прошли 6/6 на desktop Chromium,
Firefox и WebKit (`workers=1,retries=0`). Полный typecheck и `git diff --check`
прошли. CI #1413 проверяет опубликованный HEAD `cb44a2b` и не содержит этот
follow-up. Реальный push provider, устройство, staging и общий P0.5 lifecycle
остаются открытыми.

## P0.5 — семейный shopping-check после same-account login, 16.10.2026

Добавлен acceptance для удержанного family `PATCH /api/shopping/check`: соседняя
вкладка повторно входит в тот же account с новым `serverSessionId` и загружает
другую семью до ответа старой операции. Поздний ответ не переносит оптимистичную
отметку в новую семью, не вызывает `shopping_item_checked` achievement и не
запускает новый GET старой сессии. Проверены исходные `familyId` и session proof;
production-код не менялся, runtime-дефект не выявлен.

Новый сценарий вместе с family shopping-list account-switch, shopping achievement
account-switch и отказным retry acceptance прошёл 12/12 на desktop Chromium,
Firefox и WebKit (`workers=1,retries=0`). Полный typecheck и `git diff --check`
прошли. CI #1413 для опубликованного HEAD `cb44a2b` всё ещё выполняет E2E и не
содержит два последующих локальных family follow-up; их точный CI запускается
после push. Остальные callbacks, staging и полный P0.5 lifecycle остаются
открытыми.

## Проверка текущих family callbacks и logout, 16.10.2026

Account-switch acceptance уточнены по фактическому поведению старой вкладки:
после смены сессии она показывает блокирующее session notice, поэтому ввод
создания семьи и CSV-кнопка должны отсутствовать; CSV экспортируется только из
активной вкладки и содержит список её аккаунта. Временное окно теста delayed
shopping-check теперь начинается непосредственно перед освобождением отложенного
ответа, чтобы не учитывать фоновые GET, начатые до него.

Выборка из 36 family create/CSV/same-account reauth/logout сценариев прошла на
Chromium, Firefox и WebKit последовательными прогонами: сначала 34/36, после
уточнения границы ответа оставшаяся проверка прошла 3/3. Профильные unit-тесты —
185/185; общий, domain-strict и storage-strict typecheck, admin guards, production
build и `git diff --check` прошли. Новый SHA ещё не отправлен; точный CI и staging
остаются открытыми.

## P0.5 — поздний GET семейного меню после same-account reauth, 16.10.2026

Добавлен acceptance для удержанного `GET /api/family/menu`: та же учётная запись
входит с новым `serverSessionId`, новая вкладка отображает меню своей сессии, затем
освобождается ответ старой. После него меню новой сессии остаётся видимым, а
старый маркер не появляется. Первоначальный тестовый сбой был только в локаторе:
он требовал точного совпадения, хотя маркер отображается вместе с пунктом списка
и граммовкой. Уточнённый локатор прошёл сценарий 3/3 на desktop
Chromium/Firefox/WebKit (`workers=1`, `retries=0`); общий `npm run typecheck`
прошёл. Производственный код не менялся, runtime-дефект не обнаружен.

Проверка выполнена командой:
`npm run test:e2e -- --project=desktop-chromium --project=desktop-firefox --project=desktop-webkit --workers=1 e2e/family-callback-account-switch.spec.ts --grep "shared family-menu read from the previous same-account session"`.
Локальная проверка не включает полный E2E и staging. CI run #1417 на базовом SHA
`568c559` ещё выполняет E2E и не содержит этот follow-up; точный CI нового SHA
нужно проверить после push.

## P0.5 — поздний preview семейного меню после same-account reauth, 16.10.2026

Добавлен acceptance для задержанного `POST /api/family/menu/generate`: тот же
аккаунт получает новый `serverSessionId` и `sessionEpoch`, затем освобождается
preview старого входа. Outbox и сохранённый family-menu snapshot остаются равны
снимку до ответа, старая попытка не вызывает commit, server mutation или
achievement. Сценарий прошёл 3/3 на desktop Chromium/Firefox/WebKit; общий
`npm run typecheck` прошёл. Production-код не менялся, подтверждённого runtime-
дефекта не выявлено.

Проверка выполнена командой:
`npm run test:e2e -- --project=desktop-chromium --project=desktop-firefox --project=desktop-webkit --workers=1 e2e/family-menu-durable.spec.ts --grep "delayed family server preview after same-account reauthentication"`.
Точный CI этого follow-up запускается после push; staging и полный lifecycle
остаются открытыми.

## P0.5 — поздний AI-ответ семейного меню после same-account reauth, 16.10.2026

Добавлен acceptance для удержанного ответа `/api/ai` `family_menu`: та же
учётная запись входит с новым `serverSessionId` и `sessionEpoch`, затем
освобождается старый ответ. Outbox и сохранённое семейное меню остаются равны
снимку до ответа; старый callback не создаёт запись и не запускает achievement.
Сценарий прошёл 3/3 на desktop Chromium/Firefox/WebKit; общий
`npm run typecheck` прошёл. Production-код не менялся, runtime-дефект не выявлен.

Проверка выполнена командой:
`npm run test:e2e -- --project=desktop-chromium --project=desktop-firefox --project=desktop-webkit --workers=1 e2e/family-menu-durable.spec.ts --grep "delayed family AI response after same-account reauthentication"`.
Точный CI follow-up запускается после push; общий P0.5, staging и полный
lifecycle остаются открытыми.

## P0.8 — повторная проверка legacy-нормализатора, 16.10.2026

На кодовом SHA `b362cc8` сверены финальное описание legacy-записи, реализация
`storage/legacyQueue.ts`, unit-покрытие и контракт в `docs/legacy-migration.md`.
Подтверждены непустой ключ, строка для put, отсутствие `value` у delete,
нормализация отсутствующих числовых полей в `0`, отклонение присутствующих
невалидных значений и все семь причин карантина. Fingerprint вычисляется по
`[type, key, valueOrNull, baseVersion]` и не включает `retryCount`.

`npm run test:unit -- tests/legacy_queue.test.ts tests/legacy_migration.test.ts`
прошёл: 128/128 тестов в двух файлах. Код не менялся. Результат подтверждает
контракт нормализации; импорт с владельцем из подтверждённого `/api/me`, fencing
старых writers, полный PWA lifecycle, staging и P0.8 выпуск остаются открытыми.

## P0.8 — владелец и атомарность миграции, 16.10.2026

Проверены `storage/stateSync.ts` и `storage/legacyMigration.ts` по согласованным
правилам владельца и атомарности. Runtime формирует кандидатов владельца только
для ключей с точным префиксом свежего аутентифицированного аккаунта; глобальные
и чужие ключи не назначаются текущему аккаунту. Отсутствующий или неоднозначный
владелец отправляется в карантин. Мигратор копирует подтверждённую карту
владельцев до асинхронной работы, а затем внутри одной IndexedDB-транзакции
повторно проверяет префикс ключа и существующее владение value/key-state. В этой
же транзакции сохраняются импортированная операция, ledger, quarantine evidence,
прогресс снимка и связанные изменения value/key-state. Отправка разрешается,
только если подтверждены текущий all-client writer fence, неизменность исходного
снимка, полный аудит снимков и отсутствие необработанных предыдущих снимков.

`npm run test:unit -- tests/legacy_migration.test.ts tests/state_sync_legacy_migration.test.ts`
прошёл: 73/73 теста. Покрыты отказ от угадывания владельца, неоднозначное и
конфликтующее владение, фиксация карты владельцев до смены аккаунта, rollback
при отказе записи ledger/quarantine и запрет отправки без актуального writer
fence. Production-код не менялся. Локально проверены эти требования миграции;
полный old/new-bundle lifecycle, точный CI локальных follow-up и staging
остаются открытыми.

## PWA — разбор WebKit pageerror при обновлении, 16.10.2026

Разобран сохранённый browser trace CI run `38249434753` для SHA `5b90249`.
Первый запрос `/api/family/menu/state` получил ожидаемый `503`; затем при
`controllerchange` Playwright зафиксировал WebKit pageerror для fetch того же
PUT в rollback-клиенте. Событие пришло во время навигации на новую страницу,
а повторный серверный ответ последовал уже после него. Проверка точных файлов
из rollback-архива `98d4910` показывает, что `requestJson` выполняется внутри
`try/catch` метода `StateSync.drain`, который переводит сетевую ошибку в retry;
это локализует эффект как отмену повторного fetch на границе reload, но не
является свидетельством потери durable intent. Общий фильтр ошибок не добавлен.

На текущем HEAD `e2e/pwa-rollback-install.spec.ts` детерминированно дожидается
первого `503`, удерживает следующий PUT в `sending` во время активации и после
reload проверяет неизменность opId/payload, отмену старого запроса и отсутствие
`unhandledrejection`/`window.error`. Тест прошёл 4/4 повторов desktop WebKit;
отдельная Chromium/Firefox/WebKit матрица прошла 3/3 без retries. Production
код не менялся. Опубликованный CI run `38845192574` на SHA `568c559` завершился
failure на E2E; исправления тестовых ожиданий ниже не входят в этот SHA.
Staging/device acceptance остаются открытыми.

## CI #1417 — разбор E2E failure и тестовые исправления, 16.10.2026

Run `38845192574` проверял PR merge SHA `70cb44f` и завершился с 27 failed,
706 passed и 247 skipped; audit, schema/privacy/auth/API guards, unit,
typecheck и build были успешны. В 12 account-switch сценариях тесты ждали
контент старой учётной записи во вкладке, которая уже показывала корректный
stale-session status. Multi-tab acceptance сам переводил соседнюю вкладку в
stale state: общий mock отвечал на state writes невалидным `200` без protocol/
scope headers. Storage и preview тесты испытывали тот же mock-побочный эффект;
в durable settings acceptance теперь используется scoped `503`, а там, где
тест не проверяет outbox, mock подтверждает state writes.

Локальные исправления проверены: callback account-switch 12/12 на desktop
Chromium/Firefox/WebKit; concurrent multi-tab без Web Locks 7/7 browser/PWA
проектов; settings reload и quota rollback 6/6 на desktop WebKit, iPhone Safari
и iPhone PWA; preview-origin 3/3 на WebKit; задержанный family state read 1/1
на iPhone Safari. Здесь менялись E2E фикстуры/ожидания, production-код не
затронут. Изменения закоммичены и отправлены в `fix/durable-outbox` как
[`e4ced68`](https://github.com/Michael-edel/FitFocus/commit/e4ced6861cfeb6038e9a8e28f0c8c3ff91b2b0d0).
Точный [CI run #1418](https://github.com/Michael-edel/FitFocus/actions/runs/38852235508)
поставлен в очередь для этого SHA. Следующие gates — полный CI,
staging/device; до них P0.8/P0.9 остаются открытыми.

## P0.9 — commit на сервере с потерянным HTTP-ответом, 16.10.2026

Browser-acceptance в `e2e/storage-durability.spec.ts` фиксирует settings PUT
в mock-сервере, обрывает первый HTTP-ответ и возвращает 409 на повторной
отправке той же baseVersion. Тест проверяет, что исходные opId и payload
сохраняются как конфликт, серверный snapshot версии 1 остаётся видимым, а
confirmedVersion не продвигается без проверенного ack. Это не подменяет
потерянный ответ успешным локальным совпадением значений.

Сценарий прошёл 7/7 проектов Playwright (desktop Chromium/Firefox/WebKit,
Android Chrome/PWA, iPhone Safari/PWA, `retries=0`); `tests/state_sync.test.ts`
прошёл 56/56, `npm run typecheck`, E2E production build и `git diff --check`
прошли. Изменение тестовое, production-код не менялся. Коммит
[`d028bc4`](https://github.com/Michael-edel/FitFocus/commit/d028bc4d5a14e0711b40a8b10e446cdc9e382511)
создан локально поверх опубликованного `706910f`, но ещё не отправлен.
CI #1421 проверяет предыдущий опубликованный SHA и пока выполняет E2E;
он не подтверждает эту проверку. Mock не подтверждает staging, OAuth,
реальный Service Worker или выпуск.

## P0.9 — повторный захват после остановки отправляющей вкладки, 16.10.2026

`e2e/storage-durability.spec.ts` проверяет живой сценарий с общей IndexedDB:
первая вкладка сохраняет settings intent и claim в состоянии `sending`, затем
выгружается и закрывается. Новая вкладка стартует со временем за пределом
30-секундной lease, повторно захватывает ту же операцию с новым attempt ID и
owner и подтверждает её через mock API. Проверяются неизменные opId/payload,
baseVersion, версия сервера и пустая очередь после подтверждения. Существующий
`tests/durable_outbox.test.ts` отдельно проверяет, что ответ старого attempt после
reclaim не подтверждает и не удаляет операцию.

Browser-сценарий прошёл 7/7 desktop Chromium/Firefox/WebKit, Android Chrome/PWA
и iPhone Safari/PWA (`workers=1`, `retries=0`); outbox unit suite прошёл 28/28,
`npm run typecheck` и `git diff --check` прошли. Переход через `about:blank` перед
закрытием использует штатный lifecycle mock fixture и в финальном полном matrix
прогоне не оставил proxy `ECONNREFUSED`. Изменены только E2E и документация;
production-код не менялся. Полный CI нового HEAD, staging, реальные устройства,
OAuth, BFCache и общая release acceptance остаются открытыми.

## P0.9 — retryable intent после reload, 16.10.2026

Новая browser acceptance возвращает scoped HTTP 503 с `Retry-After: 60`, ждёт
записи retry metadata в IndexedDB, выполняет reload и проверяет прежние opId,
payload, baseVersion и `nextAttemptAtMs`. До срока повторного запроса нет; после
сдвига тестового времени та же операция отправляется повторно и подтверждается
сервером. Первая матрица выявила, что WebKit успевал прочитать начальное pending
состояние до обработки 503; ожидание теперь синхронизировано по durable
`retryCount`, а не по преждевременному status.

Итоговая матрица прошла 7/7 desktop Chromium/Firefox/WebKit, Android Chrome/PWA
и iPhone Safari/PWA (`workers=1`, `retries=0`); `npm run typecheck` и
`git diff --check` прошли. Изменены только browser mock/E2E и документация;
production-код не менялся. Это transient HTTP recovery, не доказательство
физического отключения сети или staging. Полный CI текущей опубликованной ревизии
проверяется отдельно.

## P0.9 — поздний ответ истёкшего sender после cross-tab ack, 16.10.2026

Browser acceptance удерживает первый PUT после claim, затем во второй вкладке
без Web Locks сдвигает время за lease и повторно захватывает тот же opId с новым
attempt/owner. Вторая попытка получает серверный ack; после этого освобождается
старый запрос, который получает 409 на прежнюю baseVersion. Проверяется, что
поздний ответ не воскрешает операцию и не меняет confirmedVersion или durable
value. Browser test подтверждает фактическую доставку старого ответа;
`durable_outbox.test.ts` отдельно проверяет транзакционный guard старого attempt.

Сценарий прошёл 7/7 desktop Chromium/Firefox/WebKit, Android Chrome/PWA и iPhone
Safari/PWA (`workers=1`, `retries=0`); root typecheck прошёл. Изменены только E2E
и документация, production-код не менялся. Mock API не заменяет staging D1 и
реальные browser/device lifecycle. Точный CI последующих локальных commits ещё
не запущен; текущий опубликованный CI проверяет предыдущий SHA.

## P0.9 — транспортный обрыв и восстановление intent после reload, 16.10.2026

Коммит [`e3f0312`](https://github.com/Michael-edel/FitFocus/commit/e3f0312ec84adce4c71a2e554c73fa8284df7c9c)
добавляет browser acceptance, где settings PUT сначала завершается транспортным
abort без HTTP-ответа, а повтор получает корректно scoped `503 Retry-After`.
Тест проверяет durable `opId`, payload, baseVersion и retry deadline до и после
reload; до deadline повтор не уходит, после восстановления связи сервер
подтверждает ту же операцию. Все семь desktop/mobile/PWA Playwright-проектов
прошли без retries (`workers=1`, `retries=0`); `npm run typecheck` и
`git diff --check` прошли. Production-код не менялся.

Это mock transport acceptance, а не проверка физического offline, настоящего
устройства, Service Worker при реальном отсутствии сети или staging. Полная
матрица P0.9 и точный CI нового HEAD остаются открытыми.

## P0.4 — повторная проверка сессии после чтения weekly report, 16.10.2026

Аудит обнаружил ранний возврат существующего отчёта без повторной проверки
captured login-session после чтения IndexedDB. Если session менялась во время
чтения, устаревший callback мог вернуть старый отчёт вызывающему экрану, хотя
запись отчёта уже оставалась защищена commit guard. `ensureWeeklyReportWithAI`
теперь повторно вызывает session guard сразу после чтения и до любого возврата.

Новый регрессионный unit-тест моделирует истечение captured login во время
чтения существующего отчёта и подтверждает `WEEKLY_REPORT_SESSION_CHANGED`;
AI generation не запускается. Целевой unit suite прошёл 4/4, root typecheck и
`git diff --check` прошли локально. Полный CI нового commit и browser acceptance
остаются необходимыми; общий аудит cloud callbacks/cache и P0.4 открыты.

## P0.4 — account-owned дневник при переключении вкладки, 16.10.2026

Коммит [`8279976`](https://github.com/Michael-edel/FitFocus/commit/8279976fb140cd58aa2c00853b4f5eea2b30e02b)
расширяет существующую browser acceptance: после анализа еды в account A вторая
вкладка активирует B. Проверяется, что A diary value остаётся в A IndexedDB, не
попадает в B value, запись и открытые food insight/correction surfaces исчезают
из старой вкладки, а nutrition screen B не показывает блюдо A.

Сценарий прошёл 3/3 desktop Chromium/Firefox/WebKit без retries; Android/iPhone
mobile/PWA проекты штатно пропущены из-за двухвкладочной природы проверки.
`npm run typecheck` и `git diff --check` прошли. Изменён только browser test;
production-код не менялся. Это одна cache acceptance и не закрывает общий аудит
P0.4, остальные callbacks, staging или полный P0.9. Точный CI нового HEAD нужно
подтвердить отдельно.

## P0.4 — family callbacks привязаны к неделе запроса, `1543cc9`/`e4a078f`, 16.10.2026

`useFamilyCloud` теперь сохраняет неделю начала для family-context и shopping
чтений, отметки покупки и генерации меню. Если неделя меняется до применения
результата, устаревший снимок не меняет UI; запрашивается снимок актуальной
недели. Это закрывает rollover-гонку при долгом запросе через границу недели.

Три E2E удерживают старые context/list ответы и shopping PATCH, переводят
browser clock на следующую неделю и проверяют актуальное отображение и
восстановление списка без ложной ошибки смены сессии. Полный
`family-session.spec.ts` прошёл 33/33; недельные сценарии — 9/9 на desktop
Chromium, Firefox и WebKit без retries. Root, domain-strict и storage-strict
typecheck, `git diff --check` прошли. Проверка локальна на mock API; staging и
общий P0.4/P0.5 аудит остаются открытыми. Точный CI локального стека ожидает
push.

## P0.9 — сузить Android PWA Cloud badge acceptance, `f066fde`, 16.10.2026

Полный CI run [`38883305792`](https://github.com/Michael-edel/FitFocus/actions/runs/38883305792)
для опубликованного `d3d8cbd` завершился: audit, guards, unit, typecheck и build
успешны; E2E — 816 passed / 254 skipped / 1 failed. Сбой возник в Android PWA
тесте принятия серверного settings-конфликта: проверка подтверждала, что
операция `_settings` удалена и серверное значение применено, но дополнительно
требовала отсутствия любых account-wide pending операций. Cloud badge
агрегирует очередь всего аккаунта. Проверка теперь сравнивает badge с
pending/sending операциями аккаунта, оставляя строгие assertions для settings.
Целевой тест прошёл 13/13 без retries на desktop Chromium, Firefox, WebKit и
Android PWA; `npm run typecheck` и `git diff --check` прошли. Исправление меняет
только тест. Точный CI нового SHA запускается после push; staging и полный P0.9
release acceptance остаются открытыми.

## P0.9 — уточнить Firefox baseline и WebKit reload aborts, `0de4865`, 16.10.2026

Полный CI run [`38888606723`](https://github.com/Michael-edel/FitFocus/actions/runs/38888606723)
для `fe44643` завершился с 835 passed / 254 skipped / 3 failed; audit, guards,
unit, typecheck и build прошли. Firefox-сбой ожидал точное количество старых
shopping-list reads до того, как старая вкладка обработала подтверждённую смену
сессии; baseline теперь снимается после сообщения о смене сессии, а held
response по-прежнему проверяет, что старые данные не применяются.

Два WebKit/PWA сбоя возникли из-за сообщений `due to access control checks` при
навигации во время in-flight `/api/me` или `/api/shopping/list`, а также
удержанного `/api/family/menu/state`. Эти прерывания допускаются только для трёх
указанных GET путей в WebKit, не более одного каждого; все ошибки вне allowlist
остаются фатальными. Локальный набор прошёл 10/10 на допустимых browser/PWA
профилях с четырьмя штатными skips; три WebKit/PWA повтора — 3/3; Firefox
reauth callback — 5/5. `npm run typecheck` и `git diff --check` прошли. Изменены
только E2E ожидания; точный CI нового SHA запускается после push.

## P0.8 — повторная проверка Firefox PWA и опубликованного preview, 16.10.2026

На checkout `8dfab604c97f90f6720e8185f0366bbe61b9383d` тест
`e2e/pwa-update.spec.ts` прошёл 5/5 на `desktop-firefox`, `workers=1,retries=0`.
Это подтверждает текущую повторяемость, но не закрывает историческую причину
таймаута: отдельный точный CI ещё выполняет E2E. В run
[`38913791205`](https://github.com/Michael-edel/FitFocus/actions/runs/38913791205)
audit, schema/privacy/auth/API, unit, три typecheck и build прошли; E2E завершился
839 passed / 251 skipped / 2 failed. Desktop WebKit зарегистрировал
`/api/ai due to access control checks` во время account switch. iPhone PWA после
offline reopen не отправил settings: сервер принял только `weekly_reports`, без
failed state writes, pending HTTP requests или page errors. Это оставляет причину
сбоя PWA-синхронизации неустановленной.

Read-only GET smoke branch preview `fix-durable-outbox.fitfocus.pages.dev`
подтвердил точный JS SHA `8dfab604c97f90f6720e8185f0366bbe61b9383d`.
`/api/env` и анонимный `/api/me` ответили 200, `user: null`; анонимные
`/api/bootstrap`, `/api/profile`, `/api/state` и `/api/push/status` ответили 401
без redirect и `Set-Cookie`. `/api/env` показывает пустые Google Client ID и
`requireInvite=false`. Запрос OAuth start не выполнялся. Это частичная
проверка deployment/origin, не D1, APP_URL, callback или staging-приёмка.

`wrangler.toml` объявляет один top-level D1 binding `DB` (`fitfocus`, ID
`061ae786-9341-4bd7-8efe-025dd1bac6d5`) без environment-specific overrides.
Cloudflare Pages поддерживает `env.preview`, но не branch-based configuration;
Wrangler file является source of truth только если deployment перешёл на этот
режим. Без текущей Pages dashboard/API конфигурации фактический D1 preview и
его изоляция неизвестны. Живые D1-запросы не выполнялись; staging остаётся
открытым.

## P0.8/P0.9 — follow-up двух E2E-сбоев CI #1463, 16.10.2026

Трасса WebKit показывает `due to access control checks` для автоматического
`/api/ai` старой вкладки во время подтверждённой смены аккаунта; запрос старой
вкладки не был зафиксирован тестовым сервером. Account-switch acceptance теперь
допускает не более одного точного такого сообщения только в `desktop-webkit`, а
все остальные ошибки остаются фатальными.

Трасса PWA показала стартовую автоматическую генерацию и запись `weekly_reports`.
Offline acceptance теперь ждёт завершения этой независимой стартовой операции и
пустой outbox до сохранения settings offline; failure attachment включает
содержимое очереди и подтверждённую версию. Полная offline матрица прошла 7/7,
`iphone-pwa` повторён 5/5 без retries. В одном промежуточном повторе settings успешно
синхронизировался, но WebKit сообщил прерванный GET `/api/me` при переключении
offline; этот единичный точный abort теперь допускается только в `iphone-pwa`.
Desktop WebKit account-switch прошёл 5/5 без retries.
Остальные page errors, неотправленные settings и лишние запросы остаются
фатальными. Причина первоначального CI timeout пока не доказана; точный полный
CI follow-up ещё не запускался.

## P0.5 — поздний недельный AI-отчёт после повторного входа в тот же аккаунт, `63d6a0b`, 16.10.2026

В существующем account-switch E2E был переход A → B для недельного отчёта,
но не повторная авторизация того же аккаунта с новым `serverSessionId`.
Добавлен сценарий, который удерживает старый `wis_text`, открывает вторую
вкладку с новой серверной сессией и ждёт, пока она создаст собственный отчёт.
После освобождения прежнего ответа сравниваются report value, outbox и число
сетевых записей; поздний результат не появляется в UI.

Новый сценарий прошёл 6/6 на desktop Chromium, Firefox и WebKit,
`workers=1,retries=0`. `npm run typecheck` (включая admin guards) и
`git diff --check` прошли. Production-код не менялся. Проверка использует mock
API и не заменяет настоящий OAuth, устройство или staging. Точный полный CI
этого HEAD подтверждается после отправки коммита `63d6a0b`.

## P0.6 — область online/visibility profile recovery, 17.10.2026

Проверка callback-гарантий нашла, что cloud recovery запускался при наличии
обоих ID, не сверяя, что текущий профиль и облачная сессия принадлежат одному
аккаунту. Его 60-секундный cooldown также был общим для всего времени жизни
приложения, поэтому мог подавить восстановление после смены аккаунта или
повторного входа. Теперь событие игнорируется при несовпадении `cloudUserId` и
`currentUserId`, а cooldown привязан к account/profile и ключу активной сессии
(`accountId`, `serverSessionId`, `sessionEpoch`).

Профильные unit-тесты прошли 3/3; полный unit suite — 1334/1334 в 212 файлах.
Общий typecheck с admin guards, domain-strict и storage-strict typecheck,
production build и `git diff --check` прошли локально. Изменений API или D1 нет.
Проверка локальная; точный CI новой ревизии ожидается после push, общий P0.6,
реальный BFCache и staging остаются открытыми.

## P0.8/P0.9 — follow-up CI #1465: недельная семья и WebKit reload, 16.10.2026

Опубликованный `f09b356` завершил CI run
[`38924431808`](https://github.com/Michael-edel/FitFocus/actions/runs/38924431808)
с ошибкой E2E; все проверки до браузерной матрицы прошли. Desktop WebKit упал
на проверке ошибок после reload/account switch: консоль содержала
`/api/state due to access control checks`. Трасса не содержит соответствующего
завершённого `/api/state` запроса. До поправки тест повторился 5/5. После reload
добавлено ожидание пустой durable outbox; console listener теперь сохраняет
source location и failure diagnostics для запросов `/api/state`. Целевой тест
прошёл 3/3 (`desktop-webkit`, один worker, без retries); причина сообщения
остаётся непроверенной до точного CI.

В iPhone Safari weekly-shopping trace API вернул 200 для `week=2026-10-26`, но
тело содержало старую mock-запись. Тест выставлял целевую неделю для mock после
смены browser clock, и автоматический запрос мог получить старый fixture до
переключения. Три сценария rollover (family context, shopping response и
shopping check) теперь заранее настраивают целевую неделю, затем сдвигают часы
и сверяют вычисленную неделю. Они прошли 9/9 на `iphone-safari`, один worker,
без retries. Исправлены только E2E-fixtures и ожидания; production-код не менялся.
После push точный CI [`38931381772`](https://github.com/Michael-edel/FitFocus/actions/runs/38931381772)
для `c44027fe1a97f3e808319151e0f4ddca06ceea93` прошёл audit, guards, unit,
typechecks и build, но упал в одном desktop WebKit сценарии: reload оборвал
незавершённый фоновый weekly AI `wis_text` `/api/ai` запрос. В тест добавлено
ожидание завершения этого запроса и сохранения отчёта до reload; локальные типы
прошли, а целевой WebKit-сценарий прошёл 3/3 в отдельных запусках без retries.
Дополнительный запуск `--repeat-each=5` прошёл первый тест, но следующие четыре
не подключились к preview-серверу; результат повторения проверен отдельными
запусками.

## P0.6 — fail-closed profile refresh guard, 17.10.2026

Проверка профиля нашла fallback в `reloadUserFromCloud`, который вызывал
`stateSync.refreshProfile()` и терял возвращаемый state-sync `readGuard`. Из-за
этого потребитель мог применить облачный снимок, не повторно проверив proof
сессии и не приняв guard чтения. Теперь reload требует guarded refresh, отклоняет
guard другого аккаунта, повторно подтверждает текущую сессию и сохраняет именно
этот guard до синхронного применения профиля. Value-only fallback и
value-only convenience API в state-sync удалены.

Целевые `profile_sync` и `profile_sender` тесты прошли 35/35, включая
устаревший и чужой guard;
`npm run typecheck` и `git diff --check` прошли. Точный PR CI #1525 ещё проверяет
предыдущий SHA `a83416c` и пока находится на E2E. Новая правка ждёт отправки,
чтобы не отменить этот запуск; staging и весь P0.6 остаются открытыми.

## P0.5 — поздний achievement GET после same-account reauth, 17.10.2026

Новый regression удерживает achievement GET, повторно авторизует тот же аккаунт
в соседнем контексте с новым `serverSessionId`, затем отпускает старый ответ.
До исправления callback попадал в `catch` по локальному login generation и
очищал уже загруженный achievement snapshot, хотя transport верно отклонял
устаревший readGuard. Теперь UI-публикация и очистка после GET дополнительно
проверяют, что точный attempt guard всё ещё актуален в IndexedDB; старый ответ
не очищает и не заменяет снимок. POST/check завершение также повторно проверяет
точный guard перед публикацией unlock.

Regression прошёл после воспроизведённого падения; achievement client и transport
tests прошли 30/30, `npm run typecheck` и `git diff --check` прошли. PR CI #1527
для предыдущего SHA `bb8c6c5` выполняет E2E; этот фикс ожидает push и собственного
точного CI. Другие callbacks и полная P0.5 lifecycle-приёмка остаются открыты.

## P0.6 — не показывать ошибку profile commit для устаревшей сессии, 17.10.2026

У guarded profile commit локальный login-generation мог оставаться прежним,
когда другая вкладка уже активировала новую серверную сессию. При отказе старой
IndexedDB-записи `catch` всё ещё показывал ошибку синхронизации. Перед этим UI
эффектом теперь проверяются исходный `readGuard` и актуальность локального
profile edit; ошибка состояния хранилища остаётся видимой, если guard всё ещё
текущий.

Целевые profile persistence/sync/sender tests прошли 36/36, `npm run typecheck`
и `git diff --check` прошли. PR CI #1529 для предыдущего SHA `2d1a24b` выполняется;
этот follow-up ожидает push и отдельной точной проверки. Общий P0.6, реальные
BFCache и staging остаются открытыми.

## P0.5 — не публиковать weekly reports после смены AI-действия, 17.10.2026

В weekly AI retry проверка последнего действия выполнялась до чтения списка
отчётов, но после асинхронного `loadReports` проверялась только локальная
сессия. Если за время чтения пользователь запускал новое AI-действие, старый
callback мог опубликовать список поверх текущего состояния. После чтения теперь
повторно проверяются session, scope и `actionId` того же retry.

Добавлен regression, который меняет последнее действие во время `loadReports` и
проверяет, что старый список не попадает в UI. Целевой файл прошёл 9/9, полный
unit suite — 1338/1338, три typecheck-профиля и production build прошли.
Точный CI новой ревизии запускается после push. Общий P0.5 и staging остаются
открытыми.

## P0.5/P0.6 — weekly report attempt и read-session guard, 17.10.2026

Фоновая генерация и ручной retry используют один `WeeklyReportGenerationRef`,
но фоновый путь раньше присваивал маркер лишь при вызове AI и не сверял его
после чтения списка. Если retry заменял маркер, старый фоновый ответ всё ещё
мог пройти session-only commit guard или опубликовать старый список. Теперь
попытка захватывает общий маркер до получения proof; `canCommit`, AI response,
`loadReports` и обновление UI требуют, чтобы и сессия, и точный маркер оставались
текущими. Перед UI publication после чтения дополнительно подтверждается точный
`readGuard` в IndexedDB, чтобы same-account reauthentication в другой вкладке
не принималась за прежнюю локальную сессию. Catch очищает только собственный
маркер и не показывает session-change как ошибку.

Три unit-регресса проверяют замену владельца во время AI generation и чтения
списка, а также повторную авторизацию в том же аккаунте во время чтения. В
фоновом пути маркер захватывается до proof; manual retry дополнительно сравнивает
последний `actionId`. Два weekly AI report unit-файла прошли 18/18, полный unit suite — 1342/1342, browser
acceptance `weekly-ai-report-session.spec.ts` — 6/6 на desktop
Chromium/Firefox/WebKit без retries. Общий typecheck, domain-strict,
storage-strict и production build прошли. Точный CI новой ревизии ожидает push;
общий P0.5/P0.6, staging и полный lifecycle остаются открыты.

## P0.5 — не показывать stale ошибку weekly menu, 17.10.2026

Scoped weekly-menu transport отклоняет AI ответ после смены server session,
однако catch ранее превращал этот ожидаемый session отказ в обычную ошибку
генерации. Теперь soft/session ошибки не отображаются как неудачная генерация;
loading всё равно снимается для текущего локального действия.

Регрессия `weekly_menu_generation_feature.test.ts` прошла 4/4. Account-switch и
same-account reauthentication сценарии `ai-callback-account-switch.spec.ts`
прошли 6/6 на desktop Chromium/Firefox/WebKit без retries. Полный unit suite —
1343/1343; общий typecheck, domain-strict, storage-strict, production build и
`git diff --check` прошли. Общий P0.5, остальные callbacks и staging остаются
открыты.

## P0.5 — подавлять session/auth отказ семейной AI-генерации, 17.10.2026

В `useFamilyMenu` отказ `AiSession` из-за `SESSION_READ_AUTH`,
`LOGIN_SESSION_CHANGED` или изменившейся сессии ранее попадал в общий `catch` и
показывался как ошибка генерации. Новый E2E сначала воспроизвёл `SESSION_READ_AUTH`
на экране после специально возвращённого scoped 401. Теперь ожидаемые session/auth
отказы не отображаются как ошибка меню; остальные ошибки генерации и сохранения
по-прежнему видны, а `finally` снимает loading для ещё текущей попытки.

Регрессия и same-account reauthentication сценарий прошли 6/6 на desktop
Chromium/Firefox/WebKit без retries. Полный unit suite — 1343/1343; общий,
domain-strict и storage-strict typecheck, production build и `git diff --check`
прошли. P0.5, другие callbacks, staging и общий lifecycle остаются открытыми.

## P0.5 — не логировать ожидаемый auth-отказ анализа фото еды, `3bc6581`, 17.10.2026

Scoped AI transport переводит HTTP 401 в `SessionReadError('auth')`. Фотоанализ
не записывал такую ошибку в дневник или профиль, но отправлял её в общий
`logError`, из-за чего ожидаемый отказ выглядел как ошибка приложения. Новый
тест сначала воспроизвёл вызов `logError` до исправления. Теперь `session` и
`auth` завершают текущую обработку без диагностического сообщения; `access`,
ошибки изображения и другие реальные сбои продолжают логироваться. Loading
сбрасывается, diary, usage и insight не записываются.

Профильный unit-набор прошёл 12/12; полный unit suite — 1346/1346. Общий,
domain-strict и storage-strict typecheck, production build и `git diff --check`
прошли. Точный CI опубликованного родителя `dfe9b42` (run #1541) на момент
фиксации ещё выполнялся: статические шаги, unit и build прошли, E2E был в работе.
Затем `3bc6581` и документация опубликованы под HEAD `55b3484`; точный PR CI
#1543 проходит, предварительные guards/unit/typechecks/build успешны, E2E ещё
выполняется. Фотоанализ здесь проверен unit-тестом; реальный OAuth и staging
этим локальным результатом не подтверждаются.
P0.5, остальные callbacks, staging и общий lifecycle остаются открытыми.

## P0.5 — не показывать scoped auth-отказ анализа рецепта как alert, `d774018`, 17.10.2026

В enhanced-анализе рецепта `RecipesScreen.handlePick` раньше подавлял только
`SessionReadError('session')`. При scoped HTTP 401 transport выдавал
`SessionReadError('auth')`; если IDB-сессия всё ещё была текущей, повторная
проверка проходила и catch показывал пользователю alert с `SESSION_READ_AUTH`.
Новый браузерный тест воспроизвёл этот alert до исправления.

Общая `isExpectedAiSessionFailure` распознаёт только типизированные `session`
и `auth` ошибки. Её используют enhanced-рецепт и пакетный анализ еды; отказы
`access`/`protocol` остаются видимыми. Scoped-401 E2E после исправления прошёл
3/3 на desktop Chromium, Firefox и WebKit без retries; проверено отсутствие
alert, recipe draft и pageerror. Unit suite — 1347/1347, общий,
domain-strict и storage-strict typecheck прошли; `npm run build` прошёл как шаг
подготовки Playwright preview. `git diff --check` прошёл.

Точный CI опубликованного HEAD `55b3484` (run #1543) на момент проверки
выполнялся: guards, unit, typechecks и build прошли, E2E был в работе. Полный CI
`d774018` запускается после push. Тестовый scoped 401 не подтверждает реальный
OAuth или staging. P0.5, остальные callbacks, staging и общий lifecycle открыты.

## P0.6 — сообщать об отказе durable profile write в замерах и wearable, `646b8b4`, 17.10.2026

`patchProfileInCloud` сообщает об отказе IndexedDB через `false`, не обязательно
бросая исключение. На экране Progress ручные замеры и импорт wearable раньше
игнорировали этот результат; импорт из текста не показывал ошибку, а выбор
JSON/CSV-файла очищался до завершения записи. В Settings выбор и отключение
wearable также не проверяли отказ. Новые E2E сценарии сначала воспроизвели
молчаливый отказ импорта текста и отсутствующее сообщение ошибки.

Теперь Progress проверяет результат каждого профильного patch, показывает
ошибку при неудаче, оставляет ручной ввод и текст импорта. Выбранный файл не
очищается до успешного commit; при отказе он доступен для явного повтора.
Попытки захватывают поколение account/session и не публикуют старую ошибку или
состояние в новой сессии; временный импортный ввод очищается при переключении
аккаунта. Settings так же проверяет отказ выбора и отключения источника, а
сообщение об ошибке ограничено исходным login scope.

Полная `profile-durability.spec.ts` прошла **42/42** на desktop Chromium,
Firefox и WebKit (`workers=1`, `retries=0`), включая file retry после
восстановления хранилища. Unit suite — **1347/1347**; общий, domain-strict и
storage-strict typecheck, production build и `git diff --check` прошли. Точный
предыдущий CI [#1549](https://github.com/Michael-edel/FitFocus/actions/runs/39022938858)
выполняется на parent SHA `81823dc`, поэтому не подтверждает этот follow-up;
его exact CI запускается после push. BFCache на устройстве, остальные callbacks,
staging и общий P0.6 остаются открыты.

## P0.8 — durable commit избранного рецепта, `0aad496`, 17.10.2026

В `useFavoriteRecipes` UI раньше обновлялся синхронно, а `writeJson` выполнялся
в фоне и не ожидался. Поэтому quota/IndexedDB отказ мог показать добавление как
успешное. Обновление переведено на сериализованный `UserStateRepository.updateJson`
с account/session commit guard; React-state меняется только после pending outbox
commit и проверки, что исходный read session всё ещё текущий. Добавление,
редактирование, удаление и очистка возвращают `Promise<boolean>`. Редактирование
теперь одна атомарная операция вместо пары remove+add. AI-карточка сообщает об
ошибке при отказе и о сохранении только после подтверждения commit. Draft форма
сохраняется открытой при ошибке; её содержимое прокручивается в обычном viewport.

Новый E2E формы сначала воспроизвёл молчаливый отказ; после изменения quota
failure → retry проходит 3/3 на desktop Chromium, Firefox и WebKit. Прямое
сохранение из фоторазбора с отказом и повтором прошло 1/1 desktop Chromium.
Полный unit suite — 1347/1347, root typecheck, storage-strict и production build
прошли. `git diff --check` без ошибок. Exact CI предыдущего SHA `74309e1`
([run #1551](https://github.com/Michael-edel/FitFocus/actions/runs/39024480257))
ещё выполнялся и не покрывает `0aad496`; CI нового коммита будет после push.
Это закрывает найденную ошибку сохранения избранных рецептов, но не завершает
P0.8: lifecycle, остальные writers, staging и интеграция в `main` остаются
открыты.

## P0.8 — durable commit отметки прочтения и ответа на тест урока, `77ca05f`, 17.10.2026

`useCourseActions` раньше вызывал `persistUser` без ожидания и сразу закрывал
LessonViewModal. При отказе IndexedDB пользователь терял экран повтора; в тесте
урока терялся и выбранный вариант. Новая quota-регрессия воспроизвела дефект:
после клика отсутствовали alert и открытая форма.

Обе операции теперь ждут durable profile commit до закрытия модального окна.
При ошибке показывается `role=alert`, кнопки исключают повторный параллельный
commit, урок остаётся открыт, а выбранный ответ сохраняется; после восстановления
хранилища то же действие можно повторить. Персистентность использует session-bound
local commit guard: локальные правки разрешены во время auth-паузы отправителя,
но другой account/session отклоняется. Для проверки ошибки текущего guard добавлена
проверка локальной сессии без auth-fence, сохраняя различие между локальным
намерением и правом на облачное чтение.

Полная `profile-durability.spec.ts` прошла **45/45** на desktop Chromium,
Firefox и WebKit (`workers=1`, `retries=0`). Новый сценарий проверяет отдельно
отказ/retry отметки прочтения и отправки квиза, сохранение ответа при сбое и
durable профиль после успешного повтора. Unit suite — **1348/1348**; root,
domain-strict и storage-strict typecheck, production build и `git diff --check`
прошли локально. Кодовый коммит — [`77ca05f`](https://github.com/Michael-edel/FitFocus/commit/77ca05f).
Его exact CI ещё не запущен. Предыдущий опубликованный HEAD
[`5b90b31`](https://github.com/Michael-edel/FitFocus/commit/5b90b31) завершил
[PR CI #1557](https://github.com/Michael-edel/FitFocus/actions/runs/39029225255)
с ошибками E2E, поэтому этот run не подтверждает `77ca05f` и более поздние
локальные commits. PR #93 остаётся draft; общий P0.8/lifecycle, остальные
callbacks, staging, выпуск и интеграция в защищённую `main` открыты.

## P0 — локальная стабилизация мобильных/PWA проверок, `10dbcab`, 17.10.2026

Исправлены мобильные предупреждения Recharts в свёрнутых секциях, повторный
импорт wearable-файла в iPhone PWA и приоритет отображения предупреждения о
migration pause. E2E теперь ждёт подтверждения outbox-записи перед reload,
различает ожидаемый HTTP 426 старого протокола от ошибок браузерной консоли и
открывает меню действий перед правкой дневника на мобильном.

После изменений прошли unit **1348/1348**, root/domain/storage typecheck,
production build, PWA update **7/7**, rollback install **7/7** и мобильная
правка дневника **4/4**. Профильные мобильные retry сценарии дали 12 успешных
запусков в отдельных прогонах; weekly menu Firefox прошёл 1/1. PWA offline
матрица прошла 6/7, а единственный iPhone Safari сбой — в изолированном повторе.
Поэтому полная offline матрица требует повторной проверки и пока не считается
стабильной. Предыдущий CI #1557 на `5b90b31` завершился 913 passed, 31 failed,
295 skipped; его E2E падения включали эти PWA/mobile классы. Точный CI для
локального `10dbcab` ещё не запускался. PR #93 остаётся draft; staging, выпуск и
интеграция в защищённую `main` открыты.

## P0.8/P0.9 — повтор writer fence после пропущенного handshake, 17.10.2026

Android Chrome offline-reopen сценарий оставлял weekly-report операцию в
IndexedDB `pending`, потому что legacy migration фиксировала
`writersStopped=false` и `sendAllowed=false`. Это корректно удерживало отправку,
но `StateSync.drain()` после завершения неудачной первоначальной проверки ждал
только уже выполняющуюся верификацию; обычный polling не запускал новую проверку.
Следовательно, разовый пропуск all-client fence мог оставить sender на паузе до
focus/online/controllerchange.

`checkLegacyWriterFence` теперь ждёт состояния `activated` у текущего Service
Worker и прекращает попытку при переходе в `redundant`. Когда proof отсутствует,
StateSync повторно проверяет session и миграцию при polling с ограниченным
экспоненциальным backoff до 15 секунд. Fail-closed правило сохраняется:
outbox не отправляется, пока не получено актуальное подтверждение всех клиентов
того же build id.

Новый unit-регресс воспроизводит пропущенный fence и подтверждает повтор без
дополнительного события браузера. Legacy writer fence и migration наборы прошли
**18/18**, полный unit suite — **1352/1352**; root, domain-strict и storage-strict
typecheck, production build и `git diff --check` прошли. Android Chrome стресс-
прогон прошёл **20/20** без retries; offline-сценарий прошёл **7/7** на полной
браузерной матрице без retries. Перед исправлением Android стресс дал 19/20.

Опубликованный parent SHA [`cf62df0`](https://github.com/Michael-edel/FitFocus/commit/cf62df0)
прошёл точный [PR CI #1565](https://github.com/Michael-edel/FitFocus/actions/runs/39037015105)
успешно, включая E2E и rollback jobs; этот run не содержит текущий fix.
Точная проверка исправления проводится отдельно на опубликованном SHA. PR #93 остаётся draft;
полный P0.8/P0.9, разделение staging-проверок, выпуск и интеграция в защищённую
`main` остаются открытыми.

## P0.8/P0.9 — порядок отметок покупок и очистка writer-fence, 17.10.2026

Два быстрых переключения одного и того же пункта покупок могли отправить
конкурирующие PATCH и сохранить на сервере устаревшее намерение. Добавлена
локальная очередь по account, family, week и canonical ingredient; personal и
family writes теперь доходят до сервера в порядке кликов. E2E проверяет порядок
обоих записей и состояние после reload, а family retry проверяет reconciliation
после отказа второй записи. Также Firefox/WebKit ранее выдавали page error при
завершении PWA fence, если контроллер не предоставлял `removeEventListener`;
очистка стала условной, добавлен unit-регресс на такой объект.

`legacy_writer_fence.test.ts` прошёл **11/11**, полный unit suite — **1353/1353**,
typecheck, production build и `git diff --check` прошли. Полный
`family-callback-account-switch.spec.ts` прошёл **84/84** на desktop Chromium,
Firefox и WebKit с `workers=1`, `retries=0`; прежняя page error не повторилась.
Точный PR CI [#1567](https://github.com/Michael-edel/FitFocus/actions/runs/39040645536)
на предшествующем SHA `243c102` выполняет E2E и не включает коммит `b6591e6`;
его точный CI проверяется отдельно после push. Результаты этого раздела пока
локальные; staging, полный P0.8/P0.9, release acceptance и интеграция в защищённую
`main` остаются открытыми.

## P0.8 — durable dashboard weight and weekly-report writer, 17.10.2026

Dashboard cleared the entered weight immediately after starting `persistUser`,
before IndexedDB had confirmed the profile outbox transaction. The callback now
awaits the durable commit, checks the captured account/session, and clears the
draft or triggers the achievement only after success. A storage failure leaves
the value visible, reports the failure, and allows retry after reload.

The browser regression exposed a related weekly-report error after reload:
each run created a new repository with a random writer ID, so its update was
correctly rejected as `independent-snapshot` when the same report still had a
pending outbox operation. Weekly reports now use a stable logical writer and
continue only that writer's active causal chain; other writers still conflict.
Concurrent report generation is serialized in the current page, and report
updates merge from the current durable value instead of rewriting a stale array.

Full unit suite passed **1355/1355**, dashboard weight/reload/retry passed **7/7**
desktop/mobile/PWA Playwright projects, root/domain/storage typechecks, production
build, and `git diff --check` passed locally. The exact CI for this change starts
after push; PR #93 remains draft, and the rest of P0.8/P0.9, staging, release
acceptance, and integration into protected `main` remain open.

## P0.8 — durable dashboard habit updates, 17.10.2026

Отметка привычки раньше меняла интерфейс сразу, запускала profile-save без
ожидания и отдельно писала производный список `habits`. Теперь daily habit
сохраняется через guarded durable profile commit; при ошибке состояние не
переключается, кнопка блокируется на время записи, а сообщение предлагает
повторить действие. Кнопка стала семантической и сообщает `aria-pressed`.

Профиль `dailyHabits` используется как источник истины. При hydration сохранённые
legacy-счётчики привычек сверяются с сегодняшней записью профиля, поэтому
отдельная запись второго ключа больше не создаёт частичное состояние. Обновление
`toggleHabit` теперь иммутабельно и не меняет профиль до durable commit.

Полный unit suite прошёл **1357/1357**, тест hydration/profile reconciliation
входит в набор; пара сценариев веса и привычек прошла **14/14** по семи
desktop/mobile/PWA Playwright-проектам. Root/domain/storage typechecks,
production build и `git diff --check` прошли. На момент записи точный родительский
CI для `dbca5e3` — [run #1571](https://github.com/Michael-edel/FitFocus/actions/runs/39048988632) —
ещё выполнялся на E2E; он позже завершился ошибкой и разобран в следующем разделе.
P0.8/P0.9, staging и выпуск остаются открыты.

## P0.8 — durable Settings profile callbacks, `a0721b0`, 17.10.2026

Профильная форма и отдельные действия Settings подтверждали изменения до
IndexedDB commit. Теперь сохранение профиля, goal intensity и risk acknowledgment,
progress photos, а также профильные ответы Huawei ждут durable write. При отказе
показывается ошибка, введённое значение остаётся доступно для повтора. Записи
используют account/session-scoped local commit guard; он сохраняет локальное
намерение во время sender auth-паузы. Автосинхронизация профиля откладывается,
пока открыт несохранённый draft.

Исправлен также общий E2E Service Worker mock: он теперь EventTarget с состоянием
`activated`, поэтому writer-fence handshake проходит как в настоящем браузере.
Родительский CI [#1571](https://github.com/Michael-edel/FitFocus/actions/runs/39048988632)
для `dbca5e3` завершился E2E failure (summary: 341 failed; доступны десять
подробных account-switch annotations). Эти десять сценариев прошли локально
10/10 на desktop Chromium после исправления mock. Полный `profile-durability.spec.ts`
прошёл 19/19 Chromium; Huawei и goal-intensity regressions — 14/14 на семи
desktop/mobile/PWA проектах. Unit — **1359/1359**, root/domain/storage typecheck,
production build и `git diff --check` прошли. Точный CI нового SHA ожидает push;
P0.8/lifecycle, staging, release acceptance и интеграция в защищённую `main`
остаётся открытыми.

## Deployed branch preview smoke: `bb94957`, 17.10.2026

GitHub Cloudflare Pages check сообщает успешное развертывание commit preview
`https://71594efe.fitfocus.pages.dev/` и branch alias
`https://fix-durable-outbox.fitfocus.pages.dev/`. Read-only `HttpClient` GET
проверены без cookie и auto-redirect: на обоих origin root, `/api/env` и
анонимный `/api/me` ответили 200; `/api/bootstrap`, `/api/profile`, `/api/state`
и `/api/push/status` — 401 без `Location` и `Set-Cookie`. `/api/env` сообщает
пустые Google Client IDs и `requireInvite=false`.

Свежий Chromium открыл branch preview с HTTP 200, `title=FitFocus`, без
pageerror/console errors, off-origin requests или non-GET запросов. Это
подтверждает только публичную страницу и указанные unauthenticated маршруты.
D1 binding/изоляция, серверный `APP_URL`, OAuth callback, миграции и
аутентифицированные сценарии не проверены; staging и выпуск остаются открыты.
Точный PR CI #1573 для `bb94957` позднее завершился с двумя E2E сбоями
(980 passed / 299 skipped); оба сценария прошли локальные повторы 5/5.

## Recheck Safari reload cancellation: 17.10.2026

Повторно запущен сценарий `a native profile refresh cancelled by reload stays
handled in Safari` на текущем локальном коде: desktop WebKit, iPhone Safari и
iPhone PWA прошли **3/3**, workers=1, retries=0. Это подтверждает обработку
нынешней отмены GET `/api/profile` при reload, но не устанавливает источник
старого исторического сообщения; соответствующий диагностический пункт в
`TASKS.md` остаётся открытым. Этот прогон локальный и не заменяет точный CI.

## Firefox PWA update timeout recheck: 17.10.2026

Сценарий `real service worker waits for an explicit update and preserves durable
family intent` на коде `bb94957` прошёл **1/1** в `desktop-firefox`,
`workers=1,retries=0`. Timeout на ожидании сохранённого состояния не возник;
один успешный повтор не устанавливает причину исторического timeout и не
закрывает диагностический пункт. CI #1573 позднее завершился двумя другими E2E
сбоями; этот локальный Firefox recheck их не проверял.

## P0.8 — follow-up точного CI #1575 для fallback AI-plan E2E, 18.10.2026

Точный [PR CI run #1575](https://github.com/Michael-edel/FitFocus/actions/runs/39061905817)
проверял commit `a9d2e33686cb9219ccd88eff66f2dd7b0a845629`: audit, schema/privacy/
auth/API checks, unit tests, три typecheck и production build прошли. E2E
завершился **988 passed / 299 skipped / 1 failed**. Единственный отказ —
`fallback AI plan stays hidden when its durable profile commit fails, then recovers
after reload` на iPhone Safari. В этой ветке браузер начинал фоновый недельный
`wis_text` запрос; при reload WebKit выдал access-control console error и
`WEEKLY_AI_REPORT_FAILED`, из-за чего проверка общего console health упала после
успешных проверок fallback и durable profile commit.

Локально тот же сценарий прошёл **10/10** на iPhone Safari до изменения, что
подтвердило неповторяемость сбоя. Profile fixture теперь явно отвечает на
`wis_text` запрос тестовым результатом с AI protocol/guard и account/session
headers; общая проверка консоли не ослаблена. После изменения точный сценарий
прошёл ещё **10/10**, `workers=1,retries=0`; root typecheck и `git diff --check`
прошли. Это устраняет нестабильную зависимость этого profile E2E от общего
fallback mock. Следующий CI должен подтвердить новый SHA целиком; P0.8/P0.9,
staging, release acceptance и интеграция в `main` остаются открытыми.

## P0.8 — точный CI и branch-preview smoke для `87ba8b9`, 18.10.2026

Коммит `87ba8b917031a6eb739401ecf851ce7fe5e84d42` опубликован в
`fix/durable-outbox`. В точном [PR CI #1577](https://github.com/Michael-edel/FitFocus/actions/runs/39070119020)
успешно завершились dependency audit, schema/privacy/auth/API checks, unit,
root/domain/storage typecheck и production build; E2E выполняется. Полный вывод
матрицы ещё не получен.

Branch preview `https://fix-durable-outbox.fitfocus.pages.dev/` обслуживает
bundle `87ba8b917031a6eb739401ecf851ce7fe5e84d42`. Read-only GET дали ожидаемые
результаты: `/`, `/api/env`, `/api/me` — 200; `/api/bootstrap`, `/api/profile`,
`/api/state`, `/api/push/status` — 401 без redirect и `Set-Cookie`. Свежий
Chromium показал `title=FitFocus`, без `pageerror`, off-origin запросов или
не-GET запросов. Он сообщил одно предупреждение Chromium о неизвестной
`ambient-light-sensor` директиве Permissions-Policy из `public/_headers`.
Директива сохранена: она ограничивает экспериментальный API в поддерживающих
её браузерах, и её безусловное удаление может ослабить политику. Smoke не
подтверждает D1 binding, `APP_URL`, OAuth/callback или аутентифицированные
сценарии; staging и выпуск остаются открытыми.

## P0.8 — follow-up двух E2E отказов CI #1577, 18.10.2026

Точный [PR CI #1577](https://github.com/Michael-edel/FitFocus/actions/runs/39070119020)
для `87ba8b9` завершился ошибкой только в E2E: 987 passed, 299 skipped, два
failed; audit, schema/privacy/auth/API checks, unit, root/domain/storage
typecheck и build прошли. Android Chrome access-pause проверка сохранила pending
settings operation, но показала local storage error вместо сообщения о паузе.
В коде пользовательский settings write был завязан на read guard, который
отклоняется при auth/access pause; теперь отдельный `writeLocalJson` использует local commit guard,
сохраняющий локальное намерение при паузе и по-прежнему проверяющий аккаунт,
server session и epoch. Guarded generated write, отозванный сменой сессии,
больше не публикуется как storage failure.

Второй отказ был на iPhone Safari profile fallback E2E. Трасса прежнего run
показывала incidental `/api/state` от фоновой AI записи, который мог пройти
через незакрытый `DELETE` fixture route к preview origin. Общая profile fixture
теперь подтверждает background state writes. После изменений целевые два
сценария прошли 12/12 на Android Chrome/iPhone Safari без retries; затронутые
unit — 32/32, полный unit suite — 1362/1362, root/domain/storage strict
typecheck, production build и `git diff --check` прошли. Коммит `4c03b68`
опубликован в `fix/durable-outbox`; точный [PR CI #1579](https://github.com/Michael-edel/FitFocus/actions/runs/39076716798)
прошёл audit, schema/privacy/auth/API checks, unit, три typecheck и build; полный
E2E ещё выполняется. Полный P0.8/P0.9, staging, выпуск и интеграция в защищённую
`main` остаются открыты.

После публикации проверен branch preview: bundle содержит точный SHA
`4c03b68743626744f867db64fd276cdffffa6388`. Read-only GET `/`, `/api/env` и
анонимный `/api/me` вернули 200; `/api/bootstrap`, `/api/profile`, `/api/state`
и `/api/push/status` вернули 401 без redirect и `Set-Cookie`. Это проверка
неавторизованного preview origin, а не D1/OAuth, авторизованных действий или
staging acceptance.

## P0.6 — убрать неиспользуемое переименование account-префиксов, 18.10.2026

Из `storage/hybrid.ts` и `storage/indexedUserState.ts` удалены неиспользуемые
`renameLocalStoragePrefix` и `renameIndexedUserStatePrefix` вместе с cursor-
миграцией, которая переписывала ключи IndexedDB из одного account-префикса в
другой. Поиск runtime call sites подтвердил, что приложение этот путь уже не
вызывало; прежний unit test, однако, закреплял перенос как допустимую операцию.
Тест заменён на проверку изоляции точного account-префикса; импорт из `App.tsx`
удалён. Это не затрагивает scoped чтение и очистку данных, но предотвращает
возврат к переносу владельца по одному лишь преобразованию ключа.

Локальная проверка: `tests/indexed_user_state.test.ts` — 3/3, весь unit suite —
1363/1363, общий typecheck, `typecheck:storage-strict`, production build и
`git diff --check` прошли. Коммит `49a1ff6` опубликован; точный CI #1589
проверяет последующий head `faa1e71`. PR #90 с проверенным CI #971 пока не влит,
потому что защищённая `main` требует approving review от write-доступного
reviewer. Полный P0.6/P0.8/P0.9, staging и выпуск остаются открыты.

## P0.8 — инвентаризация отдельного scaffold outbox, 18.10.2026

`storage/outbox.ts` реализовывал localStorage ключ `fitfocus_outbox_ops` для
другого scaffold-формата (`OutboxOp`: device/user/tenant/entity/patch), но не
имел runtime-потребителей; единственной ссылкой приложения был export из
`storage/index.ts`. Удалены модуль и export в коммите `e5a6154`, чтобы в текущем
коде не оставалось второй API-реализации очереди. Существующий ключ не очищается:
общий backup сохраняет его как непрозрачную localStorage-строку, а новая очередь
его не импортирует и не отправляет. Источником legacy migration остаётся только
отдельный `fitfocus.remote-kv-outbox.v1`.

Backup regression проверяет сохранение payload через export/import без записи в
DurableOutbox; `tests/backup.test.ts` — 10/10, полный unit suite — 1364/1364,
общий/storage-strict typecheck, production build и `git diff --check` прошли.
Код опубликован в `e5a6154`, тест и документация — в `cf9d20e`. Точный PR CI
[#1591](https://github.com/Michael-edel/FitFocus/actions/runs/39094609689)
для `cf9d20e` отменён после продвижения ветки; [CI #1593](https://github.com/Michael-edel/FitFocus/actions/runs/39094911718)
создан для документационного commit `125ae97` и не содержит нижеследующий новый E2E.

Startup acceptance дополнительно запускает приложение со старым ключом
`fitfocus_outbox_ops`: исходный payload остаётся нетронутым, записи в
DurableOutbox и matching state PUT/DELETE отсутствуют. Точечная матрица прошла
7/7 профилей, полная `durable-backup-restore.spec.ts` — 21/21 без retries.
Точный CI этой регрессии следует проверить на опубликованном SHA. P0.8 lifecycle, staging и
релизные проверки остаются открыты.

## P0.4 — account-switch cache архива прогресса, `fd026b5`, 18.10.2026

Добавлен двухвкладочный сценарий на мобильной ширине: раскрытая галерея
сохраняется только в ключе account A, после активации account B старая вкладка
не показывает архив, профиль и outbox A не меняются, а B видит собственное
закрытое состояние по умолчанию. Регрессия прошла 3/3 на desktop Chromium,
Firefox и WebKit без retries. Первый запуск нашёл нулевой размер скрытого
Recharts контейнера во всех трёх движках. Архивный экран теперь не монтирует
график, пока мобильный раздел закрыт; открытые графики используют общий
положительный initial dimension вместе с dashboard и экраном прогресса.

После фикса archive account-switch E2E прошёл 3/3, прежний progress draft
account-switch E2E — 3/3, полный unit suite — 1368/1368 в 213 файлах, root
typecheck, production build через Playwright preview и `git diff --check` прошли.
Сценарий подтверждает один UI cache path; другие callbacks/cache, общий P0.4,
staging и release acceptance остаются открыты.

## P0.9 — abort legacy migration между импортом и marker, 18.10.2026

Добавлена browser acceptance в `e2e/legacy-outbox-migration.spec.ts` с реальным
IndexedDB и текущим приложением: тест отменяет транзакцию после постановки
outbox operation и imported migration item в одной транзакции, до её commit.
После abort исходная
legacy-запись и незавершённый snapshot сохраняются, а value, outbox operation,
ledger/quarantine и processed marker отсутствуют; `sendAllowed` остаётся false.
Затем повторный запуск успешно импортирует запись как конфликтную с одним opId,
а последующий reload не создаёт дубль и не отправляет её на сервер.

Сценарий прошёл 7/7 Playwright-проектов (desktop Chromium/Firefox/WebKit,
Android Chrome/PWA, iPhone Safari/PWA), `workers=1`, `retries=0`; root typecheck и
`git diff --check` прошли. Тест опубликован в `f9bf4e6`. [Точный CI #1601](https://github.com/Michael-edel/FitFocus/actions/runs/39100776970)
для этого SHA прошёл audit, guards, unit, три typecheck и production build;
E2E ещё выполняется.

### P0.9 — reorder и retryCount в browser migration, `de56ab3`

Проверка повторного runtime-импорта двух конфликтных legacy operations после перестановки массива и изменения `retryCount` опубликована в `de56ab3`. Старые opId сохраняются, новый snapshot получает processed marker, повторная загрузка не создаёт дубликаты; реальная IndexedDB/Service Worker матрица прошла 7/7 без retries. Точный CI #1603 завершился одним Safari E2E отказом; staging и общая P0.9 приёмка остаются открыты.

## P0.9 — опубликованная browser-проверка fingerprint миграции, `de56ab3`, 18.10.2026

В текущий code/test HEAD добавлена browser acceptance стабильности legacy fingerprint после изменения порядка исходного массива и `retryCount`: обе конфликтные операции сохраняют исходные opId, новый снимок получает processed marker, последующая загрузка не создаёт дубликатов. Используются реальная IndexedDB и Service Worker. Локальная матрица прошла 7/7 desktop/mobile/PWA профилей без retries; целевые unit-наборы `legacy_queue` и `legacy_migration` прошли 128/128.

Точный [CI #1603](https://github.com/Michael-edel/FitFocus/actions/runs/39101610258) для `de56ab3` прошёл audit, schema/privacy/auth/API guards, unit, root/domain/storage typecheck и production build. E2E завершился одним Safari reload отказом; follow-up описан ниже. Предыдущая проверка атомарного abort legacy import из `f9bf4e6` также содержится в этом SHA.

Branch preview развернул `de56ab3`. Свежие анонимные GET подтвердили: `/`, `/api/env`, `/api/me` — 200; `/api/bootstrap`, `/api/profile`, `/api/state`, `/api/push/status` — 401 без redirect и `Set-Cookie`. `/api/env` сообщает пустые Google Client IDs и `requireInvite=false`. Это не подтверждает авторизованные действия, OAuth, D1 или staging. Полный P0.9 и выпуск остаются открыты.

## P0.8/P0.9 — Safari reload отменяет фоновый weekly AI, локальный follow-up, 18.10.2026

Точный [CI #1603](https://github.com/Michael-edel/FitFocus/actions/runs/39101610258) для `de56ab3` завершился одним отказом `a native profile refresh cancelled by reload stays handled in Safari` на iPhone Safari. Trace показал `/api/ai due to access control checks` через 21 мс после начала `page.reload()`. Локальный повтор выявил, что Desktop WebKit иногда также логирует `Weekly AI reporting failed: TypeError: Load failed` при таком переходе.

`useWeeklyAiReport` теперь инвалидирует попытку уже на `beforeunload`, сохраняя `pagehide` для остальных переходов и BFCache. Acceptance учитывает не более одного точного WebKit `/api/ai` access-control page error только внутри reload; остальные page/console errors остаются отказами теста. Целевые unit `weekly_ai_report_feature` и `ai_session_transport` прошли 32/32, reload acceptance — 9/9 на desktop WebKit, iPhone Safari и iPhone PWA без retries. Исправление опубликовано в `05bf14b`. Точный [CI #1605](https://github.com/Michael-edel/FitFocus/actions/runs/39105107242) прошёл audit, schema/privacy/auth/API guards, unit, три typecheck и production build; E2E выполняются. Read-only smoke branch preview подтвердил bundle `05bf14b`: `/`, `/api/env`, `/api/me` — 200; защищённые `/api/bootstrap`, `/api/profile`, `/api/state`, `/api/push/status` — 401 без redirect и `Set-Cookie`. P0.8/P0.9, staging и выпуск открыты.

## CI follow-up — ожидание dashboard draft после reload, `cff4b93`, 18.10.2026

Тестовое ожидание восстановления весового черновика после reload увеличено с 10 до 30 секунд после того, как trace CI #1607 показал медленный `/api/me` и восстановление значения уже после таймаута. Сценарий локально прошёл 5/5 на Desktop WebKit и 3/3 на Chromium, Firefox и WebKit без retries. Точный [CI #1612](https://github.com/Michael-edel/FitFocus/actions/runs/39119924075) для `cff4b939903c54d266d4f9629b0179598c4ea085` завершился success, включая полный E2E. Изменение test-only и не меняет runtime bundle; branch preview smoke последнего runtime bundle `e91c134` зафиксирован отдельно в [приёмке origin](staging-origin.md). P0 стабилизация продолжается; staging, выпуск и интеграция в `main` не подтверждены.

## P0.9 — route-level state generation lifecycle, `77d2679`, 18.10.2026

Добавлена регрессия `tests/state_generation_route.test.ts` для `delete → recreate → stale update`. Production `/api/state` handlers проходят создание версии 1, удаление в tombstone версии 2, отказ старого PUT с 409, recreate на версии 3 и отказ исходной stale версии; новая запись остаётся неизменной. SQL production storage выполняется на SQLite-backed D1 adapter. Auth/capability провайдеры изолированы, поэтому эта проверка не заменяет staging или OAuth. Целевой test — 1/1; полный unit suite — 1369/1369, общий/domain/storage typecheck, production build, API invariants и `git diff --check` прошли. Точный CI #1616 на `47bb7d9` завершился success; общий P0.9 и staging остаются открыты.

## P0 — отдельная staging smoke suite и точный CI, `66e8c19` / `1271dfe`, 18.10.2026

Опубликованный `66e8c19` разделяет browser mock suite и отдельную read-only
staging suite. Точный [PR CI #1618](https://github.com/Michael-edel/FitFocus/actions/runs/39126327612)
завершился success: unit, guards, typechecks, build, browser mock matrix и
rollback/CAS gate прошли. Staging smoke не запускался, поскольку отдельный
HTTPS staging origin не настроен.

Локальный follow-up `1271dfe` вынес разбор origin в валидатор и добавил проверки
для отсутствующего, некорректного и небезопасного адреса, включая production
hostname с завершающей точкой. Локально полный unit suite прошёл 1382/1382 в
215 файлах; typecheck, admin guards, API/auth-scope проверки и обнаружение
browser/staging наборов прошли. Точный CI для `1271dfe` ещё не запускался.
В плане остаются 32 пункта: 18 P0, 7 P1 и 7 будущих;
staging acceptance, release и интеграция в `main` открыты.

## P0.8 — причины legacy quarantine в UI, `b97307a`, 18.10.2026

StateSync передаёт в статус миграции причины неразрешённых quarantine rows;
интерфейс показывает сводку по числу и причине только для подтверждённого
аккаунта. Ключи и raw payload не отображаются, а quarantine-записи не получают
владельца и не отправляются автоматически. Словарь причин исчерпывающий для
текущего типа миграции, с безопасной общей подписью для неизвестного значения.

Целевые migration unit-тесты прошли 78/78. Весь
[`legacy-outbox-migration.spec.ts`](../e2e/legacy-outbox-migration.spec.ts)
прошёл 7/7 в desktop Chromium; acceptance проверяет `unknown-owner`, причины
повреждённых legacy-записей и отсутствие чужого ключа/значения в сводке. Root,
domain-strict и storage-strict typecheck, production build и `git diff --check`
прошли локально. Изменение опубликовано в [`b97307a`](https://github.com/Michael-edel/FitFocus/commit/b97307a1d011d5fb639c3dd9f074895ad59e1134).
Точный [PR CI #1622](https://github.com/Michael-edel/FitFocus/actions/runs/39131570644)
для `b97307a` завершился с 1026 прошедшими, 303 пропущенными и 8 упавшими
браузерными тестами: семь из-за строгого locator, который стал неоднозначным
после появления второго summary, и один из-за гонки при заполнении поля имени
в iPhone PWA rollback. Последний code/test HEAD и точный CI follow-up описаны
ниже. PR #93 остаётся draft; staging, полный lifecycle P0.8 и интеграция в
защищённую `main` открыты.

## CI follow-up — conflict recovery и PWA rollback, `7f76a8e`, 18.10.2026

В `owned-state.spec.ts` locator теперь выбирает именно блок действий
«Разрешить конфликт или повторить отправку», устраняя неоднозначность второго
summary с причинами quarantine. Conflict recovery прошёл 7/7 затронутых browser
projects. В `pwa-rollback.spec.ts` тест ожидает начальное имя профиля `E2E User`,
затем меняет его и подтверждает значение до сохранения; iPhone PWA сценарий
прошёл 3/3 повтора. Root typecheck и `git diff --check` прошли локально.

Исправления зафиксированы локальным коммитом [`7f76a8e`](https://github.com/Michael-edel/FitFocus/commit/7f76a8e)
и ещё не опубликованы. Следующий шаг — push, затем точный CI для нового SHA;
пока он не завершится успешно, E2E follow-up и PR #93 не считаются принятыми.
Staging, полный P0.8 lifecycle и интеграция в защищённую `main` остаются открыты.

## P0.9 — реальный unload во время регистрационного AI, `dc38a51`, 18.10.2026

Реальная браузерная навигация во время удержанного `/api/ai` показала, что
синтетическая отправка `pagehide` не доказывает отмену сигнала fetch до teardown.
Регистрационный AI transport теперь отменяет request-specific controller и
registration action на `beforeunload`; `pagehide` остаётся дополнительной
защитой. Базовый профиль уже durable, остаётся одна pending operation, а login
и profile PUT после прерывания не запускаются.

Полный `registration-durability.spec.ts` прошёл 21/21 на семи browser/PWA
профилях без retries; targeted unit — 44/44, полный unit suite — 1388/1388 в
215 файлах. Root, domain-strict и storage-strict typecheck, production build и
`git diff --check` прошли локально. Эти результаты относятся к локальному
`dc38a51`; точный CI #1628 проверял remote HEAD `5d5dca8` и завершился success,
но не включает эту правку. После push fix проверяется точным CI #1630,
описанным ниже.
Staging, OAuth, реальный D1, выпуск и интеграция в защищённую `main` остаются
открыты.

## P0 — exact CI и branch-preview smoke для `9825e8d`, 18.10.2026

После push для точного HEAD `9825e8d9bd3053b6158d06fdd4b04f32324b25d6`
завершился success в [PR CI #1630](https://github.com/Michael-edel/FitFocus/actions/runs/39144722602):
1388 unit в 215 файлах, 1041 browser passed / 303 skipped, audit,
schema/privacy/auth/API guards, три typecheck и production build прошли.
Rollback/CAS gate выполнил 23 HTTP/D1-запроса.

Artifacts: [browser diagnostics](https://github.com/Michael-edel/FitFocus/actions/runs/39144722602/artifacts/12143743312)
и [rollback archive](https://github.com/Michael-edel/FitFocus/actions/runs/39144722602/artifacts/12143553718)
сохранены; archive SHA-256 `a07775e6c70dbd1cae80c3f2171b0250fcd67092e3c681ff263e6421fa3f6f37`.

Branch-preview smoke `npm run test:e2e:staging` прошёл 7/7 GET-only проверок.
Загруженный `/assets/index-C_UPaACd.js` содержит полный текущий SHA. `/`,
`/api/env` и анонимный `/api/me` вернули 200; защищённые bootstrap/profile/state/
push-status — 401 без redirect и `Set-Cookie`. Это не отдельный staging и не
подтверждает OAuth, D1, авторизованные действия или выпуск.

## P0.5/P0.9 — request-scoped navigation abort для AI и family callbacks, 18.10.2026

В `589d49e` `AiActionScope` ставит временный `beforeunload` listener только во
время активного запроса; завершение, замена attempt и invalidation его снимают.
Недельный отчёт продолжает собственную проверенную обработку события, не
добавляя второго listener. Unit suite — 1390/1390, root/domain/storage typecheck
прошли; реальная навигация при удержанном Coach retry прошла 1/1 desktop Chromium.

В `a739c1e` семейные action scopes получили один listener на все параллельные
запросы scope. Он удаляется после завершения последнего действия, а событие
abort-ит все оставшиеся controllers до `pagehide`. Family unit — 19/19, полный
unit — 1391/1391, три typecheck-профиля и `git diff --check` прошли локально.
Навигация при удержанном family invite прошла 1/1 desktop Chromium, сигнал
отменён, поздний код не показан. Точный [CI #1642](https://github.com/Michael-edel/FitFocus/actions/runs/39155718399)
прошёл audit, guards, unit, typechecks и build; browser job ещё выполняется.

Повтор `pwa-update.spec.ts` в desktop Firefox прошёл 1/1 без retries; известный
исторический timeout не воспроизвёлся, и причина остаётся не доказанной. P0.5,
P0.8/P0.9, staging и protected-main integration остаются открытыми.

## P0.9 — read-only branch-preview smoke для `a739c1e`, 19.10.2026

`npm run test:e2e:staging` выполнен с origin
`https://fix-durable-outbox.fitfocus.pages.dev/` и прошёл **7/7 GET-only**
проверок. Страница, `/api/env` и анонимный `/api/me` вернули 200; защищённые
bootstrap/profile/state/push-status — 401 без redirect и `Set-Cookie`.
`/assets/index-BDc4XSZj.js` содержит SHA
`a739c1e151d5bf33a99346ba24d95368272ecb10`. Это branch preview, не выделенное
staging; реальные OAuth, D1, авторизованные запросы и релиз остаются открыты.

## P0.9 — отмена Admin transport при уходе со страницы, `931779e`, 19.10.2026

`requestAdminResponse` уже отменял текущий запрос на `pagehide`; теперь он
отменяет его и на `beforeunload`, снимая оба временных listener в `finally`.
Отменяется только request-specific controller: controller долговечной
`AdminSession` остаётся активным, и тест после каждого события отправляет новый
scoped запрос. Это сохраняет возможность продолжить работу после возврата из
BFCache.

`tests/admin_session_transport.test.ts` прошёл 13/13; вместе с
`support_session_transport.test.ts` — 28/28. `npm run typecheck`,
`npm run typecheck:storage-strict` и `git diff --check` прошли локально. Проверка
посылает lifecycle events в unit-тесте и не доказывает реальный BFCache,
физический браузер или staging. Точный CI для опубликованного коммита
[`931779e`](https://github.com/Michael-edel/FitFocus/commit/931779ef9899366f0a6a812ada054b8c2fff3167)
для него был создан [run #1653](https://github.com/Michael-edel/FitFocus/actions/runs/39162383939).
После документационного follow-up точная проверка latest PR head отслеживается
по workflow в PR #93.

## P0.9 — настоящая навигация с активным Admin-запросом, `8f75731`, 19.10.2026

`e2e/admin-session.spec.ts` удерживает scoped `/api/admin/stats`, переходит на
другую страницу того же origin и проверяет реальное событие `beforeunload`, abort
сигнала именно активного fetch и запись account/session proof. Acceptance прошёл
7/7 desktop/mobile/PWA Playwright-профилей, workers=1/retries=0. В fixture
включено подтверждение incidental state writes, чтобы исходный auth-fence не
устаревал из-за фоновой очереди до проверки панели.

`tests/admin_session_transport.test.ts` прошёл 13/13; root и storage-strict
typecheck и `git diff --check` прошли. Unit дополнительно проверяет synthetic
`pagehide` и отправку следующего запроса той же сессией. Реальная навигация не
проверяет BFCache, физическое устройство или staging; точный CI новой ревизии
отслеживается после push в PR #93.

## P0.5 — единый ранний abort session-bound запросов, `7777636`, 19.10.2026

До follow-up несколько transports прерывали активную работу только на
`pagehide`, хотя `beforeunload` приходит раньше. Общий `listenForPageExit` теперь
вызывает guard на первом из этих сигналов и удаляет оба временных listener.
Использование приведено к одному helper для `/api/me`, bootstrap/state reads,
StateSync lifecycle, Admin, Support, AI, family, achievements, billing, Huawei,
push и mobile-token. `stateSyncLifecycle` заново устанавливает listener после
подтверждённого BFCache возврата.

Целевые transport/lifecycle тесты прошли 140/140; полный unit suite — 1415/1415
в 216 файлах. Root, domain-strict и storage-strict typecheck, auth/API guards,
production build и `git diff --check` прошли. Admin-переход на другую страницу
проверен реальной browser navigation: 7/7 desktop/mobile/PWA проектов,
workers=1/retries=0. Проверка покрывает `beforeunload` и отмену fetch; реальный
BFCache, устройство и выделенный staging остаются отдельными gate. Staging
origin в окружении не настроен. Точный CI follow-up запускается после push
в PR #93.

## P0.5 — отмена публичных auth callbacks при навигации, `050eb30`, 19.10.2026

`fetchWithResilience` раньше заменял переданный вызывающим кодом `AbortSignal`
внутренним controller. Теперь он передаёт отмену активному `fetch`, возвращает
отдельный тип ошибки `aborted` и не запускает следующую безопасную попытку,
если сигнал отменён во время запроса или retry delay. Timeout по-прежнему
отличается от page-exit/caller abort.

`/api/env` теперь имеет временный page-exit guard и после ответа не меняет
React state при уходе со страницы или размонтировании. Проверка приглашения
держит тот же guard до чтения JSON: при `beforeunload`/`pagehide` POST
отменяется, поздний ответ не выставляет устаревшую ошибку, а нормальный
результат продолжает обычный путь регистрации.

Проверки на локальном SHA `050eb30`: полный unit suite — **1420/1420** в 216
файлах; root/domain-strict/storage-strict typecheck, API invariants, auth scope,
schema parity (23 migrations / 32 tables), privacy coverage (29 user tables),
admin guards, production build и `git diff --check` прошли. Новая реальная
навигация с удержанным `/api/env` прошла **7/7** desktop/mobile/PWA профилей
(`workers=1,retries=0`). Unit покрывает отмену проверки приглашения на обоих
сигналах и прекращение retry при отменённом caller signal.

Это mock API и проверка browser fetch; OAuth, выделенный staging, физические
устройства и реальный BFCache остаются отдельными gates. Точный CI текущего
опубликованного SHA проверяется через PR #93 после push. Общий P0.5/P0.9 не
закрыт.

## P0.5 — повторная загрузка публичной конфигурации после BFCache lifecycle, локальный follow-up, 19.10.2026

Новая ранняя отмена `/api/env` прерывала запрос при уходе со страницы. При
восстановлении документа React effect автоматически не запускается повторно,
поэтому приложение могло оставить `requireInvite` устаревшим. Теперь при
`pageshow.persisted` старый request generation инвалидируется, состояние
`inviteChecking` сбрасывается и `/api/env` запрашивается заново. Поздний ответ
предыдущего запроса не меняет состояние.

`e2e/http-client-lifecycle.spec.ts` проверил удержанный `/api/env`, abort на
`pagehide` и второй успешный запрос после синтетического persisted `pageshow`:
**14/14** на семи Playwright desktop/mobile/PWA профилях, workers=1/retries=0.
Полный unit suite — **1420/1420** в 216 файлах; root/domain-strict/storage-strict
typecheck и production build прошли. Code/test сохранены локальным коммитом
[`bd30041`](https://github.com/Michael-edel/FitFocus/commit/bd30041); он ещё не
опубликован и не включён в точный CI.

Попытка проверить настоящий browser back отдельно не дала BFCache в Playwright;
CDP сообщил `BackForwardCacheDisabledForDelegate` даже после удаления явного
флага из Chromium и запуска установленного Chrome. Этот harness-result не
считается ошибкой приложения и не подтверждает реальный BFCache. Удалённый CI
#1663 на опубликованном HEAD `7acfc86` всё ещё выполняет browser tests; новый
HEAD не отправляется до его завершения. Реальный BFCache, staging/OAuth и общий
P0.5/P0.9 остаются открытыми.

## P0.6 — очистка счётчика рецептов при удалении аккаунта, `8b7fb2c`, 19.10.2026

Аудит `clearLocalUserData` показал, что общий account cleanup пропускал счётчик
из `domain/usage.ts`: `fitfocus_usage_counters_v1:<encoded-accountId>`. Из-за
этого удаление аккаунта могло сообщить о полной локальной очистке, оставив его
weekly recipe usage. Очистка теперь удаляет точный URL-кодированный ключ и не
затрагивает соседний аккаунт; обычный и кодированный ID проверяются отдельно.

Регрессия сначала провалилась на обоих вариантах ключа. После фикса privacy и
usage тесты прошли **9/9**, полный unit suite — **1423/1423** в 216 файлах;
root/domain-strict/storage-strict typecheck, privacy coverage (29 таблиц),
production build и `git diff --check` прошли. Code/test commit `8b7fb2c`
пока локальный. CI #1673 на предыдущем опубликованном HEAD `8ffa9e4` ещё
выполняет browser tests; публикация follow-up ожидает завершения этого run.
Этот ключевой cleanup не закрывает остальной account lifecycle P0.6.

В follow-up `5d3d5b1` префикс счётчика перенесён в общий `STORAGE_KEYS` и
используется и writer-ом `domain/usage.ts`, и account cleanup. Полный unit
suite 1423/1423, root/domain/storage-strict typecheck, production build,
privacy coverage и diff check повторно прошли; CI #1673 всё ещё проверяет
предыдущий опубликованный SHA.

## P0.5 — отложенное чтение семейного меню при смене аккаунта, локальная приёмка, 19.10.2026

В `e2e/family-callback-account-switch.spec.ts` добавлен сценарий, который
удерживает shared `GET /api/family/menu` от аккаунта A, пока соседняя вкладка
входит под аккаунтом B. После освобождения ответа маркер меню B остаётся на
экране, маркер A не появляется, старый callback не запускает повторный family
GET, а обе вкладки остаются без page error. Сценарий прошёл **3/3** на desktop
Chromium, Firefox и WebKit без retries; `npm run typecheck` и `git diff --check`
прошли. Runtime-код не менялся, дефект не воспроизведён.

Read-only smoke Cloudflare branch preview `fix-durable-outbox.fitfocus.pages.dev`
проверил точный опубликованный SHA `e469959db1234011fe01cde0e9a270c4e7f5b2ae`:
`/`, `/api/env` и `/api/me` вернули 200; анонимные `/api/bootstrap`,
`/api/profile` и `/api/push/status` вернули 401 без redirect и `Set-Cookie`;
основной JS bundle содержит полный SHA и все загруженные JS assets вернули 200.
Это branch preview, не staging, авторизованный сценарий или реальный OAuth.

Точный CI #1679 для опубликованного `e469959` всё ещё выполняет browser tests;
он не включает новый локальный E2E-сценарий. Отдельный HTTPS staging origin,
полная callback-матрица, устройства и общий P0.5/P0.9 остаются открытыми.
