# Стабилизация и развитие FitFocus

Обновлено: 21.10.2026. Текущий этап — **P0: стабилизация сохранности данных и
приёмка полного lifecycle**. Основной код реализуется в Draft PR
[#93](https://github.com/Michael-edel/FitFocus/pull/93), ветка
`fix/durable-outbox` → `fix/state-generations`; он зависит от открытых PR
[#94](https://github.com/Michael-edel/FitFocus/pull/94) и
[#90](https://github.com/Michael-edel/FitFocus/pull/90).

Точный CI [#1840](https://github.com/Michael-edel/FitFocus/actions/runs/39533012883)
для последнего code-bearing SHA `7f534868584936067f12b0070adc874e5755be74`
завершился success; docs HEAD `ed7100bbd50b15c2d2ede895ec59a1a99309ade8` также
прошёл точный [CI #1841](https://github.com/Michael-edel/FitFocus/actions/runs/39537965299).
Branch-preview smoke выявил ошибочную подпись preview как `main`. Локальное
исправление маркировки и регрессионный тест прошли целевые unit/typecheck/build и
Playwright. Исправленный preview SHA `1e0110a8f697c038b433e723da73e87ddad1f037`
прошёл 8/8 GET-only smoke и визуальную проверку. CI #1842 прошёл audit, guards,
unit, typechecks и build; в browser suite упал один `iphone-pwa` тест из-за гонки
готовности active session. Ожидание исправлено: теперь тест требует существующую
серверную сессию. Тест прошёл локально 3/3, весь migration spec на `iphone-pwa` —
7/7; новый полный CI ещё не запущен.

Более ранняя проверенная ревизия Draft PR #93 —
`4ed1d27a495f1eb7934864eb5808dae538dce520`; точный
[CI #1834](https://github.com/Michael-edel/FitFocus/actions/runs/39500775880)
завершился success: npm audit — 0 уязвимостей, 1469 unit tests / 216 файлов,
1627 browser passed / 74 skipped, native Chrome BFCache — 1/1, rollback/CAS HTTP —
23/23. Сохранены [browser diagnostics](https://github.com/Michael-edel/FitFocus/actions/runs/39500775880/artifacts/12305346172)
и [rollback archive](https://github.com/Michael-edel/FitFocus/actions/runs/39500775880/artifacts/12304419091).

Документационный HEAD `be3ebe8` прошёл точный
[CI #1835](https://github.com/Michael-edel/FitFocus/actions/runs/39510320870):
1469 unit tests / 216 файлов, 1627 browser passed / 74 skipped, native BFCache
1/1, rollback/CAS HTTP 23/23. Сохранены [browser diagnostics](https://github.com/Michael-edel/FitFocus/actions/runs/39510320870/artifacts/12308427637)
и [rollback archive](https://github.com/Michael-edel/FitFocus/actions/runs/39510320870/artifacts/12310035761).

Последняя проверенная ревизия тестового follow-up в Draft PR #93 —
`58f4d309f7a8359c4233905cacdb49d6adb6f430`. Точный
[CI #1832](https://github.com/Michael-edel/FitFocus/actions/runs/39489956059)
для этого SHA завершился success: 1469 unit tests / 216 файлов, audit,
schema/privacy/auth/API guards, три typecheck и build; browser matrix —
1627 passed / 74 skipped, native Chrome BFCache — 1/1, rollback/CAS HTTP —
23/23. Артефакты: [browser diagnostics](https://github.com/Michael-edel/FitFocus/actions/runs/39489956059/artifacts/12298829550)
и [rollback archive](https://github.com/Michael-edel/FitFocus/actions/runs/39489956059/artifacts/12300230192).
Локально Firefox PWA recheck прошёл 3/3, вся `pwa-update.spec.ts` — 10 passed /
4 skipped без retries. Предыдущий CI #1831 отменён concurrency policy после
продвижения PR-ветки.

CI [#1833](https://github.com/Michael-edel/FitFocus/actions/runs/39500144954)
на docs-only `d1ea3af` остановился на `npm audit`: advisory
[GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv)
затрагивает Vite `<=6.4.3`. Текущий follow-up поднимает Vite и lockfile до
исправленной `6.4.4`; изменение опубликовано в `4ed1d27` и подтверждено CI #1834.
Более ранний точный
[CI #1829](https://github.com/Michael-edel/FitFocus/actions/runs/39476078016)
на code-bearing commit `16305bedbee49fdeb611fa69e9c0ad9625bf7b91` завершился
success: 1627 browser passed / 74 skipped, native Chrome BFCache — 1/1,
rollback/CAS HTTP — 23/23, audit, guards, unit, три typecheck и build прошли.
Сохранены [browser diagnostics](https://github.com/Michael-edel/FitFocus/actions/runs/39476078016/artifacts/12292299978)
и [rollback archive](https://github.com/Michael-edel/FitFocus/actions/runs/39476078016/artifacts/12293138406).

Предыдущий точный
[CI #1823](https://github.com/Michael-edel/FitFocus/actions/runs/39426977716)
на `5f92da16632b27b5bace86783757748f42764188` завершился с **1603 passed /
67 skipped / 3 failed**. Три падения имели две причины: два iPhone Safari/PWA
snapshot теста ожидали пустую очередь B, хотя B независимо поставил
`weekly_reports`; один desktop WebKit reload тест получил четыре ошибки
отменённых GET. Follow-up [`26e6b3a`](https://github.com/Michael-edel/FitFocus/commit/26e6b3a)
ограничивает проверку отсутствием операции A у B, ждёт гидратацию настроек и
принимает только точные reload warnings, совпавшие с failed GET; локальные
сценарии прошли 7/7 и 3/3 без retries.

Follow-up [`b5a493e`](https://github.com/Michael-edel/FitFocus/commit/b5a493e)
повторно проверяет исходную сессию перед alert о позднем HTTP/network отказе
удаления аккаунта. Дефект воспроизведён на 7/7 browser-профилях; после фикса
сценарии успешного удаления и позднего отказа прошли 14/14, целевой unit —
10/10, полный unit — 1469/1469. Исправление опубликовано в `030e10e` и входит
в CI #1829 и последующие ревизии.

Ранее точный [CI #1822](https://github.com/Michael-edel/FitFocus/actions/runs/39413327068)
для предыдущего SHA завершился с 1584 passed / 67 skipped / 1 failed. Отказ
Firefox E2E `owned-state.spec.ts` исправлен в [`11e1fd1`](https://github.com/Michael-edel/FitFocus/commit/11e1fd1):
Council clear disabled until session guard and quota-failure marker verified.
Полный `owned-state` прошёл 42/42 на семи профилях, проблемный Firefox сценарий —
10/10, typecheck и полный unit suite — 1466/1466.
Предыдущий точный
[CI #1820](https://github.com/Michael-edel/FitFocus/actions/runs/39403388251)
завершился с 1568 browser tests passed, 67 skipped и 3 failed. Диагностика
показала полный ответ Service Worker fence при состоянии контроллера `activating`,
гонку раннего E2E-снимка с profile operation в статусе `sending` и два Safari
GET-abort console errors при reload. Все три отказа исправлены в `e33fb78`;
затронутые browser сценарии прошли локально 24/24 (`workers=2,retries=0`). Новый
CI проверяет опубликованное исправление.
Предыдущий CI #1817 выявил тот же тип writer-fence timeout на iPhone PWA;
failure-only диагностика добавлена в `44b6356`.
Документационный push `fca954d` отменил предыдущий run #1819 по concurrency.
Два E2E для позднего `/api/state` ответа после смены аккаунта и reauthentication
вошли в `e33fb78`; общий CI #1822 завершился с единственным отказом в другом
сценарии (`owned-state.spec.ts`).

Локальный коммит [`75b59b0`](https://github.com/Michael-edel/FitFocus/commit/75b59b0)
добавляет same-account reauthentication E2E для PDF сравнения замеров и архива
прогресса. Обе проверки прошли на всех семи desktop/mobile/PWA проектах без
retries (14/14); root typecheck, admin guards, PDF unit tests (6/6) и
`git diff --check` прошли. Эти тесты вошли в опубликованный SHA `5f92da1`;
CI #1823 для него завершился тремя E2E сбоями, разобранными выше. Последующие
исправления вошли в текущую ветку и проверяются в CI #1832.

Проверенный branch preview `https://fix-durable-outbox.fitfocus.pages.dev/`
отдавал bundle с точным SHA проверенной ревизии
`58f4d309f7a8359c4233905cacdb49d6adb6f430`.
Read-only preview suite прошёл **8/8 GET-only** проверок:
публичные маршруты отвечают 200, закрытые API — 401 без redirect/cookie;
Service Worker активируется, scope `/`, после reload контролирует страницу.
Загруженный `/assets/index-6mWogxmq.js` содержит тот же полный SHA. Это preview,
а не отдельная staging-среда; OAuth, D1 и авторизованные записи не подтверждены.

PR #90 остаётся открыт; одобряющего review пока нет. Вы подтвердили, что
сможете получить необходимое одобрение. Требование защищённой `main` пока не
выполнено, merge не сделан.

В плане **27 незакрытых пунктов верхнего уровня**: 15 в P0, 7 в P1 и 5 в
подготовительных и компонентных разделах. Ни один P0 не закрыт целиком. Остались другие
writers и lifecycle callbacks, полная матрица, UI разрешения конфликтов, отдельная
staging-среда с OAuth и D1, совместимость старых/новых bundles, rollback/release
checklist и интеграция через защищённую `main`.

## Исторические результаты предыдущих этапов

Follow-up `dc38a51` закрывает найденную браузерную границу unload:
`beforeunload` заранее отменяет активный AI fetch и registration action, а
`pagehide` остаётся дополнительной защитой. E2E `registration-durability.spec.ts`
прошёл 21/21 на семи browser/PWA профилях, targeted unit — 44/44, полный unit —
1388/1388 в 215 файлах; root/domain/storage typecheck, production build и
`git diff --check` прошли; code и test follow-ups опубликованы в PR.
Предыдущий [CI #1628](https://github.com/Michael-edel/FitFocus/actions/runs/39139902243)
для `5d5dca8` не содержит этот fix. На `9825e8d` он подтверждён точным CI #1630.
На `f4dcce8` прошли
registration unit 16/16, root/storage typecheck, auth-scope guard, production
build и registration durability E2E 2/2 в desktop Chromium. Родительский
[CI #1624](https://github.com/Michael-edel/FitFocus/actions/runs/39136081427)
на `702b4d1` завершился success, включая browser matrix и rollback compatibility.

Read-only smoke branch preview подтвердил SHA `5d5dca8`: staging smoke прошёл 7/7
GET-проверок, bundle содержит полный SHA; `/`, `/api/env`, анонимный `/api/me` —
200, защищённые bootstrap/profile/state/push/status — 401 без redirect и
`Set-Cookie`. Это проверка branch preview, не отдельного staging, OAuth или D1.

В `b97307a` добавлена безопасная сводка причин legacy quarantine: интерфейс
показывает их только для подтверждённого аккаунта и скрывает ключи/raw payload.
Old/new bundle acceptance прошёл 7/7 в desktop Chromium; migration unit — 78/78;
root, domain-strict и storage-strict typecheck, production build и `git diff --check`
прошли локально. Точный CI #1622 для `b97307a` завершился с E2E-сбоями; причины
и тестовый follow-up `7f76a8e` описаны ниже.

В плане остаются 31 пункт: 18 P0, 7 P1 и 6 подготовительных задач; ни один P0 не
закрыт целиком. Staging, выпуск и интеграция в защищённую `main` открыты.
Опубликованный HEAD [`dbca5e3`](https://github.com/Michael-edel/FitFocus/commit/dbca5e3)
проверялся точным [PR CI #1571](https://github.com/Michael-edel/FitFocus/actions/runs/39048988632),
который завершился ошибкой в E2E: summary сообщил `341 failed`, а доступные
GitHub annotations показывают отказы account-switch сценариев при ожидании
пустого outbox. В тестовой фикстуре не было активного состояния Service Worker;
она исправлена в `a0721b0`, десять аннотированных сценариев прошли локально
10/10 на Chromium. CI нового PR head `bb94957` — [run #1573](https://github.com/Michael-edel/FitFocus/actions/runs/39056823576) —
позднее завершился двумя E2E сбоями после успешных audit, guards, unit,
typechecks и production build; оба сценария локально прошли 5/5.

Исправление обнаруженной паузы sender: когда первый fence handshake не давал
подтверждение, `StateSync` сохранял безопасный запрет отправки, но секундный
polling не начинал новую верификацию. Теперь проверка ждёт `activated` у текущего
Service Worker, а после пропуска автоматически повторяется с ограниченным
backoff; отправка по-прежнему разрешена только после валидного all-client proof.
Регрессионные unit-тесты и миграционный набор прошли **18/18**, полный unit suite
— **1352/1352**, три typecheck и production build прошли. Android Chrome stress
прошёл **20/20** без retries; полная PWA offline-матрица — **7/7** без retries.
Все локальные проверки успешны, однако они ещё не заменяют точный CI нового SHA.

Более ранние мобильные результаты на `10dbcab` и предыдущая история CI приведены
ниже; они не заменяют текущую матрицу 7/7 и точный CI.

В кодовом коммите [`646b8b4`](https://github.com/Michael-edel/FitFocus/commit/646b8b4)
обработан отказ durable profile write в Progress/Settings: ошибки видны,
черновики и выбранный файл остаются для повтора, а stale account/session callback
не меняет экран нового владельца. Полная `profile-durability.spec.ts` прошла
42/42 на desktop Chromium/Firefox/WebKit без retries; 1347 unit-тестов, root,
domain-strict и storage-strict typecheck, production build и `git diff --check`
прошли локально. Exact CI для этой ревизии запускается после push. Предыдущий
CI [#1549](https://github.com/Michael-edel/FitFocus/actions/runs/39022938858)
проверяет parent HEAD `81823dc` и на момент записи выполняет E2E; он не включает
кодовый commit `646b8b4`.

Точный [PR CI #1501](https://github.com/Michael-edel/FitFocus/actions/runs/39006074443)
для опубликованного `7ff579d` завершился success: 1326 unit tests / 212 файлов,
850 browser passed / 263 skipped за 38,1 минуты; audit, guards, три typecheck и
build прошли. Rollback/CAS-проверка выполнила 23 HTTP/D1-запроса, diagnostics и
rollback artifact сохранены ([browser](https://github.com/Michael-edel/FitFocus/actions/runs/39006074443/artifacts/12091992214),
[rollback](https://github.com/Michael-edel/FitFocus/actions/runs/39006074443/artifacts/12091852535)).
Локально также прошли targeted bulk/account E2E 3/3 desktop engines без retries
и legacy migration tests 128/128. Дублирующий push-run #1500 отменён concurrency
после старта PR-run. PR остаётся draft; staging и интеграция в `main` открыты.

CI #1491 обнаружил гонку гидратации профиля в PWA update acceptance; тест теперь
ждёт исходное имя из общей фикстуры перед вводом. Исправленный сценарий прошёл
5/5 на desktop WebKit (`workers=1`, `retries=0`), затем CI #1493 на `b67beee`
успешно проверил его вместе с полным набором.
История и ограничения — в [журнале стабилизации](docs/stabilization-progress.md).

Предыдущий run #1467 для `c44027f` подтвердил исправление порядка mock-недели,
но выявил отдельное прерывание weekly AI `wis_text` при reload в desktop WebKit.
Локальный WebKit-сценарий после исправления прошёл 3/3 без retries.

В локальную ветку также добавлен same-account reauthentication тест для weekly
AI report: 6/6 на Chromium, Firefox и WebKit. Исправленный E2E-код и документация
ещё не подтверждены полным CI. P0/P0.8/P0.9, staging, выпуск и интеграция в
`main` остаются открыты.

Добавлена проверка P0.9 для DELETE-конфликта `council_history`: локальный
tombstone и `serverSnapshot` версии 9 сохраняются в IndexedDB; после reload
явное подтверждение применяет серверную версию, очищает операцию и ставит
`confirmedVersion = 9`. Тот же `opId` переживает reload, повторного DELETE нет.
Все 7 browser/PWA профилей прошли без retries.
Тест account-switch больше не сравнивает viewport-зависимый `activeSection`;
остальные UI-настройки аккаунта и очистка черновика проверены 3/3 Chromium.

В плане остаются 33 незакрытых пункта: 19 P0, 7 P1 и 7 следующих задач; ни один
P0 не закрыт полностью. Staging, выпуск и интеграция в защищённую `main` не
подтверждены. Подробные результаты — в [журнале](docs/stabilization-progress.md),
[матрице](docs/verification-matrix.md) и [статусе проекта](docs/project-status.md).
### Дополнительные подтверждённые результаты

Mock-фикстура опубликована в `085fcc1` и проверена полным CI `aefc463`.
Ранее подтверждённый [CI для tombstone-коммита `57e0a93`](https://github.com/Michael-edel/FitFocus/actions/runs/38340805337):
1082 unit / 197 файлов; browser — 390 passed / 9 skips, success, 21,1 мин.
Dependency audit сообщил 0 уязвимостей; rollback-check выполнил 23 HTTP/D1-запроса.
P0.8 остаётся открытым до полного lifecycle и общей приёмки. Полный
[CI run 38318876304](https://github.com/Michael-edel/FitFocus/actions/runs/38318876304)
на `c724bce` также завершился success. После него настоящий old/new bundle smoke
прошёл на семи Playwright-проектах и проверен полным [CI `00cd005`](https://github.com/Michael-edel/FitFocus/actions/runs/38324638965).
Последующий CI базового docs SHA `d987c846` тоже завершился success ([run
38330238660](https://github.com/Michael-edel/FitFocus/actions/runs/38330238660)).
Cleanup-компонент затем опубликован в [`b53a55e`](https://github.com/Michael-edel/FitFocus/commit/b53a55eaf272ca8ad6ba8653760f502b0e993b6b); его точный CI прошёл.
Исправление неиспользуемого Google SDK опубликовано в `98d4910`.
Компонент артефакта отката опубликован в `bd763ec`; поправка CI — в `5b90249`.
Полная приёмка проверяется отдельно;
[текущий статус](docs/project-status.md#рабочее-дерево--обновление-pwa).

Предыдущий компонент — [личные покупки](docs/personal-menu-projection.md)
`4736ff5` с серверной поправкой `830caf4`. Подготовительная версия и переход
0019 → 0020 → проекция описаны в [инструкции выпуска](docs/profile-cas-rollout.md).
История достижений, формы, прежних прогонов и исправлений сохранена
[в журнале](docs/stabilization-progress.md) и контрактах компонентов.

Пакет account-scoped cleanup опубликован в [`b53a55e`](https://github.com/Michael-edel/FitFocus/commit/b53a55eaf272ca8ad6ba8653760f502b0e993b6b).
Точный [CI run 38334411131](https://github.com/Michael-edel/FitFocus/actions/runs/38334411131)
завершился success: 1079 unit / 197 файлов, 390 browser passed / 9 skipped,
20,1 мин; audit, guards, три typecheck, build и 23 HTTP/D1-запроса прошли.
Rollback-артефакт сохранён в [run](https://github.com/Michael-edel/FitFocus/actions/runs/38334411131/artifacts/11784907304).
Общий legacy-источник и снимки сохраняются, поэтому полное удаление локальных
копий не подтверждено. Контракт: [очистка данных аккаунта](docs/account-data-cleanup.md).

Полная область — в [карте документации](docs/README.md),
текущая работа — в [статусе проекта](docs/project-status.md). Этот файл — очередь реализации.
P0.8 подключён к runtime; реальная миграция pending legacy intent из старого
bundle проверена на семи Playwright-проектах и прошла CI на `00cd005`; cleanup
опубликован в `b53a55e` и прошёл точный CI. Ни один P0 целиком не закрыт.

## Подготовленный компонент — preview origin

- [x] Воспроизвести клиентский переход preview → production и убрать его
  из entry point; сохранить URL и относительные API выбранного origin.
- [x] Локально проверить три hostname на семи конфигурациях и native PWA-shell:
  28/28, workers=1/retries=0; typecheck и admin guards прошли.
- [x] Подтвердить [CI компонента `076f4ac`](https://github.com/Michael-edel/FitFocus/actions/runs/38261672999):
  success, 1053 unit / 194 файла, 383 browser passed / 9 skips, 20,3 мин;
  23 HTTP/D1-запроса прошли.
- [ ] Проверить фактический deployment, D1, APP_URL, OAuth и edge-правила.
  Branch preview текущего SHA `58f4d30` подтверждён: GET-only smoke 8/8,
  загруженный bundle содержит полный SHA, а Service Worker активируется и
  контролирует страницу; отдельный staging, D1, APP_URL, OAuth и реальные
  edge-правила остаются непроверенными.
  - [x] Для current branch preview commit `bb94957` сверить успешный Cloudflare
    deploy, страницу и анонимные GET: root/env/me — 200, защищённые
    bootstrap/profile/state/push — 401 без redirect/cookie. Свежий Chromium
    остался на preview origin без page/console errors и записывающих запросов.
    Google Client IDs пусты; OAuth start не запускался. D1, `APP_URL`, callback,
    отдельная staging-база и непроверенные edge routes остаются открытыми.
  - [x] Повторно проверить текущий branch preview: точный bundle SHA `8dfab60`
    обслуживается на `fix-durable-outbox.fitfocus.pages.dev`; страница, `/api/env`
    и анонимный `/api/me` отвечают на том же origin; оба Google Client ID пусты,
    `requireInvite=false`. Анонимные GET для bootstrap,
    profile, state и push/status дают 401 без redirect/cookie. OAuth start не
    вызывался; оба Client ID пусты. `wrangler.toml` задаёт один глобальный D1
    binding без preview override, но фактическую Pages-конфигурацию без Cloudflare
    доступа проверить нельзя; D1, APP_URL, OAuth callback и остальные staging
    gates открыты.
  - [x] Проверить preview SHA `9c78726` только GET-запросами: bundle содержит
    полный SHA, публичная страница открывается на preview origin, анонимные API
    отказывают ожидаемо. Реальный OAuth start вернул `AUTH_UNAVAILABLE`;
    конфигурация OAuth в Pages и остальные staging gates остаются открытыми.
  - [x] Повторно проверить branch preview после `0af2c30`: страница и точный
    bundle SHA вернули 200 на `fix-durable-outbox.fitfocus.pages.dev`; `/api/env`
    и анонимный `/api/me` — 200, `/api/bootstrap`, `/api/profile`, `/api/state`
    и `/api/push/status` — 401 без redirect/cookie. Только GET, OAuth start не
    вызывался; D1, `APP_URL`, provider callbacks и реальные edge-настройки
    остаются непроверенными. Дополнительный Chromium browser smoke подтвердил
    отрисовку landing page без pageerror, app console errors и записывающих запросов;
    зафиксировано одно предупреждение о `ambient-light-sensor` policy feature.
  - [x] После `dfe9b42` повторить branch preview smoke без cookies и redirect-follow:
    bundle содержит точный SHA, root и выбранные API остаются на preview origin;
    `/api/env` и `/api/me` дают 200, защищённые GET — 401 без `Location` и
    `Set-Cookie`. Проверялись только GET. Браузерный smoke текущего SHA, D1,
    `APP_URL`, OAuth, edge rules для остальных путей и staging остаются открытыми.
  - [x] Проверить deployment `87ba8b9`: JS bundle содержит точный SHA; GET
    `/`, `/api/env`, `/api/me` вернули 200, защищённые bootstrap/profile/state/push
    маршруты — 401 без redirect/cookie. Свежий Chromium отрисовал FitFocus без
    `pageerror`, off-origin или не-GET запросов. Осталось одно известное
    предупреждение о `ambient-light-sensor`; директива сохранена для браузеров,
    которые её поддерживают. Проверка не подтверждает D1, `APP_URL`, OAuth,
    авторизованные действия или реальные edge rules.
  - [x] Подтвердить branch preview для `e91c134`: bundle содержит полный SHA;
    root, `/api/env`, `/api/me` — 200, защищённые bootstrap/profile/state/push
    GET — 401 без redirect и `Set-Cookie`. Проверка только read-only; D1 binding,
    `APP_URL`, OAuth и отдельная staging-база остаются открыты.
  - [x] Повторить read-only smoke для remote HEAD `5d5dca8`: staging suite прошёл
    7/7 GET-проверок, браузер остался на preview origin без pageerror и не-GET;
    bundle `/assets/index-6747H75z.js` содержит полный SHA
    `5d5dca8ddc8e3d782fc4f44ccf1b1399878a3488`. Это не отдельный staging и не
    подтверждает OAuth, D1 или авторизованные действия.
  - [x] Проверить текущий PR HEAD `1546073` на branch preview: staging suite
    прошёл 7/7 GET-only проверок, asset `/assets/index-CmecaeC0.js` содержит
    полный SHA `1546073d72d8c81bb8628bf5dbedfab0c6430d12`. Это не отдельный
    staging и не подтверждает OAuth, D1 или авторизованные действия.

База компонента — `aefc463`; [контракт и история прогонов](docs/staging-origin.md).
Это локальная часть подготовки staging, а не закрытие P0 или выпуск.

## Порядок работы

CI `076f4ac` завершился success без flaky и proxy-ошибок; причины прежних native WebKit/Firefox сбоев ещё требуют отдельной диагностики. Два полных прогона rollback artifact `574de76`
дали 26 passed / 2 failed каждый; база содержит лишний Google SDK и не принята.
В `98d4910` SDK удалён из HTML. В новом компоненте обновлены закреплённый SHA
и workflow-пути, собран архив `98d4910`: 82 файла, 28 browser passed на семи
конфигурациях, workers=1/retries=0, 13,2 мин. HTTP/D1-переход `bd763ec`
→ архив `98d4910` прошёл 23 запроса. CI `5b90249` также прошёл 23 HTTP/D1
запроса и сохранил `.tar`; скачанный архив проверен. Ближайшие шаги —
разобрать Firefox IDB timeout и native WebKit sender error, затем пройти staging.
Тест восстановления pending теперь учитывает сохранённые `Retry-After`
и lease; проверяет время приёма на HTTP-фикстуре. Production backoff/claim
не изменены. Диагностика с Retry-After прошла 3/3 в desktop-движках.
Временная подмена внешнего SDK дала 4/4 Firefox/Android, но не устранила
ошибки полного повторного прогона; подмена удалена. История сохранена
в [журнале](docs/stabilization-progress.md).
- [x] Устранить выход mock API-запросов при WebKit teardown без фильтрации
  ошибок: общая фикстура выгружает документ до снятия маршрутов; полный CI
  `aefc463`/`076f4ac` прошёл без preview ECONNREFUSED/proxy errors.
Первый расширенный прогон — 97 passed / 1 failed на iPhone PWA. После отдельного
ожидания самого экрана перед семейными данными прошли 98/98 на семи конфигурациях,
workers=2/retries=0, без proxy-ошибок. Typecheck прошёл; полный CI mock-фикстуры
подтверждён на `aefc463`. [Доказательства и следующий шаг](docs/mock-api-lifecycle.md).
Текущий шаг P0.8 подключает runtime-импорт к свежему `/api/me` и требует
подтверждение build id от всех same-origin вкладок перед отправкой legacy-операций.
В unit/integration проверках покрыты владелец, карантин, отсутствие proof и закрытый
send gate; настоящий PWA update-тест проверяет fence и сохранность очереди/профиля.
Smoke настоящей legacy-записи между старой и новой сборками прошёл локально 7/7;
CI точного SHA `00cd005` завершился success в [run 38324638965](https://github.com/Michael-edel/FitFocus/actions/runs/38324638965).
Формат backup v3 для всех пяти IDB stores и атомарный restore реализованы и
опубликованы в [`2aff6c3`](https://github.com/Michael-edel/FitFocus/commit/2aff6c33d638052d9a084902895df822efb269e5).
Локально прошли 1073 unit / 196 файлов, три typecheck, production build и 7/7
тестов backup. [Полный CI PR-head `2aff6c3`](https://github.com/Michael-edel/FitFocus/actions/runs/38327323270)
завершился success: 1073 unit / 196 файлов, 390 browser passed / 9 skips
(15,7 мин), audit/typechecks/guards/schema/privacy/build и 23 HTTP/D1 rollback
проверки прошли. Далее — остальные callbacks P0.2–P0.6, полная lifecycle-
приёмка recovery UI и staging/rollback acceptance. Account-scoped cleanup
реализован; общее legacy evidence физически не удаляется.
Интеграция P0.1 и серверной части P0.7 в защищённую main остаётся открытой.
P0.9 пополняется тестами каждого исправления и завершается проверкой
всего жизненного цикла и выпуска. [Подробный статус](docs/project-status.md),
[матрица подтверждённых частей и открытых критериев](docs/verification-matrix.md).

Новые независимые ветки начинать от актуальной GitHub `origin/main`.
Если нужны изменения из PR #90, сначала выделить или интегрировать
необходимую зависимость и явно указать её в PR. Не отправлять локальную
`main` целиком: на дату снимка она опережает `origin/main` на 250 коммитов.

## Завершённый клиентский этап 11.10.2026

Список управляемых state-ключей расширен с 6 до 15, прежний sender удалён
из текущей сборки. [Граница реализации](docs/owned-state-writers.md).

- [x] Исправить ожидание `quota` / `STATE_STORAGE_QUOTA` в новом тесте
  отказа удаления; подтвердить rollback и сохранность видимого значения.
- [x] Проверить гонку удаления с новой правкой, раннюю правку до загрузки,
  привязку редактора и syncNow к исходному аккаунту.
- [x] Проверить в браузере отметки плана и очистку истории с reload;
  убедиться, что чтение не создаёт операций и legacy-источник сохранён.
- [x] Выполнить локальные проверки и обновить контракты по итоговой реализации.
  Код `31ec847` опубликован с документацией на `44e0c32`;
  [CI этой ревизии прошёл](https://github.com/Michael-edel/FitFocus/actions/runs/38150544608).
  SHA, результаты и ограничения — в [журнале](docs/stabilization-progress.md).

Дополнение `fc6bb82`: [редактор профиля](docs/profile-persistence.md)
использует единственную outbox, отдельный guarded HTTP и CAS; отказ commit
сохраняет dirty-форму. 790 unit-тестов прошли; результаты браузеров и
остальных проверок записаны [в журнале](docs/stabilization-progress.md).

Дополнение `2e41742`: [регистрация](docs/registration-persistence.md)
сохраняет canonical profile до AI, AI-update продолжает ту же цепочку;
quota оставляет форму открытой. Вход не угадывает владельца по email,
не переименовывает prefix и восстанавливает только own IDB-profile.
Invite redeem проверяет свежую session-привязку до расходования кода.
814 unit-тестов прошли; результаты браузеров — в журнале.

Исправление `b723b7d` останавливает sender при pagehide и заново проверяет
сессию при возврате из BFCache. После него прошли 816 unit-тестов,
117 браузерных сценариев и 9 явных skips; два Safari reload-сценария
дополнительно прошли 20 повторов. [Контракт](docs/state-sender.md#жизненный-цикл-страницы).

На `cb6e6cf` тест регистрации ожидает постоянную auth-паузу вместо точного
числа запросов до UI-проверки. 817 unit-тестов и 20 повторных сценариев
Firefox/iPhone PWA прошли; исходный flaky в CI и проверка нового HEAD —
[в журнале](docs/stabilization-progress.md).

Далее продолжить незакрытые P0 ниже. Отключение sender в новой сборке
не является доказательством остановки ранее открытых старых сборок.

## В работе — загрузка сессии и облачных данных

Контракт и результаты: [bootstrap/hydration](docs/bootstrap-hydration.md).
Код компонента — `dac2de2`; пункты P0.3–P0.6 остаются открытыми для остальных
writers/callbacks и приёмки. [CI `57f956d`](https://github.com/Michael-edel/FitFocus/actions/runs/38170218508)
прошёл: 846 unit, 145 browser passed / 9 skips, без flaky. CI опубликованного
исправления `45315d9` также прошёл: 846 unit, 152 browser passed / 9 skips,
без flaky; [запуск](https://github.com/Michael-edel/FitFocus/actions/runs/38172605267).
Предыдущее падение регистрации Safari на `ece4e7a` сохранено в журнале; успешный
следующий запуск сам по себе не устанавливает причину.

- [x] Останавливать вход при успешном `/me`, который не подтверждает аккаунт,
  доступ или capability, включая путь без входящего readGuard; добавить
  регрессионные тесты отдельно от восстановления при ошибке сети.
- [x] Не повышать revision при повторном чтении того же owned-снимка;
  независимые изменения и новая версия сервера по-прежнему дают конфликт.
- [x] Устранить гонку проверки очистки истории: pending и содержимое
  проверяются по одному снимку IDB. 15 повторов прошли без retries.
- [x] Стабилизировать область notice при удержанном profile Save (`3550cc8`). В диагностическом
  прогоне pointerdown попал в кнопку, а через 12 мс pointerup/click — в DIV;
  outbox и список PUT остались пустыми. Проверить изменение расположения формы
  при обновлении notice. До исправления регрессионный тест подтвердил сдвиг
  документа на 86/86/106 px в Chromium/Firefox/iPhone PWA; после прошёл во всех
  семи проектах. Исходный и новый сценарии прошли 20 повторов Safari/PWA.
  Проверено: удержать нажатие, завершить state-sync и отпустить указатель;
  кнопка остаётся целью, создаётся одна profile-операция, а 409 сохраняет её
  локальный payload и серверный снимок. Повторный клик не считается исправлением.
- [x] Завершить диагностику остальных Safari reload sources, включая `/api/profile`.
  Источник profile debounce → `/api/me` установлен и исправлен на `f3930ec`.
  Артефакт точного CI #1603 (`de56ab3`) сохранён и изучен: историческая ошибка
  `/api/ai due to access control checks` возникла у отдельного фонового weekly-AI
  запроса через 21 мс после начала reload; удержанный GET `/api/profile` был
  отменён отдельно и ожидаемо. В `useWeeklyAiReport` сигнал запроса теперь
  инвалидируется на `beforeunload`. Native HTTP acceptance подтверждает cancel
  GET `/api/profile`, доступность локального профиля и отсутствие page/console
  errors. В `pwa-update.spec.ts` assertion ужесточён до нуля WebKit `/api/ai`
  warnings; desktop WebKit, iPhone Safari и iPhone PWA прошли 3/3
  (`workers=1,retries=0`). CI #1813–#1816 отменены после продвижения ветки;
  точный CI #1817 для `045f934` выполняет полный browser E2E.
  В `pwa-update.spec.ts` снят ещё один `/api/me` допуск; вся спека прошла 6/6.
  В `weekly-menu-durability.spec.ts` удалены допуски для `/api/me` и
  `/api/achievements/check`; спека прошла 24/24. В `pwa-rollback.spec.ts`
  удалён `/api/me` page/console допуск, при этом сохранена проверка точных
  ожидаемых request cancellations; pending/conflicted матрица прошла 6/6.
  Все три спеки прошли без retries на desktop WebKit, iPhone Safari и iPhone PWA;
  page/console warning не возник. В `pwa-offline-durability.spec.ts` снят допуск
  одного iPhone PWA `/api/me` warning при offline transition; сценарий прошёл
  7/7 на всех browser/PWA профилях; изменение опубликовано в `8ae5c0f`, CI #1815
  отменён при продвижении ветки. В `family-menu-durable.spec.ts` снят cap на четыре
  `/api/me`/family reload access-control errors: смена аккаунта и same-account
  reauthentication прошли 6/6 на трёх WebKit/PWA профилях с нулём warnings.
  Затем в `ai-callback-account-switch.spec.ts` удалено последнее узкое
  исключение для WebKit `/api/ai` access-control warning при переходе на другой
  аккаунт. Строгая проверка `errorsA === []` прошла 7/7 browser/PWA профилей,
  включая desktop WebKit; root typecheck и `git diff --check` прошли.
  Изменения семейных и AI callback проверок публикуются в текущем follow-up;
  точный CI после push обязателен.
  Точный CI #1829 на `16305be` завершился success: полная browser matrix прошла
  1627 сценариев, 74 были пропущены по условиям проектов; строгие reload-проверки
  вошли в этот прогон. Источники исторических сообщений разобраны по trace и
  проверены без общего CORS/network-фильтра. Отдельные device/staging/old-new
  bundle gates остаются в пункте P0.5 ниже.
  Общий CORS-фильтр не добавлялся.
- [x] Опубликовать компонент и проверить CI точного `ece4e7a`: success,
  846 unit-тестов, 144 browser passed / 1 flaky / 9 skips.
- [x] Проверить CI опубликованного исправления Save на точном `45315d9`:
  success, 846 unit-тестов, 152 browser passed / 9 skips, без flaky.
- [x] После исправлений пройти полную матрицу без retries и проверить CI
  итогового HEAD. На `3550cc8`: 151 passed / 1 failed / 9 skips; падение —
  Safari page error на reload после успешного Save/409. Шесть диагностик
  с задержанными запросами и reload его не воспроизвели; общий фильтр ошибок
  не добавлен. CI `45315d9` прошёл, но локальное падение и его причина остаются
  частью исторической диагностики. В текущем profile follow-up `d6946af`
  исправлена только проверка viewport: поле настроек расположено ниже первого
  экрана на iPhone. Целевая матрица прошла 3/3, полная `profile-durability.spec.ts`
  — 63/63 на семи проектах при `workers=1,retries=0`. Это не закрывает полный
  E2E набора. Следующая поправка profile recovery в `6b38bb3` прошла 9/9
  повторов на Chromium/Firefox/WebKit. Полный CI #1489 для `584b257` прошёл
  проверки до E2E, но упал на одном WebKit same-account family-menu reload:
  trace поместил точный GET `/api/family/menu` через ~45 мс после начала reload.
  В E2E helper добавлен только этот маршрут в bounded WebKit-исключение;
  проблемный сценарий прошёл 5/5, вся family-menu спека desktop WebKit — 16/16
  при `workers=1,retries=0`; точный полный CI актуального HEAD зафиксирован ниже.
  В `playwright.config.ts` CI retries отключены, чтобы первый нестабильный
  запуск завершался ошибкой. На точном документационном HEAD `9ba464b` CI #1698
  завершился success: 1454 unit / 216 файлов, 1110 browser passed / 311 skipped
  за 47 минут, retries=0, все guards/typecheck/build и rollback/CAS успешны;
  rollback и browser diagnostics артефакты сохранены. Это закрывает полную
  матрицу для актуального HEAD. Исторический pageerror и его причина остаются
  в предыдущем диагностическом пункте; staging не проверен.
  [Подробные свидетельства](docs/stabilization-progress.md).

## Персональное недельное меню — реализация и открытая приёмка

Код [`f4b4eee`](https://github.com/Michael-edel/FitFocus/commit/f4b4eee1e577292019481b711b097941df27558e), [контракт и результаты](docs/ai-session-guard.md#клиентское-подключение-в-работе).

- [x] Подключить свежий proof исходного входа, обе capabilities и scope
  к AI/items HTTP; отсутствие capability не заменять обычным запросом.
- [x] Защитить action/page/login lifetime и поздние success/failure;
  проверить logout, независимую правку и синтетический pagehide/pageshow.
- [x] Проверять session/epoch/auth-fence и актуальность редактора внутри
  транзакции, ждать profile commit до публикации меню и вторичного writer.
- [x] Убрать скрытую отправку items из генерации; отдельно показывать её отказ.
  Quota/конфликт не создают items или achievement успешного меню.
- [x] Исправить desktop-панель: настройки доступны после обычной прокрутки.
  Убрать неверное ожидание hash при переключении React tabs в тесте.
- [x] Исправить классификацию отмены `/me` и отделить таймаут HTTP от lifetime
  попытки; проверить снятие loading и повтор генерации после таймаута.
- [x] Пройти 900 unit, три typecheck, guards/schema/privacy/audit/build.
- [x] Пройти последующую локальную матрицу на `f3930ec`: 201 browser passed / 9 skips, без retries.
  Это не закрывает реальный lifecycle/staging или CI нового HEAD.
- [x] Проверить workflow опубликованного компонента на `42ee434`: success,
  950 unit / 186 файлов, 229 browser passed / 9 skips.
- [x] Защитить achievement HTTP/очередь в `useAchievements.ts` и серверный
  handler: проверка menu use case до вызова не защищает последующий POST.
  Реализовано в `57da2cf` с поправками до `724ecf1`; локально прошли 950 unit
  и полная матрица 229 passed / 9 skips. CI `42ee434` подтверждён.
  Follow-up [`616f42c`](https://github.com/Michael-edel/FitFocus/commit/616f42ca2bb973cfb034f50112328843eaf837a4)
  требует proof также от legacy-запросов и отклоняет unscoped POST до разбора
  body. Локально прошли 1242 unit / 208 файлов, 18 профильных тестов, три
  typecheck, API/auth/schema/privacy guards и build. Старые bundles нужно
  обновить; точный CI, staging/BFCache остаются открытыми.
  Счётчики остаются best effort; staging/BFCache ещё открыты.
  [Контракт и границы](docs/achievement-session.md).
- [x] Личный список покупок переведён на profile CAS и SQL-проекцию без
  отдельного личного items POST; семейное меню, порции и покупки используют
  одну `familyMenu` outbox-операцию с CAS по семье и неделе.
  [Личный контракт](docs/personal-menu-projection.md),
  [семейный контракт](docs/family-menu-state.md).
- [ ] Проверить эти пути на staging и завершить реальные BFCache/OAuth-сценарии;
  остальные AI/report/retry/family writers и их общий lifecycle остаются открыты.
  Коммит `16305be` добавляет нативную Chrome BFCache acceptance: два same-origin
  перехода подтверждают настоящее `pageshow.persisted=true`, затем тест приложения
  проверяет новый GET `/api/env`. Локально Chrome прошёл 1/1; точный CI #1829
  выполняется. OAuth, другие callbacks, физическое устройство и staging остаются
  открыты. Unit-проверка двух IDB connections не заменяет old/new bundles.

Ни весь P0.5, ни выпуск этим компонентом не закрыты.

## Последующее исправление автоматической синхронизации профиля

- [x] Установить callback native `/api/me`: debounce → `syncNow` → `verify`
  после `beforeunload`, до `pagehide`; baseline 3 failed / 13 passed.
- [x] Заменить автоматический вызов на `flushPending`; сохранить ручной свежий
  proof, auth-паузу, проверку владельца и защиту старого поколения.
- [x] Усилить E2E реальной auth-паузой, фактическими PUT/401 и тем же opId
  после reload; пройти 905 unit и полную матрицу без retries.
- [x] Не планировать flush для чистого профиля, сохранив cloud refresh и
  одноразовый suppress; проверить recovery и отсутствие ложной ошибки.
- [x] Подтвердить workflow последующего опубликованного `42ee434`.
- [ ] Завершить остальные lifecycle-сценарии и staging.
- [x] Подтвердить CI profile-компонента на `bf01d87`: 905 unit,
  201 browser passed / 9 skips, без flaky; последующие компоненты проверяются отдельно.

Реализация [`f3930ec`](https://github.com/Michael-edel/FitFocus/commit/f3930ec64f7fa74f3aad352246aa18b92d2542b7); [контракт](docs/state-sender.md#автоматическая-отправка-и-ручная-проверка-сессии),
[журнал](docs/stabilization-progress.md). Прежние падения и retries выше
сохраняются как история; общий CORS-фильтр не добавлен.

## Текущий компонент — личные покупки и profile CAS

Код [`4736ff5`](https://github.com/Michael-edel/FitFocus/commit/4736ff51b06f0062a6cb45a98169f4a4d0c39895),
[контракт и свидетельства](docs/personal-menu-projection.md),
[ADR-007](docs/adr/ADR-007-personal-menu-projection.md).

- [x] Сохранять покупки SQL-проекцией принятого profile CAS без второго
  личного POST; старый POST не меняет проекцию.
- [x] Разделить read/write-capabilities; без новой capability clean refresh
  доступен, а профиль остаётся pending с protocol-паузой.
- [x] Обновить menu E2E: ошибка сервера/reload восстанавливает тот же opId,
  личного items POST нет, capability проверяется до AI. 8 Chromium-сценариев прошли.
- [x] Пройти 976 unit / 187 файлов, typecheck/guards/schema/privacy, audit;
  проверить upgrade/изоляцию и 16 HTTP-запросов локального Worker/D1.
- [x] Пройти полную browser matrix `4736ff5`: 236 passed / 9 skips, без retries.
- [x] На `830caf4` возвращать постоянный отказ 422 для некорректного меню до
  persistence; сохранить версию и возможность явного удаления без угадывания недели.
- [x] Подтвердить CI `2d1f480`: 976 unit / 187 файлов,
  236 browser passed / 9 skips;
  [success](https://github.com/Michael-edel/FitFocus/actions/runs/38194485398).
- [x] Подготовить совместимый сервер `dde4c71` до 0020; пройти 952 unit,
  обязательные проверки/build и локальный переход на одной БД (30 HTTP).
  [Инструкция и границы](docs/profile-cas-rollout.md).
- [x] Подтвердить [CI подготовительного `c39904c`](https://github.com/Michael-edel/FitFocus/actions/runs/38196258543):
  952 unit, 229 browser passed / 9 skips, success.
- [ ] Подтвердить CI следующих release-ревизий.
- [ ] Проверить staging, реальные старый/новый bundles и совместимый откат;
  затем продолжить семейные writers и остальные callbacks.

P0.5, P0.8 и выпуск остаются открытыми. Это реализация существующего плана;
серверная атомарность личных покупок не закрывает семейный путь.

## P0 — сохранность данных и выпуск

Последующий компонент `9c44c21` — [сессии семейных запросов](docs/family-session.md):

- [x] Передавать исходный login guard из hydration в `useFamilyCloud`;
  требовать fresh proof и family capability перед каждым HTTP-запросом.
- [x] Проверять server scope до эффектов family/shopping handlers;
  late response, same-account login и pagehide не применяют старый результат.
- [x] Изолировать React-состояние/setters по login scope, покупки — также по familyId;
  отклонять неправильные family/week и повреждённые ответы.
- [x] Снимать необработанный Promise отметки, восстанавливать checkbox при отказе.
- [x] Пройти 1009 unit / 189 файлов, три typecheck, guards/schema/privacy и audit.
- [x] Пройти 23 HTTP-запроса локального workerd/D1 с двумя синтетическими аккаунтами.
- [x] Подтвердить полную browser matrix в CI `3baac01`: 278 passed / 9 skips,
  семь проектов, workers=2, без flaky в итоговом summary. Первый локальный
  прогон 272 passed / 6 failed / 9 skips и диагностика 12 passed сохранены в журнале.
- [x] Подтвердить [CI опубликованного `3baac01`](https://github.com/Michael-edel/FitFocus/actions/runs/38200234936).
- [x] Подтвердить последующий [CI `0eae743`](https://github.com/Michael-edel/FitFocus/actions/runs/38201311011):
  1009 unit / 189 файлов, 278 browser passed / 9 skips; без flaky в итоговом summary.
- [x] Подключить `useFamilyMenu` к durable `familyMenu` intent, family/week
  CAS и единой серверной записи меню/порций/покупок. Реализация `405238b`
  прошла CI; контракт и проверки — [здесь](docs/family-menu-state.md).
- [ ] Проверить реальные old/new bundles, PWA/Service Worker, staging и
  совместимый откат; это остаётся release gate.

[Точная граница семейного компонента](docs/project-status.md#текущая-работа--семейное-меню).
- [x] Подключить AI и server-preview к единственному familyMenu intent с исходным
  login guard, captured revision/baseVersion и guarded локальным commit.
- [x] Принимать family/week CAS одной SQL-записью, читать покупки из того же
  поколения и не восстанавливать legacy для empty/corrupt canonical.
- [x] Добавить 0021 SQL-барьер прежних writers и versioned IDB v3 opens;
  проверить preservation старых stores на fake IndexedDB.
- [x] Пройти 1039 unit, три typecheck, guards/schema/privacy/audit, 16 новых
  Chromium/iPhone browser-сценариев и 33 HTTP локального workerd/D1.
- [x] Пройти полную browser matrix и [CI точного опубликованного кода `405238b`](https://github.com/Michael-edel/FitFocus/actions/runs/38208076392):
  1039 unit / 191 файл, 334 browser passed / 9 skips, без flaky в итоговом summary.
- [x] Проверить настоящие v2/v3 bundles на одном origin локально: 2/2,
  pending/conflicted, старый reopen=VersionError, старые мутации=0,
  профиль/marker ledger/quarantine/auth-fence сохранены; mock API, SW отключён.
- [x] Локально проверить предложение обновления и сохранность profile/family
  intent с настоящими v2/v3 SW и native HTTP: 7/7 в составе 63 связанных
  сценариев на семи конфигурациях, workers=1/retries=0. [Контракт](docs/pwa-updates.md).
  Standalone эмулируется; это не staging и не установка на устройстве.
- [x] Проверить потерю первого SKIP_WAITING, deadline, сохранность черновика
  и успешный повтор: 7/7 real-SW/native HTTP; затем 1043 unit / 192 файла,
  три typecheck, guards/schema/privacy и audit (0).
- [x] Подтвердить [CI PWA `8d32f12`](https://github.com/Michael-edel/FitFocus/actions/runs/38224847501):
  1043 unit / 192 файла, 341 browser passed / 9 skips; success.
- [x] Исследовать Firefox timeout в `pwa-update.spec.ts` на `saved(page)` до
  активации Service Worker. Trace показывает, что задерживался test-only
  независимый `indexedDB.open()` в `saved(page)`: около 87,9 с при живом экране
  приложения. `saved(page)` и failure diagnostics теперь повторно используют
  открытую приложением IDB connection; в диагностическом режиме отсутствие
  connection завершается ясной ошибкой. Так убран второй IDB open, а не
  замаскирован timeout увеличением ожидания или retry. Targeted Firefox и полный
  `pwa-update.spec.ts` прошли без retries. Точный CI
  [#1832](https://github.com/Michael-edel/FitFocus/actions/runs/39489956059)
  для кода `58f4d30` завершился success: 1627 browser passed / 74 explicit skips,
  native BFCache 1/1, rollback/CAS HTTP 23/23. Основной `saved(page)` helper и
  захват app connection не менялись после этой проверенной ревизии. Новый
  диагностический follow-up также удаляет независимый `indexedDB.open()` из failure-only
  `stateDebug`; targeted Firefox и полная PWA spec прошли без retries локально.
  Точный CI этого диагностического follow-up ожидает завершения текущего run.
  Причина внутренней задержки дополнительного запроса на уровне Firefox
  неизвестна, но независимые открытия IDB в диагностических helpers устранены.

- [x] Разобрать исторический native WebKit pageerror по trace CI `5b90249`:
  ошибка привязана к отмене семейного PUT при reload после `controllerchange`,
  когда rollback-клиент отправляет повтор после `503`. В точном bundle `98d4910`
  запрос проходит через `requestJson` и `try/catch` метода `StateSync.drain`;
  regression также подтверждает сохранение opId/payload. Это не доказывает
  потерю операции и не требует общего фильтра CORS-ошибок.
- [x] Разобрать CI run #1417 `38845192574`: audit, guards, unit, typecheck и
  build прошли; E2E завершился failure (27 failed, 706 passed, 247 skipped).
  В 12 callback-сценариях устаревшие вкладки ошибочно ждали UI прежнего
  аккаунта; multi-tab тест использовал mock-ответы без scope-заголовков;
  storage-тесты испытывали такой же mock-побочный эффект.
- [x] Уточнить локальные E2E: callback-тесты проверяют stale-session guard;
  multi-tab удерживает валидные ответы, storage/preview используют scoped
  responses. Проверки прошли: callback 12/12 на desktop engines, multi-tab
  7/7 browser/PWA проектов, storage 6/6 на WebKit/iPhone Safari/iPhone PWA,
  preview-origin 3/3 на WebKit. Отдельный family stale-read Safari тест прошёл
  локально и учитывает ограниченный WebKit abort message.
- [x] Подтвердить CI исправленных тестов и PWA lifecycle: run #1418 для
  `e4ced68` был отменён при обновлении PR. Более поздний точный полный CI
  [#1698](https://github.com/Michael-edel/FitFocus/actions/runs/39202941991) на HEAD
  `9ba464b` прошёл: 1454 unit / 216 файлов, 1110 browser passed / 311 skipped,
  retries=0; rollback/CAS checks успешны. Установка на устройстве и staging
  не проверялись и остаются открытыми.
- [x] Реализовать локальный прототип упаковки полного client/SW/Pages Worker из точного Git SHA,
  manifest SHA-256, проверки целостности и настоящий локальный HTTP/D1 smoke
  распакованного `.tar`. База `574de76`, кандидат `d3a9496`, 23 HTTP прошли;
  [контракт](docs/release-artifacts.md). Эти SHA различаются только документацией.
  Это исторический локальный результат, а не приёмка нового кандидата.
- [x] Перенести rollback pins на `98d4910`, собрать и проверить новый архив:
  82 файла, 28/28 fresh-install/rollback/forward на семи конфигурациях,
  workers=1/retries=0. Прежний архив `574de76` сохранён для диагностики.
- [x] Выполнить HTTP/D1-приёмку `bd763ec` → сохранённый архив `98d4910`:
  23 запроса на одном origin/D1 прошли. Server functions/migrations одинаковы.
- [ ] Завершить приёмку компонента отката: CI `5b90249` и сохранение архива
      подтверждены, flaky WebKit и staging остаются открытыми;
  затем проверить целевое окружение и принять отдельный staging gate.
- [x] Проверить old/new bundle smoke для настоящей pending legacy-записи на одном
  origin и в одном browser context: 7/7 Playwright-проектов, `workers=1/retries=0`.
  Остались полный lifecycle, staging и совместимый rollback artifact.

Клиент подключён; отказ старых menu/items writers, конфликт после reload
и локальная совместная работа настоящих v2/v3 bundles проверены. CI семейного
кода `405238b` и PWA `8d32f12` прошёл.
Локальный real-SW smoke добавлен; до закрытия нужны PWA на
устройствах/staging и совместимый откат. Явная семейная цель invite/member
реализована в `2bbec11` и подтверждена точным CI `38459458051`; staging и
проверка старых/новых bundles для неё остаются открытыми вместе с остальными callbacks.

Это не закрывает P0.4–P0.6 целиком. Прежние unscoped clients остаются совместимыми
и не защищены opt-in guard; отмена fetch не устанавливает порядок SQL-записей.

### P0.1 — восстановить CI: зависимости и проверка push

- [x] Подготовить исправление dependency audit для GitHub `main`, проверив
  совместимость обновлений. В [CI PR #91 на SHA 8b13b25](https://github.com/Michael-edel/FitFocus/actions/runs/37910803294)
  обнаружено 16 уязвимостей (1 low, 6 moderate, 9 high); последующие проверки
  пропущены. Документирующая ветка не меняла package.json/lockfile.
- [x] Убрать устаревшее требование наличия `signal: controller.signal`
  непосредственно в `push.ts` из `scripts/check-api-invariants.mjs`.
- [x] Проверять отмену зависшего запроса через реальный путь
  `sendPushNotification` → `fetchWithTimeout` → `fetch`.
- [x] Проверить успех, ошибку и timeout, отмену запроса и очистку таймера.
- [x] Получить зелёный CI исправления без отключения проверки:
  [4c16088 в PR #92](https://github.com/Michael-edel/FitFocus/actions/runs/37914508279).
- [ ] Интегрировать проверенное исправление в защищённую GitHub `main`.

Готово, когда audit проходит, тест падает при разрыве передачи сигнала в этом
пути, а существующие API-проверки, тесты и сборка проходят. Audit failure
наблюдался на базе GitHub main; устаревшая push-проверка относится к
интеграционной ревизии PR #90. Эти два состояния нельзя смешивать.

Реализация: [PR #92](https://github.com/Michael-edel/FitFocus/pull/92),
также перенесена в локальную интеграционную ветку. Проверены зависший
error body и фокус в forced-colors после обновления Tailwind.
Подробные результаты: [журнал стабилизации](docs/stabilization-progress.md).
P0.1 остаётся открытым до интеграции в GitHub main; CI ветки исправления прошёл.

### P0.2 — сохранить конфликт и ошибочную операцию

- [x] В sender шести ключей при 409 сохранить локальный payload, доступный
  серверный снимок и delete-intent; перевести в conflicted, не подтверждая отправку.
- [x] В этом sender неповторяемые 4xx хранить как failed, 408/429/5xx и сеть
  обрабатывать ограниченными повторами с backoff/Retry-After.
- [x] Подключить остальные управляемые state-ключи к этому sender;
  [граница 15 ключей](docs/owned-state-writers.md).
- [x] Перенести эти гарантии на редактор существующего profile и его sender:
  409 сохраняет локальную операцию и доступный проверенный снимок, без rebase.
- [x] Создавать профиль регистрации постоянной операцией с baseVersion=0;
  AI-update — причинный child, ошибки и конфликты не требуют raw profile PUT.
- [x] Пройти old/new migration smoke реального legacy intent; полный lifecycle
  остаётся отдельной открытой задачей P0.8.

Готово, когда update/delete-конфликты и failed-операции доступны после reload;
совпадение текущего локального значения с исходящей записью не скрывает конфликт.

### P0.3 — разделить локальную запись и паузу отправки

- [x] В новом sender после 401 сохранять новые операции, остановив отправку;
  после свежего подтверждения того же аккаунта возобновить его очередь.
- [x] В новом sender различать 403 `ACCESS_REQUIRED` и `FORBIDDEN_KEYSPACE`; повторный вход
  не считать универсальным исправлением 403.
- [x] Подключить операции редактора профиля к общей auth/access/protocol-паузе;
  отсутствие profile capability не удаляет локальные правки.
- [x] Сохранять регистрацию до сети/AI и восстанавливать own pending-профиль
  после reload без OAuth-маркера; bootstrap 401/403 не активирует локальный вход.
- [x] Проверять HTTP bootstrap/state-hydration и profile seed по proof сессии
  и атомарному auth-fence; подтверждённый отказ `/me` останавливает вход.
- [ ] Завершить auth-координацию legacy и остальных callbacks,
  затем приёмку выпуска. Серверные barriers обязательного proof добавлены для
  `/api/bootstrap`, `/api/state`, `/api/profile` и Support feedback; остаются
  остальные callbacks, старые bundles и staging.

Готово, когда изменения, сделанные во время auth-паузы, не теряются и
после входа отправляются только от подтверждённого владельца.

### P0.4 — защитить локальные изменения при загрузке облака

- [x] Для 15 managed-ключей и профиля перед cloud apply проверять pending/sending/conflicted
  операции и локальную ревизию для этого аккаунта и ключа.
- [x] Проверить `sessionHydration.ts`, profile refresh через stateSync и repository отдельно.
- [x] В этих путях не заменять локальный снимок и не менять baseVersion только потому,
  что пришла более новая облачная версия.
- [ ] Проверить остальные cloud callbacks и cache приложения по тем же гарантиям.
  - [x] Удержанный `GET /api/profile` старой сессии не заменяет профиль,
    сохранённый после повторного входа того же аккаунта с новым SID. Browser
    acceptance прошёл 7/7 desktop/mobile/PWA профилей (`workers=1,retries=0`);
    root typecheck и diff check прошли. Production-код не менялся; общий пункт
    остаётся открытым для остальных callbacks и cache.
  - [x] Поздний `PUT /api/profile` старой сессии того же аккаунта не завершает
    reclaimed operation: `opId` сохраняется, `attemptId` и `sessionEpoch`
    меняются, ответ старого SID игнорируется, а новый ack завершает запись.
    Browser acceptance прошёл 7/7 профилей без retries; профильный unit — 9/9,
    root typecheck и diff check прошли. Тест [`9315e33`](https://github.com/Michael-edel/FitFocus/commit/9315e33);
    CI #1822 для предшествующего SHA завершился одной несвязанной ошибкой в Council history;
    follow-up опубликован в `5f92da1`; точный CI #1823 выполняет browser matrix.
  - [x] Привязать содержимое root overlays и черновик регистрации к владельцу:
    фоторазбор, редактор блюда, камера, scanning status, меню, paywall,
    profile-sync/adaptation notices и медицинские данные формы регистрации не
    должны попадать в UI другого аккаунта. Root overlays и notices используют
    account/session scope; черновик регистрации — Google identity scope. Код:
    [`24180d7`](https://github.com/Michael-edel/FitFocus/commit/24180d744222ea7a618ce1c634fd26d58613a4ea),
    [`236453b`](https://github.com/Michael-edel/FitFocus/commit/236453bbabfec221a65b3c0ac68cd6b8375770c5) и
    [`b405761`](https://github.com/Michael-edel/FitFocus/commit/b4057613da5251837b69c2a77594d44a80aa3373); root typecheck, 12 целевых
    unit-тестов и diff check прошли. Follow-up [`d23ceb9`](https://github.com/Michael-edel/FitFocus/commit/d23ceb96f17149f8cdee137d3f8fb1ddd921245e)
    расширяет browser acceptance на scanning status, фоторазбор/редактор, камеру
    и paywall при переключении A → B: 12/12 на desktop Chromium/Firefox/WebKit
    без retries. Его точный [CI #1723](https://github.com/Michael-edel/FitFocus/actions/runs/39228647936)
    завершился success: 1457 unit, 1119 browser passed / 323 skipped, typechecks,
    build, rollback/CAS (23 HTTP requests); rollback и browser artifacts сохранены.
    Следующий follow-up [`cf81aab`](https://github.com/Michael-edel/FitFocus/commit/cf81aabde79d7566ad56349bd0a9a2f10a1b58c1)
    проверяет меню «Ещё» после account switch: 2/2 на iPhone Safari и iPhone PWA;
    root typecheck и diff check прошли. Точный CI
    прежний [CI #1725](https://github.com/Michael-edel/FitFocus/actions/runs/39234111699)
    для `cf81aab` отменён при push нового HEAD; [CI #1727](https://github.com/Michael-edel/FitFocus/actions/runs/39236817609)
    для `f3e5b37` отменён следующим push. Коммит
    [`3a037f3`](https://github.com/Michael-edel/FitFocus/commit/3a037f3ded9b4546b08927724898456f817bffe5)
    расширил мобильную проверку меню до Android: 2/2 на `android-chrome` и
    `android-pwa-chrome`. Предшествующий коммит
    [`2cec2e2`](https://github.com/Michael-edel/FitFocus/commit/2cec2e21024b2bfc47e9bc0d5fe121a2a6a3606d)
    исправляет stale setter заметки profile sync и добавляет UI acceptance обеих
    notices: 6/6 на desktop Chromium/Firefox/WebKit, typecheck и diff check прошли.
    Оба коммита опубликованы в PR #93.
    Следующий follow-up [`f233eff`](https://github.com/Michael-edel/FitFocus/commit/f233effd968ad0b2d498ce83e75963150d877369)
    расширил account-switch UI acceptance paywall и profile-sync/adaptation notices:
    21/21 на семи desktop/mobile/PWA профилях, включая 12 мобильных запусков
    (`workers=1,retries=0`). Камерный dialog остаётся desktop-only, поскольку на
    телефонах его заменяет native capture input; locator-проверка подтвердила,
    что это `<label>` с `input[type=file][capture]`, не in-app dialog.
    Дополнительно проверен открытый paywall после повторной авторизации того же
    аккаунта с новым `serverSessionId`: IndexedDB `sessionEpoch` меняется, старая
    вкладка показывает notice новой сессии, а paywall скрыт в обеих вкладках.
    E2E прошёл 7/7 desktop/mobile/PWA профилей без retries; суммарно 73 сценария
    и 292 мобильных запуска. Это mock API, production-код не менялся. Сценарий:
    [`8afbd96`](https://github.com/Michael-edel/FitFocus/commit/8afbd96a2915c094f4f392d6b55d9b3f48c4a496).
    Profile-sync и adaptation notices отдельно проверены после повторного входа
    того же аккаунта с новым `serverSessionId`: старый notice скрывается, новый
    не наследует его; оба сценария прошли 7/7 desktop/mobile/PWA профилей.
    Камера-диалог также скрывается после same-account reauthentication: 3/3
    desktop engines, четыре mobile-профиля штатно пропущены из-за native capture
    input. Разбор фото и несохранённый редактор блюда скрываются после reauth,
    durable-запись дневника сохраняется; сценарий прошёл 7/7, включая четыре
    mobile/PWA профиля. Мобильное меню «Ещё» также скрыто после same-account
    reauthentication на четырёх Android/iPhone browser/PWA профилях. Матрица
    расширена до 78 сценариев и 308 мобильных запусков;
    тесты добавлены
    в [`a1e36ee`](https://github.com/Michael-edel/FitFocus/commit/a1e36ee8fd67e676266e098fd761593782185a0f).
    Камера-проверка: [`918e64c`](https://github.com/Michael-edel/FitFocus/commit/918e64cd47009c2596d9daf9d19e5c67ac342854).
    Проверка фото-разбора: [`f71e783`](https://github.com/Michael-edel/FitFocus/commit/f71e78370c1e0a40caf23329c1a08b8f9b19d099).
    Проверка мобильного меню: [`41c7467`](https://github.com/Michael-edel/FitFocus/commit/41c746729e4791e5aa05ca663eac2f3d63f95fce).
    Индикатор «Анализирую фото…» виден при удержанном запросе и исчезает после
    A→B и same-account reauthentication; связанный набор — 18 passed / 3
    ожидаемых desktop skips. Проверка: [`4f41c1a`](https://github.com/Michael-edel/FitFocus/commit/4f41c1a883aa663697f7a94d6114467f8dbc71b0).
    Follow-up [`35a2d30`](https://github.com/Michael-edel/FitFocus/commit/35a2d303cf26a8e88ca8a796a69fe1479c2e1240)
    расширил recipe-photo scoped-auth-refusal acceptance: 7/7 на семи
    desktop/mobile/PWA профилях, включая 4 мобильных запуска; обычная ошибка
    рецепта, browser alert и page error не появляются (`workers=1,retries=0`).
    [`c751260`](https://github.com/Michael-edel/FitFocus/commit/c751260ac7edbe328eea64a4220648ef570a9adb)
    расширил на mobile два held plateau-explanation callbacks: account B и новая
    server session того же аккаунта прошли 14/14 на семи профилях, включая 8
    мобильных запусков (`workers=1,retries=0`). Поздний результат не появляется
    и не меняет профиль/outbox другой или новой сессии.
    Следующий follow-up [`ebddd21`](https://github.com/Michael-edel/FitFocus/commit/ebddd21265c897316f7337e1c605c7524c9fefe0)
    снял desktop-only skip с успешной генерации пошагового рецепта и сохранения
    избранного: сценарий прошёл 7/7 на desktop, Android и iPhone/PWA профилях,
    включая 4 мобильных запуска (`workers=1,retries=0`). Накопленная mobile
    account/session матрица — 65 сценариев и 260 запусков; полный CI нового HEAD
    ожидает завершения. Остальные callbacks/cache остаются открытыми.
    Follow-up [`81aec0d`](https://github.com/Michael-edel/FitFocus/commit/81aec0d59a1d71f034c09570071c02e1f804feff)
    расширил прямой success path анализа фото еды на все семь профилей: 7/7,
    включая четыре мобильных запуска (`workers=1,retries=0`). Проверены дневник,
    история, usage и пустой outbox активного аккаунта. Матрица составляет
    66 сценариев и 264 мобильных запуска.
    Follow-up [`e6f73f2`](https://github.com/Michael-edel/FitFocus/commit/e6f73f27208055ce51bb48899327c0fafc68db67)
    проверяет именно мобильный `input[capture]`: удержанный ответ анализа еды
    отпускается после входа аккаунта B, не меняя профиль, дневник, историю,
    outbox и побочные запросы обоих аккаунтов. Phone/PWA E2E прошёл 4/4 на
    Android Chrome/PWA и iPhone Safari/PWA; исходный gallery-upload сценарий
    после выделения общей проверки — 7/7 на всех профилях. Root typecheck,
    legacy normalization/migration unit 128/128 и diff check прошли.
    Изображение подаётся в capture input фикстурой Playwright; запуск системной
    камеры на физическом устройстве не проверен. Матрица теперь — 67 сценариев
    и 268 мобильных запусков; точный CI этого follow-up ожидает публикации.
    Следующий follow-up [`746e26e`](https://github.com/Michael-edel/FitFocus/commit/746e26eb483dca986f4ca10fea896279dd34fd0d)
    повторил эту приёмку для отдельного native camera input страницы рецептов:
    поздний `foodphoto_enhanced` ответ не создаёт черновик после входа B.
    Native capture E2E прошёл 4/4 Android/iPhone browser/PWA профилей, исходный
    gallery input — 7/7; всего 11 passed и 3 ожидаемых desktop skips при
    `workers=1,retries=0`. Root typecheck прошёл. Проверяется file-input обработчик,
    физическая камера остаётся вне этой приёмки. Матрица — 68 сценариев и 272
    мобильных запуска; точный CI follow-up ожидает публикации.
    Коммит [`79d2550`](https://github.com/Michael-edel/FitFocus/commit/79d25500341e40bb0be18c65ffff36ed48719237)
    закрывает browser acceptance черновика регистрации:
    после смены активной IndexedDB-сессии экран A блокируется, пока Google identity
    не совпадает с сохранённой сессией. До guard тест воспроизводил открытые поля;
    после изменения сценарий прошёл 3/3 на desktop Chromium/Firefox/WebKit. Код уже
    опубликован в PR #93; точный [CI #1730](https://github.com/Michael-edel/FitFocus/actions/runs/39239267181)
    отменён при следующем push. [CI #1732](https://github.com/Michael-edel/FitFocus/actions/runs/39239523175)
    относится к предыдущему HEAD `2563dc8` и не включает мобильное расширение;
    точный CI новой ревизии проверяется после push.
    Follow-up снял desktop-only skip с registration account-switch
    сценария: он прошёл 7/7 на всех desktop, Android и iPhone/PWA проектах. Эта
    приёмка опубликована в [`083cef0`](https://github.com/Michael-edel/FitFocus/commit/083cef0c1531874db1fae06648a19fc0537e2774).
    Остальные root callbacks и P0.4 остаются открытыми. Ещё один E2E проверил
    повторный вход того же владельца с новым server session: старая вкладка
    скрывает форму Settings, новая восстанавливает черновик account cache без
    profile PUT или изменения durable profile. Базовый сценарий прошёл 3/3 на
    desktop Chromium/Firefox/WebKit; follow-up [`8cf1cd9`](https://github.com/Michael-edel/FitFocus/commit/8cf1cd9c92a0ceaccf0916cdfbfd4bed22cb90e2)
    снял desktop-only skip, после чего сценарий прошёл 7/7 на desktop, Android и
    iPhone/PWA профилях. Typecheck, production build и diff check прошли. Точный CI
    проверяется для актуального PR HEAD #93. Другие callbacks/cache остаются открытыми.
    Follow-up [`d124d6c`](https://github.com/Michael-edel/FitFocus/commit/d124d6cde085220c4b0be662d23d193688d793a5)
    привязал индикатор генерации объяснения плато к account/session scope вместе
    с adaptation notice. Целевой unit — 13/13; удержанный plateau response при
    повторном входе прошёл 3/3 desktop E2E; typecheck, production build и diff check
    прошли. Межаккаунтный UI-сбой до изменения не воспроизведён; это защита
    stale UI-state. Код опубликован в PR #93; точный CI актуального HEAD нужно
    проверить перед слиянием.
    Локальный follow-up [`e9a14c2`](https://github.com/Michael-edel/FitFocus/commit/e9a14c2)
    перевёл `planError` на Google-identity scope: сообщение регистрации A скрыто
    для B и после выхода. Целевые unit — 33/33, registration account-switch E2E —
    7/7, typecheck, production build и diff check прошли. До этого конкретный
    визуальный cross-identity сбой не воспроизведён; это защита stale root state.
    Коммит добавлен в PR #93; exact-head CI новой ревизии нужно подтвердить
    перед слиянием.
    Последующий fail-open аудит обнаружил, что форма регистрации могла
    отрисоваться до подтверждения совпадения Google identity и активной
    IndexedDB-сессии. Теперь несовпадающая/неизвестная проверка блокирует форму,
    а обработчик требует актуальный `active` и неинвалидированный session guard.
    Unit — 21/21, включая проверку отсутствия profile/AI side effects при
    неактивной сессии; registration account-switch E2E — 7/7 и durability E2E — 21/21
    на desktop, Android, iPhone и PWA профилях; root typecheck, production build
    и diff check прошли локально на рабочем дереве поверх `42683ae`. Точный CI
    этой ревизии нужно подтвердить перед слиянием.
    - [x] Закрыть гонку между проверкой регистрации и первым profile commit:
      перед записью перечитать активную IDB-сессию и передать её в
      `OutboxLocalCommitGuard`, чтобы транзакция атомарно сверила accountId,
      serverSessionId и sessionEpoch. При смене сессии профиль, outbox operation
      и AI-запрос не создаются; обычная sender pause запись не блокирует.
      Unit-регрессия проверяет переключение сессии после чтения guard — 22/22
      registration unit. Две E2E спеки прошли 28/28 без retries на семи desktop,
      Android и iPhone/PWA профилях при workers=1; отдельный параллельный прогон
      дал один WebKit timeout, который не повторился ни в изолированном тесте,
      ни в последовательной матрице. Root/storage typecheck, auth-scope guard,
      production build и diff check прошли. Точный CI зафиксировать после push.
  - [x] Проверить задержанный update семейной цели после смены семьи в той же
    сессии: ответ старой семьи не должен менять новую семью или показывать ложную
    ошибку. Account-switch E2E прошёл 7/7 на desktop, Android, iPhone и PWA
    профилях без retries; точный CI актуального HEAD проверяется после push.
  - [x] Проверить задержанный update цели участника после повторного входа того
    же аккаунта: старая server session не должна менять состояние новой сессии.
    После снятия desktop-only skip сценарий прошёл 7/7 на desktop, Android,
    iPhone и PWA профилях без retries; точный CI актуального HEAD проверяется
    после push.
  - [x] Проверить задержанный update цели участника A после входа аккаунта B:
    ответ не должен менять UI B или вызывать повторную загрузку семьи A. После
    снятия desktop-only skip E2E прошёл 7/7 на desktop, Android, iPhone и PWA
    профилях без retries; точный CI актуального HEAD проверяется после push.
  - [x] Расширить account-switch приёмку 15 delayed family callbacks на Android,
    iPhone Safari и PWA профили, ранее пропущенные desktop-only фильтром. Новая
    мобильная часть прошла 60/60 (`workers=1,retries=0`); историческая desktop
    часть проверена отдельно. Совместный exact-head CI запускается после push.
  - [x] Расширить на Android/iPhone/PWA ещё 10 previously desktop-only сценариев:
    personal shopping list/export/check, support tickets, mobile bearer token,
    push status/account reauthentication, checkout URL и две shopping write-race
    проверки. Мобильная часть прошла 40/40 без retries; точный CI объединённой
    матрицы проверяется на актуальном HEAD.
  - [x] Удержать ответ `POST /api/mobile/token` старой server session после
    повторного входа того же аккаунта с новым SID. Старый bearer token не
    появляется в UI и не копируется; token новой сессии остаётся видимым и
    является единственным значением в clipboard. E2E прошёл 7/7 desktop/mobile/
    PWA профилей без retries; root typecheck и `git diff --check` прошли.
    Точный CI follow-up проверяется после push.
  - [x] В account-switch acceptance dashboard проверить оба поля общего cache-hook:
    восстановление настройки «Детально: лог еды» после reload, её скрытие для B
    и сохранность ключа A. E2E прошёл в точном [CI #1708](https://github.com/Michael-edel/FitFocus/actions/runs/39211847952).
  - [x] В browser acceptance проверить, что поисковый запрос дневника A
    восстанавливается после reload, но скрыт в B, а исходный ключ A сохраняется.
    E2E прошёл в точном [CI #1708](https://github.com/Michael-edel/FitFocus/actions/runs/39211847952).
  - [x] Расширить account-switch acceptance дневника: после анализа еды в аккаунте A
    запись A сохраняется в его IndexedDB, остаётся скрытой в старой вкладке, не
    появляется в аккаунте B и не создаёт для B diary value. Сценарий прошёл 3/3
    desktop Chromium/Firefox/WebKit без retries; четыре mobile/PWA проекта
    штатно пропущены, так как проверка использует две вкладки. Typecheck и diff
    check прошли в [`8279976`](https://github.com/Michael-edel/FitFocus/commit/8279976fb140cd58aa2c00853b4f5eea2b30e02b).
    Это одна UI/cache acceptance; остальные callbacks и P0.4 остаются открыты.
  - [x] Расширить bulk move/delete account-switch acceptance дневника на телефоны:
    Android Chrome/PWA и iPhone Safari/PWA прошли 4/4; вместе с desktop-частью
    матрица составляет 7/7 (`workers=1,retries=0`). Один scoped PUT
    подтверждается для bulk move и один для bulk-delete, выбор не переносится
    в аккаунт B, данные B не меняются в коммите
    [`0c4ba6a`](https://github.com/Michael-edel/FitFocus/commit/0c4ba6a4c9391c0ac520632d417fc37dc8a796d8).
  Delayed durable family-menu state GET проверяет account switch без
  гидратации старых данных; задержка теперь управляется тем же mock API handler,
  без дополнительного route/fallback. Полный `family-menu-durable.spec.ts` после
  изменения прошёл 39/39 на трёх desktop engines. Точный CI `aa4073c` ожидается;
  `baba226` дополнительно изолирует локальный recipe-usage cache по accountId;
  unit suite 1295/1295 и целевые account-switch E2E 4 passed / 2 project skips.
  Коммит `64d14a4` скрывает состояние урока/викторины до гидратации ключа
  активного аккаунта; targeted unit — 3/3. Полный запуск выполнил 1297 тестов
  в 207 файлах; две suite столкнулись с Windows `EBUSY`, затем прошли отдельно
  последовательно (4/4 теста). Typecheck и production build прошли. Остальные
  cloud callbacks и cache остаются открытыми; P0.4 не закрыт. Follow-up
  [`32818d1`](https://github.com/Michael-edel/FitFocus/commit/32818d15e11e1b61cde267eff4050a9e9d4904d4)
  распространяет scope gate на черновик веса/PDF, поиск еды, выбранную дату,
  направление камеры и UI плана. `planScope` теперь также owner-bound. Старые
  setters отбрасываются после смены storage key. Полный unit: 1304/1304 в 210
  файлах; typecheck, production build и diff check прошли локально.
  Follow-up [`f814234`](https://github.com/Michael-edel/FitFocus/commit/f8142349291fd592c58a857ae88e0ee28c6b098e) применяет
  общий account/session render key к экрану прогресса: черновики замеров и импорта
  не переживают смену аккаунта или login-session; заполнение черновиков также
  отслеживает владельца и значение глюкозы. Unit 1305/1305, typecheck, build и
  diff check прошли локально. Account-switch UI E2E для этого экрана и остальные
  cloud callbacks/cache остаются открытыми; P0.4 не закрыт.
  [`cdc872b`](https://github.com/Michael-edel/FitFocus/commit/cdc872bae6cfef13642051d847b23cd03923a791)
  переносит тот же lifecycle key на остальные account-aware экраны: dashboard,
  plan, архив прогресса, питание, рецепты, семью, AI-совет и курс. Это сбрасывает
  несохранённый recipe editor и account UI cache при смене login scope. Unit
  1305/1305, typecheck и build прошли; recipe account-switch E2E — 3/3, семейное
  меню — 39/39 на desktop Chromium/Firefox/WebKit без retries. P0.4 остаётся
  открытым до завершения оставшихся browser acceptance и аудита callbacks/cache.
  Follow-up [`a67ed17`](https://github.com/Michael-edel/FitFocus/commit/a67ed177f7214bf41e02259f1602d2e72d8ddc9c)
  обнаружил и исправил production-сбой генерации ID черновика рецепта: вызов
  optional `crypto.randomUUID` превращался production-сборщиком в обращение к
  необъявленному `n`. Приёмка черновика перед сменой аккаунта теперь проходит
  3/3 на desktop Chromium/Firefox/WebKit; смена активной IndexedDB-сессии между
  вкладками обновляет render key через advisory BroadcastChannel с polling и
  visibility fallback. Общий P0.4 остаётся открытым: нужны проверки остальных
  переходов, cloud callbacks/cache и staging. Follow-up
  [`beedbee`](https://github.com/Michael-edel/FitFocus/commit/beedbeea594b8d501032ab10dfe80ad79f2f67fc)
  добавляет account-switch acceptance для черновика измерения прогресса:
  после активации account B во второй вкладке весовой черновик скрыт, профиль и
  outbox account A неизменны. Тест прошёл 3/3 на desktop Chromium/Firefox/WebKit
  без retries. Проверка выявила и предупреждения Recharts при первом измерении
  контейнера; графикам задан положительный initialDimension, повторный прогон
  чистый. Unit 1305/1305, три typecheck и production build прошли. Общий P0.4
  остаётся открытым до аудита остальных переходов, cloud callbacks/cache и staging.
  Follow-up `a8d20ee` добавляет account-scoped `nutrition.selected-day` в сброс UI;
  unit подтверждает, что очищается ключ только выбранного аккаунта, без удаления
  чужого ключа или профиля. Follow-up `02a12e2` не восстанавливает локальный
  черновик Settings в старой вкладке, пока IndexedDB активен другой аккаунт;
  черновик остаётся в account A cache и снова восстанавливается после обычного
  reload при активном account A. Follow-up `6c53b68` закрыл воспроизведённую
  утечку account-scoped UI cache в старой вкладке: restore и setters теперь
  разрешаются только после совпадения текущего профиля с активной IndexedDB
  session. Gate распространяется на dashboard weight/PDF, nutrition search и
  selected day, camera preference, plan controls и course UI; cache A остаётся
  нетронутым для возврата к A. Новый сценарий до исправления показывал черновик
  веса `98.765` после входа B в другой вкладке. После исправления draft matrix
  прошла 15/15 на desktop Chromium/Firefox/WebKit без retries, unit suite —
  1308/1308, три typecheck, production build и diff check прошли. P0.4 всё ещё
  открыт до остальных cloud callbacks/cache, staging и полного lifecycle.
  Follow-up [`2e2c1d1`](https://github.com/Michael-edel/FitFocus/commit/2e2c1d165e2d138d6d426052137b284e0500c381)
  распространяет тот же gate на экранные кэши графиков/разделов прогресса и
  fallback-отметки списка покупок. Расширенный progress account-switch E2E
  подтверждает, что выбранный account A показатель скрывается после входа B, а
  сохранённый A cache остаётся неизменным. Полная draft matrix повторно прошла
  15/15 на desktop Chromium/Firefox/WebKit без retries; unit 1308/1308, три
  typecheck, production build и diff check прошли. Остальные callbacks/cache,
  staging и полный P0.4 lifecycle остаются открытыми.
  Последующий локально проверенный follow-up привязывает root state
  множественного выбора блюд к `accountSessionRenderKey`: старые выбранные id
  скрываются, setters/bulk callbacks прежнего scope не меняют новый дневник.
  Пять новых unit-тестов; полный unit 1316/1316 в 212 файлах, три typecheck и
  production build прошли. Точный CI нового SHA ожидает push; общий аудит и
  приёмка P0.4 остаются открытыми.
  Дополнительная проверка нашла побочные записи в React functional state
  updaters дневника и bulk-операций: под `StrictMode` updater может вызываться
  повторно. Переведены add/update/delete и bulk move на immutable snapshot refs;
  persistence выполняется один раз после вычисления нового списка. Массовое
  удаление нескольких записей тоже пишет один новый снимок. Полный unit прошёл
  1326/1326, три typecheck и production build прошли; расширенный bulk/account
  E2E для двух записей прошёл 3/3 desktop engines; follow-up расширил матрицу
  до 7/7 с Android/iPhone/PWA (`workers=1,retries=0`). Первый WebKit запуск
  превысил 45-секундный лимит на
  завершающих действиях; после упрощения необязательных ожиданий контрольный
  прогон прошёл без изменения timeout.
  Изменение опубликовано в `7ff579d`; точный CI #1501 завершился success:
  1326 unit / 212 файлов, 850 browser passed / 263 skipped за 38,1 минуты.
  Полный E2E прошёл без retries; rollback/CAS выполнил 23 HTTP/D1-запроса.
  Последующий аудит `useCouncilChat` обнаружил, что временное состояние root
  сбрасывалось только по `userId`, поэтому повторный вход того же аккаунта с
  новым `sessionEpoch` мог сохранить старый черновик/этап/expanded state.
  Эти поля теперь изолированы `accountSessionRenderKey`, скрываются без
  подтверждённого UI cache и отклоняют setters прежнего scope; запросы также
  инвалидируются при смене session key. Полный unit 1318/1318, три typecheck,
  production build и существующий council late-response E2E 3/3 desktop прошли.
  Кодовый follow-up опубликован коммитом `2f6afdc`; PR-run #1397 для этого SHA
  pending без созданных jobs на момент проверки. Push-run #1396 отменён при
  замене дублирующим PR-событием по concurrency policy. Повторный-login E2E,
  остальные callbacks/cache и staging остаются открытыми; перед слиянием
  проверять CI для актуального exact HEAD.
  - [x] Защитить выбранный день личного недельного меню: restore, отображение,
    сохранение и setter теперь требуют разрешённого account cache и гидратации
    точного ключа аккаунта. Регрессия до исправления оставляла вторник A выбранным
    в старой вкладке после входа B; после исправления кэш A сохранён, но скрыт.
    [`c1f8180`](https://github.com/Michael-edel/FitFocus/commit/c1f818080c1554feaf36ce24f78b91145ea607ec): E2E 3/3 на desktop
    Chromium/Firefox/WebKit без retries, unit 1308/1308, typecheck, оба strict
    typecheck и production build прошли. Остальной аудит P0.4 не закрыт.
  - [x] Скрыть AI status badge и retry metadata до подтверждения активной
    IndexedDB-сессии. До исправления `AI: online` и `Retry: Coach` оставались
    видны в старой вкладке после входа B. [`ca49b0d`](https://github.com/Michael-edel/FitFocus/commit/ca49b0db8406a7ec124c05d90345402ba1a98d79): E2E 3/3 на desktop
    Chromium/Firefox/WebKit без retries, unit 1308/1308, typecheck, оба strict
    typecheck и production build прошли. P0.4 остаётся открытым для остальных
    callbacks и кэшей.
  - [x] Скрыть открытый разбор еды и редактор account A, если другая вкладка
    активировала B; также запретить открыть их из устаревшего экрана. До фикса
    модалки оставались видимыми после переключения. [`66a7362`](https://github.com/Michael-edel/FitFocus/commit/66a73623309d46d8ca5bcdc89a71068cf6004a9f): E2E 3/3 на desktop
    Chromium/Firefox/WebKit без retries, unit 1308/1308, typecheck, оба strict
    typecheck и production build прошли. Остальной P0.4 audit остаётся открытым.
  - [x] Скрывать account-зависимые экраны и root overlays/notice, пока
    IndexedDB-сессия не совпадает с аккаунтом UI; статические «Гид», «Политика»
    и «Обновления» остаются доступны. Регрессия воспроизводила одновременно
    приветствие профиля A и сохранённую историю AI-отчётов после входа B. После
    фикса account-данные и модальные поверхности старой вкладки скрыты, данные A
    сохраняются. Account-switch E2E — desktop Chromium/Firefox/WebKit без
    retries; typecheck и production build прошли. Остальной P0.4 audit остаётся
    открытым.
  - [x] Не восстанавливать настройки и другие root account-caches при
    несовпадении UI- и IndexedDB-аккаунта. До фикса старая вкладка сохраняла
    violet-тему A после входа B; теперь settings, plan marks, refeed/adaptation,
    favorites и invite code используют account scope только после проверки
    сессии. E2E с сохранённым отчётом и темой прошёл 3/3 desktop-браузера без
    retries; root, domain-strict и storage-strict typecheck и production build
    прошли. P0.4 остаётся открытым для остальных callbacks, кэшей и staging.
  - [x] Ограничить результат WIS-share исходной UI/session scope: notice hook
    теперь хранит поколение владельца; durable read guard проверяется перед
    внешней передачей PNG и снова после возврата системного share API, прежде
    чем обновлять уведомление, телеметрию или достижение. До
    фикса поздний callback после перехода A → B → A показывал успех старой
    операции в активном экране. Desktop-часть прошла 3/3; follow-up расширил
    приёмку до 7/7 на Android/iPhone/PWA, включая 4 мобильных запуска
    (`workers=1,retries=0`) в коммите
    [`971844d`](https://github.com/Michael-edel/FitFocus/commit/971844d80819ee41add9a5a979a2aa35ad65e43f).
    Unit 1309/1309 в 210 файлах, общий и оба strict
    typecheck, production build и `git diff --check` прошли в исходной ревизии.
    Точный CI нового тестового SHA запускается после push. Остальной P0.4 audit,
    staging и полный lifecycle открыты.
  - [x] Проверить account-scoped кэш открытого урока и выбранного ответа
    викторины: после активации account B старая вкладка скрывает UI account A,
    исходный кэш A не меняется, а курс B не открывает чужой урок. Новый E2E
    прошёл 3/3 на desktop Chromium, Firefox и WebKit (`workers=1,retries=0`);
    typecheck и `git diff --check` прошли. Это приёмка одного cache-пути;
    остальной P0.4 audit и staging остаются открытыми.
  - [x] При повторном входе того же account сравнивать `authFence`, `accountId`,
    `serverSessionId` и `sessionEpoch`, а не только id аккаунта. До фикса старая
    вкладка сохраняла черновик AI Council и не показывала session notice;
    теперь несовпадающая сессия блокирует account UI, черновик скрыт, история
    не меняется. E2E прошёл 3/3 на desktop Chromium/Firefox/WebKit; 7 связанных
    account-switch сценариев прошли на Chromium. Unit 1318/1318, три typecheck,
    production build и `git diff --check` прошли. [`5042db8`](https://github.com/Michael-edel/FitFocus/commit/5042db8adca01a58bcaff9c044d516b3d15394fb).
  - [x] Проверить поздний GET семейного контекста при повторном входе того же
    account с новой server session: старая вкладка показывает session notice,
    удержанный ответ предыдущей сессии не возвращает старый экран семьи. Новый
    E2E прошёл 3/3 на desktop Chromium/Firefox/WebKit; четыре соседних callback
    сценария — 12/12 в тех же браузерах. Production-дефекта не выявлено; общий
    P0.4 audit, остальные callbacks/cache и staging остаются открытыми.
    [`88ca7e3`](https://github.com/Michael-edel/FitFocus/commit/88ca7e3d4e5c88383b1a9e88db2c2afca2f6964a).
  - [x] После чтения weekly report повторно проверить login-session перед
    возвратом существующего отчёта: если сессия истекла во время IndexedDB-read,
    callback завершится `WEEKLY_REPORT_SESSION_CHANGED`. Регрессионный unit-тест
    и общий typecheck прошли локально; follow-up включён в `d3d8cbd`.
  - [x] Привязать delayed family context, shopping-list и shopping-check
    callbacks к неделе, для которой они начались. После смены недели старый
    результат не применяется, а запрашивается актуальная неделя. Полный
    `family-session.spec.ts` прошёл 30/30 на Chromium, Firefox и WebKit без
    retries; root, domain-strict, storage-strict typecheck и diff check прошли.
    Локальный commit `1543cc9`; exact CI запускается после push.
  - [x] Проверить account-switch UI cache архива прогресса: раскрытая галерея
    account A остаётся в его ключе, а после входа B второй вкладке показывается
    default состояние B без изменения профиля/outbox A. E2E прошёл 3/3 на
    desktop Chromium/Firefox/WebKit без retries. Сценарий выявил, что скрытый на
    mobile график всё равно монтировал Recharts с нулевым размером; теперь
    collapsed chart не монтируется, а видимые графики получают положительный
    initial dimension. Код `fd026b5`; archive и progress account-switch E2E
    прошли 3/3 каждый, полный unit — 1368/1368, typecheck, production build и
    diff check прошли. Остальные callbacks/cache, staging и полный P0.4 lifecycle
    остаются открытыми.
  - [x] Расширить на четыре Android/iPhone/PWA-профиля десять account-switch
    сценариев для черновиков и кэшей рецепта, прогресса, профиля, dashboard,
    питания, недельного меню, курса, AI-статуса и фоторазбора. Мобильные прогоны
    прошли 40/40; два скорректированных сценария также прошли 6/6 на desktop
    Chromium, Firefox и WebKit. Мобильный тест замера раскрывает блок «Детали»,
    а AI-проверка на телефонах сверяет account-scoped записи, поскольку sidebar
    скрыт. Exact CI опубликованного HEAD ещё не завершён; остальные callbacks/cache
    и общий P0.4 lifecycle остаются открытыми.

  - [x] Проверить отложенное декодирование фото прогресса при смене аккаунта:
    удержанный `Image.src` после выбора файла отпускается только после перехода
    A → B; старый callback не меняет профиль, managed state, outbox или сетевые
    writes аккаунта A/B и не показывает фото. E2E прошёл 7/7 desktop/Android/
    iPhone/PWA профилей без retries; root typecheck и diff check прошли в
    [`265bb6a`](https://github.com/Michael-edel/FitFocus/commit/265bb6afe939aed6730fd7cbc5dff42218be85d3).
    Это mock API и Playwright file fixture, не физическая камера/staging. CI
    родительского SHA `4630689` ещё выполнялся и тест не включает; точный CI
    этой ревизии проверяется после push. Остальные callbacks/cache и P0.4 lifecycle
    остаются открытыми.

Для шести ключей repository транзакционная managed hydration реализована
на `cfcc31b`; этап `31ec847` расширяет её до 15 ключей.
Для существующего profile guarded refresh и восстановление локального
снимка добавлены на `fc6bb82`; постоянная регистрация — на `2e41742`.
HTTP bootstrap/state-hydration и атомарный auth-fence добавлены на `dac2de2`;
[контракт и проверки](docs/bootstrap-hydration.md). Остальные callbacks открыты.
[Проверенная граница](docs/runtime-state.md).

Готово, когда повторный вход и восстановление сети сохраняют локальные
изменения; конфликтующие полные JSON-снимки не сливаются автоматически.

### P0.5 — защититься от запоздавших ответов

- [x] Для нового sender привязать ответ к opId, accountId, sessionEpoch,
  attemptId и ревизии; проверить scope/key/exists/protocol ответа.
- [x] Его принадлежность и операцию/версию проверять одной IDB-транзакцией.
- [x] Для bootstrap/state-чтения проверять HTTP scope и актуальный readGuard;
  hydrate/profile seed атомарно проверяют epoch и auth-fence (`dac2de2`).
- [x] В outbox передавать подтверждённую версию следующей операции только
  при доказанной причинной зависимости; независимую правку другой вкладки
  автоматически не перебазировать.
- [ ] Перевести и проверить оставшиеся сетевые writers и callbacks приложения.
  `3abb374` вводит обязательный серверный proof для всех `/api/state` и
  `/api/profile` handlers; `4edeb0a` закрыл такой же legacy-путь в
  `GET /api/export`, а `a396a30` добавил proof для чтения вложений поддержки.
  - [x] Поздний `GET /api/profile` старой сессии после same-account
    reauthentication не перезаписывает значение, сохранённое текущей сессией;
    тот же тест проходит 7/7 desktop/mobile/PWA профилей без retries.
  - [x] Четыре PDF-экспорта не скачиваются, если во время загрузки шрифта тот
    же аккаунт получает новую server session: краткий и подробный отчёты,
    сравнение замеров и архив прогресса прошли суммарно 28/28 на семи
    desktop/mobile/PWA профилях (`workers=1,retries=0`). Unit guard покрывает
    все пять экспортёров (6/6). Сравнение и архив добавлены в [`75b59b0`](https://github.com/Michael-edel/FitFocus/commit/75b59b0);
    root typecheck и diff check прошли. Production-код не менялся; exact CI этого
    follow-up опубликован в `5f92da1` и проверяется в CI #1823.
  - [x] Привязать раннюю отмену AI-запросов к `AiActionScope`: активный scope
    устанавливает временный `beforeunload`, завершение/инвалидация его снимает;
    idle-страница не удерживает listener. Недельный отчёт оставляет уже
    протестированную request-specific обработку. Unit scope/report — 13/13,
    полный unit — 1390/1390, root/domain/storage typecheck прошли; удержанный
    Coach retry отменён при реальной навигации в Chromium (1/1). P0.5 в целом открыт.
  - [x] Проверить навигацию во время ответа AI Совета: `beforeunload` отменяет
    запрос; сохранённый вопрос и durable operation остаются, поздний ответ не
    попадает в историю после возврата. Browser acceptance прошёл 7/7 desktop,
    Android, iPhone и PWA профилей, `workers=1,retries=0`. Точный CI нового
    коммита и staging ещё не подтверждены; общий P0.5 остаётся открытым.
  - [x] При очистке AI Council отменять удержанный запрос и блокировать его
    поздний ответ общей generation-проверкой durable commit. До исправления
    регрессия подтвердила, что signal оставался активным. После исправления
    empty history и отсутствие outbox-записей сохранились после освобождения
    ответа; E2E прошёл 7/7 desktop/mobile/PWA профилей без retries, scope unit —
    4/4, root/domain/storage typecheck и diff check прошли. Точный CI изменения
    ещё требуется; общий P0.5 остаётся открытым.
  - [x] Отменять все активные family callbacks перед навигацией через один
    временный listener на scope; listener снимается после завершения последнего
    действия или при invalidation, а при idle отсутствует. Family unit — 19/19;
    реальный переход во время удержанного invite abort-ит его signal и не
    публикует устаревший код (desktop Chromium 1/1). В `e22b2bf` добавлена
    навигация при удержанной AI-генерации семейного меню: `beforeunload`
    отменяет signal до `pagehide`, освобождённый поздний ответ не создаёт menu
    operation, семейный снимок остаётся прежним; 7/7 desktop/mobile/PWA проектов,
    `workers=1,retries=0`. Root typecheck и diff check прошли. Это mock API и не
    подтверждает отмену работы внешнего AI-провайдера, BFCache или staging.
    P0.5 остаётся открытым.
  - [x] Раньше отменять SupportScreen JSON-запросы и чтение вложений: на
    `beforeunload` теперь abort-ятся request и action controllers; `pagehide`
    остаётся страховкой. До фикса transport слушал только `pagehide`, оставляя
    callback активным на более раннем событии. Проверено снятие временных
    listeners после успешного запроса. Transport-тесты прошли 15/15,
    support-attachment E2E — 7/7 browser/PWA проектов; root и
    storage-strict typecheck, `git diff --check` прошли. Код и тесты — коммит
    [`d9317f7`](https://github.com/Michael-edel/FitFocus/commit/d9317f7) в PR
    [#93](https://github.com/Michael-edel/FitFocus/pull/93); точный CI и staging
    остаются открытыми.
  - [x] Распространить ранний page-exit guard на все session-bound transports и
    StateSync lifecycle: общий `listenForPageExit` срабатывает на первом из
    `beforeunload`/`pagehide` и снимает оба listener. Обновлены `/me`, bootstrap/
    state reads, Admin, Support, AI, family, achievements, billing, Huawei, push,
    mobile-token и sender lifecycle. Транспортные регрессии прошли 140/140;
    полный unit suite — 1415/1415 в 216 файлах; root/domain/storage typecheck,
    guards и production build прошли. Реальная Admin navigation прошла 7/7
    desktop/mobile/PWA проектов без retries. Код — [`7777636`](https://github.com/Michael-edel/FitFocus/commit/7777636f0beb1b874529f89f1f7309c3b048e751);
    точный CI запускается после push; реальный BFCache и staging остаются открыты.
  - [x] Подключить оставшиеся публичные auth callbacks к page-exit abort:
    `/api/env` и `POST /api/invite/validate` передают свой `AbortSignal`,
    прекращают работу на первом `beforeunload`/`pagehide` и не применяют поздний
    результат. `fetchWithResilience` теперь уважает сигнал вызывающего кода,
    различает отмену и timeout и не начинает retry после отмены. Полный unit
    suite — 1420/1420 в 216 файлах; root/domain/storage typecheck, API/auth/
    schema/privacy guards, production build и diff check прошли. Реальная
    навигация с удержанным `/api/env` прошла 7/7 browser/PWA профилей без
    retries. Изменение — [`050eb30`](https://github.com/Michael-edel/FitFocus/commit/050eb30);
    точный CI этой ревизии проверяется после push. Остальные writers, полный
    lifecycle и staging остаются открыты.
  - [x] При восстановлении страницы из BFCache (`pageshow.persisted`) заново
    запросить `/api/env` и сбросить зависший `inviteChecking`; поколения запроса
    не дают старому ответу примениться. Синтетический pagehide/pageshow acceptance
    прошёл 14/14 на семи браузерных/PWA проектах, полный unit — 1420/1420, три
    typecheck и production build прошли. Это не подтверждает реальный BFCache;
    exact CI ожидает публикации вместе с локальным follow-up.
  `d2cbb25` добавляет account-switch acceptance для недельного AI-отчёта:
  удержанный ответ A после входа B не меняет report value/outbox ни A, ни B;
  сценарий прошёл 3/3 на desktop Chromium/Firefox/WebKit, без retries.
  Компонент [`18af4ee`](https://github.com/Michael-edel/FitFocus/commit/18af4ee48cf1cde471dd85cea892715a04691d2d)
  привязывает retry metadata к `userId`: регистрация пишет действие в ключ
  нового аккаунта до смены ambient scope, а unscoped legacy action принимается
  только при совпадении владельца. AI activity hook читает явную область аккаунта
  и скрывает прежний снимок сразу при смене профиля. Unit suite прошёл
  1300/1300 в 209 файлах; root/domain/storage typecheck и production build
  прошли; Coach retry account-switch E2E — 3/3 на desktop Chromium/Firefox/WebKit,
  workers=1/retries=0. Точный CI этого коммита ожидает push.
  Follow-up [`0646e3d`](https://github.com/Michael-edel/FitFocus/commit/0646e3ddc699692d2f05e1bbe1b130e01b8cd8c0)
  передаёт accountId во все проверки последнего действия в Coach, Plateau и
  retry; 20 профильных unit, typecheck, production build и E2E 3/3 прошли
  локально. Полный CI точного HEAD запускается после push.
  Follow-up [`e7d5a5c`](https://github.com/Michael-edel/FitFocus/commit/e7d5a5c)
  привязывает все пять PDF download sites к действующей account/session и
  повторно проверяет session непосредственно перед `doc.save()`. Новый тест
  задерживает загрузку шрифта, меняет session и подтверждает отсутствие файла;
  также проверяется успешный экспорт при неизменной session. Полный unit suite
  прошёл 1311/1311 в 211 файлах, три typecheck и production build прошли.
  Точный CI ожидается; остальные callback-контракты, staging и lifecycle
  остаются открытыми.
  Мобильный follow-up [`39ff89e`](https://github.com/Michael-edel/FitFocus/commit/39ff89e43bf939ebc83c4e0789fe76efd4d2cb4a)
  прошёл 4/4 на Android/iPhone/PWA; вместе с desktop Chromium/Firefox/WebKit
  account-switch PDF acceptance составляет 7/7 (`workers=1,retries=0`). Точный
  CI этой расширенной матрицы ожидает публикации.
  Остальные callback-контракты, точный CI, проверка внешних потребителей и
  staging остаются открытыми.
- [x] Привязать обычный logout к актуальному IDB guard; account delete требует
  обязательный парный scope на сервере и проверяет ответ перед очисткой. Чужой
  proof отклоняется до удаления, scoped logout не отзывает другую сессию и не
  очищает cookie поздним ответом. Добавлен регрессионный тест: если сервер
  подтверждает удаление после смены локальной сессии, очищаются данные только
  захваченного аккаунта, а его старый logout callback не вызывается. Тест
  `authSession_logout` прошёл 8/8, полный unit — 1467/1467, typecheck прошёл;
  межвкладочный E2E в [`17db3b4`](https://github.com/Michael-edel/FitFocus/commit/17db3b4)
  прошёл 14/14 на семи desktop/mobile/PWA профилях без retries. Коммиты
  `5cb8508` и `17db3b4` опубликованы в `4ffff5a`; точный CI #1824 выполняется.
  Проверки 1215 unit, три typecheck, build, auth/API/admin/privacy guards прошли
  локально на базовой ревизии `956cf96`. Follow-up
  [`b2f6938`](https://github.com/Michael-edel/FitFocus/commit/b2f6938136c6ad6a82624b295c6eb7e2fdaf5ee6)
  требует полный proof для `/api/logout`; отсутствие или неполная пара дают 401
  до cookie lookup/revocation, а все ответы не меняют cookie. API/auth/admin
  guards и три typecheck прошли в изолированном контейнере; опубликованная версия
  проверяется в CI #1824. Старые bundles, device/staging и полный lifecycle остаются открытыми.
  Follow-up [`b5a493e`](https://github.com/Michael-edel/FitFocus/commit/b5a493e)
  повторно проверяет исходный session guard перед показом HTTP, network или
  protocol error. На незафиксированном состоянии тест до фикса воспроизвёл stale
  alert в 7/7 browser-профилях; после фикса сочетание успешного cross-session
  удаления и позднего HTTP 500 прошло 14/14, целевой unit — 10/10, полный unit —
  1469/1469, typecheck и diff check прошли. Коммит опубликован в SHA `030e10e`;
  его точный CI #1825 superseded при push следующего follow-up.
  Дополнительно same-account reauthentication E2E удерживает HTTP 500 старого
  delete-запроса до активации новой server session того же аккаунта. Проверены
  `serverSessionId` в обеих вкладках и отсутствие позднего alert: 7/7
  desktop/mobile/PWA профилей без retries; root typecheck и diff check прошли.
  Проверка включена в опубликованный SHA `bd488ef` и проходит точный CI #1826.
  [Контракт](docs/account-lifecycle-session.md).
- [x] Требовать парный account/session proof для расходования invite при
  регистрации; отсутствие и устаревший proof отклоняются до body/consume. Проверки
  invite guard и oversized body проходят. На `55bc09e`: полный unit suite
  1216/1216 в 208 файлах, typecheck, API invariants, production build и
  `git diff --check` прошли; точный CI ожидает push. Старые клиенты без proof
  получают 401. Общая приёмка registration и staging остаются открытыми.
- [x] Обязать парный scope для всех family/shopping HTTP endpoints, включая
  чтения, `family/menu/state`, корзину, CSV и старый bulk route. Отсутствующий
  или устаревший proof отклоняется до body/D1 side effects; transport нового
  клиента передаёт proof. Профильный suite прошёл 85/85. Старые сборки без proof
  получают 401; staging и общий family lifecycle остаются открытыми.
- [x] Привязать административную панель, CSV-аудит, admin support и `logout_all`
  к исходному account/session proof; сервер проверяет его до D1 role lookup и
  admin-session side effects. Локальные transport/server regression tests,
  общий unit suite, typechecks и build прошли; точный CI нового HEAD ожидает push.
  Follow-up [`c778515`](https://github.com/Michael-edel/FitFocus/commit/c778515db0fe8481d8fa1a767493a000334cb1f6)
  требует полный proof для destructive `/api/logout_all`; legacy no-scope и
  account-only запросы получают 401 до auth lookup, revocation и cookie clearing.
  API/auth/admin guards и три typecheck прошли в изолированном контейнере;
  follow-up [`90bd734`](https://github.com/Michael-edel/FitFocus/commit/90bd7347a1bbdea51f27737f530a5f4a8c562c46)
  требует proof для всех `/api/admin/*`; тесты покрывают оба guard overload,
  отсутствие/частичную пару до D1 lookup и guarded 401 middleware. API/auth/admin
  guards и три typecheck прошли в изолированном контейнере; точный CI после push.
  `f949842` добавляет scoped fetch и response markers для admin-вложений поддержки,
  которые браузерные media tags не могли загрузить с proof header. Follow-up
  `a396a30` требует proof и для всех attachment reads; SupportScreen и AdminScreen
  теперь получают media через scoped fetch и проверяют markers. [Контракт](docs/support-session.md).
  Browser E2E дополнительно проверяет ticket- и reply-вложения через paired proof
  и фактическое отображение Blob; точный CI нового HEAD ещё ожидается.
  Старые bundles требуют обновления.
  Предыдущий PR CI [`38706186324`](https://github.com/Michael-edel/FitFocus/actions/runs/38706186324)
  на `01bfa05` остановился на unit: 1263/1264 теста прошли, а единственная
  ошибка была в legacy fixture, который общий helper уже делал scoped. Follow-up
  [`478fc58`](https://github.com/Michael-edel/FitFocus/commit/478fc58) отключает
  scope именно в этом тесте; полный CI нового HEAD ожидает push.
  Остальные callbacks и общий lifecycle остаются открытыми.
- [x] Проверить выдачу мобильного bearer-токена из Settings: fresh
  account/session proof, server scope до mint, guarded no-store response,
  очистка токена/setup link при смене логина и delayed account-switch E2E.
  Все проверки включены в точный PR CI HEAD `08618e3`, run
  [38628487894](https://github.com/Michael-edel/FitFocus/actions/runs/38628487894),
  завершившийся success. Follow-up переводит выдачу токена на обязательный proof;
  legacy unscoped POST получает 401 до mint. На точном локальном SHA
  [`a1e79ac`](https://github.com/Michael-edel/FitFocus/commit/a1e79ac85d1f77c2112d121fd21deb3da03a5fdc)
  прошли 1244 unit / 208 файлов, 9 mobile/beta тестов, три typecheck,
  API/auth/admin/schema/privacy guards и build. CI, staging и устройство остаются
  открытыми.
  [Контракт](docs/wearable-sync.md).
- [x] Связать Huawei Health status, OAuth start/callback, sync и disconnect
  с исходными account/session proof; профиль фиксировать только через guarded
  outbox commit. `455cb01`: 26 профильных unit/API-тестов и 15/15 выбранных
  account-switch E2E на desktop Chromium/Firefox/WebKit без retries. Follow-up
  [`a127bf5`](https://github.com/Michael-edel/FitFocus/commit/a127bf5e6bb2f77fb83051d66b782bbc8baf8d6f)
  требует proof на status/start/sync/disconnect; запросы без полного scope
  получают 401 до body и route-specific D1/provider действий. Локальные API
  invariants, admin guard и три typecheck прошли в изолированном контейнере.
  Локальный Vitest не стартовал из-за Windows `node_modules` в Linux sandbox.
  `9782ef0` добавляет проверку частичной account-only пары.
  Точный PR CI [38703208009](https://github.com/Michael-edel/FitFocus/actions/runs/38703208009)
  на `a127bf5` подтвердил dependency/schema/privacy/auth/API checks, unit, три
  typecheck и build; E2E выполнялся на момент follow-up. Для `9782ef0` и
  документов точный CI запускается после push. Старые bundles нужно обновить.
  [Контракт](docs/huawei-health-session.md).
- [x] Подтвердить полный PR CI на точном SHA `455cb01`: run
  [38656586334](https://github.com/Michael-edel/FitFocus/actions/runs/38656586334)
  завершился success; E2E, unit, guards, typecheck, build и rollback/CAS прошли.
- [x] Привязать операции Push в Settings и Service Worker к свежему `/api/me`
  proof, активной IDB-сессии и проверяемым server response markers. Проверить
  поздний status-ответ аккаунта A после входа B и восстановление подписки при
  смене сессии; сервер требует парный scope на status/subscribe/unsubscribe/test
  до body и прикладных эффектов; критерии — в [контракте](docs/push-session.md).
  Запросы старых открытых сборок без proof получают 401. Код реализован
  и закоммичен в `daec94d`: 1180 unit-тестов / 202 файла, общий и строгие
  typecheck, build/guards и весь account-switch spec (42/42 на трёх desktop
  engines, без retries) прошли.
  Native HTTP E2E для настоящего собранного SW:
  `pushsubscriptionchange` отправил подписку со scope текущего аккаунта/сессии;
  после logout повторное событие не запросило `/api/me` и не отправило подписку.
  Сценарий прошёл 1/1 в Chromium; связанная PWA-регрессия — 6/6, typecheck прошёл.
  Точный [CI #1501](https://github.com/Michael-edel/FitFocus/actions/runs/39006074443)
  на `7ff579d` завершился success: 1326 unit / 212 файлов, 850 browser passed /
  263 skipped, 23 HTTP/D1 rollback/CAS-запроса; browser diagnostics и rollback
  artifact сохранены.
  CI run `38679312640` для опубликованного SHA `45575d2` завершился с двумя
  flaky E2E после retry; локальный push test и assertion follow-up в commits
  `ba973c1`/`636d2c7` ожидают точного CI. На следующем follow-up обязательная
  серверная привязка для Push проверяется профильными API-тестами и полным CI
  точного SHA; staging, реальный provider и устройство остаются открытыми.
  В follow-up `04b61dd` добавлена native-SW проверка повторного входа с новым
  session id и unit-проверка свежего proof. Полный unit suite прошёл 1277/1277;
  delayed-status E2E прошёл 3/3 desktop-браузера, native SW — 1/1 Chromium,
  typecheck прошёл. Это синтетическая локальная сессия; staging, provider и
  устройство остаются обязательными. CI `04b61dd` ожидает push. На HEAD
  `404b3da` delayed-status account switch и native-SW recovery прошли 2/2 без
  retries на Chromium; полный CI этого HEAD ещё выполняет E2E.
  - [x] Удержать `/api/push/status` старой server session, повторно войти в тот
    же account с новым `serverSessionId` и проверить ответ новой сессии до и после
    освобождения старого. В Settings остаётся только новый delivery-status marker;
    проверены исходные account/session заголовки. Same-account и A → B сценарии
    прошли 6/6 на desktop Chromium/Firefox/WebKit без retries; typecheck и diff
    check прошли. Реальные provider/device/staging остаются открытыми.
- [x] Привязать Stripe Checkout и административную смену тарифа к исходному
  account/session proof, серверному guard, response markers и
  no-store; не открывать поздний Checkout URL после смены аккаунта или входа
  того же аккаунта в новую серверную сессию. Локально:
  18 профильных unit в трёх файлах, typecheck и API/auth/admin guards прошли;
  account-switch E2E — 3/3 на desktop Chromium, Firefox и WebKit без retries,
  4 не-desktop проекта штатно пропущены. Код закоммичен в `1b80734`; точный
  последующий HEAD `45575d2`, содержащий этот guard, прошёл CI с двумя flaky
  E2E после retry в
  [run 38679312640](https://github.com/Michael-edel/FitFocus/actions/runs/38679312640).
  Follow-up переводит оба route на обязательный proof; unscoped checkout и
  admin subscription получают 401 до body/прикладных эффектов. На точном
  локальном SHA [`28341ed`](https://github.com/Michael-edel/FitFocus/commit/28341ed27d399dbed61e3bf51b6d79ff61f8c590)
  прошли 1244 unit / 208 файлов, 16 billing/admin тестов, три typecheck,
  API/auth/admin/schema/privacy guards и build. Старые bundles нужно обновить;
  точный CI, staging и Stripe остаются открытыми. Дополнительно удержанный
  Checkout URL проверен после повторного входа того же аккаунта с новым SID:
  `sessionEpoch` сменился, старая вкладка получила session-change notice, URL
  после освобождения ответа не открылся. E2E прошёл 7/7 desktop/mobile/PWA
  профилей без retries; root typecheck и diff check прошли. Тестовый коммит
  [`04bcde8`](https://github.com/Michael-edel/FitFocus/commit/04bcde897769aff0acf9b41fe43735e7fbfd219f),
  для него создан точный CI #1801; результат относится только к этому SHA.
  [Контракт](docs/billing-session.md).
- [ ] Проверить настоящий Huawei OAuth, BFCache/устройство и staging. Этот
  компонент не закрывает остальные writers и общий lifecycle P0.5. Дополнение
  [`6fd0bb0`](https://github.com/Michael-edel/FitFocus/commit/6fd0bb0459f989f7c04de087d83d49ff6b7739e7) закрывает локальную mock-проверку запоздавшего sync после повторного
  входа в тот же аккаунт с новым server session id: 3/3 desktop Chromium,
  Firefox и WebKit без retries. Commit
  [`12f7da6`](https://github.com/Michael-edel/FitFocus/commit/12f7da6949ecbbbd55287ccc7a455ac191299344)
  расширил на мобильные/PWA профили два delayed-sync сценария: вход аккаунта B
  и новая server session того же аккаунта прошли 14/14 вместе (8 мобильных
  запусков, `workers=1,retries=0`). Это локальная mock-приёмка; точный CI и
  настоящие OAuth/BFCache/staging всё ещё открыты.
- [x] Перевести AI Совет на общий AiSession: все 14 запросов используют один
  account/session proof; поздний ответ после входа другого аккаунта проверяется
  browser acceptance.
- [x] Удержать ответ AI Совета при повторном входе того же account с новым
  `serverSessionId`: старый ответ не добавляется в историю и не создаёт durable
  write в новой сессии. Вместе с A → B delayed-answer acceptance прошёл 6/6 на
  desktop Chromium/Firefox/WebKit без retries. Follow-up снял desktop-only skips
  с трёх AI Council account/session сценариев; они прошли 21/21 на desktop,
  Android, iPhone и PWA профилях (`workers=1,retries=0`). Production-код не
  менялся; exact-head CI ещё не завершён.
- [x] Расширить на мобильные/PWA-профили отложенные personal weekly-menu
  callbacks для входа аккаунта B и повторной сессии того же владельца. Оба
  сценария сверяют profile/state/outbox, AI-запросы и achievement effects;
  прошли 14/14 на desktop Chromium/Firefox/WebKit и Android/iPhone/PWA при
  `workers=1,retries=0`. Production-код не менялся; exact-head CI ещё не завершён.
- [x] Расширить delayed weekly-report и food/recipe photo callbacks на Android,
  iPhone и PWA. Шесть A→B и same-account reauthentication сценариев прошли
  42/42 на семи desktop/mobile профилях (24/24 на четырёх мобильных профилях),
  `workers=1,retries=0`. Поздние ответы не пишут профиль, дневник, историю или
  отчёт старой сессии и не запускают лишние achievement effects. Production-код
  не менялся; exact-head CI ещё не завершён.
- [x] Проверить account-switch profile save и refresh: поздний ответ A не
  подтверждает его запись в UI B и не гидратирует профиль B; после повторного
  входа A очередь продолжает ту же save operation с новой session epoch. Оба
  сценария прошли 14/14 на desktop Chromium/Firefox/WebKit и Android/iPhone/PWA
  при `workers=1,retries=0`; production-код не менялся, exact-head CI ещё не
  завершён.
- [x] Подтвердить точным CI сохранение вопроса и очистки истории во время sender
  pause через session-bound local commit guard; ответы AI остаются под строгим
  read guard. 38619175535 выявил время фикстуры, исправлено в 0abb185; 38620253135
  прошёл unit и нашёл типизацию repository API, исправлено в 92ecaa3; 38621324053
  прошёл unit и нашёл отсутствующие imports, исправлено в ce7b60d. Точный PR CI
  прошёл на merge-ref `d805b1f` с исходным SHA `7458ea0`: 1153 unit / 199 файлов,
  576 browser passed / 95 skipped, один flaky migration test прошёл после retry,
  audit, guards, три typecheck, build и 23 rollback/CAS-запроса прошли
  ([run 38621962929](https://github.com/Michael-edel/FitFocus/actions/runs/38621962929)).
  [Контракт](docs/ai-council-session.md); общий P0.5 остаётся открытым.
- [x] Добавить серверную проверку account/session в AI и weekly-menu items
  до прикладных эффектов (`16d3c34`); capabilities и HTTP-регрессии проверены.
  Follow-up [`7240fec`](https://github.com/Michael-edel/FitFocus/commit/7240fece7d9d66020599c96c6aa15f9b548c81e4)
  запрещает также legacy-запросы без scope; тест проверяет 401 до разбора
  некорректного body. Полный unit suite 1240/1240, общий и два strict typecheck,
  API/auth/schema/privacy guards, build и diff check прошли локально. Старые
  bundles нужно обновить до rollout; точный CI и staging остаются открытыми.
  [Контракт](docs/ai-session-guard.md).
- [x] Защитить недельный AI-отчёт и его retry свежим session proof, lifecycle
  guard и durable commit; локальные профильные проверки описаны в
  [контракте](docs/weekly-ai-report-session.md). GitHub CI коммита `0b7062d`
  упал на E2E (343 failed из 476) в [run 38357547143](https://github.com/Michael-edel/FitFocus/actions/runs/38357547143);
  локальный follow-up прошёл 49/49 связанных тестов Chromium; последующий полный
  CI HEAD `9bdeb47` завершился success ([run 38459458051](https://github.com/Michael-edel/FitFocus/actions/runs/38459458051)).
- [x] Локально перевести coach, личный план и объяснение плато с повторами на
  общий `AiSession`/lifecycle guard; профиль и usage сохранять только через
  guarded commit. Unit-suite: 1115 passed / 198 файлов, typecheck и два strict
  typecheck прошли. Browser-приёмка регистрации, onboarding и weekly report
  прошла: 32 passed / 3 skipped на 7 browser/PWA-профилях. CI исходного SHA
  `75e4d35` завершился ошибкой weekly-menu Firefox E2E в [run 38379449644](https://github.com/Michael-edel/FitFocus/actions/runs/38379449644):
  mock не отвечал на фоновый `wis_text`; 463 E2E прошли, 9 пропущены, три flaky.
  После добавления fixture локально прошли весь weekly-menu spec Firefox 8/8
  и пять повторов падавшего сценария. Фикс закоммичен в `ec29f41`; точный [PR CI](https://github.com/Michael-edel/FitFocus/actions/runs/38385161995)
  завершился success: 466 browser passed / 9 skipped и один flaky в iPhone PWA
  preview-origin (`route.fetch: socket hang up`, retry прошёл; причина неизвестна).
- [x] Добавить browser acceptance позднего ответа coach/plateau и смены аккаунта:
  локально 6/6 в desktop Chromium, Firefox и WebKit на `9bc98ee`.
- [x] Подтвердить CI для точного SHA `9bc98ee`: [run 38410002498](https://github.com/Michael-edel/FitFocus/actions/runs/38410002498) завершился success.
- [x] Добавить browser acceptance задержанных family callbacks после входа B в
  соседней вкладке: приглашение не попадает в старую UI, AI-ответ не создаёт
  `familyMenu`-операцию. `f9c8425` и `bca2eda` прошли по 3/3 на desktop
  Chromium, Firefox и WebKit без retries.
- [x] Проверить задержанный повтор личного плана A после входа B в соседней
  вкладке: поздний ответ не меняет профиль, значения, outbox или success-effects
  обоих аккаунтов. Локально прошло 3/3 на desktop Chromium, Firefox и WebKit;
  `npm run typecheck` и точный CI прошли: сначала `c48ce1b` в [run 38429247879](https://github.com/Michael-edel/FitFocus/actions/runs/38429247879), затем полный HEAD `7c50f08` в [run 38435173387](https://github.com/Michael-edel/FitFocus/actions/runs/38435173387). В последнем run три других E2E были flaky и прошли retry.
- [x] Проверить поздний achievement unlock из аккаунта A после входа B в
  соседней вкладке: ответ A со старым scope не показывает toast ни старой, ни
  новой сессии; active session остаётся B. Commit `b44d46e`; 7/7 browser/PWA-профилей,
  `workers=3`, `retries=0`; `npm run typecheck` прошёл. Последующий полный CI
  `9bdeb47` завершился success ([run 38459458051](https://github.com/Michael-edel/FitFocus/actions/runs/38459458051)).
  - [x] Проверить поздний achievement GET после reauth того же account: ответ
    старого readGuard не должен очистить уже загруженную награду. Регрессия
    сначала воспроизвела очистку; после проверки актуальности guard целевые
    achievement unit/transport tests прошли 30/30 и typecheck прошёл. Точный CI
    новой ревизии ожидается после push.
  - [x] Удержать POST `/api/achievements/check` с unlock от `app_open`, затем
    повторно войти в тот же account с новым server session. Поздний unlock не
    публикуется в старой или новой вкладке, а достижение новой сессии остаётся
    видимым. E2E прошёл 7/7 desktop/mobile/PWA профилей без retries; root
    typecheck и `git diff --check` прошли. Точный CI этого follow-up запускается
    после push; production-код не менялся.
- [x] Закрепить invite и member mutations за явным `familyId`: `/api/me`
  объявляет `familySync.target`; старый сервер без capability блокируется до
  запроса. Сервер проверяет точное членство/владельца, UI отбрасывает поздний
  invite после смены семьи при том же login. `2bbec11`: 1128 unit / 198 файлов,
  27 family E2E на трёх desktop-браузерах, target-capability 7/7 проектов,
  typecheck/guards/schema/privacy/audit/build и 23 rollback/CAS HTTP прошли.
  Полный CI `9bdeb47` завершился success ([run 38459458051](https://github.com/Michael-edel/FitFocus/actions/runs/38459458051)); два unrelated E2E были flaky и прошли retry.
  Staging и реальные old/new bundle для этого изменения остаются открытыми.
- [x] Добавить late-response acceptance для family shopping check и member-goal
  mutation: после входа аккаунта B ответ shopping action из A не запускает
  `shopping_item_checked`, а ответ цели семьи A не применяется после загрузки
  другой семьи тем же login. Затем личная `ShoppingListCard` подключена к
  исходному login guard: GET/PATCH требуют свежий account/session proof,
  поздние ответы не меняют данные аккаунта B, а server/local React state
  ограничены аккаунтом и неделей. CSV теперь собирается из этого scoped snapshot
  и повторно проверяет guard перед скачиванием; серверный export endpoint также
  проверяет переданный proof. E2E при входе B запретил экспорт старого A и
  подтвердил CSV только со списком B (3/3 desktop engines). Затем проверены
  отложенные family join/create
  family-context GET и family-shopping GET: после входа B ответы A не очищают
  ввод, не появляются в UI B, не запускают повторную загрузку семьи и не
  вызывают `family_join_or_create`. Тестовые commits `69c739a`, `1b6444a`,
  `bb1866c` и `8f012e4`; полный callback spec прошёл 30/30, шесть новых
  acceptance-проверок — 18/18 на desktop Chromium/Firefox/WebKit,
  `workers=1/retries=0`. Также прошли 25 API unit-тестов и `npm run typecheck`.
  Это локальная приёмка; полный CI, другие callbacks и lifecycle остаются открыты.
- [x] Проверить поздний ответ личной генерации недельного меню A после входа B:
  профиль, outbox и success-effects обоих аккаунтов остаются без изменений.
  `562e20d`: новый сценарий прошёл 3/3 на desktop Chromium, Firefox и WebKit;
  полный `ai-callback-account-switch.spec.ts` — 15/15 без retries, typecheck
  прошёл. Полный CI для этого SHA прошёл: [run 38531646756](https://github.com/Michael-edel/FitFocus/actions/runs/38531646756).
  Другие AI/family callbacks и общий lifecycle остаются открыты.
- [x] Удержать ответ `weekly_menu`, повторно войти в тот же account с новым
  `serverSessionId` и отпустить ответ старой сессии: profile, durable outbox и
  achievement state новой сессии не меняются. Вместе с A → B acceptance проверка
  прошла 6/6 на desktop Chromium/Firefox/WebKit без retries; общий typecheck и
  `git diff --check` прошли. Production-код не менялся; точный CI follow-up
  ожидает push.
- [x] Удержать недельный AI-отчёт старой сессии, повторно войти в тот же аккаунт
  и дождаться создания отчёта новой сессией. Поздний `wis_text` не меняет её
  значение, outbox, UI или число сетевых записей. Новый E2E прошёл 6/6 на desktop
  Chromium/Firefox/WebKit без retries; `npm run typecheck` и `git diff --check`
  прошли. Commit `63d6a0b`; точный полный CI запускается после push.
- [x] Проверить поздний ответ retry объяснения плато A после входа B во
  второй вкладке: профиль, values, outbox, active session и success-effects
  обоих аккаунтов не меняются. Целевой тест прошёл на Chromium, Firefox и
  WebKit; полный callback spec после поправки синхронизации прошёл 25/25
  выполненных проверок (2 штатных skip), `workers=1,retries=0`. Один Coach
  Firefox timeout в первом полном запуске не повторился: этот сценарий прошёл
  5/5, затем полный spec — 25 passed / 2 skipped. Связанные unit — 11/11,
  typecheck прошёл. Тест входит в полный CI `455cb01`, завершившийся success.
- [x] Привязать список, детали, создание тикета и ответ пользователя к исходной
  login-сессии. Все пользовательские и admin handlers требуют совпадающие
  account/session до разбора тела, проверки admin-роли и прикладных
  чтений/записей тикетов;
  клиент проверяет response markers, IDB auth-fence и не применяет поздний
  результат в другой сессии. `bc3e7c2`: профильные тесты 34/34, полный unit
  1249/1249, typechecks, guards и build прошли; старые bundles и staging остаются
  открытыми. [Контракт](docs/support-session.md).
  - [x] Удержать список и деталь обращения вместе с приватным вложением старой
    server session, повторно войти в тот же account и освободить ответы. Старый
    тикет и его вложение не появляются; актуальный ticket остаётся видим, а fetch
    приватного вложения не выполняется. Два E2E сценария прошли 14/14 на семи
    desktop/mobile/PWA профилях без retries; root typecheck и diff check прошли.
    Точный CI этого follow-up запускается после push.
  - [x] Удержать создание Support-обращения и ответ на тикет от старой server
    session после повторного входа того же аккаунта. Старый create не показывает
    success и не добавляет тикет; поздний reply не обновляет экран повторным GET.
    Два сценария прошли 14/14 на семи desktop/mobile/PWA профилях без retries;
    root typecheck и diff check прошли. Точный CI проверяется после push.
- [x] Привязать фотоанализ дневника и рецепта к исходной AI-сессии и lifecycle;
  guarded diary/history commit, profile usage и успешный UI только для текущей
  попытки. `d93ff53`: unit 11/11, typecheck прошёл; delayed-response тесты прошли
  на Chromium/Firefox/WebKit, а success-path дневника/истории/usage — на Chromium.
  Полный account-switch spec прошёл 22 сценария / 2 project skips без retries;
  полный CI HEAD `a9e3096` завершился success в [run 38540109329](https://github.com/Michael-edel/FitFocus/actions/runs/38540109329)
  (1132 unit, 535 E2E passed / 79 skipped, два Firefox flaky прошли retry).
- [x] Разобрать и исправить Firefox-flaky в двух сценариях weekly-menu durability.
  Трассировка установила TransactionInactiveError в DurableOutbox.finish: запись
  выполнялась после async-продолжения, когда IndexedDB-транзакция уже была
  неактивна. Код исправлен в [cae28bd](https://github.com/Michael-edel/FitFocus/commit/cae28bd);
  unit 1132/1132, storage 37/37, два сценария повторены 20/20, полный
  weekly-menu spec прошёл 24/24 на Chromium, Firefox и WebKit. Typecheck и
  storage-strict typecheck прошли. Полный PR CI опубликованного HEAD `6c6feca`
  завершился success в [run 38550243769](https://github.com/Michael-edel/FitFocus/actions/runs/38550243769);
  новый plateau-retry сценарий добавлен после этого SHA и ожидает точного CI.
  Подробности: [журнал](docs/stabilization-progress.md).
- [x] Завершить семейные callbacks и AI/state writers: серверный guard дополнен
  клиентской проверкой исходной сессии, lifecycle cancellation и late-response
  acceptance для перечисленных ниже путей. Полный [CI #1698](https://github.com/Michael-edel/FitFocus/actions/runs/39202941991)
  на кодовом HEAD `544f3f5` прошёл без retries. Общая приёмка оставшихся network
  writers и staging остаётся отдельной открытой задачей P0.5.
  - [x] Запретить незащищённый `/api/ai` из `callAiProxy`: помощник требует
    `AiSession`, а отсутствующий proof отклоняется до сети. Проверены 24 теста
    AI transport, полный unit suite (1188), typecheck, auth-scope и production
    build на follow-up поверх `1b80734`; точный CI этого follow-up ожидает push.
  - [x] Проверить реальный переход со страницы во время удержанного Coach retry:
    `beforeunload`/`pagehide` отменяют active `/api/ai` signal, возврат после
    навигации не меняет профиль, coach value, outbox или achievement effects.
    Сценарий прошёл 3/3 на desktop Chromium/Firefox/WebKit без retries; полный
    callback spec — 48/48 на desktop Chromium (`workers=1,retries=0`), AI transport
    unit — 25/25, `npm run typecheck` и `git diff --check` прошли в `b4336d8`.
    Это mock API;
    отмена работы внешнего AI-провайдера, BFCache и staging этим не проверены.
  - [x] Проверить реальный переход со страницы во время AI-объяснения плато,
    запущенного при session hydration. Удержанный scoped `/api/ai` отменяется
    на `beforeunload` до `pagehide`; поздний ответ после навигации не завершает
    hydration и не меняет profile, значения, outbox или achievements. Сценарий
    прошёл 7/7 на семи browser/PWA профилях без retries; root typecheck и
    `git diff --check` прошли. Код и E2E опубликованы коммитом
    [`aab209f`](https://github.com/Michael-edel/FitFocus/commit/aab209f) в PR
    [#93](https://github.com/Michael-edel/FitFocus/pull/93); точный CI запускается
    после push. Это mock API; реальный BFCache, внешний AI provider и staging
    не подтверждены.
  Отдельно добавлена account-switch проверка позднего ответа
  `/api/family/menu/generate`: после входа другого аккаунта preview не создаёт
  menu outbox operation; delayed `/api/family/menu/state` GET также не гидратирует
  старое меню после смены аккаунта. Оба сценария прошли на трёх desktop engines;
  последующий `5d3e4d6` добавил поздний `PATCH /api/family/member` после входа B:
  Chromium, Firefox и WebKit прошли 3/3 без retries, callback не запускает новую
  загрузку семьи аккаунта A после ответа. Trace первого полного прогона показал,
  что более ранний baseline включал незавершённую стартовую загрузку A; после
  переноса baseline за вход B сценарий прошёл. Точный CI follow-up ещё ожидается;
  остальные callbacks и staging остаются открытыми.
  - [x] Удержать создание family invite от прежней server session и повторно
    войти в тот же account с новым `serverSessionId`: после освобождения ответа
    старый invite-код не появляется, старая вкладка остаётся под session notice
    и не запускает повторную загрузку семьи. E2E прошёл 3/3 на desktop
    Chromium/Firefox/WebKit; typecheck и diff check прошли. Точный CI предыдущего
    SHA нашёл пропущенный `releasedMembers` в fixture; исправление включено в
    [`b1c01ae`](https://github.com/Michael-edel/FitFocus/commit/b1c01ae2338265b0aa925f269dc61140af3791dd), точный CI запускается после push.
  - [x] Удержать создание семьи со старой server session, повторно войти в тот
    же account и отпустить ответ. Новая сессия остаётся на своей семье; старая
    вкладка не запускает повторный family GET или achievement. Сценарий и два
    ранее добавленных same-account read/invite прошли 9/9 на desktop
    Chromium/Firefox/WebKit; общий typecheck и diff check прошли. Кодовый commit
    [`3c49439`](https://github.com/Michael-edel/FitFocus/commit/3c49439a6469e000591343538e2c212d52b16e3d); точный CI ожидает push.
  - [x] Удержать `/api/family/join` старой server session, повторно войти в тот
    же account и отпустить поздний ответ: старая вкладка остаётся под session
    notice, форма старой сессии скрыта, повторного family GET и achievement нет.
    Вместе с A → B join и тремя same-account проверками context/invite/create
    выборка прошла 15/15 на desktop Chromium/Firefox/WebKit без retries.
    Точный CI этого follow-up ожидает push; общий P0.5 остаётся открытым.
  - [x] Удержать PATCH цели участника, повторно войти в тот же account с новой
    server session и отпустить старый ответ: старая вкладка остаётся под session
    notice, не перечитывает семью и не изменяет новый семейный экран. Проверены
    исходные familyId и session id; три member-update acceptance прошли 9/9 на
    desktop Chromium/Firefox/WebKit без retries. Typecheck и diff check прошли;
    точный CI follow-up ожидает push. Остальные callbacks/staging открыты.
  - [x] Удержать семейный `PATCH /api/shopping/check`, повторно войти в тот же
    account с новой server session и отпустить прежний ответ. Старая отметка не
    переносится в новую семью и не запускает achievement; проверены исходные
    `familyId`/session и отсутствие повторного GET старой сессии. Новый сценарий
    вместе с тремя соседними family-shopping проверками прошёл 12/12 на desktop
    Chromium/Firefox/WebKit без retries; typecheck и diff check прошли.
    Остальные callbacks, точный CI и staging открыты.
  - [x] Удержать GET `/api/shopping/list` семейной корзины, повторно войти в тот
    же account с новой server session и отпустить ответ старой сессии. Новая
    вкладка показывает только свой маркер списка; маркер старого ответа не
    появляется после его освобождения. Новый сценарий прошёл 3/3, а вся выборка
    same-account family callback acceptance — 21/21 на desktop Chromium,
    Firefox и WebKit (`workers=1,retries=0`). Runtime-код не менялся; точный CI
    нового теста и staging остаются открытыми.
  - [x] Удержать GET `/api/family/menu` от прежней server session, повторно войти
    в ту же учётную запись с новой сессией и освободить старый ответ после того,
    как новое меню отображено. Маркер новой сессии остаётся виден, маркер старого
    ответа не появляется. Сценарий прошёл 3/3 на desktop Chromium/Firefox/WebKit;
    подтверждённого runtime-дефекта не обнаружено, exact CI follow-up ожидает push.
  - [x] Удержать GET `/api/family/menu` аккаунта A до входа аккаунта B в соседней
    вкладке. После освобождения ответа отображается меню B, маркер A не появляется,
    повторное чтение семьи A не запускается. Новый account-switch сценарий прошёл
    3/3 на desktop Chromium/Firefox/WebKit без retries; typecheck и diff check
    прошли. Runtime-дефект не обнаружен; точный CI этого тестового SHA ожидает push.
  - [x] Удержать preview `POST /api/family/menu/generate`, повторно войти в тот же
    аккаунт с новой server session и освободить старый ответ. Outbox, семейное меню
    и число отправленных операций остаются без изменений; epoch новой сессии
    отличается. E2E прошёл 3/3 на desktop Chromium/Firefox/WebKit; typecheck прошёл.
  - [x] Удержать AI-ответ семейной генерации, повторно войти в тот же аккаунт с
    новой server session и освободить ответ. Снимок меню и outbox не меняются;
    старый ответ не запускает запись или achievement. E2E прошёл 3/3 на desktop
    Chromium/Firefox/WebKit; typecheck прошёл.
  - [x] Исправить пустой экран после logout: `useCouncilChat` создавал render key
    при `currentUser=null` и `loginGuard=null`, затем читал `currentUser.id`.
    Теперь временный state key создаётся только при подтверждённом непустом
    accountId. Regression удерживает family AI-ответ, выполняет logout, затем
    освобождает ответ и проверяет auth screen, отсутствие pageerror, outbox
    mutation и achievement; прошла 3/3 на desktop Chromium/Firefox/WebKit.
    Точный CI изменённого SHA, общая матрица и staging остаются открытыми.
  Follow-up [`9e7f67d`](https://github.com/Michael-edel/FitFocus/commit/9e7f67d8da22de48bb0f0c49e257bd35fdb6de79)
  закрывает retry-гонку списка покупок: после отказа toggle клиент перечитывает
  подтверждённый серверный список с теми же account/session, family и week;
  устаревшая попытка не меняет UI. Новый тест до исправления оставлял checkbox
  в неподтверждённом состоянии, после исправления прошёл 3/3 на desktop
  Chromium/Firefox/WebKit. Полный unit suite 1318/1318, три typecheck и build
  прошли локально. Точный CI опубликованного HEAD ещё нужно проверить; общий
  P0.5 и остальные callbacks остаются открытыми.
  - [x] Удержать retry персонального плана аккаунта A, повторно войти в тот же
    аккаунт с новой server session и освободить старый AI-ответ. Профиль, значения,
    outbox и экран новой сессии не принимают устаревший план; не создаются новые
    profile/state writes или achievements. E2E прошёл 3/3 на desktop
    Chromium/Firefox/WebKit (`workers=1,retries=0`); typecheck и diff check прошли.
    Точный CI этой ревизии ожидает push.
  - [x] Удержать фотоанализ еды аккаунта A, повторно войти в тот же аккаунт с
    новой server session и освободить старый AI-ответ. Diary/history, profile usage,
    outbox и экран новой сессии не принимают результат; новые записи и achievements
    не появляются. E2E прошёл 3/3 на desktop Chromium/Firefox/WebKit
    (`workers=1,retries=0`); typecheck и diff check прошли. Точный CI этой ревизии
    ожидает push.
  - [x] Удержать пошаговую генерацию рецепта из фото еды, повторно войти в тот же
    аккаунт с новой server session и освободить старый AI-ответ. Diary/profile,
    outbox, recipe usage и achievements остаются без изменений; устаревший рецепт
    не появляется в старой или новой вкладке. E2E прошёл 3/3 на desktop Chromium,
    Firefox и WebKit (`workers=1,retries=0`); typecheck и diff check прошли.
    Точный CI этой ревизии будет проверен на опубликованном SHA.
  - [x] Расширить мобильную account/session матрицу пошаговой генерации рецепта:
    поздние ответы после входа B и новой server session того же аккаунта прошли
    14/14 на семи профилях, включая 8 Android/iPhone/PWA запусков
    (`workers=1,retries=0`). Дневник, профиль, outbox и usage другой/новой сессии
    остаются неизменными в коммите [`46cfe39`](https://github.com/Michael-edel/FitFocus/commit/46cfe39dae002301638415266c5bfe01af9b1bcf);
    точный CI follow-up проверяется после push.
  - [x] Удержать повтор Coach retry и Plateau retry после повторного входа того же
    аккаунта с новой server session. Старые ответы не меняют coach state, профиль,
    outbox, achievements или action/status metadata; результат не появляется в
    новой вкладке. Оба E2E прошли 3/3 на desktop Chromium, Firefox и WebKit
    (`workers=1,retries=0`); typecheck и diff check прошли. Точный CI проверяется
    на опубликованном SHA.
  - [x] Удержать отдельный Plateau `Объяснить` callback и повторно войти в тот же
    аккаунт с новой server session. Старый текст не появляется ни в одной вкладке;
    профиль, coach state, outbox, achievements и action/status metadata не меняются.
    E2E прошёл 3/3 на desktop Chromium, Firefox и WebKit (`workers=1,retries=0`);
    typecheck и diff check прошли. Точный CI проверяется на опубликованном SHA.
  - [x] Удержать enhanced-фотоанализ рецепта и повторно войти в тот же аккаунт с
    новой server session. Ответ старой сессии не создаёт временный recipe draft и
    не меняет профиль, values, outbox или achievements. E2E прошёл 3/3 на desktop
    Chromium, Firefox и WebKit (`workers=1,retries=0`); typecheck и diff check
    прошли. Точный CI проверяется на опубликованном SHA.
  - [x] Повторно проверить владельца callback после асинхронной загрузки списка
    weekly AI reports: если за время чтения последнее AI-действие сменилось,
    старый retry не публикует отчёты. Regression добавлен в
    `tests/ai_retry_feature.test.ts`; целевой файл прошёл 9/9, unit suite —
    1338/1338, три typecheck-профиля и production build прошли. Общий P0.5 и
    остальные callbacks/lifecycle остаются открытыми.
  - [x] Защитить фон weekly report общей попыткой с этапа proof до guarded commit;
    manual retry проверяет идентичность последнего `actionId`. Поздний AI ответ
    не проходит commit guard после замены маркера, а поздний `loadReports` не
    перезаписывает результат новой попытки. Оба пути повторно подтверждают точный
    `readGuard` в IndexedDB после загрузки списка, поэтому same-account
    reauthentication из другой вкладки не обновляет старый экран. Профильные
    unit-регрессии прошли 18/18,
    weekly report browser spec — 6/6 на desktop Chromium/Firefox/WebKit, весь
    unit suite — 1342/1342; три typecheck-профиля и production build прошли.
    Общий P0.5 и lifecycle остаются открытыми.
  - [x] Не показывать обычную ошибку генерации недельного меню, если scoped AI
    request отклонён из-за смены server session. `SessionReadError` теперь
    завершается без stale UI error; тест прошёл 4/4, а account-switch и
    same-account reauthentication E2E — 6/6 на desktop Chromium/Firefox/WebKit
    без retries. Полный unit suite — 1343/1343, три typecheck-профиля и
    production build прошли. Остальные AI/family callbacks и общий lifecycle
    P0.5 остаются открытыми.
  - [x] Не показывать `SESSION_READ_AUTH`, `LOGIN_SESSION_CHANGED` и session-read
    отказ семейной AI-генерации как обычную ошибку меню. До исправления новый
    browser regression показывал `SESSION_READ_AUTH` после scoped 401; после
    исправления session/auth ошибки подавляются, а остальные ошибки остаются
    видимыми. Тест прошёл 6/6 на desktop Chromium/Firefox/WebKit без retries;
    полный unit suite — 1343/1343, три typecheck-профиля и production build
    прошли. Общий P0.5, остальные callbacks и staging остаются открытыми.
  - [x] Подавлять ожидаемые `session`/`auth` отказы scoped AI-фото-запроса в
    диагностическом журнале; отказ `access` остаётся видимым. Новый тест
    воспроизвёл логирование `SESSION_READ_AUTH` до исправления. Целевой набор —
    12/12, полный unit — 1346/1346, три typecheck-профиля и production build
    прошли локально в `3bc6581`. Коммит опубликован в `55b3484`; точный CI
    #1543 проходит.
  - [x] Подавлять только typed `session`/`auth` отказ в общей проверке AI-сессии;
    `access` и `protocol` остаются заметны. E2E scoped 401 до исправления
    вызывал alert `SESSION_READ_AUTH`; после исправления тест прошёл 3/3 на
    Chromium, Firefox и WebKit без retries. Полный unit — 1347/1347, общий,
    domain-strict и storage-strict typecheck прошли; точный CI `d774018` ожидает
    push.
- [x] Защитить пошаговую генерацию рецепта из дневникового фото: `AiSession`,
  lifecycle/source scope, guarded durable update дневника и usage только после
  успешного commit. Код `71d2ca4`; полный локальный account-switch spec —
  44 passed / 4 skipped без retries, success path — Chromium; точный CI после
  push нужно подтвердить. [Контракт](docs/ai-callback-sessions.md).

Критерии для coach/plan/plateau callbacks и повторов приведены в
[контракте](docs/ai-callback-sessions.md).
Готово, когда ответ старого запроса не удаляет новую операцию, не применяет
старый payload и не продвигает версию независимо изменённого снимка.

### P0.6 — аккаунты и несколько вкладок

- [x] В durable-outbox хранить постоянного владельца операции и изолировать
  чтение/отправку; sender шести ключей использует проверенную серверную сессию.
- [x] В новом sender возобновлять очередь того же аккаунта со свежей сессией;
  sessionEpoch относится к попытке, а не навсегда запрещает такую операцию.
- [x] Останавливать sender на pagehide; BFCache-возврат запускает новую
  проверку сессии, cleanup удаляет обработчики прежнего аккаунта.
- [x] В desktop Chrome на сборке с runtime SHA `856e3f5` получить настоящий
  BFCache restore: `pagehide.persisted=true`, `pageshow.persisted=true`, затем
  запрос `/api/env` через 27 мс после restore. Проверка подтверждает только
  публичный конфигурационный callback на локальном mock origin; OAuth,
  авторизованные callbacks, устройства и staging остаются открытыми.
- [x] При подтверждённом удалении аккаунта очищать его recipe usage counter
  `fitfocus_usage_counters_v1:<encoded-accountId>`, не затрагивая счётчики других
  аккаунтов. До исправления очистка сообщала успех, оставляя счётчик. Регрессия
  воспроизведена и исправлена в `8b7fb2c`; общий ключ writer/cleanup закреплён
  в `STORAGE_KEYS.recipeUsagePrefix` коммитом `5d3d5b1`. Тесты privacy/usage прошли 9/9,
  полный unit — 1423/1423, typecheck/build/privacy guard прошли. P0.6 остаётся
  открытым для других callbacks, устройств, staging и полной lifecycle-приёмки.
- [x] Покрыть удаление аккаунта всеми текущими account-scoped localStorage
  ключами: UI-настройки, черновики, usage, achievement counters, telemetry и
  user-state. Проверено, что похожий ключ соседнего аккаунта и `__ffv` sidecar
  обрабатываются корректно. Test-only commit [`ef5d66a`](https://github.com/Michael-edel/FitFocus/commit/ef5d66a5e660236eeb957a9bdbdfc86531bbec73);
  полный unit suite — 1427/1427, root typecheck и diff check прошли. Точный CI
  #1686 на remote HEAD `1546073` завершился success, включая browser matrix и
  rollback/CAS gate.
  Общий account lifecycle остаётся открытым.
- [x] Запретить угадывание владельца и перенос id/prefix при входе; читать
  профиль только с own IDB accountId/owner-meta. Invite redeem проверяет
  свежую session-привязку до расходования кода.
  - [x] Удалить неиспользуемые `renameLocalStoragePrefix` и
    `renameIndexedUserStatePrefix`, которые могли переносить локальные записи
    между account-префиксами. Runtime-вызовов не было; тест теперь подтверждает
    изоляцию точного префикса. `indexed_user_state.test.ts` — 3/3, весь unit suite
    — 1363/1363, общий и storage-strict typecheck, production build и
    `git diff --check` прошли. Коммит `49a1ff6`; точный CI для этого коммита
    ожидает push.
- [ ] Завершить lifecycle-гарантии для profile и остальных API callbacks;
  `3abb374` закрыл unscoped серверный доступ к state/profile, но нужны проверки
  client lifecycle, старых writers и staging. Runtime legacy уже использует
  auth-derived owner и all-client Service Worker fence.
  - [x] Не терять выбранное фото прогресса, если durable profile write отклонён:
    передавать результат commit в UI, показывать ошибку и сохранять файл/подпись
    для повтора; инвалидировать фото-attempt при смене account/session scope.
    Регрессия прошла 3/3 desktop browsers; фото-изменение включено в последующую
    проверку полной `profile-durability.spec.ts`.
  - [x] Проверить удержанное декодирование фото после повторного входа в тот же
    аккаунт с новой server session: `sessionEpoch` меняется при прежнем
    `accountId`, а поздний callback не меняет профиль, state, outbox, сетевые
    writes или UI. Вместе с A → B проверкой E2E прошёл 14/14 на семи
    desktop/Android/iPhone/PWA профилях без retries; root typecheck и diff check
    прошли в [`2db372b`](https://github.com/Michael-edel/FitFocus/commit/2db372b4eaa1a0ddb2286cebf76b295efdad8393).
    Это mock API и Playwright file fixture, не физическая камера/staging;
    остальные callbacks, BFCache и lifecycle остаются открытыми.
  - [x] Разобрать browser failures точного CI #1793 на `4ed7f0b`: B вправе иметь
    собственную запись `wis_text`, а одинаковый mock-текст не идентифицировал
    ответ callback аккаунта A. Тесты теперь сравнивают B-данные с A-снимком,
    возвращают разные ответы для account A/B, ждут завершения начального
    `wis_text` и подтверждают конкретный `plateau` request. Оба сценария прошли
    14/14 на семи desktop/mobile/PWA профилях; root typecheck и diff check прошли.
    Новый точный CI запускается после push; production-код не менялся.
  - [x] Проверить поздний AI plateau-ответ при гидратации профиля: ответ A после
    перехода на B и после повторного входа A с новым `serverSessionId` не меняет
    profile/state/outbox, не вызывает profile/state writes или achievement и не
    появляется в UI. Оба сценария прошли 7/7 на desktop Chromium/Firefox/WebKit,
    Android Chrome/PWA и iPhone Safari/PWA (`workers=1,retries=0`). Первичный
    вариант теста требовал session notice до завершения гидратации; trace показал
    штатный loading screen, поэтому проверка перенесена на поздний ответ. Убран
    ручной close второй страницы, который давал локальный Vite proxy ECONNREFUSED;
    повторный прогон прошёл без этой ошибки. Production-код не менялся. Старый CI
    #1794 для `aee0a6c` отменён при публикации новой ревизии. Точный [CI #1796](https://github.com/Michael-edel/FitFocus/actions/runs/39314354105)
    для `8f06da2` завершился успешно: 1462 unit tests / 216 файлов, 1459 browser
    passed / 60 skipped (1 час), audit/guards, три typecheck, build, 23 HTTP/D1
    проверки rollback/CAS и сохранение артефактов прошли; новые follow-up тесты
    включены в этот запуск.
  - [x] Обрабатывать отказ profile commit для ручного замера, wearable text/file
    import и выбора/отключения источника: показывать ошибку, не считать отказ
    успешным и оставлять файл/ввод для повтора; отбрасывать callback после смены
    аккаунта или сессии. Проверки quota отказа сначала воспроизвели молчаливый
    import failure; после исправления профильный E2E-набор прошёл 42/42 на desktop
    Chromium/Firefox/WebKit без retries. Unit 1347/1347, три typecheck и build
    прошли. Код [`646b8b4`](https://github.com/Michael-edel/FitFocus/commit/646b8b4);
    exact CI после push. Остальные profile callbacks, BFCache на устройстве и
    staging остаются открыты.
  - [x] Удержать GET `/api/profile` аккаунта A, активировать B в соседней вкладке
    и отпустить ответ A после переключения. Старый экран закрыт session notice;
    профиль B и обе durable-записи не изменились, новых B-операций нет. E2E
    [`e5a22df`](https://github.com/Michael-edel/FitFocus/commit/e5a22df) прошёл
    3/3 на desktop Chromium, Firefox и WebKit без retries; typecheck прошёл.
  - [x] Удержать PUT `/api/profile` с durable Save аккаунта A, активировать B,
    затем отпустить ответ 200 со scope A. Старый opId и локальный payload A
    остаются в `sending`, не подтверждаются в активной сессии B; профиль B и его
    очередь не меняются. E2E прошёл 3/3 на desktop Chromium/Firefox/WebKit без
    retries; typecheck и `git diff --check` прошли. Это не заменяет приёмку
    повторного входа A и остальных writers/staging.
    - [x] После позднего ответа войти в A с новой server session: тот же opId
      получает новый attempt/sessionEpoch и отправляется только с новым proof;
      запись удаляется после проверенного 200. Проверка прошла 3/3 без retries.
  - [x] При возврате из BFCache заново загружать уже использованные семейный
    контекст и список покупок; старые ответы остаются недействительны.
    Регрессия прошла 24/24 на трёх desktop engines без retries (`29b1e3a`);
    полный lifecycle и реальный BFCache на устройстве остаются открытыми.
  - [x] Для profile sender проверить `pagehide` → BFCache return с новой
    проверенной сессией: та же durable-операция получает новый attempt и
    завершается только после нового scoped PUT. E2E — 3/3 desktop engines,
    `workers=1,retries=0`; synthetic lifecycle не заменяет реальный BFCache.
  - [x] Ограничить online/visibility cloud recovery совпадающими `cloudUserId`
    и `currentUserId`; cooldown теперь относится к аккаунту и проверенной
    серверной сессии и не подавляет восстановление после переключения или
    повторного входа. Профильные unit-проверки — 3/3, полный unit suite —
    1334/1334, общий и два strict typecheck, production build прошли локально.
    Точный CI новой ревизии ожидает push; общий P0.6, реальные BFCache и
    staging остаются открытыми.
  - [x] Запретить profile refresh без точного `readGuard`: тип операции требует
    guarded state-sync, совпадение `accountId`, повторную проверку и принятие
    guard до применения снимка. Удалены fallback и value-only state-sync API.
    Целевые unit и typecheck прошли; точный CI ожидает push. Остальной P0.6
    и staging остаются открытыми.
  - [x] Перед показом ошибки profile commit повторно проверять точный readGuard
    в IndexedDB: локального login-generation недостаточно при смене сессии из
    другой вкладки. Целевые profile tests прошли 36/36, typecheck прошёл; точный
    CI новой ревизии будет после push. Остальной P0.6 остаётся открытым.
- [x] Проверить old/new migration с двумя вкладками на одном origin без Web Locks;
  [smoke](e2e/legacy-outbox-migration.spec.ts) прошёл 7/7 проектов.
- [x] Проверить конкурентные записи одного ключа из двух вкладок без Web Locks:
  пока первая запись отправляется, независимая правка сохраняется конфликтом;
  [E2E](e2e/storage-durability.spec.ts) прошёл 3/3 desktop-браузера.
- [x] Проверить границу old/new bundles для `/api/state`: старая сборка получает
  `426` и сохраняет durable intent; после same-origin Service Worker update
  текущая сборка повторно отправляет тот же `opId`, payload и baseVersion с
  protocol v2. Новый E2E прошёл
  7/7 Playwright-проектов (`workers=1,retries=0`), весь файл — 3/3 на desktop
  Chromium.
- [ ] Завершить гарантии для profile и остальных API callbacks.
  Добавлен браузерный сценарий двух вкладок без Web Locks: параллельно
  сохраняются отметка плана и настройки в разные ключи. Проверка прошла в CI
  HEAD `a8f3219` (run 38634080772); остальные критерии P0.6 и writers остаются открытыми.
  Дополнительно добавлен сценарий 503 → вход B → возврат A с новой server
  session: pending операция сохраняет account A и тот же opId, не отправляется
  при активном B и возобновляется под свежей сессией A. Локальный прогон прошёл
  3/3 в desktop Chromium, Firefox и WebKit без retries; точный PR CI source HEAD
  `943d4c0` / merge-ref `75362ae` завершился success (run 38641088114).
  Также добавлены acceptance для reload и logout/login: pending запись с тем же
  opId переживает reload, а при logout sender ставится на паузу и возобновляет
  запись только после входа под свежей server session. Совместный локальный
  прогон всех трёх account-сценариев прошёл 9/9 в desktop Chromium, Firefox и
  WebKit без retries (`workers=1,retries=0`); полный CI `455cb01` завершился
  success.
  Мобильная/PWA матрица этих трёх сценариев прошла 12/12, а вся семипрофильная
  матрица — 21/21 без retries. Проверены смена аккаунта, reload с тем же `opId`
  и пауза после logout с возобновлением под свежей server session. Точный CI
  нового HEAD ожидает завершения.
  Это не закрывает общий P0.6: остаются profile и остальные API callbacks.

Готово, когда нет отправок чужих данных и потери записи из-за перезаписи
всей очереди одной вкладкой.

### P0.7 — непрерывные серверные версии после удаления

- [x] Реализовать additive-расширение `user_kv.deleted_at`, поколения
  tombstones и opt-in чтение удалённых записей в `fix/state-generations`.
- [x] Зафиксировать baseVersion=0 как отсутствие предыдущего поколения
  для PUT/DELETE; старое безусловное удаление существующего ключа запрещено.
- [x] Выполнять CAS и получать подтверждённую версию атомарно через `RETURNING`;
  конфликт отклоняет весь пакет, исчерпанная версия не переполняется.
- [x] Проверить SQLite: delete/recreate/stale update, гонки, миграцию,
  экспорт, перенос legacy-аккаунта и hard delete.
- [ ] Подключить совместимый клиент и проверяемый барьер старых writers;
  - [x] Требовать request `X-FitFocus-State-Protocol: 2` для `PUT/DELETE /api/state`;
    несовместимый writer получает 426 до чтения тела и D1. Текущий sender передаёт
    protocol и сохраняет intent на protocol-паузе; route/sender regressions
    и локальные проверки описаны в [журнале стабилизации](docs/stabilization-progress.md).
  - [x] Проверить настоящую пару старого/нового bundle через HTTP barrier на одном
    origin: старая сборка получает 426, сохраняет durable intent в IndexedDB,
    а текущая после Service Worker update повторяет ту же операцию с тем же opId,
    payload и baseVersion с protocol v2.
    Native HTTP E2E прошёл 7/7 Playwright-проектов без retries; synthetic API
    не заменяет staging-проверку ниже.
- [x] Не повышать legacy `baseVersion` до доказанного серверного поколения:
  импортировать старые операции как конфликт с `baseVersion=0`, закрыть claim,
  атомарно снимать старую попытку и отклонять поздний ack. Unit и browser
  acceptance зафиксированы в [контракте миграции](docs/legacy-migration.md).
- [ ] Проверить delete → recreate → stale update, гонку пакетной записи,
  миграцию, экспорт и удаление аккаунта на staging.

Готово, когда устаревшая версия не становится действительной после recreate,
а версия в ответе принадлежит именно подтверждённой мутации.

[Контракт и условия выпуска](docs/state-generations.md),
[проверки компонента](docs/stabilization-progress.md#p07--серверные-поколения-state).
Серверная реализация не закрывает staging, клиент или выпуск в main.

### P0.8 — единая постоянная очередь в IndexedDB

В текущей ветке реализованы общий IDB DurableOutbox и транзакционная запись
данных с операцией, claim/lease и guarded finish. К ней подключены 15 управляемых
state-ключей, профиль, регистрация и guarded bootstrap; старый Map sender удалён
из текущей сборки. Runtime-импорт legacy-очереди использует свежий `/api/me`,
all-client Service Worker fence, атомарные migration items и quarantine.
Старый и новый browser bundle проверены на одном origin с реальной pending-записью.
Формат JSON backup v3 сохраняет пять долговечных IDB stores и поддерживает
атомарное восстановление. Контракты и результаты проверок: [legacy migration](docs/legacy-migration.md),
[backup/restore](docs/backup-restore.md), [статус проекта](docs/project-status.md).

- [x] Инвентаризировать отдельную scaffold-очередь `fitfocus_outbox_ops`:
  у `storage/outbox.ts` не было runtime-вызовов, только re-export из
  `storage/index.ts`; модуль и re-export удалены в `e5a6154`, опубликованном
  вместе с тестом в `cf9d20e`. Сохранённый
  localStorage payload остаётся нетронутым и переносится backup как opaque data;
  автоматического импорта в DurableOutbox нет. Backup regression прошёл 10/10,
  полный unit suite — 1364/1364, общий и storage-strict typecheck, production
  build и `git diff --check` прошли. Browser startup acceptance подтвердила
  сохранение ключа, отсутствие DurableOutbox operation и сетевой отправки его
  данных: targeted 7/7, полная backup/restore спека 21/21. Точный CI новой
  ревизии должен проверить этот сценарий.
- [x] Обновить существующую IDB до v2, сохранив values; создать outbox,
  migration_items, migration_unknown и outbox_meta.
- [x] Реализовать и проверить транзакционные примитивы записи value/операции,
  claim/lease и guarded finish, явное владение ключом и сессией.
- [x] Выполнять зависимые записи finish внутри success-события последнего
  IndexedDB read request; проверить Firefox-повторы и браузерную матрицу.
  Локальные результаты связаны с кодом [cae28bd](https://github.com/Michael-edel/FitFocus/commit/cae28bd);
  CI `8dc7f71` прошёл, но обнаружил ещё один flaky в outbox.write; см. следующий пункт.
- [x] Выполнять зависимые value/operation/meta записи `writeOutboxInTransaction`
  в success-событии последнего IDB-чтения и синхронно отменять транзакцию при
  ошибке (`8d7aee0`). Timeout Firefox прошёл 5/5, account-switch 3/3,
  Android migration 5/5; связанные E2E: 27 passed / 9 skipped.
- [x] Выполнять claim-запись в активном success-событии IDB-чтения; gate и
  migration receipt проверять для нужной legacy-операции без сканирования всей
  очереди на каждом claim (`35fceb4`). 1132 unit, typecheck, storage-strict,
  production build прошли; Firefox и Android Chrome: 18/18 целевых E2E.
- [x] Перевести гидратацию, session accept/invalidate/clear, resolve/retry,
  account cleanup и user-state backup restore на записи в success-событии последнего IDB
  request (`f3a9abf`). Добавлена обработка пустого набора запросов; 1133 unit,
  три typecheck, build и 57 связанных Firefox/Android E2E прошли локально.
- [x] Перевести readwrite callbacks legacy migration на предварительно
  поставленные IDB-запросы и синхронные продолжения из request events
  (`37dc4b0`). Snapshot/progress и импорт с ledger остаются транзакционно
  согласованными; 94 целевых unit, 1133 общих unit, три typecheck и build
  прошли. Целевой migration smoke прошёл 6/6 повторов в Firefox и Android
  Chrome; первый совместный прогон двух E2E specs имел один timeout — подробности
  и границы проверки в [журнале](docs/stabilization-progress.md).
- [x] Подтвердить полный CI точного HEAD `152d7d7` после code/docs push:
  1133 unit / 198 файлов, 540 browser passed / 83 skipped, audit без
  уязвимостей, guards, три typecheck, build и 23 rollback/CAS-запроса прошли в
  [run 38577353585](https://github.com/Michael-edel/FitFocus/actions/runs/38577353585).
- [x] Реализовать компонент импорта по [ADR-005](docs/adr/ADR-005-durable-outbox.md):
  операция/карантин, ledger и прогресс порции атомарны; повтор, коллизии,
  подтверждение и необработанные прежние снимки учтены в тестах.
- [x] Подключить runtime-импорт после свежего `/api/me`; для владельца брать
  только точные ключи текущего подтверждённого аккаунта. Другие записи остаются
  unknown-owner до входа владельца.
- [x] Заменить `writersStopped` boolean на Service Worker all-client fence:
  worker и все same-origin вкладки должны ответить одним build id. Без ответа
  или при устаревшем proof импорт сохраняется, но `sendAllowed=false`.
- [x] Подключить шесть ключей UserStateRepository к value/операции одной
  транзакцией; сохранить редактор чтения при входе и защитить managed hydration.
- [x] Читать settings из IDB, ожидать commit недельного отчёта, показывать
  ошибку/blocked и учитывать известную outbox в индикаторе облака.
- [x] Перевести sender шести ключей на claim/finish, свежий /me proof,
  общий auth-fence, server session guard и HTTP-исходы; проверить две вкладки
  без Web Locks. [Граница sender](docs/state-sender.md).
- [x] Подключить 15 управляемых state-ключей и feature editors, удалить Map
  sender текущей сборки и raw profile state-upload; проверить отсутствие
  defaults-записей, сохранность delete и раннего/конкурентного редактирования.
- [x] Подключить редактор существующего profile к той же outbox и guarded
  sender; проверить быстрые patches, конфликт, refresh, reload и отказ commit.
- [x] Сохранять регистрацию и причинный AI-update в этой outbox; исключить
  угадывание владельца при входе и прямой profile PUT; проверить reload/quota.
- [x] Подключить guarded bootstrap/state-hydration и auth-fence (`dac2de2`).
- [x] Проверить runtime-импорт старого и нового bundle на одном origin с
  реальным pending intent: сохраняются владелец, ledger и исходный legacy-ключ;
  неизвестный владелец помещён в карантин; old/new clients обновляются по
  all-client fence, а operation без доказанного поколения остаётся конфликтом
  и не отправляется автоматически.
  [Browser smoke](e2e/legacy-outbox-migration.spec.ts), 7/7; обновлённая
  migration E2E-проверка прошла в точном CI HEAD `08618e3`, run `38628487894`.
  Полный UI lifecycle второго действия проверяется реальным повторным кликом в
  открытой старой вкладке: её legacy sender уже auth-blocked, поэтому новое
  localStorage значение сохраняется в IndexedDB как `conflicted` с причиной
  `legacy-writer-local-only`, не меняя durable value или старую очередь. Локально
  прошли 69/69 targeted unit, `storage-strict` typecheck и desktop Chromium E2E
  и полная migration матрица 7/7 без retries. Точный CI этого расширения,
  profile и delete lifecycle остаются открытыми.
  - [x] Проверить в реальном old/new bundle smoke все семь причин нормализатора:
    `not-an-object`, `invalid-type`, `invalid-key`, `put-without-value`,
    `delete-with-value`, `invalid-baseVersion`, `invalid-retryCount`. Каждый raw
    record и reason сохранён в quarantine; операций и отправок для повреждённых
    ключей нет, migration status остаётся `partial` после writer fence. Матрица
    прошла 7/7 без retries в коммите
    [`7504a2c`](https://github.com/Michael-edel/FitFocus/commit/7504a2ceb10e36c80cee1d9d17c35fc0579f9033).
- [x] Экспортировать все долговечные IDB stores в JSON backup; атомарно
  восстанавливать values/outbox/ledger/quarantine/meta, отклонять конфликт без
  частичного импорта и заново требовать legacy writer fence. Форматы v1/v2
  остаются импортируемыми. [Контракт и тесты](docs/backup-restore.md).
- [x] В durable restore заранее ставить проверки существующих primary keys,
  затем выполнять сравнение и добавление внутри success-события IDB-запросов;
  конфликт отменяет единую транзакцию всех пяти stores. Браузерный импорт и
  rollback прошли 4/4 на Firefox и Android Chrome в `38d169c`.
- [ ] Завершить остальные callbacks и полный lifecycle P0.2–P0.6.
  - [x] Проверить удаление `council_history` из открытой старой вкладки:
    при auth-паузе legacy queue остаётся с прежним PUT, но keyed storage event
    становится отдельной конфликтной DELETE-операцией `legacy-writer-local-only`.
    Durable value не удаляется и сетевой state write не выполняется. Нормальный
    legacy DELETE не дублируется; более старый DELETE не перекрывает последующую
    правку. Локально: `bf29ec8`, browser 7/7 проектов, unit 11/11; полный P0.8,
    profile callbacks, account deletion и staging остаются
    открытыми. Точный CI нового SHA ожидает публикации.
  - [x] Проверить гонку: изменение legacy source запускает re-verification,
    а следующая запись из старой вкладки приходит до ответа `/api/me`. Последний
    принятый local-commit guard позволяет сохранить её как `legacy-writer-local-only`;
    IDB повторно проверяет account/sessionEpoch, поэтому смена владельца или эпохи
    блокирует запись. Реальный `localStorage.clear()` создаёт один `key=null` event:
    исходный snapshot и quarantine остаются в IDB, per-key DELETE и state write
    не создаются. Unit 12/12, real old/new clear 7/7 и keyed-delete 7/7; полный unit
    1368/1368, три typecheck и production build прошли. Код `152b7af`; точный CI
    follow-up ожидает публикации. Остальные callbacks, P0.8/P0.9 lifecycle,
    staging и выпуск остаются открытыми.
  - [x] Сделать избранные рецепты durable: не показывать успех до outbox commit,
    выполнять edit одной транзакцией вместо remove+add, оставлять draft/editor
    открытыми при отказе и проверять account/session guard до и после записи.
    Регрессия отказа/retry формы прошла 3/3 desktop browsers; сохранение из
    фото-разбора с quota отказом и retry — 1/1 Chromium. Код [`0aad496`](https://github.com/Michael-edel/FitFocus/commit/0aad496);
    unit 1347/1347, root/storage-strict typecheck и production build прошли.
    Exact CI follow-up запускается после push; весь P0.8/lifecycle остаётся открыт.
  - [x] Дневник питания подтверждает add/edit/delete/bulk move/bulk delete только
    после durable commit в IndexedDB. При отказе запись не появляется на экране,
    выбранные строки и форма остаются доступными для повтора; callbacks проверяют
    account/session guard до и после записи. Quota-failure/retry E2E прошёл 3/3
    сценария на desktop Chromium/Firefox/WebKit; unit 1347/1347, root,
    domain-strict и storage-strict typecheck, production build и `git diff --check`
    прошли. Код [`2c94596`](https://github.com/Michael-edel/FitFocus/commit/2c94596);
    точный CI ожидает push.
  - [x] После quota/transaction ошибки настроек экран возвращается к последней
    локально записанной теме; пользователь может повторить сохранение. Действующая
    read-session guard защищает запись, а при 401 auth-паузе новая owner-scoped
    правка остаётся в outbox для отправки после повторной проверки входа.
    Регрессии quota/retry, transaction abort, multi-edit и 401 прошли 18/18 на
    desktop Chromium/Firefox/WebKit; код [`5204b41`](https://github.com/Michael-edel/FitFocus/commit/5204b41),
    unit 1347/1347, три typecheck-профиля и production build прошли. Точный CI
    запускается после push.
  - [x] Сохранять прогресс чтения и ответ на тест урока только после durable
    profile outbox commit; при quota/transaction отказе оставить урок открытым,
    показать ошибку и сохранить выбранный ответ для retry. Новый тест сначала
    воспроизвёл раннее закрытие. После фикса `profile-durability.spec.ts` прошёл
    45/45 на desktop Chromium/Firefox/WebKit без retries; unit 1348/1348, три
    typecheck-профиля, production build и `git diff --check` прошли. Код
    [`77ca05f`](https://github.com/Michael-edel/FitFocus/commit/77ca05f);
    exact CI ожидает push. Остальной P0.8 и полный lifecycle остаются открыты.
  - [x] Сохранять вес с dashboard только после durable profile commit; при
    ошибке оставить введённое значение и дать повторить его после reload.
    Недельный отчёт продолжает собственную ожидающую запись через новый
    repository instance по стабильному writer ID; конкурирующий writer по-прежнему
    остаётся конфликтом. Регрессия dashboard прошла 7/7 desktop/mobile/PWA;
    unit 1355/1355, root/domain/storage typechecks и production build прошли.
    Точный CI нового SHA запускается после push; полный P0.8/lifecycle остаётся открыт.
  - [x] Сохранять daily habit только после durable profile commit; при ошибке
    отметка остаётся прежней, её можно повторить. Profile `dailyHabits` стал
    источником истины для legacy-счётчиков привычек: они reconciled при hydration,
    поэтому больше не нужна отдельная несогласованная запись второго ключа.
    Проверки веса и привычек прошли 14/14 desktop/mobile/PWA; unit 1357/1357,
    root/domain/storage typechecks, production build и diff check прошли.
    Exact CI ожидает завершения прогона родительского SHA; полный lifecycle остаётся открыт.
  - [x] Перевести изменения профиля в Settings на durable outbox commit до
    подтверждения UI: данные профиля, прогресс-фото, настройки дефицита/профицита,
    risk acknowledgment и ответы Huawei. Запись использует актуальный
    account/session guard, сохраняется локально во время auth-паузы и не запускает
    облачную отправку, пока открыт несохранённый черновик формы. При отказе commit
    интерфейс показывает ошибку и сохраняет введённое значение для повтора.
    Полный `profile-durability.spec.ts` прошёл 19/19 desktop Chromium; Huawei и
    goal-intensity quota/retry прошли 14/14 по семи desktop/mobile/PWA проектам.
    Десять account-switch сценариев, указанных в annotations родительского CI,
    прошли 10/10 Chromium после обновления Service Worker mock. Unit 1359/1359,
    root/domain/storage typecheck, production build и `git diff --check` прошли.
    Код [`a0721b0`](https://github.com/Michael-edel/FitFocus/commit/a0721b0);
    точный CI нового SHA ожидает push. Полный P0.8/lifecycle остаётся открыт.
  - [x] Не показывать локальный fallback AI-план при входе/refresh до durable
    profile commit. Functional patch использует актуальный account/session guard;
    quota/abort оставляют экран в состоянии подготовки и не создают outbox/cloud
    запись. Регрессия отказа и восстановления прошла 3/3 на desktop Chromium,
    Firefox и WebKit; unit 1360/1360, root/domain/storage typecheck, production
    build и `git diff --check` прошли. Chromium и Firefox прошли profile E2E
    20/20; первый WebKit-прогон дал 18/20, оба сценария прошли точечный повтор
    2/2 и полный WebKit повтор 20/20 без retries. Exact CI #1575 для `a9d2e33`
    завершился с 988 E2E passed, 299 skipped и одним падением iPhone Safari:
    побочный weekly `wis_text` request дал access-control console error во время
    reload сценария fallback-плана. Поведение fallback и остальные CI gates
    прошли; до правки фикстуры этот сценарий локально прошёл 10/10. Теперь ответ
    `wis_text` задан напрямую и с AI scope в profile E2E fixture; точный iPhone
    Safari сценарий после изменения прошёл 10/10 без retries. Root typecheck и
    `git diff --check` прошли. Exact CI follow-up SHA ожидает push. Полный
    P0.8/lifecycle остаётся открыт.
  - [x] Устранить два E2E отказа точного CI #1577 для `87ba8b9`: Android access-pause
    сохраняет пользовательскую настройку через отдельный `writeLocalJson` с
    `localCommitGuard`, а устаревшая
    generated-запись после logout больше не выдаётся за storage failure. В profile
    fixture фоновые state writes подтверждаются общим mock, чтобы incidental
    DELETE не уходил на preview origin. Целевые Android Chrome/iPhone Safari E2E
    прошли 12/12 без retries; затронутые unit — 32/32, полный unit suite —
    1362/1362; root/domain/storage strict typecheck, build и diff check прошли.
    Новый SHA ожидает точный CI.
  - [x] Проверить, что временная auth-пауза и быстрый same-server re-verification
    не дают устаревшему UI guard блокировать профиль. Регрессия удерживает proof,
    проверяет fence до ответа и успешное durable сохранение после него; 7/7 проектов
    и 5/5 повторов iPhone PWA без retries в [`5003a28`](https://github.com/Michael-edel/FitFocus/commit/5003a281ab1984b7ced98ef6e0fe68b2d151ff00).
  - [x] Удержать GET `/api/family/menu/state` старой server session, повторно
    войти в тот же account и отпустить ответ после принятия нового `sessionEpoch`.
    Значения, family-menu snapshot и outbox остаются равны снимку до ответа.
    Тест прошёл 3/3 на desktop Chromium, Firefox и WebKit; точный CI изменённого
    SHA, другие callbacks, staging и общий lifecycle остаются открытыми.
- [x] Реализовать локальную очистку точных account-owned ключей и записей в
  пяти IDB stores одной транзакцией; инвалидировать сессию удаляемого аккаунта,
  сохранить чужие записи и показывать предупреждение при неполной очистке.
  [Контракт](docs/account-data-cleanup.md).
- [x] Подавлять повторный импорт данных удалённого аккаунта: локальный
  account tombstone хранится по SHA-256 ID, мигратор отмечает legacy fingerprint
  обработанным без новой операции, sender блокирует её claim/finish, а старый
  backup не восстанавливает account-owned строки при наличии tombstone. Общие
  source/snapshot сохранены; физическое удаление их payload и синхронизация
  tombstone с сервером остаются отдельными ограничениями.
  [Контракт](docs/account-data-cleanup.md).
  - [x] Вместе с удалением аккаунта сохранить неизвестную глобальную legacy-
    запись как `unknown-owner`; после повторной аутентификации не восстанавливать
    удалённую операцию и не превращать глобальную запись в account-owned. Снимок
    остаётся `partial`, raw evidence сохранена. Migration/cleanup unit suite
    прошла 70/70 в коммите
    [`82d5f27`](https://github.com/Michael-edel/FitFocus/commit/82d5f27dddb47ef374c0c1dd24835e5d2dfd26df).
  - [x] Не объявлять локальную очистку полной, если сохранена глобальная legacy-
    запись без доказанного владельца; при этом чётко scoped ключ другого аккаунта
    не считать evidence удаляемого пользователя. Регрессии в `4e8adff` сначала
    падали до исправления, затем прошли вместе с полным unit suite 1426/1426,
    strict typechecks, privacy/API guards и production build. Точный CI #1673
    предыдущего HEAD завершился с одним Safari timeout: общий migration progress
    временно оставался `importing` при закрытом send gate и сохранённых данных.
    Финальный E2E wait обновлён до 30 секунд без ослабления terminal assertions;
    локально 1/1 после трёх исходных успешных повторов. Точный CI #1675 для
    `17b96fb` выполняется.
- [ ] Завершить UI повтора/разрешения конфликтов и общий lifecycle.
  - [x] Показать для подтверждённого аккаунта число legacy-записей в карантине
    и агрегированные причины без отображения ключей/raw payload; неизвестные
    записи не получают владельца и не отправляются автоматически. Старый/новый
    bundle acceptance прошёл локально на desktop Chromium; exact CI нового SHA
    ожидает публикации.
  - [x] Добавить безопасные действия для обычных записей: повтор `failed`,
    оставить последнюю локальную версию или принять проверенный серверный снимок.
    Очередь и значения меняются транзакционно; действия требуют свежей сессии,
    точного набора operation IDs и не доступны legacy-записям.
  - [x] Пройти браузерную приёмку recovery-действий для state/settings, profile и
    familyMenu: retry failed, keep-latest-local, accept-server и отмена принятия.
    Полный прогон трёх spec-файлов прошёл локально: исходные 189 сценариев и
    добавленная проверка нескольких правок (всего 196 проверок по результатам
    прогонов); последний `storage-durability.spec.ts` прошёл 70/70 на семи
    browser/PWA-проектах. Общий/domain-strict/storage-strict typecheck прошёл.
    Проверка нескольких правок относится к следующей ревизии и не входит в CI
    SHA `4e2ccb7`.
  - [x] Подтвердить полный CI на `4e2ccb7`: 1092 unit / 197 файлов, 446 browser
    passed / 9 skipped, audit без уязвимостей, три typecheck, build и 23 rollback-
    запроса прошли в [run 38352095311](https://github.com/Michael-edel/FitFocus/actions/runs/38352095311).
  - [x] Подтвердить CI следующей ревизии с multi-edit сценарием: 1092 unit / 197
    файлов, 453 browser passed / 9 skipped, audit без уязвимостей, три typecheck,
    build и rollback-проверка прошли в [run 38354517668](https://github.com/Michael-edel/FitFocus/actions/runs/38354517668).
  - [x] Добавить явное разрешение импортированного конфликта для обычных
    account-owned state keys и профиля. State читает свежий scoped GET; профиль
    читает `/api/profile` и отправляет новую typed profile-операцию через CAS.
    Outbox и migration ledger обновляются атомарно; повторный импорт не воскрешает
    старую операцию. Legacy retry запрещён; динамический family-menu key
    появился после legacy writer, а его текущий typed conflict использует
    отдельный resource-specific recovery.
    State recovery: 1286 unit и 7/7 browser/PWA проектов. Profile recovery:
    122 целевой unit; полный набор — 1291/1291 в 208 файлах. Общий, domain и
    storage typecheck, auth/API guards и production build прошли; legacy migration
    E2E — 14/14 на семи desktop/mobile/PWA проектах, workers=2/retries=0.
    Run #1487 показал преждевременный ввод в profile-recovery до начальной
    гидратации формы; ожидание profile name в [`6b38bb3`](https://github.com/Michael-edel/FitFocus/commit/6b38bb3c23d58b6b7ac2b4ee373621244e880496)
    прошло локально 9/9 и в полном CI #1489. Единственная ошибка #1489 затем
    возникла в family-menu same-account reauthentication на desktop WebKit:
    trace поместил точный `/api/family/menu` access-control message примерно через
    45 мс после начала `page.reload()`, при штатном завершении reload и сохранных
    menu/session assertions. Узкое E2E-исключение добавлено в [`4afb66a`](https://github.com/Michael-edel/FitFocus/commit/4afb66a);
    сценарий прошёл 5/5, полная desktop WebKit family-menu спека — 16/16 без
    retries. Полный [CI #1491](https://github.com/Michael-edel/FitFocus/actions/runs/38996003342)
    для `0af2c30` выполняется; staging и общий lifecycle всё ещё открыты.
  - [x] Устранить гонку legacy profile recovery с параллельным session reverify:
    после scoped GET используется захваченный read guard, а его актуальность
    атомарно проверяется по `active-session` и `auth-fence` в outbox transaction.
    Регрессионный unit подтвердил отказ до правки и успех после неё; legacy
    migration E2E прошёл 49/49 на семи профилях и Android Chrome 10/10.
    Дополнительный тест подтверждает отказ при реальной смене session guard.
    Полный текущий локальный unit — 1422/1422, три typecheck, guards и production
    build прошли. Точный [CI #1665](https://github.com/Michael-edel/FitFocus/actions/runs/39171936916)
    для `856e3f5` выполняется; дополнительный negative unit в него не входит.
    Родительский P0.8 остаётся открытым до общей приёмки.
  - [x] Не допускать возврата локальных данных после удаления аккаунта через
    старый backup. В v1/v2/v3-импорте tombstone проверяется для localStorage и
    IndexedDB; v3 определяет владельца volume-value по account-scoped ключу,
    даже если строка старого формата не содержит `accountId`. Очистка повторно
    сканирует localStorage после записи tombstone, закрывая гонку с импортом.
    Регрессии воспроизведены до фикса и проверяют localStorage, IDB, версии v2/v3,
    соседний аккаунт и гонку удаления. Коммит
    [`671196e`](https://github.com/Michael-edel/FitFocus/commit/671196e5d80dd85929028a2378484f8781377ca9):
    1477 unit / 217 файлов, три typecheck, audit, schema/privacy/auth/API guards
    и build прошли локально. Точный CI ожидает публикации; общий P0.8 остаётся
    открыт.
  [Граница текущего runtime](docs/runtime-state.md).

Готово, когда IDB — единственный источник очереди, в том числе без Web Locks;
legacy-ключ не используется для новой очереди и не удаляется до проверенного
импорта. Неизвестное владение не определяется по активному аккаунту.

Контракт компонента и оставшиеся условия подключения:
[legacy migration](docs/legacy-migration.md). P0.8 остаётся открытым до
завершения остальных callbacks и полного lifecycle, UI повтора/разрешения
конфликтов, безопасной обработки global legacy evidence после удаления аккаунта
и общей приёмки.

### P0.9 — приёмка жизненного цикла

- [x] Проверить branch preview для проверенной ревизии
  `58f4d309f7a8359c4233905cacdb49d6adb6f430`: read-only smoke прошёл 8/8
  GET-only проверок, Service Worker активен, основной bundle содержит полный
  SHA. Это проверка публичного preview, не отдельного staging и не авторизованных
  интеграций.
- [x] Завершить точный CI P0.9 follow-up `58f4d30`:
  [CI #1832](https://github.com/Michael-edel/FitFocus/actions/runs/39489956059)
  завершился success: audit, guards, 1469 unit tests / 216 файлов, три typecheck,
  build, browser matrix 1627 passed / 74 explicit skips, native Chrome BFCache
  1/1 и rollback/CAS HTTP 23/23. Артефакты диагностики и проверенного rollback
  сохранены. Локально целевой Firefox сценарий прошёл 3/3, весь
  `pwa-update.spec.ts` — 10 passed / 4 skipped без retries. Исторический CI #1827
  на `1ea3f72` завершился с одним WebKit warning после reload; follow-up `a560c6c`
  связывает допустимый warning с тем же GET `/api/me`, начатым до reload и
  завершившимся abort/cancel. Причина прежнего Firefox timeout остаётся
  недоказанной; успешный повтор не объявляется доказательством её устранения.
- [x] Исправить два browser отказа точного CI #1839: durable delete Council и
  Android Chrome profile sync notice. Изменение опубликовано в
  [`7f53486`](https://github.com/Michael-edel/FitFocus/commit/7f534868584936067f12b0070adc874e5755be74);
  точный [CI #1840](https://github.com/Michael-edel/FitFocus/actions/runs/39533012883)
  прошёл: audit, guards, 1469 unit tests, три typecheck, build, browser matrix,
  native BFCache и rollback/CAS. Browser diagnostics и rollback archive
  сохранены [в CI](https://github.com/Michael-edel/FitFocus/actions/runs/39533012883).
  Причины двух исторических отказов не доказаны; это mock acceptance, staging и
  физические устройства остаются открытыми.
- [ ] Покрыть [матрицу сценариев](docs/sync-model.md#матрица-приёмки).
  - [x] Проверить переключение A → B во время in-flight PUT `/api/state`:
    поздний scoped-ответ A не подтверждает операцию A после смены active session;
    настройки B отправляются с proof B, без ключа A. Новый тест прошёл 7/7
    desktop/mobile/PWA профилей (`workers=2,retries=0`); mock API не заменяет
    staging. Изменение локальное, точный CI этого теста ожидает публикации.
  - [x] Проверить позднее подтверждение outbox после reauthentication того же
    аккаунта: исходная операция захватывается новым attempt в новой server
    session; поздний успех старого запроса не снимает её, а ответ нового attempt
    завершает очередь. Тест прошёл 7/7 профилей без retries. Mock API; точный CI
    локального изменения ожидает публикации.
  - [x] Подтвердить полный CI на code HEAD `ba78ba0`: audit, schema/privacy/auth/API
    guards, unit, три typecheck, build, browser matrix (`retries=0`) и rollback/CAS
    завершились success в [run #1688](https://github.com/Michael-edel/FitFocus/actions/runs/39193899739).
    Browser diagnostics и rollback artifact сохранены. Это CI/mock acceptance;
    staging, OAuth, D1 и устройство остаются открытыми.
  - [x] Проверить две вкладки с одним полным JSON-снимком без Web Locks:
    первый PUT удерживается в полёте, независимое второе редактирование не
    затирает первую запись, а сохраняется отдельным `local-revision-conflict`;
    после ответа первой операции подтверждённая версия и конфликт остаются в
    IndexedDB, второй PUT не отправляется. Browser acceptance прошёл 7/7
    desktop/mobile/PWA профилей без retries; используется mock API. Сценарий
    включён в [`de93fa0`](https://github.com/Michael-edel/FitFocus/commit/de93fa0c5d7b5a46a4258ee80fbe8783be6bb5a2).
  - [x] Browser acceptance cloud hydration при pending: server `dark` версии 7,
    локальная правка `light`, scoped 503 и reload сохраняют локальное значение,
    исходные `opId`/payload, baseVersion и retry deadline; до срока повторный PUT
    не отправляется. Сценарий прошёл 7/7 browser/PWA профилей без retries в
    [`64f4430`](https://github.com/Michael-edel/FitFocus/commit/64f4430). Это mock
    API; реальный offline, staging и остальные строки матрицы остаются открыты.
  - [x] Browser-acceptance для server commit с потерянным HTTP-ответом:
    первая запись фиксируется сервером, ответ обрывается, повтор той же операции
    получает 409. Тот же opId/payload остаётся конфликтным, confirmedVersion не
    продвигается без проверенного ack. Сценарий прошёл 7/7 desktop/mobile/PWA
    Playwright-проектов без retries на коммите
    [d028bc4](https://github.com/Michael-edel/FitFocus/commit/d028bc4d5a14e0711b40a8b10e446cdc9e382511).
    Это mock API acceptance; staging и остальные строки матрицы остаются открыты.
  - [x] Browser-acceptance закрытия отправляющей вкладки и повторного захвата
    просроченной lease: та же операция сохраняет opId/payload, получает новый
    attempt/owner и подтверждается после повторного входа в IndexedDB. Сценарий
    прошёл 7/7 desktop/mobile/PWA проектов без retries; `durable_outbox.test.ts`
    прошёл 28/28, включая игнорирование ответа старого attempt. Mock acceptance
    не закрывает staging и остальные lifecycle строки.
  - [x] Проверить восстановление retryable intent после HTTP 503 с `Retry-After`:
    opId, payload, baseVersion и время следующей попытки переживают reload;
    до срока новая отправка не происходит, после него та же запись подтверждается.
    Browser-сценарий прошёл 7/7 desktop/mobile/PWA проектов без retries; mock API
    не заменяет настоящую offline/device/staging проверку.
  - [x] Проверить transport disconnect для state PUT: первый запрос settings
    получает сетевой abort без HTTP-ответа, следующая попытка — scoped 503 с
    `Retry-After`. Та же операция с прежними opId/payload/baseVersion и сроком
    повтора переживает reload, не отправляется до срока и подтверждается после
    восстановления связи. Прошло 7/7 desktop/mobile/PWA проектов без retries
    в коммите [`e3f0312`](https://github.com/Michael-edel/FitFocus/commit/e3f0312ec84adce4c71a2e554c73fa8284df7c9c).
    Это mock transport, не проверка физического offline или staging.
  - [x] Проверить 403 access recovery: `ACCESS_REQUIRED` сохраняет ту же
    settings operation и ставит отправку на паузу; после свежего proof operation
    с теми же opId/payload подтверждается. Матрица прошла 7/7 без retries на
    локальном коммите [`1d54049`](https://github.com/Michael-edel/FitFocus/commit/1d540498a6fa05db348b6fd870d695ccde38a00c).
    Существующий `FORBIDDEN_KEYSPACE` recovery также прошёл 7/7 при повторном
    полном запуске после единичного не воспроизведённого сбоя iPhone Safari.
    Причина сбоя неизвестна; это mock API acceptance, полный lifecycle и staging
    остаются открытыми.
  - [x] Проверить DELETE-конфликт `council_history` после reload: та же
    tombstone-операция остаётся `conflicted` с исходным opId и проверенным
    `serverSnapshot`; после явного принятия сервера значение и версия 9 записаны,
    операция удалена, повторного DELETE нет. Mock API матрица прошла 7/7 без
    retries в коммите `2592492`. Общий P0.9 и staging остаются открытыми.
  - [x] В двух вкладках без Web Locks доставить ответ старого sender после
    истечения lease и ack новой попытки. Поздний 409 не возвращает операцию в
    очередь и не меняет подтверждённые value/version; browser-сценарий прошёл
    7/7 desktop/mobile/PWA проектов без retries.
  - [x] В коммите [`252bd08`](https://github.com/Michael-edel/FitFocus/commit/252bd082946ea86dbd51f4c862f6aad08a9d3f8a) добавлен PWA cold-reopen цикл: сохранить settings
    intent, закрыть вкладку, открыть управляемую Service Worker страницу, сверить
    прежние opId/payload/baseVersion в IndexedDB и подтвердить исходную операцию
    после восстановления сети. Локальная матрица на Playwright 1.64.1 прошла
    7/7 профилей без retries и использует `context.setOffline(true)` во всех
    движках; upstream fix — [`Playwright #42894`](https://github.com/microsoft/playwright/pull/42894).
    Повторный offline reopen в run #1485 выявил гонку восстановления auth:
    браузер вернул сеть, пока стартовый bootstrap ещё загружался, но обработчик
    `online` устанавливался только после перехода в `auth_choice`. В
    [`4b041f1`](https://github.com/Michael-edel/FitFocus/commit/4b041f194504068775d661b63a24f047e0e07bb1)
    обработчик установлен уже во время `loading`; целевой тест прошёл 6/6 на
    desktop WebKit и iPhone PWA без retries. Точный CI нового HEAD ожидается;
    browser/mock acceptance не заменяет физическое устройство, staging или
    полный P0.9.
  - [x] Проверить браузерный IndexedDB transaction abort после добавления
    settings outbox intent: value, operation и metadata целиком откатываются,
    видны ошибка сохранения и предыдущие подтверждённые settings. Сценарий
    прошёл 7/7 Playwright-проектов без retries в коммите
    [`bf6b142`](https://github.com/Michael-edel/FitFocus/commit/bf6b142b47e595dd9ba2947a312d9a03aeaa2a19).
  - [x] Проверить abort внутри реальной browser IndexedDB транзакции legacy import:
    после постановки outbox operation и imported migration marker в одной
    транзакции, но до commit, транзакция принудительно отменяется. Значение,
    operation, ledger и snapshot processed marker остаются целиком до повтора;
    повтор создаёт одну операцию и сохраняет тот же opId. Сценарий прошёл 7/7
    desktop/mobile/PWA проектов, workers=1, retries=0. Тест включён в точный CI #1603 для `de56ab3`; этот run завершился одним Safari E2E отказом, а локальный reload follow-up описан в журнале стабилизации. Staging остаётся открытым.
  - [x] Проверить browser migration после перестановки legacy-записей и изменения
    `retryCount`: две операции остаются конфликтными, сохраняют исходные opId,
    processed marker нового snapshot завершён, дублей после следующего reload нет.
    Тест с реальной IndexedDB и Service Worker прошёл 7/7 профилей без retries и опубликован в [`de56ab3`](https://github.com/Michael-edel/FitFocus/commit/de56ab3d9a1f2379ae3413af675545f5c99bbd41). Точный CI #1603 завершился одним Safari E2E отказом; follow-up на `beforeunload` локально прошёл 9/9 WebKit reload профилей, exact CI ожидает публикации.
  - [x] Проверить `401 → новая правка → login`: локальный follow-up
    [`cb22abe`](https://github.com/Michael-edel/FitFocus/commit/cb22abe40740ed8b1f55b6d0d7c716d9c4d7364c)
    сохраняет доступ к локальным настройкам в auth-паузе после обновления
    `authFence`, сохраняет новую операцию под прежним аккаунтом и отправляет
    обе операции с исходными opId последовательно после свежего proof.
    7/7 desktop/mobile/PWA E2E, unit 9/9, typecheck и production build прошли;
    это mock API, точный CI и staging остаются открыты.
  - [x] Проверить настоящий navigation unload во время регистрации AI:
    browser `beforeunload`/`pagehide` отменяют signal именно активного `/api/ai`
    после durable commit базового профиля; profile operation остаётся pending,
    `loginAsUser`/profile PUT не запускаются. `registration-durability.spec.ts`
    прошёл 21/21 на семи browser/PWA профилях без retries; unit 44/44, полный
    unit 1388/1388, три typecheck, production build и diff check прошли в
    локальном commit `dc38a51`; точный CI #1630 на `9825e8d` завершился success.
    Отдельный staging остаётся открытым.
  - [x] Для Admin transport отменять активное чтение ответа на `beforeunload`
    и `pagehide`, удалять временные listeners и сохранять сам `AdminSession`
    пригодным для следующего запроса после возврата. `admin_session_transport`
    прошёл 13/13; вместе с Support transport — 28/28. Root и storage-strict
    typecheck и `git diff --check` прошли на `931779e`. Дополнительно реальная
    browser navigation с удержанным `/api/admin/stats` прошла 7/7 desktop/mobile/
    PWA проектов без retries на `8f75731`: `beforeunload` отменил scoped fetch,
    исходный proof записан, same-origin probe прочитал маркеры после перехода.
    BFCache и физическое устройство остаются отдельной проверкой. Дополнительно
    поздний `/api/admin/stats` освобождён после повторного входа того же аккаунта
    с новым SID: новая статистика остаётся видна, старый marker не попадает ни
    в одну вкладку. E2E прошёл 7/7 desktop/mobile/PWA профилей; root typecheck и
    diff check прошли. Тест [`4cea2bd`](https://github.com/Michael-edel/FitFocus/commit/4cea2bdeb2513307d11b33785a7ee444da82a5b5),
    точный CI #1803 создан для этого SHA.
- [x] Добавить route-level acceptance `delete → recreate → stale update` для
  `/api/state`: проверяются 200/409, tombstone generation и сохранность новой
  версии после старого PUT. `tests/state_generation_route.test.ts` вызывает
  production handlers на SQLite-backed D1 adapter; auth/capability провайдеры
  изолированы, поэтому это не staging/OAuth. Целевой тест — 1/1, полный unit
  suite — 1369/1369, три typecheck, production build, API invariants и
  `git diff --check` прошли локально. CI #1616 на `47bb7d9` завершился success,
  включая E2E и rollback/CAS gate.
- [x] Предотвратить частичные/усечённые пакетные записи в `/api/shopping/bulk`
  и legacy `/api/weekly_menu/items`: повреждённые элементы и пакеты свыше 500
  отклоняются целиком до D1 batch/delete; пустые отметки сохраняют no-op, а
  явный пустой weekly `items: []` остаётся командой очистки.
  Четыре целевых test-файла прошли 35/35, полный unit suite — 1454/1454 в 216
  файлах; CI #1696 на точном `544f3f5` завершился success: 1110 browser passed /
  311 skipped, guards, три typecheck, build и rollback/CAS прошли, артефакт
  сохранён. Branch preview задеплоен с тем же SHA; GET-only staging-config smoke
  прошёл 7/7. Это не отдельная staging-база и не проверка OAuth/D1.
- [x] Разделить unit, браузерную матрицу с синтетическим API и реальные
  staging-проверки. Unit и mock browser запускаются отдельными командами;
  CI использует только локальную mock-матрицу. `test:e2e:staging` требует
  `FITFOCUS_STAGING_ORIGIN` и ограничен анонимными GET на одном HTTPS origin;
  `test:e2e:mock -- --list` обнаруживает 1337 сценариев / 24 файла и исключает
  staging suite; staging config обнаруживает 8 тестов. Публичный branch preview
  прошёл эти GET-only проверки 8/8, но отдельный изолированный staging-origin
  не задан. Отдельный валидатор покрыт unit-тестами на missing/non-HTTPS/
  credentials/path/query/fragment и production hostname (включая регистр и
  завершающую точку). Полный локальный unit suite — 1382/1382; typecheck и guards
  прошли. Follow-up `1271dfe` ожидает точного CI; PR CI #1618 прошёл на предыдущем
  опубликованном `66e8c19`. Авторизованные staging-запросы не выполнялись; полный
  release checklist остаётся открытым gate.
- [ ] Пройти [чек-лист выпуска](RELEASE_CHECKLIST.md) на точном release SHA.

Готово, когда доступны результаты по каждому сценарию и нерешённые
конфликты/неизвестные legacy-записи не скрыты статусом «миграция завершена».

## P1 — после P0

- [ ] Исправить контраст sidebar и нижней навигации в светлой теме:
  снимки desktop Chromium и Android после переключения на «Светлая» показывают
  тёмные подписи на тёмном фоне. Проверить [SidebarNavigation](SidebarNavigation.tsx),
  [App](App.tsx), глобальные стили и [theme hook](features/settings/useDocumentTheme.ts).
  Предупреждение конфликта читается; весь визуальный QA этим не закрыт.
- [ ] Исправить контраст native select «Цель» в тёмной теме WebKit:
  screenshot профиля показывает светлый текст на светлом фоне. Проверить
  [SettingsScreen](SettingsScreen.tsx) и темы; функциональный E2E не доказывает читаемость.

- [ ] Заменить `Record<string, unknown>` в группах props `AppWorkspace`
  конкретными контрактами; расширять строгую типизацию по модулям.
- [ ] Продолжать выделять сценарии из оставшихся крупных модулей, опираясь
  на уже существующие feature hooks и серверные use cases.
- [ ] Добавить измерения из [наблюдаемости](docs/observability.md), снять
  исходный уровень и согласовать пороги.
- [ ] Подтвердить реальные OAuth, D1, push, платежи и wearable-сценарии
  в подходящей тестовой среде перед зависимыми релизами.
- [ ] Вернуться к продуктовым улучшениям из [PRODUCT.md](PRODUCT.md).

## Как закрывать задачу

Для выполненного пункта указывать commit/PR, затронутые контракты,
проверенные сценарии и ограничения. Обновлять документы в том же изменении.
Зелёный deploy не заменяет зелёный CI; skipped/neutral проверка не считается
подтверждением отсутствия ошибок или секретов.
