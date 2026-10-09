# P0.7: серверные поколения state

Обновлено: 09.10.2026. Проверенная ревизия:
[`237f862adb51f82378617e11d48ce698504d10d2`](https://github.com/Michael-edel/FitFocus/commit/237f862adb51f82378617e11d48ce698504d10d2),
ветка `fix/state-generations`, [draft PR #94](https://github.com/Michael-edel/FitFocus/pull/94).
База — PR #90 (`cc880d9`). Это серверный компонент P0.7;
совместимый клиент, staging, слияние и выпуск ещё не подтверждены.
Документация не добавляет этот код в main.

## Хранилище и мутации

[Миграция 0019](https://github.com/Michael-edel/FitFocus/blob/237f862adb51f82378617e11d48ce698504d10d2/migrations/0019_state_tombstones.sql)
добавляет nullable `user_kv.deleted_at`, сохраняя прежние payload и версии.
NULL означает живую запись, числовая отметка — tombstone. DELETE очищает
значение до пустой строки, сохраняет строку и повышает версию. PUT по текущей
версии tombstone восстанавливает значение и снова повышает версию.

| Операция | Условие | Результат |
|---|---|---|
| PUT, baseVersion=0 | Ключ никогда не создавался | Живое значение, версия 1 |
| DELETE, baseVersion=0 | Ключ никогда не создавался | Tombstone, версия 1 |
| PUT/DELETE, baseVersion>0 | Совпадает версия живой записи или tombstone | Следующее поколение |
| baseVersion=0 при существующем поколении | Включая tombstone | 409 без мутации |
| Положительная версия отсутствующего ключа | Нет такого поколения | 409, version=0, exists=false |
| Устаревшая версия или исчерпанный безопасный диапазон | CAS не выполняется | 409 без мутации |

Повтор DELETE со старой baseVersion конфликтует. Повтор с новой совпадающей
версией tombstone создаёт следующее поколение удаления. Потеря ответа
не позволяет клиенту вычислить подтверждение как baseVersion+1.

[state_store.ts](https://github.com/Michael-edel/FitFocus/blob/237f862adb51f82378617e11d48ce698504d10d2/functions/api/_lib/state_store.ts)
проверяет пакет одним условным SQL с материализованной проверкой конфликта.
CAS и RETURNING относятся к одной мутации; конфликт отклоняет весь пакет.
Диагностическое чтение при 409 может увидеть уже следующее состояние;
оно не является подтверждением записи. SQL-ошибка откатывает statement;
нулевые changes не считаются ошибкой отдельных statements в D1.batch.

[Парсер записи](https://github.com/Michael-edel/FitFocus/blob/237f862adb51f82378617e11d48ce698504d10d2/functions/api/_lib/state_write.ts)
требует безопасную целую неотрицательную версию. MAX_SAFE_INTEGER нельзя
повысить или сбросить. PUT ограничен 32 элементами, то есть 99 параметрами
SQL; больший запрос получает TOO_MANY_ITEMS до записи. Разбивка на пакеты
не делает несколько запросов одной атомарной мутацией.

## HTTP, чтение и данные аккаунта

[Маршрут state](https://github.com/Michael-edel/FitFocus/blob/237f862adb51f82378617e11d48ce698504d10d2/functions/api/state.ts)
возвращает `X-FitFocus-State-Protocol: 2`. Новый клиент должен проверить
поддержку протокола: старый сервер может просто проигнорировать includeDeleted.
Общая JSON-обёртка добавляет schema_version=3; это отдельная версия схемы API.

| Ответ | Поля результата без общей schema_version |
|---|---|
| Успешный PUT | ok=true, items=[{key, version, exists:true}] |
| Успешный DELETE | ok=true, key, version, exists:false |
| Обычный GET | Только живые записи |
| GET с includeDeleted=1 | Также tombstones: value="", version, exists:false |
| 409 | KV_CONFLICT; доступные key/value/version/exists — диагностический снимок |

[Чтение](https://github.com/Michael-edel/FitFocus/blob/237f862adb51f82378617e11d48ce698504d10d2/functions/api/_lib/state_read.ts)
сравнивает prefix буквально. [Экспорт](https://github.com/Michael-edel/FitFocus/blob/237f862adb51f82378617e11d48ce698504d10d2/functions/api/_lib/user_data_export.ts)
сохраняет version, exists и deleted_at с очищенным payload tombstone.
[Legacy-перенос аккаунта](https://github.com/Michael-edel/FitFocus/blob/237f862adb51f82378617e11d48ce698504d10d2/functions/api/_lib/legacy_sync.ts)
копирует только отсутствующие целевые ключи; поколения разных владельцев
не сравниваются, существующее целевое значение не перезаписывается.
[Полное удаление аккаунта](https://github.com/Michael-edel/FitFocus/blob/237f862adb51f82378617e11d48ce698504d10d2/functions/api/_lib/account_delete.ts)
физически очищает его записи, включая tombstones. Произвольного TTL нет.

## Условия выпуска и отката

1. Подключить совместимый клиент: читать tombstone-поколения, сохранять
   409-intent и использовать подтверждённую DELETE-версию. Прежний sender
   ещё не поддерживает весь контракт; [оставшаяся интеграция](outbox-implementation.md).
2. Применить additive-миграцию 0019 до серверного кода на проверенном D1 binding.
3. Проверяемо остановить старые серверные writers и ограничить несовместимые
   клиенты. Reload или флаг не доказывает остановку старой вкладки.
4. На отдельном staging проверить старую/новую сборку, перенос аккаунта,
   экспорт, hard delete и [чек-лист выпуска](../RELEASE_CHECKLIST.md).
5. Зафиксировать release SHA и результат выпуска отдельным свидетельством.

Миграция не восстанавливает поколения, уже физически удалённые старым сервером.
Для старых pending/legacy без доказанной принадлежности поколению нужна
отдельная проверка или разрешение конфликта; совпавший номер не доказывает
принадлежность, автоматически повышать baseVersion нельзя.

Откат на физический DELETE разрушает гарантию. Нужно сохранить колонку,
tombstones и очередь, при необходимости остановить записи и использовать
совместимый сервер. Восстановление старой копии не должно стирать новые мутации.

## Подтверждение и граница проверки

[Тесты SQLite](https://github.com/Michael-edel/FitFocus/blob/237f862adb51f82378617e11d48ce698504d10d2/tests/state_generations.test.ts)
и [HTTP-контракт](https://github.com/Michael-edel/FitFocus/blob/237f862adb51f82378617e11d48ce698504d10d2/tests/state_put.test.ts)
проверены в [CI на 237f862](https://github.com/Michael-edel/FitFocus/actions/runs/37930729452):
532 unit-теста, три проверки типов, guards, schema/privacy, сборка и
существующие E2E (19 passed / 9 skips). Отдельно прошли 17 HTTP-запросов
к локальному Worker/D1 с синтетической сессией; удалённая D1 не менялась.
Это не настоящий OAuth и не staging. Подробности: [журнал](stabilization-progress.md).
Полная [P0.7](../TASKS.md#p07--непрерывные-серверные-версии-после-удаления)
остаётся открытой до совместимого клиента и приёмки выпуска.
