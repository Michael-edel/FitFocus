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
