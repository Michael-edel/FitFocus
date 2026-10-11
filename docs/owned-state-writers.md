# P0.8: пользовательские записи через постоянную очередь

Обновлено: 11.10.2026. Ветка `fix/durable-outbox`,
[draft PR #93](https://github.com/Michael-edel/FitFocus/pull/93), база #94 → #90.
Код этого этапа: [`31ec847`](https://github.com/Michael-edel/FitFocus/commit/31ec84757ca72b4a48ccb6b3fa0e19ca8245a2f5). Это продолжение
[repository](runtime-state.md) и [HTTP sender](state-sender.md).
На этой ревизии полная миграция legacy, profile и приёмка выпуска ещё открыты.
Следующий этап [сохранения профиля](profile-persistence.md) использует
ту же outbox; описание ниже сохраняет границу `31ec847`.

## Управляемые ключи

Общий список `USER_STATE_KEYS` используется repository, managed hydration
и распознаванием IDB-values. Теперь в нём 15 ключей.

| Ключи | Сохраняемый формат и путь |
|---|---|
| diary, history, favorite_recipes, weekly_reports, last_coach_card, settings | Прежние шесть JSON-снимков через UserStateRepository |
| habits | JSON-массив; переключение привычки в App сохраняет отдельное state-намерение |
| favorites | JSON-массив FastLogItem; существующее чтение подключено к managed hydration, активного writer этого ключа нет |
| adapt_read, adapt_expanded | Строки `1` / `0`; useAdaptationUiState |
| refeed | Строка локальной даты; useRefeedSchedule |
| plan_task_done | JSON-объект boolean-значений; usePlanTaskState |
| council_history | JSON-массив сообщений; useCouncilChat, при записи последние 50 сообщений |
| family_menu_prefs | JSON-объект; useFamilyMenu |
| invite_code | Строка; useInviteCodeState |

Обычные JSON-ключи используют writeJson. Ключи с историческим строковым
форматом используют writeRaw и свой codec, чтобы дата, код и `1` / `0`
не превращались в JSON-строки или boolean другого формата.

## Редактор и сохранение

[useOwnedState](../features/state/useOwnedState.ts) связывает feature hook
с [StateEditor](../storage/stateEditor.ts) и repository конкретного аккаунта.
Сохранённый callback сохраняет прежнего владельца после смены профиля.
Чтение не создаёт outgoing intent, не записывает defaults и не удаляет
legacy-источник. Значение и принятая операция коммитятся одной IDB-транзакцией.

Редактор сохраняет фактически прочитанную ревизию. Независимая правка
другой вкладки не получает новую базу автоматически. Правка до окончания
загрузки сохраняется как `conflicted` с причиной `editor-not-loaded`;
позднее чтение не заменяет её рабочее значение. Для продолжения такого
редактора сохраняется конфликт, пока не выполнена отдельная процедура
разрешения или повторного открытия.

Delete сохраняет намерение удаления. При quota/abort видимая история
не очищается; при конфликте прежний снимок также остаётся. Позднее завершение
delete не сбрасывает новую правку того же редактора. Остаточная localStorage
копия не оживляет удалённый ключ при reload.

## Отправка, профиль и старые пути

Прежний Map/localStorage HTTP sender удалён из `storage/hybrid.ts` текущей
сборки. Его helpers отклоняют raw-запись/удаление пользовательских state-ключей
и изменение legacy-ключа. Они больше не создают очередь или HTTP-запросы.
Device UI-настройки и метаданные AI остаются локальными; hydration больше
не запрашивает глобальные AI-префиксы и не применяет неизвестные ключи.

ProfileSync больше не собирает localStorage в пакет PUT `/api/state`
и не применяет state-ответ 409 сырым overwrite. Он просит общий sender
выполнить `syncNow(accountId)`. Этот вызов не меняет активный аккаунт,
получает свежий /me proof и проверяет сессию/остаток очереди одной readonly
IDB-транзакцией. Pending, conflicted, failed, пауза или смена поколения
не дают статус завершённой синхронизации state.

Сам `/api/profile` пока сохраняет отдельный путь и Promise-очередь.
Защита всех profile/family/AI callbacks и их HTTP-сессий этим этапом
не подтверждена. Отмена применения позднего ответа совета после очистки
или смены аккаунта не означает отмены всей цепочки его сетевых запросов.

Непустой, повреждённый или недоступный legacy-источник по-прежнему
приостанавливает новую отправку. Удаление sender из новой сборки не
останавливает уже открытые старые сборки. Нужны доказанный владелец,
фактический writer barrier и runtime-вызов [импортера](legacy-migration.md).
Источник не удаляется ради возобновления отправки.

## Проверки и оставшаяся работа

Unit-проверки: [редактор](../tests/state_editor.test.ts),
[sender](../tests/state_sync.test.ts),
[hydration](../tests/session_hydration_durable.test.ts),
[profile state-flush](../tests/profile_sync.test.ts),
[удалённый mirror](../tests/hybrid_sync.test.ts).
[Браузерные сценарии](../e2e/owned-state.spec.ts) проверяют отметку плана,
удаление истории с reload и отказ хранения с сохранением видимого значения.
Конкретные результаты ревизии и ограничения — [в журнале](stabilization-progress.md).

Остаются runtime legacy-импорт и старые сборки на одном origin, полный
profile/auth/bootstrap lifecycle, UI повтора и разрешения, атомарный backup,
экспорт/очистка всех stores, staging и выпуск в защищённую main.
Порядок и критерии закрытия — [TASKS](../TASKS.md).
