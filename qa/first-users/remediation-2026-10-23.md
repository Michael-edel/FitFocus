# Исправления после семейного аудита

Подготовлено 23.10.2026; выпуск ещё не выполнен. Исходный аудит 4+4 Sol
принадлежит tree a054bbb и сохранён отдельно с исходными PNG/кликами/оценками.
Новые результаты не приписываются этим независимым ролям.

Исправлены восстановление принятых порций и явного пустого выбора, защита
редактора от поздних GET/PATCH, сохранение неоднозначного старого черновика с
явным восстановлением, статус несохранённого preview, количественное сравнение
конфликта, нулевые строки покупок и подпись прав managed-профиля. Дополнительные
настройки профиля свёрнуты. После BFCache возврата повторно читается семья.

Промежуточный tree `7241e2381d79cb3c82c67b4aa5f83038f70c0e39`:
1683 unit / 233 файла, три typecheck, guards, schema/privacy, Vite/PWA и
Pages build прошли в Linux sandbox без внешней сети. Реальный локальный
Pages/D1 browser lifecycle прошёл 14 проверок: покупки/manual, offline→ACK,
reload, восстановление порций, preview, пересчёт, второй Free-участник,
private403 и двухсеансовый CAS409 с явным выбором версии. Проверены размеры
375/390/430/1280 в Linux Chromium156. Это технический повтор затронутых
сценариев, не новая группа пользователей и не реальный iPhone.

Первый повтор остановился из-за старого селектора теста для разделённых spans
количеств; приложение уже получило точный ACK. Исправленный harness проверяет
отдельные числовые поля. Неудачный и успешный прогон сохранены раздельно.
Полные доказательства: соседний workspace `qa/first-users/infrastructure/`
(`smoke9`, `remediation1`, `ff-check-8d3265831f52`), PNG и hash promotion.

После этого добавлены переносы mock/PWA и новые release gates. Их исходники
ещё требуют выполнения на окончательном commit; промежуточный PASS не
объявляется проверкой последнего tree. Сохранены все прежние account/session/
family guards, no-write проверки, Retry-After/opId и исторический v2 forward.
Изменившаяся семантика daily/CAS описана в `e2e/FAMILY_FIRST_COVERAGE.md`.

Контрольный B `246a2d70b70671f20081d0ba985279127c0e0262` содержит совместимый
0022 backend и draft/cache patch. Его самостоятельные unit/types/build прошли;
retained HTTP/native PWA приёмка остаётся отдельным gate. C и B должны быть
разными полными артефактами. См. `docs/family-planning-release.md`.

На `90f31b1` повторные unit/types/build/guards/schema/privacy прошли. Браузерный
family-session прогон дал 11/12: после исправления ожиданий асинхронного IDB
состояния осталась невидимая на экране покупок подсказка auth-pause. Это FAIL,
который требует исправления интерфейса, а не удаления проверки.

CI `39927546667` для предыдущего `ff19614` остановился на npm audit: DOMPurify
3.4.16. Подготовлен точечный patch 3.4.17; новый B
`a6b2048bb94b4550013662b18c778f88b785798d` содержит тот же dependency patch.
Исторические v2/legacy fixtures не меняются. Приёмка новой пары ещё требуется.

Рабочая D1, цены, политика и исходные пользовательские данные не изменены.
Сохранённые 11 прежних файлов и 27 последующих файлов проверены отдельно,
без автоматического наложения. Новая вкладка Cloudflare после восстановления
соединения позволила прочитать Production binding: DB указывает на UUID
`061ae786-9341-4bd7-8efe-025dd1bac6d5`, который в D1 называется `fitfocus-dev`.
Владелец подтвердил, что это рабочая база, и разрешил подготовить отдельный
план её миграции. На том этапе SQL не выполнялся; полного production-пути нет.

## Повторные проверки 23.10, до 15:34

