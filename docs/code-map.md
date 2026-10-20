# Карта кода FitFocus

Сверено: 19.10.2026. Фото-рецепт защищён на `71d2ca4`. Код bootstrap/hydration — `dac2de2`, исправление
уведомления — `3550cc8`, серверный AI/items guard — `16d3c34`.
Базовая проверенная ревизия кода — `8fc0b1b`, ветка `fix/durable-outbox`.
Последующий локально проверенный компонент меню — `f4b4eee`; автоматический
profile flush — `f3930ec`; сессия/очередь достижений — `57da2cf`,
атомарная проверка позднего proof — `4528e2b`, постоянная область notice — `724ecf1`.
Личные покупки следуют profile CAS на `4736ff5`; валидация меню дополнена
на `830caf4`; AI retry metadata и action reads привязаны к account scope на `0646e3d`.
CI каждой ревизии сверяется отдельно.
Это навигация по реализации; готовность задач определяется в
[TASKS](../TASKS.md), результаты проверок — в [журнале](stabilization-progress.md).
Наличие файла или теста не подтверждает выпуск функции в production.

## Функция, реализация и проверки

| Область | Основные исходники | Контракт и проверки |
|---|---|---|
| Сессии семейных запросов | [useFamilyCloud.ts](../useFamilyCloud.ts), [familySession.ts](../services/familySession.ts), [familyApi.ts](../features/family/familyApi.ts), [actionScope.ts](../features/family/actionScope.ts) | [Контракт и открытые writers](family-session.md), [server guard](../tests/family_session_guard.test.ts), [transport](../tests/family_session_transport.test.ts), [session E2E](../e2e/family-session.spec.ts), [late-callback E2E](../e2e/family-callback-account-switch.spec.ts) |
| Личная корзина недельного меню | [ShoppingListCard.tsx](../ShoppingListCard.tsx), [PlanScreen](../PlanScreen.tsx), [session transport](../services/familySession.ts) | [Account/session guard и state isolation](family-session.md#личная-корзина-недельного-меню), [account-switch E2E](../e2e/family-callback-account-switch.spec.ts) |
| Семейное меню: CAS и доставка | [useFamilyMenu.ts](../useFamilyMenu.ts), [repository](../storage/familyMenuRepository.ts), [server CAS](../functions/api/_lib/family_menu_state.ts), [shared ingredients](../shoppingIngredients.ts) | [Контракт](family-menu-state.md), [ADR-008](adr/ADR-008-family-menu-generation.md), [SQL tests](../tests/family_menu_state.test.ts), [outbox/AI](../tests/family_menu_durable.test.ts), [E2E](../e2e/family-menu-durable.spec.ts) |
| Сборка интерфейса и сценариев | [App.tsx](../App.tsx), [AppWorkspace.tsx](../AppWorkspace.tsx) | [Продукт](../PRODUCT.md), [архитектура](current-architecture.md); feature hooks находятся в `features/` |
| Вход и загрузка данных | [authSession.ts](../authSession.ts), [loginSession.ts](../features/auth/loginSession.ts), [sessionRead.ts](../storage/sessionRead.ts) | [Bootstrap/hydration](bootstrap-hydration.md), [read guard tests](../tests/session_read_guard.test.ts), [браузерные сценарии](../e2e/bootstrap-session.spec.ts) |
| Регистрация и первоначальный план | [registrationFlow.ts](../registrationFlow.ts), [registrationSession.ts](../features/auth/registrationSession.ts) | [Сохранение регистрации](registration-persistence.md), [unit](../tests/registration_flow.test.ts), [durability E2E](../e2e/registration-durability.spec.ts), [account-switch E2E](../e2e/registration-account-switch.spec.ts) |
| Редактирование, fallback-план и восстановление профиля | [useProfilePersistence.ts](../features/profile/useProfilePersistence.ts), [loginSession.ts](../features/auth/loginSession.ts), [App.tsx](../App.tsx), [profileState.ts](../storage/profileState.ts) | [Контракт профиля](profile-persistence.md), [profile tests](../tests/profile_sync.test.ts), [E2E](../e2e/profile-durability.spec.ts); fallback остаётся скрытым до guarded durable commit |
| Автоматический profile flush | [useProfileAutoSync.ts](../features/profile/useProfileAutoSync.ts), [App.tsx](../App.tsx), [stateSync.ts](../storage/stateSync.ts) | `flushPending` сохраняет текущую паузу; ручной `syncNow` проверяет свежий proof. [Контракт](state-sender.md#автоматическая-отправка-и-ручная-проверка-сессии) |
| Уведомление о сохранении и стабильность формы | [StateStorageNotice.tsx](../ui/StateStorageNotice.tsx) | [Контракт](profile-persistence.md#дополнительная-проверка-до-pointerdown-12102026), [E2E](../e2e/profile-durability.spec.ts): область учитывает все переносы сообщений и не двигает Save после фонового ack |
| Дневник питания | [useFoodDiary.ts](../features/diary/useFoodDiary.ts) | [Управляемые записи](owned-state-writers.md), [feature tests](../tests/food_diary_feature.test.ts), [storage tests](../tests/food_diary_storage.test.ts) |
| Фотоанализ дневника и генерация пошагового рецепта | [useFoodPhotoAnalysis.ts](../features/ai/useFoodPhotoAnalysis.ts), [usePhotoRecipeGeneration.ts](../features/ai/usePhotoRecipeGeneration.ts), [useFoodDiary.ts](../features/diary/useFoodDiary.ts), [geminiService.ts](../geminiService.ts), [FoodInsightCard.tsx](../FoodInsightCard.tsx) | [AI callback session contract](ai-callback-sessions.md), [photo analysis tests](../tests/food_photo_feature.test.ts), [recipe generation tests](../tests/photo_recipe_generation.test.ts), [account-switch/success E2E](../e2e/ai-callback-account-switch.spec.ts); `71d2ca4`: 44 passed / 4 skipped in desktop matrix, exact CI pending |
| Настройки | [useSettingsPersistence.ts](../features/settings/useSettingsPersistence.ts) | [Управляемые записи](owned-state-writers.md), [проверки настроек](../tests/settings_persistence_feature.test.ts) |
| Отметки заданий плана | [usePlanTaskState.ts](../features/plan/usePlanTaskState.ts) | [Feature tests](../tests/plan_task_feature.test.ts), [сценарии с reload](../e2e/owned-state.spec.ts) |
| Избранные рецепты | [useFavoriteRecipes.ts](../features/recipes/useFavoriteRecipes.ts) | [Feature tests](../tests/favorite_recipes_feature.test.ts), [модель данных](data-model.md) |
| Персональное недельное меню | [useWeeklyMenuGeneration.ts](../features/ai/useWeeklyMenuGeneration.ts), [geminiService.ts](../geminiService.ts), [aiSession.ts](../services/aiSession.ts), [actionScope.ts](../features/ai/actionScope.ts) | [Контракт](ai-session-guard.md), [HTTP](../tests/ai_session_transport.test.ts), [lifetime](../tests/weekly_menu_lifetime.test.ts), [durability E2E](../e2e/weekly-menu-durability.spec.ts), [account-switch E2E](../e2e/ai-callback-account-switch.spec.ts) |
| Личные покупки как проекция profile | [personal_menu_projection.ts](../functions/api/_lib/personal_menu_projection.ts), [profile_cas.ts](../functions/api/_lib/profile_cas.ts), [0020](../migrations/0020_personal_menu_projections.sql) | [Контракт](personal-menu-projection.md), [ADR-007](adr/ADR-007-personal-menu-projection.md), [SQLite tests](../tests/personal_menu_projection.test.ts); семейный путь остаётся открытым |
| Guarded generated commit | [stateEditor.ts](../storage/stateEditor.ts), [durableOutbox.ts](../storage/durableOutbox.ts), [useProfilePersistence.ts](../features/profile/useProfilePersistence.ts) | [Профиль](profile-persistence.md#сохранение-сгенерированного-результата), [транзакционные проверки](../tests/generated_result_commit.test.ts) |
| Прокрутка desktop-панели | [SidebarNavigation.tsx](../SidebarNavigation.tsx) | Переход к настройкам/правке/logout в [menu E2E](../e2e/weekly-menu-durability.spec.ts); pointer/viewport проверяются без force click |
| AI-отчёт за неделю | [useWeeklyAiReport.ts](../features/ai/useWeeklyAiReport.ts), [weeklyAutoEngine.ts](../weeklyAutoEngine.ts), [aiRetry.ts](../features/ai/aiRetry.ts) | [Session guard и durable save](weekly-ai-report-session.md), [unit tests](../tests/weekly_ai_report_feature.test.ts), [logout E2E](../e2e/weekly-ai-report-session.spec.ts), [account-switch E2E](../e2e/ai-callback-account-switch.spec.ts); остальные AI/family callbacks остаются задачей [P0](../TASKS.md) |
| AI activity и retry metadata аккаунта | [useAiActivityStatus.ts](../features/ai/useAiActivityStatus.ts), [geminiService.ts](../geminiService.ts), [App.tsx](../App.tsx) | [unit](../tests/ai_activity_status_feature.test.ts), [account-switch E2E](../e2e/ai-callback-account-switch.spec.ts); последний action scoped по userId, stale snapshot скрывается при смене аккаунта |
| Серверная привязка AI и items | [ai_request_handler.ts](../functions/api/_lib/ai_request_handler.ts), [weekly_menu/items.ts](../functions/api/weekly_menu/items.ts), [state_session.ts](../functions/api/_lib/state_session.ts) | [Контракт](ai-session-guard.md), [HTTP-регрессии](../tests/ai_menu_session_guard.test.ts); персональное меню подключено, остальные callbacks открыты |
| Достижения | [useAchievements.ts](../useAchievements.ts), [achievementClient.ts](../features/achievements/achievementClient.ts), [achievementSession.ts](../services/achievementSession.ts), [achievement_handlers.ts](../functions/api/_lib/achievement_handlers.ts) | [Контракт](achievement-session.md), [client tests](../tests/achievement_client.test.ts), [HTTP guard tests](../tests/achievement_session_guard.test.ts), [E2E](../e2e/achievement-session.spec.ts); исходный login proof и page/attempt lifetime на `57da2cf`, прочие producers ещё требуют приёмки |
| Обращения поддержки пользователя | [SupportScreen.tsx](../SupportScreen.tsx), [supportSession.ts](../services/supportSession.ts), [support handlers](../functions/api/_lib/support_feedback_my_handler.ts) | [Контракт сессии](support-session.md), [transport tests](../tests/support_session_transport.test.ts), [server tests](../tests/support_feedback_my.test.ts), [account-switch E2E](../e2e/family-callback-account-switch.spec.ts); проверенные результаты привязаны к SHA в [журнале](stabilization-progress.md) |
| Push-подписки и уведомления | [SettingsScreen](../SettingsScreen.tsx), [pushSession](../services/pushSession.ts), [PWA recovery](../pwa.ts), [Service Worker](../sw.ts), [push routes](../functions/api/push) | [Контракт](push-session.md), [session transport](../tests/push_session.test.ts), [routes](../tests/push_config_routes.test.ts), [test push](../tests/push_test_route.test.ts); account-switch E2E и полный lifecycle проверяются отдельно |
| Stripe Checkout и смена тарифа | [PaywallDialog](../PaywallDialog.tsx), [billingSession](../services/billingSession.ts), [checkout route](../functions/api/billing/checkout.ts), [admin subscription](../functions/api/admin/subscription.ts) | [Сессионный контракт](billing-session.md), [transport tests](../tests/billing_session.test.ts), [server tests](../tests/billing_checkout.test.ts), [account-switch E2E](../e2e/family-callback-account-switch.spec.ts); точный полный CI ещё ожидается |
| Мобильный bearer-токен для iPhone bridge | [SettingsScreen](../SettingsScreen.tsx), [mobileTokenSession](../services/mobileTokenSession.ts), [mobileTokenApi](../features/settings/mobileTokenApi.ts), [server endpoint](../functions/api/mobile/token.ts) | [Контракт и wearable sync](wearable-sync.md), [API contracts](../API_CONTRACTS.md), [transport/server tests](../tests/mobile_token_api.test.ts), [account-switch E2E](../e2e/family-callback-account-switch.spec.ts) |
| Huawei Health OAuth и sync | [SettingsScreen](../SettingsScreen.tsx), [huaweiSession](../services/huaweiSession.ts), [feature API](../features/settings/huaweiHealthApi.ts), [server routes](../functions/api/wearable/huawei) | [Сессионный контракт](huawei-health-session.md), [wearable API](wearable-sync.md), [transport](../tests/huawei_session_transport.test.ts), [server/API tests](../tests/huawei_health.test.ts), [account-switch E2E](../e2e/ai-callback-account-switch.spec.ts) |
| Семейные запросы | [familyApi.ts](../features/family/familyApi.ts) | [API tests](../tests/family_api.test.ts); полный lifecycle family callbacks ещё не принят |
| Локальное сохранение и редакторы | [userStateRepository.ts](../storage/userStateRepository.ts), [stateEditor.ts](../storage/stateEditor.ts), [durableOutbox.ts](../storage/durableOutbox.ts), [stateDatabase.ts](../storage/stateDatabase.ts) | [Фундамент P0.8](outbox-implementation.md), [repository tests](../tests/user_state_repository_indexed.test.ts), [outbox tests](../tests/durable_outbox.test.ts) |
| Отправка state и profile | [stateSync.ts](../storage/stateSync.ts), [sessionTransport.ts](../storage/sessionTransport.ts) | [Sender](state-sender.md), [state tests](../tests/state_sync.test.ts), [profile sender tests](../tests/profile_sender.test.ts) |
| Импорт прежней очереди | [legacyQueue.ts](../storage/legacyQueue.ts), [legacyMigration.ts](../storage/legacyMigration.ts) | [Legacy-контракт](legacy-migration.md), [нормализатор](../tests/legacy_queue.test.ts), [импорт](../tests/legacy_migration.test.ts); runtime smoke и общий lifecycle имеют отдельные критерии в [TASKS](../TASKS.md) |
| Серверная сессия и данные | [me.ts](../functions/api/me.ts), [bootstrap.ts](../functions/api/bootstrap.ts), [state.ts](../functions/api/state.ts), [profile.ts](../functions/api/profile.ts) | [API-контракты](../API_CONTRACTS.md), [серверные поколения](state-generations.md), [bootstrap tests](../tests/bootstrap_session_guard.test.ts) |
| Уведомление о сохранении | [StateStorageNotice.tsx](../ui/StateStorageNotice.tsx) | [Стабильность формы при жесте](profile-persistence.md#стабильность-формы-при-изменении-уведомления), [storage E2E](../e2e/storage-durability.spec.ts), [profile E2E](../e2e/profile-durability.spec.ts) |
| PWA и обновление приложения | [sw.ts](../sw.ts), [pwa.ts](../pwa.ts), [pwaRegistration](../services/pwaRegistration.ts), [pwaUpdate](../services/pwaUpdate.ts), [PwaUpdateNotice](../ui/PwaUpdateNotice.tsx) | [Контракт обновления](pwa-updates.md), [unit регистрации](../tests/pwa_registration.test.ts), [unit повторов](../tests/pwa_update.test.ts), [real SW E2E](../e2e/pwa-update.spec.ts), [shell E2E](../e2e/pwa-shell.spec.ts); активация SW не доказывает остановку всех прежних writers |
| Сборка и проверка отката | [Упаковщик](../scripts/release-artifact.mjs), [HTTP-проверка](../scripts/check-release-rollback.mjs) | [Контракт](release-artifacts.md), [целостность](../tests/release_artifact.test.ts), [откат pending/conflict](../e2e/pwa-rollback.spec.ts), [свежая установка](../e2e/pwa-rollback-install.spec.ts), [CI](../.github/workflows/ci.yml), [выпуск](../RELEASE_CHECKLIST.md) |

## Origin приложения и staging

[index.tsx](../index.tsx) монтирует приложение на исходном origin;
клиентский redirect preview → production удалён в компоненте поверх `aefc463`.
[preview-origin.spec.ts](../e2e/preview-origin.spec.ts) проверяет три hostname,
относительные API и переключение темы с локальными байтами сборки.
[Контракт](staging-origin.md) отделяет эту регрессию от настроек D1,
серверного APP_URL, OAuth и фактического deployment.

## Браузерные фикстуры

Mock-наборы используют [mockTest](../e2e/support/mockTest.ts) для выгрузки
документа до снятия routes. [familyHarness](../e2e/support/familyHarness.ts)
разделяет появление экрана и загрузку семейных данных. Native PWA-наборы
сохраняют стандартный test и [HTTP-сервер](../e2e/support/pwaReleaseServer.ts).
Доказательства и границы — в [контракте mock lifecycle](mock-api-lifecycle.md).

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
