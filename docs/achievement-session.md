# Сессия и очередь достижений

Сверено: 12.10.2026. Компонент [`57da2cf`](https://github.com/Michael-edel/FitFocus/commit/57da2cf3d8bcb682242db87994126d1c816158d4),
поправки отмены [`a407373`](https://github.com/Michael-edel/FitFocus/commit/a4073731ea2d30c107b49ff8cf7170dbffc8ed83)
и атомарного proof [`4528e2b`](https://github.com/Michael-edel/FitFocus/commit/4528e2bba08c7868ad2b24be2285c9547140b865),
ветка `fix/durable-outbox`. Реализация не закрывает весь P0.5 или выпуск.

## Проблема и граница

Прежний hook отправлял GET/POST с текущей cookie без account/session scope.
Его throttle-очередь очищалась только при размонтировании. Старый callback,
таймер или ответ могли пересечь logout/login, включая новый вход того же
аккаунта. Проверка menu use case до вызова достижений не защищала этот HTTP.

Теперь [App](../App.tsx) передаёт proof принятого входа из login/hydration.
[Hook](../useAchievements.ts) создаёт отдельный клиент для входа и page lifetime;
старые callback замыкают свой экземпляр, а не ref на будущего пользователя.
[Проверенный клиент](https://github.com/Michael-edel/FitFocus/blob/a4073731ea2d30c107b49ff8cf7170dbffc8ed83/features/achievements/achievementClient.ts)
не подбирает исходную сессию по cookie или текущему IDB при восстановлении страницы.

## HTTP-контракт

`/api/me` объявляет независимую capability `achievementSync: { protocol: 1, guard: 1 }`.
AI-capabilities для достижений не требуются. [Транспорт](../services/achievementSession.ts)
получает свежий `/me` proof с сохранением исходных accountId/serverSessionId;
актуальные epoch/auth-fence принадлежат конкретной HTTP-попытке.
Auth-пауза запрещает запрос, автоматическая проверка её не снимает.
Явное возобновление того же серверного входа допускает следующую попытку.
Если auth-пауза установлена, пока автоматический `/me` ещё выполняется,
принятие proof проверяет исходный guard и отсутствие паузы в той же IDB-транзакции.
Поздний proof не очищает паузу и не заменяет epoch своей попытки.

GET `/api/achievements` и POST `/api/achievements/check` передают парные
`X-FitFocus-State-Account` / `X-FitFocus-State-Session`. [Серверный handler](../functions/api/_lib/achievement_handlers.ts)
проверяет их после аутентификации, до feature-чтения и прикладных SQL/эффектов.
Другой аккаунт, новая сессия того же аккаунта и неполная пара получают 401.
Чтения, необходимые самой аутентификации, предшествуют этой проверке.

Ответ содержит `X-FitFocus-Achievements-Protocol: 1`, `-Guard: 1` и переданный
scope, включая ответы с отказом. Клиент проверяет scope, статус и IDB guard
после чтения тела. POST требует JSON-объект; повреждённое тело получает 400.
Deadline включает тело ответа, есть предел размера; скрытых повторов POST нет.
Запросы прежних клиентов без обоих заголовков остаются совместимыми и не
получают подтверждение account/session scope. Это не барьер старых сборок.

## Очередь и UI

- Контекст фиксируется при постановке события. Одинаковый reason объединяется
  с последним контекстом; очередь ограничена пятью различными reason.
- Logout, новый вход, cleanup и `pagehide` отменяют HTTP/таймер и завершают
  ожидающие вызовы пустым результатом. Старый ответ не добавляет уведомление.
  Если login lifetime истёк до React cleanup, таймер сам отменяет очередь.
- `pageshow.persisted` создаёт новый page-клиент с исходной login-привязкой;
  другой serverSessionId в IDB не становится новым владельцем старого контекста.
- Состояние UI помечено экземпляром клиента, поэтому данные прошлого входа
  не показываются при первом render следующего. Поздний GET не удаляет
  достижение, уже полученное успешным POST этого клиента.
- Счётчики событий остаются best effort в account-scoped localStorage.
  Throttle-очередь не постоянная outbox: offline/reload-доставка всех событий
  и атомарность этих счётчиков данным компонентом не обеспечены.

## Проверки и оставшаяся работа

[Серверные тесты](../tests/achievement_session_guard.test.ts) проверяют отказ до
feature/application effects и capability `/me`; [транспорт](../tests/achievement_session_transport.test.ts)
— scope, capability, cookie-change, late response, pagehide и deadline тела.
[Клиент](../tests/achievement_client.test.ts) проверяет очередь, завершение вызовов,
исходный proof при восстановлении, auth-паузу/явный resume и гонку GET/POST.
[E2E](../e2e/achievement-session.spec.ts) проверяет меню → достижение → toast,
logout при held GET и новый page lifetime при held POST во всех семи проектах.

Локально: 948 unit / 186 файлов, три typecheck, guards/schema/privacy и audit
прошли; 0 известных уязвимостей. Полная матрица `57da2cf`: 219 passed /
3 failed / 9 skips. Все 21 новых achievement E2E прошли; три падения profile/logout сохранены в журнале.
Это историческая проверка исходного компонента, до последующих поправок.
Последующий runtime `724ecf1`: 950 unit / 186 файлов и обязательные проверки
прошли; build и полная матрица — 229 passed / 9 skips, workers=3, retries=0.
Все 21 achievement E2E включены. CI нового HEAD проверяется отдельно.
Предыдущий кандидат прошёл 21 новый E2E после исправления высоты графиков.
Синтетические pagehide/pageshow не подтверждают реальный BFCache/OAuth/devices.
Остальные AI/report/retry/family producers, durable items/CAS, legacy-барьер,
конфликты, backup и выпуск остаются в [TASKS](../TASKS.md).
