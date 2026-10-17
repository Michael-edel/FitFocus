# Сессия семейных запросов

Сверено: 14.10.2026. Историческая база компонента — код:
[`9c44c2118749275cbb8ecaa11c520c43e4220000`](https://github.com/Michael-edel/FitFocus/commit/9c44c2118749275cbb8ecaa11c520c43e4220000),
ветка `fix/durable-outbox`. Этот документ описывает family session guard
и его продолжение; статус относится к актуальной реализации в
[контракте семейного меню](family-menu-state.md) и к свежим browser-проверкам ниже.

## Исправленная гонка

Прежде `useFamilyCloud` отправлял запрос с cookie на момент fetch, затем
применял ответ без привязки к исходному входу. Ответ старой загрузки мог
восстановить UI после logout; приглашение могло уйти от другого входа того
же аккаунта. Ошибка отметки покупки также могла оставить необработанный Promise.

Теперь `App` передаёт исходный `loginReadGuard` из hydration и функцию
проверки login attempt. Клиент не подбирает proof по текущему IDB/cookie-входу.
Каждый HTTP-запрос обновляет proof через `/me` с предыдущим guard, требует
`familySync: { protocol: 1, guard: 1 }`, проверяет IDB epoch/auth-fence и
публичную account/session-привязку ответа. Другая сессия того же аккаунта
не принимается за исходную.

Для `POST /api/family/invite` и `PATCH /api/family/member` дополнительно
требуется `familySync.target === 1`. Эти запросы всегда содержат `familyId`
конкретной выбранной семьи; отсутствие capability или цели блокирует запрос
до мутации. Сервер разрешает invite только владельцу этой активной семьи,
а member update применяет профиль только к соответствующей активной записи.

## Серверный и клиентский охват

| Путь | Методы | Защита |
|---|---|---|
| `/api/family` | GET, POST | Scope до чтения/создания семьи |
| `/api/family/invite` | POST | Scope, `familySync.target` и точный `familyId`; владелец целевой семьи |
| `/api/family/join` | POST | Scope до расходования кода |
| `/api/family/member` | PATCH | Scope, `familySync.target` и точный `familyId`; только членство в целевой семье |
| `/api/family/menu` | GET, POST | Scope до чтения/сохранения меню |
| `/api/family/menu/state` | GET, PUT | Mandatory scope, CAS snapshot; Family-Menu markers |
| `/api/family/menu/generate` | POST | Scope до серверной генерации |
| `/api/shopping/list` | GET | Scope до чтения покупок |
| `/api/shopping/check` | PATCH, POST | Scope до изменения отметки |
| `/api/shopping/bulk` | PATCH | Scope до пакетного изменения отметок |
| `/api/shopping/export` | GET | Scope до чтения CSV; Family markers и no-store |

Все перечисленные endpoints используют `requireScopedStateUser` до чтения body
или прикладных эффектов. Отсутствующий, неполный или несовпадающий account/session
proof возвращает 401. Ответы, включая ошибки,
содержат `X-FitFocus-Family-Protocol: 1`, `X-FitFocus-Family-Guard: 1`
и переданную публичную привязку. Приватный sid не возвращается.
`/api/family/menu/state` отдельно возвращает Family-Menu markers.
Старые сборки без парных заголовков получают 401; до server rollout клиент
должен обновиться и проверить family capability.

В `useFamilyCloud` подключены загрузка семьи/меню/покупок, создание,
приглашение, присоединение, смена цели, серверная генерация меню и отметки.
GET семьи и меню выполняются параллельно с отдельной проверкой каждого ответа.
Неверные family/week или повреждённые данные отклоняются; ошибка загрузки
не очищает уже показанный снимок. При отказе отметки UI восстанавливает
прежнее значение и показывает ошибку.

## Личная корзина недельного меню

Личная карточка в `PlanScreen` использует те же `/api/shopping/list` и
`/api/shopping/check`, но без `family_id`. Это всё равно account-owned запрос:
общий серверный `Family` scope требует, чтобы cookie совпадала с исходной
сессией запроса. Раньше `ShoppingListCard` посылал только cookie, поэтому
запрос из старой вкладки мог попасть в новую сессию.

Теперь `App` передаёт исходный `loginReadGuard` и `isCurrentProfileSession`
через `AppWorkspace` и `PlanScreen`. Карточка требует совпадения `userId` с
аккаунтом guard, перед каждым GET/PATCH обновляет proof через `/api/me`,
проверяет `familySync` capability, scope ответа и `week_start`. Ошибка 401,
смена активного IDB-сеанса и ответ для другой недели не применяются.
Controllers отменяются при размонтировании, смене login scope и `pagehide`;
возврат из BFCache начинает новое чтение. PATCH остаётся optimistic только в
снимке исходной пары account/session/epoch/auth-fence/week; его поздний ответ
не меняет список другого пользователя.

Серверный список и локальные fallback-отметки React хранят с ключом аккаунта и
недели. Состояние checkbox fallback сначала читается по ключу нового аккаунта,
и только затем может быть записано обратно; прежнее состояние не копируется в
новый ключ. Проверки account switch находятся в
[`family-callback-account-switch.spec.ts`](../e2e/family-callback-account-switch.spec.ts).

CSV для новой карточки строится из уже загруженного account-scoped снимка, без
второго запроса с cookie. Перед подготовкой и перед скачиванием повторно
проверяется исходный `loginGuard`; поэтому старая вкладка после входа B не может
скачать список A или данные B. CSV сохраняет серверные заголовки и формат
количества. Endpoint `/api/shopping/export` для прямых вызовов также
проверяет переданный scope до `ensureUserRow` и возвращает Family protocol/guard
markers. Proof обязателен и для экспорта.

## Lifetime и транспорт

`FamilyActionScope` допускает независимые действия одновременно и отменяет
предыдущую попытку того же вида. Logout, cleanup и pagehide отменяют старые
controllers. Pageshow активирует новое поколение и снимает оставшийся loading;
старые попытки не оживают. Завершение старой попытки не удаляет новую.

При `pageshow` с `persisted === true` уже использованный семейный контекст и
список покупок загружаются заново. Это обновляет снимок после BFCache-возврата,
включая изменения из другой вкладки; старые запросы остаются отменёнными, а
новые снова проходят обычные login-proof, family/week и action-scope проверки.
Если вкладка ещё не запрашивала семейные данные, дополнительный запрос не
выполняется.
Регрессионный тест с синтетическими `pagehide/pageshow` прошёл на Chromium,
Firefox и WebKit; реальный BFCache и OAuth на устройстве этим не подтверждаются.

Состояние и возвращённые React-setters принадлежат своему scope. Данные
покупок дополнительно принадлежат familyId; старый setter не может изменить
состояние нового входа или другой семьи. Последующий шаг mutation-chain
проверяет исходную попытку перед загрузкой и перед возвратом результата.

Транспорт ограничивает запрос вместе с телом ответа: по умолчанию 12 секунд
и 1 MiB. HTTP мутации не повторяются автоматически. Таймаут отдельного
request controller сохраняет page lifetime для явного повтора. Перед каждым
запросом выполняется новый `/me`; его безопасное GET-чтение имеет собственный
ограниченный retry. Поздний proof не снимает новую auth-паузу.

## Проверки

До поправки 14 новых server regression tests падали. После неё прошли
1009 unit-тестов / 189 файлов, три typecheck, admin/auth/API guards,
schema (22 миграции / 31 таблица), privacy (28 таблиц), audit: 0.
Проверены смена аккаунта и same-account login, неполный scope, capability,
ответ с другой привязкой, auth-пауза во время proof, поздний ответ после
IDB invalidation, таймаут, конкурентные actions и target family/week.

На локальном workerd/D1 прошли 23 HTTP-запроса: capability, десять отказов
неверного scope до эффектов, отсутствие случайного создания семьи,
create/invite/join/member, save/generate/read и общий shopping/check двух
синтетических аккаунтов на одном origin и в одной базе. Cookie участника
с account/session владельца получает 401; приватные sid не возвращаются.

Пять первоначальных Chromium-сценариев прошли до последующего усиления
валидации данных. Полная production browser matrix `9c44c21` с workers=3,
retries=0 завершилась: 272 passed / 6 failed / 9 skips. Все 42 семейных
сценария прошли. Диагностический прогон этих шести сценариев на обоих
iPhone-проектах прошёл: 12 passed (workers=1, retries=0), без изменения кода.
Замедленные операции в трассировках указывают на возможную нагрузку локального
хоста; это предположение, а не доказанная ошибка продукта. Затем
[полный CI `3baac01`](https://github.com/Michael-edel/FitFocus/actions/runs/38200234936)
завершился success: 1009 unit / 189 файлов, 278 browser passed / 9 skips,
семь проектов, workers=2, без flaky в итоговом summary (10,4 мин browser).
Код и timeouts после диагностического прогона не менялись. Это проверка
указанного опубликованного SHA; последующие HEAD проверяются отдельно.
Подробности и последующие проверки — в [журнале](stabilization-progress.md).

Последующий [CI `0eae743`](https://github.com/Michael-edel/FitFocus/actions/runs/38201311011)
также завершился success: 1009 unit / 189 файлов, 278 browser passed /
9 skips, семь проектов, workers=2; flaky в итоговом summary нет.
Эти два CI относятся к историческому guard-компоненту и не подтверждают более
поздний семейный CAS или текущие callback-проверки;
[границы семейного меню](family-menu-state.md).

Browser plugin not available: используется repository Playwright,
`http://127.0.0.1:4173` и mock API. События pagehide/pageshow в тесте
не доказывают реальный BFCache на устройстве. Эти проверки не подтверждают
OAuth, production D1, staging, merge или deploy.

## Продолжение в текущей рабочей версии

### Явная семья для invite и member — `2bbec11`

`createFamilyInvite` и `updateFamilyGoal` принимают ID выбранной семьи и
передают его в body. Сервер проверяет членство/владельца именно для этого ID;
member `UPDATE` повторно ограничен target family и active membership в SQL.
`/api/me` публикует `familySync.target: 1`; новый клиент не отправляет эти две
мутации серверу без capability. Invite code и ошибка привязаны к ID семьи,
а поздний ответ отбрасывается после переключения семьи, даже если login
остался тем же.

На `2bbec11` прошли 1128 unit-тестов / 198 файлов, три typecheck, guards,
schema (23 миграции / 32 таблицы), privacy (29 user-related tables), audit
(0 уязвимостей) и build. Две family E2E suites прошли 27/27 на desktop
Chromium/Firefox/WebKit; отсутствие target-capability проверено отдельно
во всех семи browser/PWA-проектах: 7/7. Локальный release rollback/CAS smoke
с архивом `98d49101e15ad652e1960381ce00e00e8dac0d44` прошёл 23 HTTP-запроса
на одной D1. Точный GitHub CI нового SHA ещё проверяется; staging и реальные
старый/новый bundles для этого изменения не проверены.

[Семейное меню и очередь](family-menu-state.md) реализованы в `405238b`:
AI и серверный preview сохраняются одним familyMenu intent, CAS принимает
меню/порции/покупки вместе. Старые прямые `saveFamilyMenu` и
`saveFamilyShoppingItems` больше не являются клиентскими writers этого пути.
Отдельный browser-сценарий задержанного invite-ответа после входа аккаунта B
добавлен коммитом [`f9c8425`](https://github.com/Michael-edel/FitFocus/commit/f9c8425272804b0bf9fc5963bcfb015e2926e469) и прошёл 3/3 на desktop Chromium,
Firefox и WebKit без retries. Затем `family-menu-durable.spec.ts` добавил
проверку позднего AI menu-ответа: смена активной сессии на B не позволяет A
создать `familyMenu`-операцию и изменить меню; [`bca2eda`](https://github.com/Michael-edel/FitFocus/commit/bca2edaf8c4bee1f465dfc3cb6bfabaa08960ea5) прошёл 3/3 в тех же браузерах.
Typecheck прошёл. Полный CI `b66dcb4` завершился success; точный CI для нового
AI account-switch сценария `bca2eda` ещё ожидается.

Дополнительная browser acceptance в текущей рабочей версии расширяет late-response
покрытие на две операции. Удержанный shopping-check ответ аккаунта A отпускается
только после того, как соседняя вкладка приняла аккаунт B; тест проверяет, что
ответ не вызывает achievement `shopping_item_checked` и не меняет checkbox B.
Отдельный сценарий удерживает обновление цели семьи A, загружает другую семью
в той же login-сессии и проверяет, что запоздавшая операция остаётся привязана
к исходному `familyId` и не меняет UI новой семьи. `family-callback-account-switch.spec.ts`
прошёл 12/12 на desktop Chromium, Firefox и WebKit с `workers=1/retries=0`;
общий typecheck прошёл. Это локальная проверка; актуальный CI отслеживается на
[странице checks PR #93](https://github.com/Michael-edel/FitFocus/pull/93/checks).

## Ошибка обновления списка покупок и optimistic state

При отказе `PATCH /api/shopping/check` предыдущее значение в React может быть
результатом ещё не подтверждённого клика. Поэтому callback не считает его
серверным состоянием: пока исходные account/session и `familyId` актуальны,
он перечитывает `/api/shopping/list` для того же зафиксированного `week` и только
затем отображает подтверждённый снимок. Если чтение тоже завершилось ошибкой,
применяется локальный fallback; устаревший callback после смены аккаунта или
семьи состояние не меняет.

В follow-up [`9e7f67d`](https://github.com/Michael-edel/FitFocus/commit/9e7f67d8da22de48bb0f0c49e257bd35fdb6de79)
регрессионный E2E воспроизводит отказ позднего toggle при незавершённой
предыдущей попытке. Проверка и смежный account-switch сценарий прошли 3/3 на
desktop Chromium, Firefox и WebKit. Полный CI нового опубликованного HEAD,
staging и реальные браузерные сессии остаются отдельными приёмками.

## Поздняя загрузка семейной корзины после повторного входа

Добавлен same-account reauthentication сценарий для GET `/api/shopping/list`.
Старая сессия удерживает семейный список, соседняя вкладка повторно входит в
тот же аккаунт с новым `serverSessionId` и показывает отличающийся список.
После освобождения старого ответа маркер прежней сессии не появляется на
экране новой; старая вкладка остаётся заблокирована session notice. Новый
сценарий прошёл 3/3 на desktop Chromium, Firefox и WebKit. Совместная выборка
семи same-account family callback сценариев прошла 21/21 (`workers=1,retries=0`).
Production-код не менялся, runtime-дефект не найден; точный CI изменённого
тестового SHA и staging-проверка ещё нужны.

## Следующие обязательные этапы

- Расширить поздний-response account-switch acceptance на остальные family
  callbacks и состояния; локально покрыты invitation UI, family-context GET,
  family shopping GET, family join/create responses, AI family-menu commit,
  shopping-check achievement, смена target для member update и отложенный
  ответ `/api/family/menu/generate` и отложенный GET `/api/family/menu/state`.
  Поздний family-context GET при повторном входе того же account с новой
  server session также проверен: старая вкладка сохраняет session notice и не
  восстанавливает семейный контекст из старого ответа (3/3 desktop engines).
  Поздний ответ создания приглашения после такого же повторного входа тоже
  проверен: старый invite-код не публикуется и прежняя вкладка не перечитывает
  семейный контекст (3/3 desktop engines).
  Поздний ответ создания семьи после повторного входа также не вызывает
  повторный family GET или achievement; новый семейный экран остаётся
  неизменным (3/3 desktop engines).
  Поздний ответ `/api/family/join` после повторного входа того же account тоже
  не применяется: старая вкладка сохраняет session notice, форма скрыта,
  повторного family GET и achievement нет (3/3 desktop engines). Четыре
  same-account acceptance (context GET, invite, create, join) прошли 12/12;
  вместе с A → B family-join acceptance выборка прошла 15/15 в тех же браузерах.
  Четыре смежных callback сценария прошли 12/12 в тех же браузерах.
  Последний проверяет, что смена аккаунта останавливает durable hydration до
  чтения устаревшего ответа. Suite `family-menu-durable.spec.ts` прошла 39/39
  на desktop Chromium, Firefox и WebKit (`workers=1,retries=0`); два новых
  сценария находятся в коммитах [`2c09825`](https://github.com/Michael-edel/FitFocus/commit/2c09825406d8f43c3cdaeaa1a02096a2573c7295)
  и [`13e336d`](https://github.com/Michael-edel/FitFocus/commit/13e336d9e3c67025f166a0ffce37ff776c46cdfa).
  Follow-up [`5d3e4d6`](https://github.com/Michael-edel/FitFocus/commit/5d3e4d664879529dc73c8b3d313bfda7c975b96c)
  проверяет задержанный member `PATCH` после входа B: 3/3 на desktop Chromium,
  Firefox и WebKit без retries; после позднего ответа не запускается новая
  загрузка семьи A. Trace первого полного прогона выявил ошибочную стартовую
  точку baseline, исправленную в этом follow-up. Дополнительно поздний PATCH
  member после same-account login с новым `serverSessionId` не перечитывает
  прежнюю семью и не меняет новую; тот сценарий вместе с проверками captured
  family target и A → B прошёл 9/9 на тех же engines. Семейный shopping-check,
  задержанный при той же смене server session, не отмечает покупку в новой семье,
  не запускает achievement и не перечитывает старую семью; с тремя смежными
  shopping сценариями он прошёл 12/12 на desktop engines. Полный CI для новых
  тестов ещё не подтверждён.
  Покрытие остальных callbacks всё ещё неполное.
- Проверить invite/member family target `2bbec11` в точном CI и затем staging;
  локальные проверки не подтверждают deployment или реальные bundle.
- Проверить настоящие old/new bundles с Service Worker, повреждённые legacy-строки,
  staging и совместимый rollback; локальный smoke с отключённым worker этого
  не подтверждает.
- Завершить общую browser/lifecycle-матрицу P0.5 и P0.8; серверная сессия
  и клиентский CAS закрывают только соответствующие компоненты, не весь выпуск.

Сессионный guard не устанавливает порядок конкурирующих menu/items writers
и не превращает временный HTTP-вызов в постоянную операцию. Текущий familyMenu
writer уже использует family/week CAS и outbox по отдельному контракту.
[Общий план](../TASKS.md), [матрица P0](verification-matrix.md).

Исходники:
[hook](https://github.com/Michael-edel/FitFocus/blob/9c44c2118749275cbb8ecaa11c520c43e4220000/useFamilyCloud.ts),
[транспорт](https://github.com/Michael-edel/FitFocus/blob/9c44c2118749275cbb8ecaa11c520c43e4220000/services/familySession.ts),
[API](https://github.com/Michael-edel/FitFocus/blob/9c44c2118749275cbb8ecaa11c520c43e4220000/features/family/familyApi.ts),
[scope](https://github.com/Michael-edel/FitFocus/blob/9c44c2118749275cbb8ecaa11c520c43e4220000/features/family/actionScope.ts),
[E2E](https://github.com/Michael-edel/FitFocus/blob/9c44c2118749275cbb8ecaa11c520c43e4220000/e2e/family-session.spec.ts).
