# Семейное меню: версия, сохранение и доставка

Сверено: 14.10.2026. Реализация опубликована в ветке `fix/durable-outbox`
коммитом `405238b9fd4d59b9ed76fcc4563b7850943df1a4`. Текущий PR CI для HEAD
`6c6feca` завершился success в
[run 38550243769](https://github.com/Michael-edel/FitFocus/actions/runs/38550243769);
staging и выпуск не подтверждены. Это продолжение
[семейных сессий](family-session.md), а не закрытие всего P0.
Архитектурное решение — [ADR-008](adr/ADR-008-family-menu-generation.md).

## Одно намерение

Снимок `family_menu_generations` имеет ключ `(family_id, week_start)` и версию.
Его `menu_json` содержит меню, строки порций и структурированные покупки.
Отдельная запись семейных items не требуется. Чтение покупок и локальное
представление pending-меню используют одинаковую нормализацию ингредиентов.

`useFamilyCloud` принимает версию явно выбранной семьи и недели через
guarded read, затем гидратирует owned IDB-снимок. Pending/конфликт не
заменяется HTTP-ответом. Редактор сохраняет revision и baseVersion именно
показанного снимка до начала генерации; позднее чтение не подменяет эту базу.

AI-сценарий `useFamilyMenu` использует исходный login guard, fresh proof,
capability, lifetime попытки и проверку изменений профиля/участников/настроек.
Оба AI-вызова, включая repair, сохраняют эту привязку. Профили остальных
участников строятся из family API или явных локальных familyMembers;
общий кэш чужих аккаунтов не используется как источник их медицинских данных.

Если `family_menu_prefs` ещё не сохранены, пустой `includeIds` редактора
означает выбор всех текущих разрешённых профилей. Этот список вычисляется
после каждого обновления family API, поэтому поздняя загрузка участников
не фиксирует выбор только владельца. Функциональное изменение настроек
применяется к этому же списку; явно сохранённый непустой выбор, включая
только владельца, сохраняется после reload.

Облачное семейное меню сохраняется как resource `familyMenu` в той же
IDB-outbox. Меню без облачной семьи сохраняется guarded profile-операцией.
Quota/конфликт не заменяют видимое меню и не создают достижение успешной
генерации. Серверный генератор возвращает только preview; клиент сохраняет
его через ту же очередь. Отменённый fetch не откатывает уже принятую SQL-запись.

## HTTP и CAS

`/me` публикует `familyMenuSync: { protocol: 1, guard: 1, cas: 1 }` только
при наличии таблицы, нужных колонок и четырёх migration-barrier triggers.
Отсутствующая таблица допускает прежний серверный путь до миграции;
частично применённая миграция не допускает fallback к старым writers.

| Запрос | Назначение |
|---|---|
| GET `/api/family/menu/state?familyId=…&week=…` | Проверенный снимок явной семьи/недели |
| PUT `/api/family/menu/state` | `{ familyId, weekStart, baseVersion, menu }` |
| POST `/api/family/menu/generate?week=…` | `{ preview: true, familyId }`, без persistence |

State endpoint требует account/session headers и возвращает
`X-FitFocus-Family-Menu-Protocol: 1` и `X-FitFocus-Family-Menu-Guard: 1`.
Чтение разрешено активному участнику, запись — владельцу с семейным тарифом.
CAS statement повторяет проверку активности семьи/владельца/участников меню.
`RETURNING version` подтверждает собственную мутацию. При 409 локальное
намерение и проверенный серверный снимок сохраняются после reload.

Отсутствующий снимок — `{ version: 0, menu: null }`. Принятое пустое меню
имеет положительную версию, пустые days и оба списка покупок. Повреждённый
canonical JSON возвращает `FAMILY_MENU_CORRUPT`; legacy-данные не подставляются.
Интерфейс восстановления повреждённой записи остаётся открытой задачей.

## Миграция и совместимость

0021 копирует прежние weekly_menus verbatim с версией 1; повтор не заменяет
новое принятое поколение. Источник сохраняется. SQL triggers запрещают
INSERT/UPDATE прежних семейных menus/items после переключения; удаление
для account cleanup и личные items остаются доступны. Старые menu/items POST
и генерация без preview отклоняются. Общий `/api/state` запрещает family-menu
ключ, чтобы ошибочный sender не получил ложный ack другого ресурса.

IDB повышена с версии 2 до 3, stores не добавлены. Прежняя v2-сборка закрывает
соединение на versionchange и не может открыть v3 с запросом версии 2.
Проверки сохранности values, pending, ledger, quarantine и auth-fence есть
на fake IndexedDB. Отдельный локальный smoke двух настоящих v2/v3 bundles
описан в результатах ниже; в нём Service Worker отключён, API замокан.

Порядок выпуска: совместимый сервер до 0021 → миграция и capability smoke →
клиент v3. После новых записей откат требует reader канонического поколения
и v3-aware sender. Откат к старому reader или удаление/понижение IDB недопустимы.
До выпуска нужны old/new bundles с настоящим SW/PWA, staging, повреждённые
legacy-строки и совместимый rollback artifact. Локальный bundle smoke ниже
покрывает только явно перечисленные сценарии с отключённым SW.

## Проверки и открытая приёмка

На текущей реализации прошли 1039 unit / 191 файл, проверки схемы
(23 миграции / 32 таблицы), приватности (29 таблиц), guards и audit (0).
Новые browser-сценарии: 16 passed, Chromium и iPhone Safari, workers=2,
retries=0. Проверены server-preview, AI, quota, 409/reload, 503/reload/recovery
с тем же opId, logout, правка профиля и синтетические pagehide/pageshow.
Browser plugin not available: repository Playwright, mock API,
`http://127.0.0.1:4173`. Это не настоящий BFCache или OAuth.

Локальный workerd/D1 smoke прошёл 33 HTTP-запроса: два синтетических аккаунта,
один origin/database, capability, ранние отказы, preview без записи, CAS,
чтение участником, чужая цель, отказ прежних writers и пустое поколение.
Удалённая база не использовалась. [CI реализации `405238b`](https://github.com/Michael-edel/FitFocus/actions/runs/38208076392)
завершился успешно: 1039 unit / 191 файл, 334 browser passed / 9 skips,
семь конфигураций, два worker, без flaky в итоговом summary (13,9 мин browser).
Полная локальная матрица: 332 passed, 2 failed, 9 skips (30,8 мин,
workers=2, retries=0). Registration/desktop WebKit превысил общий timeout 45 с;
server-preview/iPhone PWA не дождался названия семьи за 10 с при успешных API.
Диагностический прогон тех же двух сценариев на desktop WebKit и iPhone PWA:
4 passed, workers=1, retries=0, 1,8 мин; код и таймауты не изменялись.
Это не заменяет полный локальный результат. Нагрузка хоста — предположение,
а не установленная причина. Staging и совместимый выпуск ещё не подтверждены.
Явные цели invite/member реализованы в `2bbec11` и включены в успешный полный
CI `9bdeb47` (run 38459458051); staging и проверка реальных старых/новых bundles
для этого пути остаются открытыми. Поздний AI menu callback при смене аккаунта
прошёл 3/3 на desktop Chromium, Firefox и WebKit в `bca2eda`. Остальные AI/report/
retry callbacks, old/new migration smoke с legacy intent, UI конфликтов и
backup/экспорт/очистка всех IDB stores остаются открытыми. Runtime legacy owner
proof и Service Worker fence уже подключены.

Поздние family-menu callbacks дополнительно проверяются на account switch:
удержанный `/api/family/menu/generate` preview не создаёт операцию после входа
аккаунта B, а удержанный `GET /api/family/menu/state` не гидратирует ответ A.
Оба сценария прошли на Chromium, Firefox и WebKit; полная
`family-menu-durable.spec.ts` прошла 39/39 без retries в `13e336d`.
Точный CI этого follow-up ожидает push; остальные writers и общая lifecycle-
приёмка остаются открытыми.

На `e22b2bf` добавлена проверка реальной навигации во время удержанного
family-menu AI запроса. `beforeunload` отменяет его signal до `pagehide`; после
освобождения старого ответа familyMenu operation не создаётся, IndexedDB-снимок
семьи остаётся прежним, menu PUT и achievement не запускаются. E2E прошёл 7/7
desktop/mobile/PWA профилей без retries; root typecheck и diff check прошли.
Это mock API и не доказывает отмену работы внешнего провайдера, BFCache или
staging. Точный CI нового SHA ожидает публикации.

Добавлена проверка границы повторного входа того же аккаунта: старый
`GET /api/family/menu/state` удерживается во время reload, соседняя вкладка
принимает новую `serverSessionId` и `sessionEpoch`, затем старый ответ
освобождается. Значения, семейный снимок и outbox после этого остаются равны
предварительному IndexedDB-снимку. Новый сценарий прошёл 3/3 на desktop
Chromium, Firefox и WebKit; production-код не менялся. Текущий CI проверяет
предыдущий опубликованный SHA и не включает тест; точный CI этой ревизии,
staging и lifecycle со старым/новым bundle остаются открытыми.

## Настоящие bundles на одном origin

Локальный Chromium smoke: 2/2, последовательно pending и conflicted.
Старая сборка — опубликованный `3baac01c98bd82ab7a87c0e9c2999914db194590`
с IDB v2; текущая — `405238b9fd4d59b9ed76fcc4563b7850943df1a4` с IDB v3.
Старые исходники получены через git archive; исполняемый код не правился.
У package-lock один Git blob `82e7e5a71a0e3c6187c60c602f348f0caaeaa225`;
сборка использовала те же установленные зависимости и отдельный base path.

Обе вкладки работали в одном browser context на `http://127.0.0.1:4173`.
Старая HTML/JS отдавалась под `/__compat_v2__/`; новые assets — под `/assets/`.
Зафиксированы реальные script requests и SHA-256 assets/HTML в manifest.
Наблюдатель IDB регистрировал события, но не закрывал соединение за приложение.

До обновления старый UI создал pending profile intent. После открытия v3
старый код получил versionchange и VersionError при versioned reopen v2;
попытка сохранить старую форму не отправила мутаций. Новая family-операция
сохранила opId/value/status после reload; conflicted сохранила remote version 8.
Сохранились profile intent, пять stores, синтетические marker-записи
ledger/quarantine, текущая account/session-привязка и неубывающий auth-fence.
Page errors отсутствовали; console errors соответствовали введённым 503/409.

Артефакты вне Git: `family-real-bundles-smoke.ts`, build helper,
`real-bundles-result.json`, screenshots и logs. Первый запуск внешнего fixture
получил protocol pause из общего mock ack state; fixture исправлен на явный
503. Это не изменение продукта. Итоговый запуск прошёл 2/2.

Mock API и отключённый Service Worker ограничивают вывод: не проверены
старый Map/localStorage sender, настоящий legacy import, SW/PWA-кэш,
BFCache/OAuth, удалённый D1, staging или rollback artifact.

Реализация и проверки: [repository](../storage/familyMenuRepository.ts),
[sender](../storage/stateSync.ts), [server CAS](../functions/api/_lib/family_menu_state.ts),
[миграция](../migrations/0021_family_menu_generations.sql),
[SQLite](../tests/family_menu_state.test.ts), [outbox/AI](../tests/family_menu_durable.test.ts),
[browser](../e2e/family-menu-durable.spec.ts). Общий статус — [TASKS](../TASKS.md).
