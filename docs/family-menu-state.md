# Семейное меню: версия, сохранение и доставка

Сверено: 12.10.2026. Реализация в рабочем дереве ветки `fix/durable-outbox`
после `dbb22aa`; ещё не опубликована. Это продолжение
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
на fake IndexedDB; это ещё не проверка двух настоящих bundles.

Порядок выпуска: совместимый сервер до 0021 → миграция и capability smoke →
клиент v3. После новых записей откат требует reader канонического поколения
и v3-aware sender. Откат к старому reader или удаление/понижение IDB недопустимы.
Фактические old/new bundles, staging, повреждённые legacy-строки и совместимый
rollback artifact должны быть проверены до выпуска.

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
Удалённая база не использовалась. Полная browser matrix, CI нового кода,
реальные bundles, staging и совместимый выпуск ещё не подтверждены.
Также открыты явные цели invite/member, остальные AI/report/retry callbacks,
runtime legacy-импорт, UI конфликтов, backup/экспорт/очистка всех IDB stores.

Реализация и проверки: [repository](../storage/familyMenuRepository.ts),
[sender](../storage/stateSync.ts), [server CAS](../functions/api/_lib/family_menu_state.ts),
[миграция](../migrations/0021_family_menu_generations.sql),
[SQLite](../tests/family_menu_state.test.ts), [outbox/AI](../tests/family_menu_durable.test.ts),
[browser](../e2e/family-menu-durable.spec.ts). Общий статус — [TASKS](../TASKS.md).