`3a52e4ad41409ee8e0c08ff2e95980534923dc66` (C10): семейное меню 19/19,
без skipped/flaky, workers=1/retries=0. Полная пара архивов C10/B2 прошла
50 HTTP-проверок и 12 проверок штатного migration runner на локальной D1,
включая атомарный отказ и полный rollback при шести участниках. Источники:
`ff-family-e2e-4520b3adbf44`, `ff-family-prepare-0ddb199d09e8`,
`ff-family-http-91d156930c30` в отдельном infrastructure workspace.

C10 callback-прогон дал 34/37. Два селектора смешивали личные и семейные
checkboxes; третий тест запрещал допустимую новую sender-попытку уже сохранённого
durable intent после входа того же аккаунта. На C11
`e35ba9aa7d86b7bbf6089afb74be9c47c2087dd2` все 37/37 прошли. Теперь тест отдельно
проверяет сохранённый opId, прежнюю семью/payload/CAS обеих попыток, свежий ACK
и неизменность IDB после позднего старого ответа. Account/session guards,
no-achievement и отсутствие воздействия на новую семью сохранены.

Native PWA update на C11: 1 passed, 1 failed, 1 pre-existing Safari-only skip
в Chromium. Проверка выявила скрытую внутри More причину legacy pause на Family.
Это настоящий дефект видимости, а не разрешение обойти all-client fence:
sender оставался закрытым, durable intent сохранялся. C12
`f272639ba1ccc1a9b908d8a42c3ef635a040f497` оставляет один глобальный notice
на Today/Family/Shopping с reserveSpace=false; idle сворачивается, личные экраны
сохраняют прежнее резервирование места. Hooks/retry/fence не менялись.
Recovery UI-тесты обращаются к видимому глобальному уведомлению. Полный повтор
unit/types/build и выбранных Chromium/WebKit PWA/menu/session/callback проверок
на C12 выполняется; предыдущие PASS не объявляются его полной приёмкой.

После восстановления Chrome выполнены только read-only SELECT рабочей D1.
Все 23 имени ledger точно совпали с исходниками до 0021, отсутствует только 0022.
Пять основных и три дополнительных anomaly counts равны 0; ожидаемый seed — 2.
Метаданные семи таблиц, 18 индексов и четырёх прежних barriers совместимы с 0022.
Рассмотрено историческое отличие DEFAULT у family_members.status; полной
идентичности всей схемы не заявлено. Time Travel показывает 7 дней, bookmark
прочитан, restore не проверен. DDL/DML/restore и смены binding не выполнялись.
Полные неперсональные записи сохранены вне исходников в
`WORKING-DB-PREFLIGHT-20261023-1003Z.json` и
`WORKING-DB-SCHEMA-20261023-1014Z.md`.

Merge/deploy остаются закрыты до точного CI/review, окончательной пары
артефактов и production hold/drain/backup/QA gates. Исходные 4+4 Sol и их PNG,
клики, оценки и ответы о возвращении не переписывались. Инженерные повторы
не выдаются за новую независимую пользовательскую группу.

### Обновление 15:39

На точном C12 прошли 1683 unit / 233 файла, три typecheck, guards, schema
(24 миграции / 33 таблицы), privacy (30 таблиц), Vite/PWA и полный Pages build.
Доказательство: `ff-check-12477e138188`, runtime.ok=true.

Повтор PWA update C12 подтвердил видимость legacy pause, но остановился дальше:
сырой writer-fence helper вернул null (1 passed / 1 failed / 1 Safari-only skip).
Сохранён `ff-family-e2e-061c7f02d25f`. Найдено конкретное несоответствие бюджета
теста: helper закрывал порт через 750 мс, SW допускает 1500 мс на client probe,
production checkLegacyWriterFence ждёт 2500 мс. Фактическую задержку старый trace
не доказывает. Test helper теперь использует тот же production budget 2500 мс,
проверяет challengeId и workerBuildId; complete, количество клиентов и совпадение
их builds остаются обязательными. SW, hooks, suite timeouts и retries не менялись.
Исправление ещё требует native retest; null не переименован в PASS.

