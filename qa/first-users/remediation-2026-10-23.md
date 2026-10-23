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
checkbox disabled=true, focus=false, connected/inside/hit=true. Прежний вывод
о пройденных ready animation frames исправлен диагностикой ниже. Все12 PNG и
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

Уточнение 18:40: третий диагностический WebKit прогон
`ff-mobile-c20-67cf7ea1b9e3` сохраняет FAIL36/37 и12PNG. Trace содержит18
событий без truncation и четыре read-only IDB metadata snapshots. Маркер
FOCUS_READY_TWO_RAF не достигнут; disabled/local состояние до focus непрерывно.
PUT и точный HTTP readback версии2 успешны, IDB подтверждает тот же opId/revision3.
Playwright1.64.1 coreBundle.js (SHA256829521b67ed7be90c7d6d6098ff39f2241562d47e4ad7ccab13710924a56001d,
строки25681–25712) проверяет truthiness результата predicate до await: Promise
от async predicate преждевременно завершает poll даже с false. Это ошибка QA
ожидания; trace не доказывает прежнюю гипотезу stale setter приложения.
Отдельное статическое воспроизведение и исправленный полный прогон описаны ниже.

### Приёмка 18:54: ожидание WebKit и prefix adapter

Static proof `ff-wk-predicate-ed4e19a27185` подтвердил asyncfalse → false handle
без polling, тогда как syncfalse завершился TimeoutError200ms. Fixture оставалась
disabled, app/HTTP/D1 не запускались. Прежний masked static FAIL
`ff-wk-predicate-f558b78ca26e` сохранён; точную причину его отказа восстановить
нельзя, CPU/timing не объявляются доказанной причиной.

Full native mobile `ff-mobile-c20-502f559ef725`:37/37 checks,12PNG375/390/430,
console errors0; в trace ready marker предшествует успешному focus на375.
QA harness использует synchronous predicate, требует result===true, сохраняет
два RAF, strict recheck и общий20sbudget. App не менялся ради этого PASS.
Parent подтвердил namespace/external unreachable до/после, resource gates,
input hashes, stoppedPID0 и12PNG при безопасном продвижении evidence.

B3 implementation `c98951e` и test/checker fix `b8babb1` сохранены отдельными
локальными commits/refs/bundles. `ff-check-12d853f2a027` остаётся FAIL: шесть
устаревших mocks и прежний inline SQL checker. `ff-check-e854da2c2e90` наb8babb1
PASS1680unit/232файла, три types, guards, schema24/33, privacy30, builds.
Runtime bytes между этими двумя B3 commits не менялись.

Actual compiled B3 + local workerd/D1:
create0021 `ff-prefix-bridge-create-0021-a24bfeb15042`14cases;
join0021 `ff-prefix-bridge-join-0021-01d92f5ce142`12;
create0022 `ff-prefix-bridge-create-0022-0cb8f779d73e`14;
join0022 `ff-prefix-bridge-join-0022-110da1a46574`12 — все52PASS.
Exact full schema/rows, bare3/token5, metadata/partial refusal, no-op/IGNORE,
installer TOCTOU и три persistence opens каждой конфигурации проверены.
`ff-prefix-managed-capacity-6e385b75ad48`: ещё4PASS — owner+3managed принимает
пятый account, owner+4managed отклоняет шестой; оба modes, fullrollback/token0,
invite unchanged, distinct probes и durable reopen. Исходные файлы неизменны,
все targetPID0 подтверждены перед чтением результатов и контейнеры удалены.

B3 перенесён в локальную Family-ветку. Новый combined candidate/HTTP и pin
совместимого rollback ещё проверяются. Это не public HTTP/auth, Cloud D1 или
разрешение рабочей миграции. Atomic installer/receipt, lifecycle/drain,
backup/restore и live согласование остаются открыты; рабочая DB не менялась.

### Приёмка 19:22: объединённый C25 и полный B3

Локальный C25 `f5f3d635f0cd827eb245131bcb733d9071578e83`, tree
`9415c6a4e2f97a50999b2c99360e926a8727ee63`, интегрирует fence-aware B3.
`ff-check-4ac0ed0b099f`:1695 unit/234 файла, три types, guards, schema/privacy,
frontend/PWA/Pages builds PASS. Архивы `ff-family-prepare-c43eaf154fd0`
прошли полную упаковку. `ff-family-http-99be0cff12de`:50 HTTP-запросов
C25→B3→C25 и12запросов/7групп штатного Wrangler rollout PASS: honest23ledger
через0021, capability fail-closed, atomic create/join на0021, оригинальная0022,
seed/menu/profile preservation и полный rollback при шестом участнике.
Это не combined prerequisite/zero-prefix/0022 ledger proof.

Native WebKit на этой паре: `ff-family-e2e-9c667f0b825c` rollback2/2 и
`ff-family-e2e-9598d3a341e2` fresh installation1/1 PASS. Parent подтверждает
профиль2CPU/3GiB/512PID, private namespace, Git blob до/после, PID0 и cleanup.
Предыдущий `ff-family-e2e-c8b5fb161fa4` сохранён как infrastructure FAIL:
при перезапуске tool service parent потерял stdin до promotion. Exit0 target
не засчитан как приёмка. Новый parent запущен отдельно в скрытом устойчивом
процессе; новая приёмка не переписывает старый FAIL.

Installer/receipt подготовлены вне приложения: восемь шагов одним D1 batch,
17случаев (8fault+8matched benign controls+success), независимое Sol review
безP1/P2. Runner с настоящим локальным Wrangler baseline ещё не запускался.
Общий zero-prefix+0022+actual ledger, lifecycle/HTTP drain, backup/restore,
QA actor и exact-head CI остаются открыты. Шаблон человеческой проверки
owner-son-acceptance.md подготовлен без подсказок; люди его ещё не проходили.
11+27 прежних файлов и пять защищённых файлов сохранены; рабочая DB не менялась.
