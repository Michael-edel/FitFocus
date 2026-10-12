# Матрица проверки стабилизации FitFocus

Сверено: 12.10.2026. Это указатель на критерии [TASKS](../TASKS.md),
контракты и доказательства. Он не вводит новый план и не закрывает P0
по наличию тестового файла.

## Проверенная граница

Опубликованная ревизия —
[`42ee4348113e94d43cb24d6950ccd1bd7be597bc`](https://github.com/Michael-edel/FitFocus/commit/42ee4348113e94d43cb24d6950ccd1bd7be597bc),
ветка `fix/durable-outbox`. [CI этой ревизии](https://github.com/Michael-edel/FitFocus/actions/runs/38189490979)
завершился success: 950 unit / 186 файлов, 229 browser passed / 9 skips.
В итоговом browser summary нет flaky. CI использовал 2 workers; локальная
полная матрица кода `724ecf1` — 3 workers, retries=0, с теми же итогами.
Это не подтверждает staging, production или слияние в main.

Рабочие изменения личного списка покупок не входят в эту ревизию.
Их отдельный статус — в [контракте проекции](personal-menu-projection.md).

## P0: что проверено и что ещё требуется

| Пункт | Подтверждённая часть | Где смотреть проверки | Условие, которое ещё не закрыто |
|---|---|---|---|
| P0.1 — CI и зависимости | Исправление audit и push; зелёный CI опубликованной ветки | [Журнал](stabilization-progress.md), [workflow](../.github/workflows/ci.yml) | Интеграция зависимостей через защищённую main; CI release SHA |
| P0.2 — конфликты и ошибки | Outbox сохраняет конфликт и payload для 15 state-ключей и profile | [Outbox tests](../tests/durable_outbox.test.ts), [profile sender](../tests/profile_sender.test.ts), [контракт](profile-persistence.md) | UI разрешения/повтора, runtime legacy и полный lifecycle |
| P0.3 — auth-пауза | Локальная запись продолжается; отправка требует подтверждения владельца | [State sender](../tests/state_sync.test.ts), [profile E2E](../e2e/profile-durability.spec.ts), [контракт](state-sender.md) | Остальные callbacks и legacy; реальный повторный вход на staging |
| P0.4 — облачная загрузка | Managed hydration и profile seed проверяют pending, revision и auth-fence | [Hydration](../tests/session_hydration_durable.test.ts), [bootstrap E2E](../e2e/bootstrap-session.spec.ts), [контракт](bootstrap-hydration.md) | Остальные cloud callbacks и cache |
| P0.5 — поздние ответы | Claim/finish и readGuard; guarded bootstrap, личное меню и достижения в указанной области | [Read guard](../tests/session_read_guard.test.ts), [menu E2E](../e2e/weekly-menu-durability.spec.ts), [achievement E2E](../e2e/achievement-session.spec.ts) | AI/report/retry/family producers; долговечность и порядок вторичных записей |
| P0.6 — аккаунты и вкладки | Постоянный accountId операции, session попытки; транзакционная координация IDB без обязательных Web Locks | [Outbox](../tests/durable_outbox.test.ts), [lifecycle](../tests/state_sync_lifecycle.test.ts), [контракт](sync-model.md) | Доказанное владение legacy и барьер реально работающих старых writers |
| P0.7 — серверные поколения | State protocol 2, tombstones и версия своей мутации | [State generations](../tests/state_generations.test.ts), [серверный контракт](state-generations.md) | Совместимый выпуск сервера/клиента, staging и интеграция в main |
| P0.8 — постоянная очередь | Одна IDB-outbox; value/операция и import/ledger атомарны; legacy-нормализатор реализован | [Legacy queue](../tests/legacy_queue.test.ts), [migration](../tests/legacy_migration.test.ts), [ADR-005](adr/ADR-005-durable-outbox.md) | Runtime-импорт с доказательствами; old/new bundles на одном origin; backup/экспорт/очистка всех stores |
| P0.9 — приёмка | Есть unit и браузерные сценарии отдельных компонентов | [Матрица lifecycle](sync-model.md#матрица-приёмки), [release checklist](../RELEASE_CHECKLIST.md) | Полная приёмка точного release SHA, реальные устройства/BFCache/OAuth/staging и проверка отката |

Все P0 остаются открытыми в целом. Успешные части и оставшиеся условия
нужно читать вместе; результаты mock API не подтверждают поведение реального D1.

## Как фиксировать следующий результат

Для каждой проверки записывать commit SHA либо явно «незакоммиченное рабочее
дерево», команду, среду, результат и ограничения. Для браузеров дополнительно
указывать проекты, workers, retries и явные skips. Не заменять неуспешный
полный прогон успешным выборочным повтором.

После изменения контракта обновлять его документ, TASKS,
[краткий статус](project-status.md) и [журнал](stabilization-progress.md).
Эту матрицу менять, когда изменилась подтверждённая область или оставшийся
критерий; ежедневные логи и дубли всего плана сюда не добавлять.