### Обновление 16:10: точные повторы и граница выпуска

C13 `eb8a136c1e9536e1cedbabddc15e76b344a03e2c`: native Chromium PWA update
прошёл 2 сценария, один прежний Safari-only skip, без failed/flaky
(`ff-family-e2e-ea4f9c89a944`). C14
`15330c6307e2e28da5a21d304b35af7a63961954`: C→B2→C rollback прошёл 2/2
pending/conflicted (`ff-family-e2e-234fb0d816bb`). В тесте сохранён Settings
hash после reload, затем проверен личный профиль и выполнен явный переход
в семейное меню; ACK, IDB, retry и сохранность данных не ослаблялись.

C15 `7ed0ee15cc318b96b513e27fff0820bf4e743d69` интегрировал текущий main.
Единственный конфликт CI разрешён с сохранением B2 и всех семейных gates;
его tree `94deb35141ce89df2880ba2217baeb8dbd214190` точно равен C14.
На C15 прошли 1683 unit / 233 файла, три typecheck, guards, schema/privacy,
frontend/PWA/Pages build (`ff-check-fdd16bfdd516`). Точная полная пара C15/B2
прошла 50 HTTP/CAS и 12 migration-runner проверок
(`ff-family-prepare-eaa5a9ad89f3`, `ff-family-http-de08c1674ae8`).
Свежая установка B2→C15 в Chromium — 1/1 PASS
(`ff-family-e2e-fa75a12847da`). Все target-процессы запускались внутри
прежнего Linux sandbox без внешней сети, workers=1/retries=0.

C15 native WebKit/iphone-safari update — 1 passed / 2 failed / 0 skip/flaky
(`ff-family-e2e-67d4a2deca1b`). MiniBrowser SIGABRT при открытии oldPage
и отдельный retryCount=0 после structured confirm пока не имеют установленной
причины. OOMKilled=false контейнера не доказывает отсутствие resource pressure
дочернего процесса. Последующая browser очередь остановлена. Технический
diagnostic с bounded resource telemetry и catch только временной копии теста
выполняется отдельно; он не считается acceptance PASS. Sandbox, guards,
timeouts/retries и исходные assertions ради результата не ослаблялись.

Security-only PR #100 слит обычным merge в main
`a42b9de1be296dd97ba23ee160d3b8ab68a5bf6e`. Его PR CI 39933203987 SUCCESS:
1608 unit, 1665 browser passed / 71 предусмотренных платформенных skip,
HTTP/CAS 23/23; rollback/diagnostics artifacts загружены. Tree merge/head/
synthetic merge совпадает. Main CI 39942447140 ещё выполняется. В Chrome
подтверждены Production/main/a42b9de/success; Family и 0022 туда не включены.
Исторический security rollback 98d4910 содержит DOMPurify 3.4.16 и не принят
как безопасный откат security patch.

Правило main прочитано на странице GitHub без изменения настроек:
Require PR, build-and-typecheck/up-to-date, conversation resolution и запрет
admin bypass включены; Require approvals выключено. Поэтому прежнее ожидание
обязательного APPROVED не переносится на текущий выпуск автоматически.

Рабочая D1 проверялась только на чтение. Конкретный проект prefix barrier
подготовлен отдельно в infrastructure workspace; он ещё не реализован и
не проверен. Два guards не означают полного family hold или HTTP drain.
Безопасный installer/bridge/rollback, lifecycle gates, backup/restore и QA
остаются условиями будущей семейной публикации. Family merge/deploy не выполнены.
Нового слепого 4+4 после этих инженерных исправлений не было; сохранённые
58 PNG и оценки исходных восьми Sol-персон относятся к их прежним snapshot.

### Обновление 17:26: native WebKit и AI navigation

