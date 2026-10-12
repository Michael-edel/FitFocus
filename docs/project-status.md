# Текущее состояние FitFocus

Сверено: 12.10.2026. Это краткая точка входа: функции — в
[PRODUCT](../PRODUCT.md), порядок и критерии готовности — в
[TASKS](../TASKS.md), результаты отдельных проверок — в
[журнале стабилизации](stabilization-progress.md).

Последний подтверждённый CI опубликованной ветки — `dbb22aa57668dc9064fddee18e5bcfebfdbadaf4`:
[success](https://github.com/Michael-edel/FitFocus/actions/runs/38204076306),
1009 unit / 189 файлов, 278 browser passed / 9 skips, без flaky в итоговом summary.
Последующие HEAD проверяются отдельно. Подготовительный сервер `dde4c71` и переход
0019 → 0020 → проекция проверены локально;
[инструкция выпуска](profile-cas-rollout.md). Staging и выпуск ещё открыты.

## Что это за проект

FitFocus — PWA для питания, привычек и прогресса. Основной цикл:
профиль и цель → персональный план → дневник и ежедневные действия →
обзор прогресса → корректировка плана. Есть рецепты, семейное меню,
список покупок, AI-анализ и рекомендации. Работоспособность внешних
интеграций требует отдельной проверки окружения.

Текущий приоритет — сохранность данных и воспроизводимый выпуск.
Крупные продуктовые улучшения идут после приёмки P0.

## Проверенный компонент — сессии семьи

Код `9c44c2118749275cbb8ecaa11c520c43e4220000` привязывает `useFamilyCloud`
к исходному login proof, проверяет каждый запрос и отбрасывает поздние ответы.
Защищены family handlers, загрузка семьи/покупок, приглашение, join, смена цели,
серверная генерация и отметки. Неверные family/week и повреждённый ответ
не заменяют видимый снимок; отказ отметки восстанавливает её прежнее значение.

1009 unit / 189 файлов, три typecheck, guards/schema/privacy и audit (0) прошли.
Локальный workerd/D1: 23 HTTP-запроса прошли. Первая полная browser matrix:
272 passed / 6 failed / 9 skips (workers=3, retries=0); все 42 семейных
сценария прошли. Диагностика profile/storage/weekly-menu на обоих iPhone-проектах:
12 passed, workers=1/retries=0, без изменения кода. Затем полный CI `3baac01`
прошёл: 278 browser passed / 9 skips, workers=2, без flaky в итоговом summary.
[Контракт и приёмка](family-session.md). AI-путь `useFamilyMenu`, семейные
CAS/постоянная доставка и реальный staging остаются открытыми.

Подготовительный [CI `c39904c`](https://github.com/Michael-edel/FitFocus/actions/runs/38196258543)
подтверждён: 952 unit / 186 файлов, 229 browser passed / 9 skips.
Это проверка промежуточной версии, не staging-выпуск.

## Текущая работа — семейное меню

В рабочем дереве реализованы family/week CAS, единый серверный снимок меню,
порций и покупок, а также resource `familyMenu` в существующей IDB-outbox.
AI-клиент `useFamilyMenu` подключён к этому сохранению; серверная генерация
возвращает preview для той же очереди. Ошибка хранения сохраняет прежнее меню,
409 сохраняет локальную правку и remote snapshot, поздний AI не создаёт запись.
Миграция 0021 и IDB v3 ещё не приняты к выпуску.

Прошли 1039 unit / 191 файл, три typecheck, обязательные guards/schema/privacy,
audit (0), 16 browser-сценариев в Chromium/iPhone Safari и 33 HTTP локального
workerd/D1 с двумя синтетическими аккаунтами. Полная browser matrix и CI
нового кода ещё не подтверждены. [Контракт](family-menu-state.md),
[решение](adr/ADR-008-family-menu-generation.md).

CI `dbb22aa` относится к опубликованному коду семейных сессий и MD-файлам.
Он не проверяет эти локальные изменения. Критерии завершения остаются
открытыми в [TASKS](../TASKS.md); после локальных проверок конфликтов и reload
нужны прежняя и новая сборки на одном origin, полный browser-набор
и CI точного коммита. Staging, merge и deploy
этого этапа не выполнялись.

## Предыдущий проверенный компонент — сессии и форма

Код [`724ecf1`](https://github.com/Michael-edel/FitFocus/commit/724ecf1aad05461d86644789f773ffca73f6efad)
содержит компонент достижений и последующие поправки:

- [`a407373`](https://github.com/Michael-edel/FitFocus/commit/a4073731ea2d30c107b49ff8cf7170dbffc8ed83): таймер завершает ожидающие вызовы, если login lifetime истёк до React cleanup.
- [`4528e2b`](https://github.com/Michael-edel/FitFocus/commit/4528e2bba08c7868ad2b24be2285c9547140b865): автоматический proof, начатый до auth-паузы, не очищает её при позднем ответе.
- `724ecf1`: уведомление не сдвигает форму до или во время нажатия; высота области сохраняется и без сообщения.

На этом коде прошли 950 unit / 186 файлов, три typecheck,
guards/schema/privacy и audit (0 известных уязвимостей).
Production build и полная браузерная матрица `724ecf1` прошли:
229 passed / 9 skips, 7 проектов, workers=3, retries=0.
[CI документирующего `42ee434`](https://github.com/Michael-edel/FitFocus/actions/runs/38189490979)
завершился success: 950 unit / 186 файлов, 229 browser passed / 9 skips,
workers=2; в итоговом summary нет flaky. Этот результат не относится
к последующим незакоммиченным изменениям.
Проверка положения кнопки до pointerdown прошла во всех семи проектах.
[Контракт профиля](profile-persistence.md#дополнительная-проверка-до-pointerdown-12102026),
[контракт достижений](achievement-session.md).

## Компонент — атомарная проекция личных покупок

Код [`4736ff5`](https://github.com/Michael-edel/FitFocus/commit/4736ff51b06f0062a6cb45a98169f4a4d0c39895)
сохраняет личные покупки в том же SQL statement, что принятый profile CAS.
Существующая IDB profile-outbox доставляет одно намерение; отдельного личного
items POST больше нет. Старый POST отклоняется, а пустая генерация не
восстанавливает legacy-покупки. Семейный путь остаётся отдельной открытой задачей.

Локально прошли 966 unit / 187 файлов, три typecheck, guards/schema/privacy,
audit (0 известных уязвимостей), 16 HTTP-проверок настоящего локального
Worker/D1 и 8 menu E2E в Chromium. Миграция сохраняет старые строки;
clean refresh работает без новой write-capability, pending-операция не теряется.
Полная production matrix `4736ff5` прошла: 236 passed / 9 skips,
7 проектов, workers=3, retries=0, 16.2m. Серверная валидация на
[`830caf4`](https://github.com/Michael-edel/FitFocus/commit/830caf43895fe00bd9eddf2b58cf254afbe847c8)
возвращает 422 до persistence вместо общей ошибки для некорректного меню.
После неё прошли 976 unit / 187 файлов, обязательные проверки и повторный
16-request Worker/D1 smoke. Клиент и E2E не изменились.
[CI опубликованного `2d1f480`](https://github.com/Michael-edel/FitFocus/actions/runs/38194485398)
прошёл: 976 unit и 236 browser passed / 9 skips; в итоговом summary нет flaky.

Подтверждённый CI предыдущего документационного `14ca638`:
[success](https://github.com/Michael-edel/FitFocus/actions/runs/38191713675),
950 unit / 186 файлов, 229 browser passed / 9 skips, без flaky в итоговом summary.
Он не подтверждает код нового компонента. Для выпуска 0020 требуется
подготовительный сервер с RETURNING до triggers, затем сервер проекции
и capability smoke до клиента. Подготовительный код `dde4c71` прошёл 952 unit,
обязательные проверки и build. На одной локальной БД переход и негативный
откат reader прошли 30 HTTP-запросов. Staging и совместимый откат ещё открыты;
[проверенные этапы](profile-cas-rollout.md).
[Контракт и следующий шаг](personal-menu-projection.md), [матрица P0](verification-matrix.md).

## Компонент — сессия и очередь достижений

Код [`57da2cf`](https://github.com/Michael-edel/FitFocus/commit/57da2cf3d8bcb682242db87994126d1c816158d4)
добавляет независимую capability, server guard до feature/application effects,
исходный login proof из hydration и проверку каждой HTTP-попытки.
Queue/context/resolvers принадлежат своему входу и page lifetime; logout и
pagehide отменяют старые запросы, pageshow создаёт новый клиент с прежней
login-привязкой. Другой вход того же аккаунта не принимается за исходный.

Локально прошли 948 unit / 186 файлов, три typecheck, guards/schema/privacy,
audit (0 известных уязвимостей). Полная матрица `57da2cf` завершилась:
219 passed / 3 failed / 9 skips, workers=3, retries=0. Все 21 новых achievement
E2E прошли; падения прежних profile/logout-сценариев исследуются.
Предыдущий кандидат прошёл 21 новый E2E во всех семи проектах после исправления
предупреждений Recharts: высота графиков соответствует существующим 220 px.
[Контракт, проверки и ограничения](achievement-session.md). Throttle-очередь
остаётся временной, счётчики best effort; реальный BFCache/staging не доказаны.

## Предыдущее изменение — автоматическая синхронизация профиля

Код [`f3930ec`](https://github.com/Michael-edel/FitFocus/commit/f3930ec64f7fa74f3aad352246aa18b92d2542b7): автоматический profile flush отправляет существующую очередь
без ручного повторного `verify`. Auth-пауза сохраняется; ручная синхронизация
по-прежнему получает свежий proof. Старое поколение не подтверждает новый вход.
Источник `/api/me` после `beforeunload` установлен по диагностическим событиям;
общий фильтр ошибок не добавлен, background/BFCache не ограничены.

Локально прошли 905 unit / 183 файла, три typecheck, guards/schema/privacy,
audit (0 известных уязвимостей), build и полная браузерная матрица:
201 passed / 9 skips, workers=3, retries=0. E2E auth-паузы теперь проверяет
два фактических PUT/401 по разные стороны reload и тот же opId.
[CI документирующего `bf01d87`](https://github.com/Michael-edel/FitFocus/actions/runs/38184851075)
завершился success: 905 unit, 201 browser passed / 9 skips, без flaky.
Это результат profile-компонента; новый код достижений проверяется отдельно.

Предыдущий `cd2e923` CI завершился success: 900 unit,
200 browser passed / 1 flaky / 9 skips. WebKit registration reload прошёл
только на retry с native `/api/me`; это не было исправлением.
[Журнал диагностики и проверок](stabilization-progress.md).

## Базовая опубликованная проверка до последних компонентов

| Область | Подтверждённое состояние |
|---|---|
| Проверенная ревизия кода | `8fc0b1b1adc44975396578e2ee60a4e7d1873eb7`, ветка `fix/durable-outbox` |
| CI этого SHA | [38175438277](https://github.com/Michael-edel/FitFocus/actions/runs/38175438277): success; 860 unit / 179 файлов, 152 browser passed / 9 skips, без flaky; обязательные проверки прошли |
| Клиентский PR | [#93](https://github.com/Michael-edel/FitFocus/pull/93), открыт как draft, база `fix/state-generations`, не слит |
| Серверная зависимость | PR #94 включён в клиентскую ветку коммитом `93f90c0`; это не слияние в main |
| GitHub main | `c939ae6f3dbdb802478ea8a305b180eefb0b90f8`, защищена |
| Production | Staging и выпуск этой интеграционной версии не подтверждены |

Результаты относятся к точному SHA. Незакоммиченные изменения рабочего дерева
этим CI не проверены. Исходный архитектурный снимок — `810adb1` из PR #90;
история промежуточных проверок сохраняется в журнале.

## Что уже реализовано в ветке

| Компонент | Контракт и проверенная граница |
|---|---|
| Исправление dependency audit и проверки push | [P0.1](../TASKS.md#p01--восстановить-ci-зависимости-и-проверка-push); интеграция в main открыта |
| IDB v2, атомарные данные/операция, claim/finish | [Фундамент P0.8](outbox-implementation.md) |
| 15 state-ключей, feature editors, удаление Map sender текущей сборки | [Управляемые записи](owned-state-writers.md), [sender](state-sender.md) |
| Profile editor, CAS, сохранение конфликта и dirty-формы | [Профиль](profile-persistence.md) |
| Canonical profile до AI, причинный update, own IDB-profile при reload | [Регистрация](registration-persistence.md) |
| Guarded bootstrap/state-hydration, readGuard и атомарный auth-fence | [Bootstrap/hydration](bootstrap-hydration.md), код `dac2de2` |
| Стабильное расположение формы при удержанном Save | [Исправление UI](profile-persistence.md#стабильность-формы-при-изменении-уведомления), код `3550cc8` |
| Серверная привязка account/session для AI/items и capabilities | [AI/items guard](ai-session-guard.md), код `16d3c34` |
| Legacy-нормализатор, fingerprint, карантин и атомарный importer/ledger | [Legacy migration](legacy-migration.md); runtime-владелец и барьер ещё не подключены |
| Серверные поколения и tombstones | [P0.7](state-generations.md); совместный выпуск остаётся открытым |

Наличие этих компонентов не закрывает целиком P0.5, P0.7, P0.8 или выпуск.

## Последующий компонент — персональное меню

Код [`f4b4eee`](https://github.com/Michael-edel/FitFocus/commit/f4b4eee1e577292019481b711b097941df27558e): персональное недельное меню использует свежий proof исходного
входа, capabilities/scope и ограниченный HTTP. Action/page/login lifetime и
транзакционный readGuard защищают generated-profile commit от старого ответа
и независимой правки. Результат показывается после постоянного сохранения.

Скрытый items writer вынесен из генерации: сначала profile commit, затем
отдельный scoped запрос. Ошибка списка покупок показывается отдельно от
сохранения меню. Таймаут снимает loading и разрешает повтор; logout/pagehide
останавливают старую попытку. Desktop-панель прокручивается к настройкам.

Локально: 900 unit / 183 файла, три typecheck, guards, schema/privacy, build
и audit прошли. Полная матрица: 200 browser passed / 1 failed / 9 skips, workers=4,
retries=0; все 49 новых menu-сценариев прошли в семи проектах.
Возврат pagehide/pageshow проверен синтетическими browser events; это не
доказательство реального BFCache браузера или физического устройства.
История первоначальных падений и исправлений — [в журнале](stabilization-progress.md).

Полная приёмка ещё открыта: старый profile reload на desktop WebKit
воспроизвёл native сообщение `/api/me due to access control checks`
после успешных функциональных проверок. Трасса указывает на `verify`
sender через `requestJson` во время reload. На этом снимке причина ещё не была установлена; последующая диагностика
и исправление описаны выше. Сообщение не скрыто.

CI документирующего `59a3630` прошёл: 860 unit, 152 browser passed / 9 skips,
без flaky. Он предшествует коду меню. Новый workflow проверяется на точном
опубликованном HEAD отдельно; [контракт компонента](ai-session-guard.md).
После этой ревизии achievement HTTP защищён отдельным `57da2cf`; остаются version/CAS и
durable-порядок вторичной items-проекции, остальные AI/report/retry/family
callbacks. Весь P0.5 остаётся открытым.

## Что остаётся

1. Подключить `useFamilyMenu`, явную цель семейной мутации, family/week CAS
   и постоянную доставку семейного намерения. [Компонент сессий](family-session.md)
   проверен в CI; его реальный lifecycle и staging остаются открытыми.
   Личные покупки и подготовительный переход проверены локально и в CI;
   staging и выпуск остаются открытыми. Продолжить остальные
   AI/report/retry/family producers с привязкой к исходному входу,
   актуальной попытке и определённым порядком конкурирующих записей.
   CI компонента достижений на `42ee434` уже подтверждён; его счётчики
   остаются best effort, реальные BFCache/staging ещё не доказаны.
2. Продолжить приёмку lifecycle остальных callbacks. CI profile debounce
   на `bf01d87` прошёл. Исторические `/api/profile` и другие
   источники не считать автоматически объяснёнными этим изменением.
3. Подключить runtime legacy-импорт с доказанным владельцем и фактической
   остановкой старых writers; проверить старую и новую сборки на одном origin.
4. Завершить UI повтора/разрешения конфликтов, backup, экспорт и очистку
   всех stores без потери ожидающих операций.
5. Пройти полную [матрицу lifecycle](sync-model.md#матрица-приёмки), staging
   и [выпуск](../RELEASE_CHECKLIST.md) через защищённую main.

Подробные условия находятся в TASKS. После P0 — типизация, границы модулей,
наблюдаемость и продуктовые улучшения из P1.

## Как поддерживать MD-файлы

Функции обновляются в PRODUCT, задачи — в TASKS, контракты — в профильных
документах, результаты — в журнале. Этот файл содержит краткий статус и
ссылки. [Карта документации](README.md) помогает выбрать документ,
[карта кода](code-map.md) — найти реализацию и тесты.
При следующей сверке обновлять дату, SHA и рабочую версию; прошлые результаты
сохранять с их ревизиями. Правила разработки — в [CONTRIBUTING](../CONTRIBUTING.md),
правила помощника — в [AGENTS](../AGENTS.md).
