# Личное меню и список покупок

Сверено: 14.10.2026. Код компонента —
[`4736ff5`](https://github.com/Michael-edel/FitFocus/commit/4736ff51b06f0062a6cb45a98169f4a4d0c39895), ветка `fix/durable-outbox`.
Серверная валидация дополнена на [`830caf4`](https://github.com/Michael-edel/FitFocus/commit/830caf43895fe00bd9eddf2b58cf254afbe847c8).
Локальные проверки компонента описаны ниже. Последний PR CI ветки
`fix/durable-outbox` проверил HEAD `6c6feca` и завершился success
([run 38550243769](https://github.com/Michael-edel/FitFocus/actions/runs/38550243769));
staging и выпуск не подтверждены.
Общий план — [TASKS](../TASKS.md), решение — [ADR-007](adr/ADR-007-personal-menu-projection.md),
подтверждённая область — [матрица P0](verification-matrix.md).

## Причина изменения

На `42ee434` личное меню сохранялось в IDB вместе с profile-операцией,
затем клиент отдельно вызывал `POST /api/weekly_menu/items`.
Reload или завершение вкладки могли потерять второй запрос. Его session
guard не связывал покупки с принятой версией profile; поздний запрос мог
заменить более свежий список. [Прежний контракт](ai-session-guard.md)
сохраняет границу этого исторического этапа.

## Один источник и одна очередь

Меню и `shoppingListItems` остаются частью profile. Существующая IDB-outbox
доставляет одну profile-операцию с accountId, baseVersion и защитой попытки.
В клиенте больше нет личного items POST и второй очереди.

Миграция [0020](../migrations/0020_personal_menu_projections.sql) добавляет
`personal_menu_projections` и AFTER INSERT/UPDATE triggers на `user_profiles`.
Принятый profile CAS и запись проекции выполняются одним SQL statement.
Ошибка проекции откатывает профиль. Конфликт profile не меняет покупки.
[CAS](../functions/api/_lib/profile_cas.ts) подтверждает свою строку через
`RETURNING version`: D1-счётчик изменений учитывает также trigger-записи.

| Поле проекции | Назначение |
|---|---|
| `user_id`, `week_start` | Владелец и неделя; составной первичный ключ |
| `items_json` | Снимок ингредиентов принятого profile |
| `profile_version` | Версия этого profile |
| `updated_at` | Время сохранения |

[Чтение](../functions/api/_lib/personal_menu_projection.ts) личных покупок
и CSV использует проекцию. Legacy `weekly_menu_items` читается только при
отсутствии канонической записи данной недели. Пустой снимок означает пустой
список; повреждённый снимок даёт ошибку. Смена недели сохраняет историю;
удаление текущего меню записывает пустое поколение его недели.
Миграция сохраняет прежние строки и не угадывает недостающую неделю меню.

Личный items POST возвращает `409 PERSONAL_MENU_PROFILE_REQUIRED` без записи
покупок. Семейный список хранится как часть единого поколения меню
`(family_id, week_start)` через `familyMenu` outbox и server CAS; отдельного
items POST для нового протокола нет. Семейный контракт и его оставшиеся
lifecycle/staging проверки описаны в [family-menu-state.md](family-menu-state.md).
Проекции включены в export/delete аккаунта и privacy coverage.

## Совместимость клиента

`/api/me` объявляет `profileSync.weeklyMenuProjection: 1` только при наличии
таблицы и обоих triggers. Генерация проверяет эту capability до AI.
Отправка profile требует её вместе с `profileSync.protocol: 1`, `guard: 1`.
При отсутствии capability локальная операция сохраняется, отправка получает
protocol-паузу. Safe clean refresh продолжает работать по прежнему read-контракту.

## Проверки

До исправлений регрессионные тесты подтвердили прежний список после успешного
profile CAS и ложный отказ CAS при учёте trigger-записей. Отдельный RED-тест
подтвердил блокировку clean refresh без новой write-capability; после разделения
флагов 18 profile-sender проверок прошли.

Итог на рабочем дереве с теми же исполняемыми изменениями перед коммитом:
966 unit / 187 файлов; три typecheck, admin/auth/API guards, schema и privacy
прошли. Схема: 22 миграции / 31 таблица, privacy: 28 таблиц.
Audit: 0 известных уязвимостей. Негативная проверка schema verifier на внешней
копии отклонила отсутствие update-trigger.

11 тестов проекции используют настоящий SQLite: CAS, откат, пустая генерация,
история, некорректное меню, повреждение, readiness, экспорт/удаление, обновление
прежней БД и изоляция двух аккаунтов. Изолированный локальный Worker/D1
(`127.0.0.1:8797`, Wrangler 4.149.0, синтетический аккаунт) прошёл 16 HTTP-запросов:
capability, legacy fallback, успешный CAS с triggers, конкурентные 200/409,
согласованные покупки/CSV, отказ устаревшего личного POST, пустой снимок и
откат некорректного меню. Это локальный workerd/D1, не production D1.

В Chromium прошли 8 browser-сценариев: commit, quota, logout, независимая
правка, reload после 503 с тем же opId, отсутствие capability, pageshow и retry
после timeout. Полная production matrix `4736ff5`: 236 passed / 9 skips,
7 проектов, 3 workers, retries=0, 16.2m. Клиент и E2E между `4736ff5` и
`830caf4` не менялись.

На `830caf4` некорректное меню отклоняется до persistence явным HTTP 422
`PROFILE_INVALID_WEEKLY_MENU`. Проверяется также унаследованное некорректное
меню; явное удаление принимается без угадывания недели. Десять новых RED-кейсов
подтвердили дефект до поправки. После неё: 976 unit / 187 файлов, все обязательные
проверки и повторный 16-request Worker/D1 smoke прошли; HTTP smoke теперь
требует точный 422 и неизменённую версию. 47 targeted tests дополнительно
подтвердили явное удаление, session guard, projection и sender.

## Порядок выпуска и открытые условия

- [x] Разделить read/write-capabilities и сохранить protocol-паузу записи.
- [x] Заменить menu E2E: одна profile-операция, reload с тем же opId, без items POST.
- [x] Пройти unit/typecheck/guards/schema/privacy, audit и локальный Worker/D1.
- [x] Пройти полную browser matrix `4736ff5`: 236 passed / 9 skips, без retries.
- [x] Подтвердить [CI `2d1f480`](https://github.com/Michael-edel/FitFocus/actions/runs/38194485398):
  976 unit / 187 файлов, 236 browser passed / 9 skips, success.
- [x] Подготовить совместимый CAS-сервер `dde4c71` и проверить локальный
  переход на одной БД; [инструкция и свидетельства](profile-cas-rollout.md).
- [x] Подтвердить [CI подготовительного `c39904c`](https://github.com/Michael-edel/FitFocus/actions/runs/38196258543):
  952 unit, 229 browser passed / 9 skips, success.
- [ ] Проверить staging и совместимый откат.
- [ ] Продолжить семейные writers, runtime legacy и остальную приёмку P0.

Дополнение 13.10.2026: последний пункт описывает состояние этой проверки на
12.10. Семейные writers и runtime legacy позднее подключены в PR #93; настоящий
old/new migration smoke прошёл [полный CI](https://github.com/Michael-edel/FitFocus/actions/runs/38324638965).
Для актуального порядка staging, отката и P0 см. [статус проекта](project-status.md).

До миграции 0020 требуется отдельный подготовительный серверный выпуск:
оба profile CAS уже используют `RETURNING`, а чтение/запись личных покупок
ещё сохраняют прежний контракт. Применять triggers поверх старого CAS,
который ждёт `meta.changes === 1`, нельзя: запись может состояться, а сервер
вернёт ложный конфликт. Полный сервер `4736ff5` также не предназначен для БД
без 0020: новые чтения требуют таблицу. Последовательность: подготовительный
сервер → миграция 0020 → сервер проекции → capability smoke → новый клиент.

Старый клиент получает 409 на личный items POST; его поведение проверяется
отдельно. Откат functions к чтению только `weekly_menu_items` может скрыть
актуальную проекцию, поэтому требует проверенного совместимого решения.
Данные проекции и legacy не удаляются ради отката. Локальная проверка
воспроизвела устаревшее чтение при откате reader и восстановление после
возврата проекции. Staging и production-действия выпуска ещё не выполнялись;
[чек-лист](../RELEASE_CHECKLIST.md) остаётся обязательным.