C20 `64bd7a260479114b3cc7b4d020f6e85f550d449d`:
`ff-family-e2e-9130dd2a1043` — исходный `pwa-update.spec.ts` прошёл 3/3
в Linux WebKit / iphone-safari, без skip/flaky/retries. Отдельный bounded
acceptance профиль: 2 CPU / 3 GiB / 512 PID / 2 GiB scratch. Перед запуском
подтверждены private netns, caps=0, NNP/seccomp, отсутствие внешней IPv4/IPv6
сети, портов и host credentials; target оставался на trusted hold до проверки
и подтверждения parent. Static native online probe завершён и закрыт до suite.
До/после suite совпали сети и SHA256 исходного spec с immutable Git blob
`6eae1a54152c6b1c05da7937a18b9f4628d9c081edc5678193a7b2a529971df9`.
Все 110 resource snapshots доступны, memory/PID denial counters равны 0.
Runtime и независимый parent proof равны true; promotion выполнен после PID0.
Тесты, source assertions и timeouts не менялись. Это не physical iOS acceptance.

Прежние FAIL остаются сохранены. Diagnostic 3 GiB / 512 PID / CPU1
`ff-family-e2e-e0ed0f618dab`: 2 passed / 1 timeout финального screenshot.
Отсутствие default route ранее давало native WebKit offline и retryCount=0;
новая private network с terminal unreachable rule устраняет именно этот
инфраструктурный дефект. Последний diagnostic `ff-family-e2e-19a6854abd22`
остановился на static first-page-create, приложение не запускалось. Он не
доказывает причины прежнего screenshot timeout. PASS CPU2 не переносится
на CPU1 и не доказывает, что причиной был только CPU.

C17 `ea386d5c3a3ac65ce898f7dce452aaa8d922f22b` AI Chromium:
`ff-family-e2e-edb1f4fe4210` — 69 passed / 4 platform skip / 1 failed.
Семь исправленных Retry-сценариев прошли; осталась попытка открыть More
в retired A после активации B. Null UI scope намеренно отклоняет такой setter.
C20 проверяет session-change notice, закрытое меню, отсутствие AI online и
Retry даже в hidden DOM; исходные raw A/B ownership assertions сохранены.
C18 обновил два mobile dialog selector, C19 убрал семь устаревших desktop-only
skips: AI Retry теперь доступен через общее More на всех ширинах. Новых skip,
таймеров или ослабления durable/session checks нет. Все эти коммиты test-only.

Текущий C20 Android retest, WebKit rollback/fresh installation и семейные
regressions выполняются строго по очереди; окончательные результаты пока
не заявлены. Family CI 39945032316 относится к remote C16 и уже показывает
старые navigation failures; исправления C17–C20 не выдаются за его результат.

### Обновление 18:23: текущий main и завершённые семейные regressions

Main API повторно подтвердил `a42b9de1be296dd97ba23ee160d3b8ab68a5bf6e`,
protected=true. Exact CI `39942447140` завершён SUCCESS: 1608 unit / 226 файлов,
1658 browser passed / 78 reported skips / 0 failed; HTTP/CAS 23/23; browser и
rollback artifacts фактически загружены (IDs 12503002995 и 12503795856).
Локальный inventory: `MAIN-CI-39942447140-20261023.json`. Исторический 98d4910
с DOMPurify 3.4.16 не является принятым security rollback. Family B2 a6b2048,
main и C23 содержат 3.4.17, проверено по immutable lock blobs.

C20 Android AI `ff-family-e2e-16393205da6a`: 71 passed / 3 platform skip,
без failed/flaky/retries. C22 `77b5384` исправляет только rollback helper:
ожидание enabled day editor, native details.open и visible checkbox до исходных
assertions. Exact C22 Linux WebKit rollback `ff-family-e2e-f858d60d82d0`:
2/2 PASS; Git spec before/after, network/resources и parent acceptance PASS.

