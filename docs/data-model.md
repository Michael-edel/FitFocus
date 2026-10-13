# Данные и владение

Снимок: 09.10.2026, `810adb1`. [Область документации](README.md).

Дополнение 12.10.2026, `dac2de2`: [чтение облачных данных](bootstrap-hydration.md)
передаёт accountId/serverSessionId/sessionEpoch/authFence через readGuard.
Guard и fence принимаются одной транзакцией, hydrate проверяет fence вместе
с revision/pending. Идентичное повторное чтение той же owned-версии не меняет
revision; первое подтверждение отсутствия сохраняет owner/meta. Схемы IDB v2
и D1 не меняются. Таблица ниже описывает исторический снимок `810adb1`.

## Хранилища исходного снимка 810adb1

| Данные | Где находятся в исходном снимке | Ограничение |
|---|---|---|
| Профиль | D1 `user_profiles`, JSON и версия; локальное состояние клиента | Отдельный путь profileSync |
| Cloud state | D1 `user_kv`: `user_id`, `k`, `v`, `updated_at`, `version` | Полный строковый снимок на ключ; физическое удаление |
| Объёмные локальные state | IDB `fitfocus-user-state-v1`, версия схемы 1, store `values` | Это значения, ещё не очередь |
| Остальные локальные значения/метаданные | localStorage, ключи из `storage/keys.ts`, включая версии `__ffv` | Нельзя атомарно связать с отдельной IDB-транзакцией |
| Очередь hybrid | Map по ключу + localStorage `fitfocus.remote-kv-outbox.v1` | Общая для вкладок без безопасной транзакции и явного accountId |
| Старый scaffold outbox | `storage/outbox.ts`, ключ `fitfocus_outbox_ops` | Другой формат; найден экспорт, активные вызовы требуют отдельной инвентаризации |

В `values` находятся записи `{ key, value, updatedAt }` для diary, history,
weekly_reports, favorite_recipes, last_coach_card. Префикс данных пользователя —
`fitfocus_data_<user>_…`. Не все ключи автоматически становятся account-owned:
hybrid также зеркалирует часть глобальных AI-ключей.

## D1

