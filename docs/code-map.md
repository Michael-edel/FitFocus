# Карта кода FitFocus

Сверено: 12.10.2026. Код bootstrap/hydration — `dac2de2`, исправление
уведомления — `3550cc8`; предыдущая ревизия документации — `57f956d`,
ветка `fix/durable-outbox`.
Это навигация по реализации; готовность задач определяется в
[TASKS](../TASKS.md), результаты проверок — в [журнале](stabilization-progress.md).
Наличие файла или теста не подтверждает выпуск функции в production.

## Функция, реализация и проверки

| Область | Основные исходники | Контракт и проверки |
|---|---|---|
| Сборка интерфейса и сценариев | [App.tsx](../App.tsx), [AppWorkspace.tsx](../AppWorkspace.tsx) | [Продукт](../PRODUCT.md), [архитектура](current-architecture.md); feature hooks находятся в `features/` |
| Вход и загрузка данных | [authSession.ts](../authSession.ts), [loginSession.ts](../features/auth/loginSession.ts), [sessionRead.ts](../storage/sessionRead.ts) | [Bootstrap/hydration](bootstrap-hydration.md), [read guard tests](../tests/session_read_guard.test.ts), [браузерные сценарии](../e2e/bootstrap-session.spec.ts) |
| Регистрация и первоначальный план | [registrationFlow.ts](../registrationFlow.ts) | [Сохранение регистрации](registration-persistence.md), [unit](../tests/registration_flow.test.ts), [E2E](../e2e/registration-durability.spec.ts) |
| Редактирование и восстановление профиля | [useProfilePersistence.ts](../features/profile/useProfilePersistence.ts), [profileState.ts](../storage/profileState.ts) | [Контракт профиля](profile-persistence.md), [profile tests](../tests/profile_sync.test.ts), [E2E](../e2e/profile-durability.spec.ts) |
| Дневник питания | [useFoodDiary.ts](../features/diary/useFoodDiary.ts) | [Управляемые записи](owned-state-writers.md), [feature tests](../tests/food_diary_feature.test.ts), [storage tests](../tests/food_diary_storage.test.ts) |
| Настройки | [useSettingsPersistence.ts](../features/settings/useSettingsPersistence.ts) | [Управляемые записи](owned-state-writers.md), [проверки настроек](../tests/settings_persistence_feature.test.ts) |
| Отметки заданий плана | [usePlanTaskState.ts](../features/plan/usePlanTaskState.ts) | [Feature tests](../tests/plan_task_feature.test.ts), [сценарии с reload](../e2e/owned-state.spec.ts) |
| Избранные рецепты | [useFavoriteRecipes.ts](../features/recipes/useFavoriteRecipes.ts) | [Feature tests](../tests/favorite_recipes_feature.test.ts), [модель данных](data-model.md) |
| AI-отчёт за неделю | [useWeeklyAiReport.ts](../features/ai/useWeeklyAiReport.ts) | [Feature tests](../tests/weekly_ai_report_feature.test.ts); защита всех AI callbacks остаётся задачей [P0](../TASKS.md) |
| Семейные запросы | [familyApi.ts](../features/family/familyApi.ts) | [API tests](../tests/family_api.test.ts); полный lifecycle family callbacks ещё не принят |
| Локальное сохранение и редакторы | [userStateRepository.ts](../storage/userStateRepository.ts), [stateEditor.ts](../storage/stateEditor.ts), [durableOutbox.ts](../storage/durableOutbox.ts), [stateDatabase.ts](../storage/stateDatabase.ts) | [Фундамент P0.8](outbox-implementation.md), [repository tests](../tests/user_state_repository_indexed.test.ts), [outbox tests](../tests/durable_outbox.test.ts) |
| Отправка state и profile | [stateSync.ts](../storage/stateSync.ts), [sessionTransport.ts](../storage/sessionTransport.ts) | [Sender](state-sender.md), [state tests](../tests/state_sync.test.ts), [profile sender tests](../tests/profile_sender.test.ts) |
| Импорт прежней очереди | [legacyQueue.ts](../storage/legacyQueue.ts), [legacyMigration.ts](../storage/legacyMigration.ts) | [Legacy-контракт](legacy-migration.md), [нормализатор](../tests/legacy_queue.test.ts), [импорт](../tests/legacy_migration.test.ts); runtime-подключение ещё открыто |
| Серверная сессия и данные | [me.ts](../functions/api/me.ts), [bootstrap.ts](../functions/api/bootstrap.ts), [state.ts](../functions/api/state.ts), [profile.ts](../functions/api/profile.ts) | [API-контракты](../API_CONTRACTS.md), [серверные поколения](state-generations.md), [bootstrap tests](../tests/bootstrap_session_guard.test.ts) |
| Уведомление о сохранении | [StateStorageNotice.tsx](../ui/StateStorageNotice.tsx) | [Стабильность формы при жесте](profile-persistence.md#стабильность-формы-при-изменении-уведомления), [storage E2E](../e2e/storage-durability.spec.ts), [profile E2E](../e2e/profile-durability.spec.ts) |
| PWA и обновление приложения | [sw.ts](../sw.ts), [pwa.ts](../pwa.ts) | [PWA E2E](../e2e/pwa-shell.spec.ts), [выпуск](../RELEASE_CHECKLIST.md); обновление service worker не доказывает остановку старых вкладок |

## Границы, которые нужно сохранить

- Пользовательские изменения проходят через repository/editor и атомарную
  транзакцию value/outbox. Прямой сетевой PUT из формы не заменяет локальный commit.
- `/api/state` и `/api/profile` используют одну постоянную очередь, но разные
  HTTP-контракты. Успешный ответ одного ресурса не подтверждает другой.
- HTTP-чтение проверяет аккаунт, серверную сессию и протокол; применение
  снимка дополнительно проверяет epoch/auth-fence в транзакции IDB.
- Legacy-нормализатор не назначает владельца. Импорт требует доказательств
  владельца и остановки старых writers; текущий вход этого не доказывает.
- Числа тестов и результат CI относятся к указанному SHA. Проверка mock API
  не заменяет настоящий OAuth, staging или проверку выпуска.

## Как выбрать файлы для изменения

1. Найти задачу и критерий готовности в [TASKS](../TASKS.md).
2. По таблице открыть feature hook, его контракт и проверки. Проследить вызов
   через `App.tsx`, repository и серверный маршрут, если они участвуют в дефекте.
3. Воспроизвести конкретное поведение; для ошибки сохранения проверить
   намерение в IDB, статус операции, запрос и ответ, а не только надпись в UI.
4. После исправления выполнить проверки из [CONTRIBUTING](../CONTRIBUTING.md),
   обновить затронутый контракт, TASKS, краткий статус и журнал с результатами.

Карта обновляется при добавлении, переименовании или переносе модулей.
Новые функции и приоритеты описываются в PRODUCT/TASKS; их не нужно
дублировать здесь отдельным планом.