C22 menu regression `ff-family-e2e-469a178fa3df` сохранён как 17/19 FAIL:
notice-rooted locator внутри details.has ошибочно требовал вложенный notice.
C23 `50b60523d7443715796523ba37bcfa36bba660d9` меняет только relative summary
selector, сохраняя все local/remote/menu/CAS/outbox/persistence assertions.
Exact C23 последовательная очередь `remaining-acceptance-f8b22474cbae.json`
завершена PASS: menu 19/19 `ff-family-e2e-b286f73d3403`, session 12/12
`ff-family-e2e-d0fe42509080`, callbacks 37/37 `ff-family-e2e-bd8d96bfe899`.
Ни skips, ни retries, ни flaky. Native C23 WebKit fresh installation
`ff-family-e2e-f7fa50980e87`: 1/1 PASS; parent подтверждает неизменный spec и PID0.

WebKit infrastructure pre-app failure `ff-family-e2e-8278365eae18` сохранён:
отложенный kernel ff00::/8 route после однократного cleanup. Только bounded
cleanup exact kernel multicast rows двух внутренних veth исправлен; строгая
allowlist, terminal IPv4/IPv6 unreachable rules, empty DNS/caps0 не ослаблены.
Отказные контейнеры не запускали app/browser и удалены после PID0.

Native mobile C20 `ff-mobile-c20-4870f3130f0f`: 36/37 engineering checks,
12 PNG на375/390/430, menu/purchases exact ACK/readback, console errors=0.
Единственный FAIL — shopping focus на375 сразу после ACK. Код controller
подтверждает отдельное ожидание durable ACK observation; исходный trace не
сохранял disabled attribute. External harness теперь ждёт естественный enabled
control и displayed saved state, сохраняет focus/inside/hit и добавляет
disabled/connected. Повтор `ff-mobile-c20-dc734b9aec91` также36/37 FAIL:
после двух ready animation frames checkbox снова disabled=true, focus=false,
connected/inside/hit=true. Причина повторного UI-перехода пока не доказана;
app bug или harness timing окончательно не классифицированы. Все12 PNG и
сетевые/ресурсные proofs сохранены. Предшествующие pre-app manifest и
tmpfs evidence-retention failures также сохранены; это не дефекты пользователя.
Physical iOS, VoiceOver, native zoom и3G не проверены; root-rem simulation
не называется native text zoom. Это технический QA, не новые независимые роли.

Отдельный prefix prototype: `ff-prefix-f4618a6fa286` SQLite18 групп + JS5
binding checks PASS; source bytes и bounded isolated sandbox подтверждены.
`ff-prefix-d1-52f11a5cb6c6` остаётся diagnostic FAIL по четырём исходным FK
error-string assertions, хотя full state checks, обе positive batches,
16 durable checkpoints /33 runtime opens и original old-prefix/late-suffix/
unchanged0022 sequence наблюдались успешно. D1 наружу скрывает FK error за
generic internal reference; произвольный internal error не принят как PASS.
Новый отдельный matched differential proof:
`ff-prefix-d1-differential-create-9c5c84eb8dac` и
`ff-prefix-d1-differential-join-9f8fe848c753` PASS, суммарно6пар/12вариантов/
18opens/4durableFKrejections. Matched control отличается только exact FK clause,
принимает standalone/forgot-delete с exact persisted rows; FK variant откатывает
те же inputs; правильная5statement batch коммитится в обоих. Проверены exact
schema/FK pragma, foreign_keys=1, пустой невозможный parent и durable reopen.
Это local pinned workerd, не Cloud D1, не app integration или разрешение live DDL.

Fence-aware B3 готовится отдельно на B2; current B2 atomic handlers ещё не знают
token protocol, поэтому после guard он не принят как рабочий rollback writer.
Atomic installer/receipt, B3 runtime/race proof, полный lifecycle/drain,
backup/restore-check, QA actor и новый exact-head Family CI остаются gates.
Рабочая DB, binding и защитные правила не менялись. Family не merged/deployed.
Исходные 4+4 Sol-роли и58PNG относятся к своим зафиксированным snapshots;
инженерные агенты/прогоны не прибавляются к этому пользовательскому аудиту.