Источник схемы — [db/schema.sql](https://github.com/Michael-edel/FitFocus/blob/810adb11b01447114de9f240c6e2d520f747470b/db/schema.sql),
история — [migrations](https://github.com/Michael-edel/FitFocus/tree/810adb11b01447114de9f240c6e2d520f747470b/migrations).
Кроме profile/state есть users/sessions, доступ и подписки, семейные данные,
меню/покупки/рецепты, push, поддержка, административные и AI-события,
достижения и wearable connections. Проверки schema/privacy должны обновляться
вместе с миграцией, экспортом и удалением аккаунта.

Таблицы `state_store`, outbox или tombstone не объявляются уже существующими
серверными таблицами: `state_store.ts` — модуль работы с `user_kv`.

## Подключение клиента — частично внедрено

После этапов шести и 15 state-ключей [редактор профиля](profile-persistence.md)
использует тот же IDB v2: values по ключу `fitfocus_data_<accountId>_profile`
и outbox-операцию с явным resource=profile. Нового store или второй очереди
нет. Profile не входит в prefix-hydration state. Наблюдение и конфликт
сохраняют отдельные серверные версии profile; [регистрация](registration-persistence.md)
создаёт value/операцию до AI. Восстановление требует явного accountId и owner-meta;
старый profile без владельца не принимается по имени ключа. Legacy и полный
экспорт/очистка ещё открыты. Описание прежних этапов ниже сохраняет их границы.

Шесть ключей UserStateRepository, включая settings, теперь коммитят значение
и outbox-операцию вместе. Менеджер IDB использует схему 2; metadata хранит также
доказательство точного подтверждённого parent. Старые raw-writers не меняют
durable-owned values. Это не охватывает profile и остальных writers.
[Контракт runtime](runtime-state.md).

Существующая IDB расширена outbox и миграционными stores. Значение и операция
одного изменения шести ключей коммитятся вместе. Для profile и остающихся localStorage-записей
нужно явно определить перевод или отдельную гарантию, а не приписывать им
атомарность IDB. См. [ADR-005](adr/ADR-005-durable-outbox.md).

Операция имеет постоянный accountId и opId, ключ, тип, payload, базовую версию,
локальную ревизию и статус. Попытка отправки имеет attemptId, sessionEpoch,
owner и числовой startedAtMs. Установить владельца legacy можно только по
проверяемым данным; неоднозначные и глобальные записи сохраняются в карантине.

Карантин содержит rawRecord, fingerprint, reason и detectedAt.
Это может быть пользовательская информация: её не писать в логи,
учитывать в локальном экспорте/очистке и правилах хранения.

## Реализация фундамента P0.8 в PR #93

Дополнение 11.10.2026: [15 управляемых state-ключей](owned-state-writers.md)
используют общую схему IDB v2 и явный repository. Raw-форматы date/flag/code
сохранены; прежний Map sender удалён из текущей сборки. Подключение шести
ключей ниже — исторический промежуточный этап. На момент этого дополнения
profile, backup и реальная old/new migration-приёмка ещё не были подключены.
Profile и runtime migration описаны в более поздних контрактах; JSON backup v3
для всех долговечных stores реализован в [`2aff6c3`](https://github.com/Michael-edel/FitFocus/commit/2aff6c33d638052d9a084902895df822efb269e5)
([подробности](backup-restore.md)). Коммит `b53a55e` добавил account-scoped
очистку пяти stores и scoped localStorage; exact CI прошёл. Global legacy source
и snapshots сохраняются, поэтому полное стирание ещё открыто.
[Контракт очистки](account-data-cleanup.md), оставшиеся критерии — в [TASKS](../TASKS.md).

Эта часть относится к ветке `fix/durable-outbox`, а таблица существующих
хранилищ выше — к исходному снимку `810adb1`. Новая схема IDB — версия 2:
values сохранён, добавлены outbox, outbox_migration_items,
outbox_migration_unknown и outbox_meta. Менеджер `storage/stateDatabase.ts`
используется также существующим `indexedUserState.ts`.

`storage/durableOutbox.ts` сохраняет value, операцию, локальную ревизию
и явного владельца ключа одной транзакцией. Независимый снимок при устаревшей
ревизии сохраняется как conflicted, не заменяя принятое value. Новое значение
содержит accountId; отдельная owner-запись остаётся и после локального delete.
Значения исходного v1 не получают выдуманный accountId при upgrade.

Метаданные содержат ревизию принятого value, счётчик операций, подтверждённую
серверную версию, headOpId и активную accountId/sessionEpoch. Только явный
parentOpId того же writer связывает последующие полные снимки. Подтверждение
родителя может обновить baseVersion pending-потомка в той же транзакции;
независимые conflicted-снимки не перебазируются.

Следующий этап добавляет public serverSessionId, причину паузы и монотонный
auth-fence. Проверка `/me`, logout, возобновление и claim/finish используют
этот metadata-store транзакционно; raw sid/cookie в IDB не сохраняются.

Claim и finish проверяют активную сессию в IDB. Попытка фиксирует owner,
attemptId, sessionEpoch и startedAtMs. Upgrade сообщает blocked и продолжает
тот же запрос после закрытия старого соединения; versionchange закрывает
соединение нового клиента. Эти пути проверены fake IndexedDB, не реальными
старым и новым browser bundle.

Атомарная запись подключена к шести ключам UserStateRepository;
HTTP claim/finish и проверенная server session подключены для шести ключей
в [следующем этапе](state-sender.md). Компонент
`storage/legacyMigration.ts` заполняет migration stores только при явном вызове;
запуска при входе/старте приложения пока нет. Ledger содержит canonical,
raw-варианты, ссылку на opId/accountId и сохранённое подтверждение отправки.
В outbox_meta сохраняются точные legacy-снимки и прогресс. Это данные
миграции, не отдельная очередь отправителя. Старый localStorage-источник
не изменяется и не удаляется импортером.

Необработанные записи прежних снимков восстанавливаются и при изменении
источника. Unknown сохраняется с причиной; подтверждение с версией и удаление
outbox-операции атомарны. [Контракт и проверки](legacy-migration.md).
На исходном снимке предстоят доказательство владельца/остановки старых writers
и runtime-вызов импортера. Текущее подключение уже получает владельца из свежего
auth proof и использует all-client Service Worker fence. Smoke настоящего legacy
intent на старой и новой сборках пройден; остаются полная координация
auth/hydration, UI повтора/разрешения и очистка/экспорт.

## Серверные поколения — компонент реализован, выпуск ожидается

Последующее изменение в `fix/state-generations` реализует описанное ниже
для серверного компонента: [user_kv.deleted_at и поколения](state-generations.md).
Миграция 0019 сохраняет прежние живые payload/версии, GET получает opt-in
чтение tombstones, экспорт включает exists/deleted_at. Показанный выше снимок
`810adb1` остаётся исторической базой. Серверная ветка объединена с клиентской
коммитом `93f90c0`; managed hydration читает protocol 2, новый HTTP sender
подключён для шести ключей. Слияние в main и staging не подтверждены.

Удаление должно сохранять поколение ключа: tombstone в `user_kv` или
эквивалентный механизм. Следующие мутации повышают версию, включая recreate.
Старая baseVersion не должна снова стать действительной после удаления.

Смена формата требует определить read/exists, payload tombstone,
условный delete, создание отсутствующего ключа, baseVersion=0 и ответ с версией
именно выполненной мутации. `RETURNING` нужен внутри условной записи;
повторный SELECT может увидеть уже чужую следующую версию.

`D1.batch()` не превращает `changes=0` в SQL-ошибку. Нельзя считать пакет
атомарно отклонённым только из-за нулевого результата одного условного UPDATE.
Совместимость старых клиентов, retention, экспорт и privacy проверяются до
выпуска. Удалять tombstones по произвольному сроку без анализа старых клиентов
и очередей нельзя. Детали — [P0.7](../TASKS.md).


## Личные покупки: компонент 4736ff5

Миграция [0020](../migrations/0020_personal_menu_projections.sql) добавляет
`personal_menu_projections`: ключ `(user_id, week_start)`, `items_json`,
`profile_version`, `updated_at`. AFTER-triggers записывают снимок ингредиентов
в том же SQL statement, что принятый profile CAS. Версия берётся из принятого
profile. Нового клиентского store/outbox нет: доставка использует profile-операцию.

Пустая каноническая генерация остаётся пустой, удаление меню создаёт её для
старой текущей недели. История других недель сохраняется. Прежние личные
`weekly_menu_items` остаются fallback только для недели без канонического
снимка. Повреждение проекции не переключает чтение на старые данные.
Новая таблица включена в GDPR export/delete; семейный путь остаётся отдельным.
[Контракт и проверки](personal-menu-projection.md), [ADR-007](adr/ADR-007-personal-menu-projection.md).

## Семейное поколение — рабочая версия 12.10.2026

Миграция 0021 добавляет `family_menu_generations`: family_id/week_start —
составной первичный ключ; version — положительная CAS-версия; menu_json —
один снимок меню, порций и структурированных покупок. Старые weekly_menus
сохраняются и копируются verbatim с version=1 без перезаписи новой canonical.
Четыре triggers запрещают прежние INSERT/UPDATE семейных menus/items;
личные items и deletion для cleanup остаются доступны.

IDB v3 сохраняет прежние пять stores. Resource familyMenu использует ту же
outbox и key `fitfocus_data_<accountId>_family_menu:[familyId,weekStart]`,
где суффикс — точный JSON tuple. Значение — JSON `{familyId,weekStart,menu}`.
Generic `/api/state` не принимает этот ресурс. Export и owner cleanup
учитывают новую серверную таблицу; до 0021 отсутствие таблицы допустимо,
при ошибке/неполной миграции частичный fallback не выполняется.
Это не подтверждает backup/экспорт всех IDB stores или полноту удаления
вложенных ссылок на бывшего участника из чужих общих JSON-снимков.
[Контракт, проверки и открытые условия](family-menu-state.md).

Последующее обновление 13.10.2026: локальный JSON backup v3 теперь включает
все пять долговечных stores IDB-outbox и атомарно восстанавливает их с
проверкой конфликтов; детали в [контракте backup/restore](backup-restore.md).
Этот экспорт не заменяет серверный GDPR `/api/export`. Локальная очистка
account-owned строк пяти IDB stores и scoped localStorage добавлена в `b53a55e`;
она сохраняет global legacy source/snapshots и
не подтверждает полное стирание. [Контракт и ограничения](account-data-cleanup.md).
