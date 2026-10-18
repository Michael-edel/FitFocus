# Сессия и очередь достижений

## Уточнение после CI `9a23a32` — 18.10.2026

[CI39146322907](https://github.com/Michael-edel/FitFocus/actions/runs/39146322907)
проверил точный `9a23a3221817a301445ea61522975c954f1158a3`: 1370 unit,
1043 browser passed / 307 skipped / 1 failed. Native abort прошёл7/7,
но delayed dashboard desktop WebKit сохранил строгий отказ `errorsA=[]`:
GET `/api/achievements` и POST `/api/achievements/check`.

Trace привязал ошибки к reload A: +27,855/+27,941 мс; переход B начался
примерно12,3с позже. Ошибочные A-fetch не записаны в network entries; точных
времён beforeunload/fetch invocation trace не содержит. Поэтому это не
доказательство account-switch ошибки или установленной CORS-конфигурации.

Controlled unit отдельно выявил непокрытую границу: beforeunload во время
начального IDB guard проходит до регистрации listeners; после освобождения
проверки начинается GET/POST с signal.aborted=false. RED17passed/2failed;
после переноса начального await внутрь существующего try, после регистрации
listeners и всё ещё перед HTTP, GREEN19/19. Guard и response validation
сохранены; finally теперь очищает listeners и при отказе начального guard.

Более ранние prepare/queue окна и точная внутренняя последовательность
исторической browser ошибки этой проверкой не устанавливаются. Общий
sessionRead и hook/client lifetime не меняются; фильтров ошибок и увеличения
timeout нет. Новый exact-head CI проверяется после corrective push.


## Независимый follow-up навигации — 18.10.2026

Ветка `fix/dashboard-readiness-20261018`, рабочее дерево поверх `a84214f`.
Транспорт отменяет активный request controller уже на `beforeunload`, перед
отменой attempt/session controller; `pagehide` остаётся дополнительным барьером.
Оба listener удаляются в `finally`. Account/session guard, response markers,
deadline и отсутствие автоматического повтора мутации не меняются.

Новый native HTTP тест `e2e/achievement-navigation.spec.ts` удерживает POST,
проверяет исходные account/session headers и порядок
`beforeunload → abort → pagehide` отдельно для старого документа. На исходной
сборке `a84214f` он отказал: abort не был записан до ухода страницы; на
исправленной сборке desktop WebKit прошёл. Транспортные unit: RED 15 passed /
2 failed (GET/POST), GREEN 17 passed. Строгие pageerror/console-error assertions
сохранены без фильтров.

Исторический CI `39114947822` обнаружил WebKit
`/api/achievements/check due to access control checks` через 28,097 мс после
reload. Его точный браузерный механизм не воспроизведён стабильно: обычный и
задержанный dashboard-сценарии локально прошли и до исправления. Проверенный
lifecycle gap не является доказательством всех причин этой исторической ошибки.
Отменённая пользователем навигация, BFCache, физические устройства и staging
этим тестом не приняты.


## Актуальное уточнение — обязательный proof, `616f42c`, 15.10.2026

Follow-up [`616f42c`](https://github.com/Michael-edel/FitFocus/commit/616f42ca2bb973cfb034f50112328843eaf837a4)
переводит оба achievement handlers на `requireScopedStateUser`. Legacy-запросы
без proof получают 401; unscoped POST отклоняется до разбора некорректного body.
Локально прошли профильные тесты (18/18), полный unit suite (1242/1242), три
typecheck, API/auth/schema/privacy guards, production build и `git diff --check`.
Точный CI этого follow-up ещё не запущен; rollout старых bundles, staging и
реальный BFCache остаются открытыми.

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
обязательно проверяет их после аутентификации, до feature-чтения и прикладных
SQL/эффектов. Отсутствующая/неполная пара, другой аккаунт и новая сессия того
же аккаунта получают 401.
Чтения, необходимые самой аутентификации, предшествуют этой проверке.

Ответ содержит `X-FitFocus-Achievements-Protocol: 1`, `-Guard: 1` и переданный
scope, включая ответы с отказом. Клиент проверяет scope, статус и IDB guard
после чтения тела. POST требует JSON-объект; повреждённое тело получает 400.
Deadline включает тело ответа, есть предел размера; скрытых повторов POST нет.
Запрос без обоих заголовков также получает 401; старые открытые bundles нужно
обновить до rollout. Полностью unscoped POST отклоняется до разбора тела.

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

Дополнительный cross-account сценарий в
[`e2e/ai-callback-account-switch.spec.ts`](../e2e/ai-callback-account-switch.spec.ts)
удерживает положительный `app_open` POST аккаунта A, открывает соседнюю вкладку
с аккаунтом B и затем отпускает ответ A. Проверяется, что active session остаётся
B и unlock/toast не появляется ни в старой, ни в новой вкладке. Commit
[`b44d46e`](https://github.com/Michael-edel/FitFocus/commit/b44d46eb78255b4b5da0fcbb58cd442e0b2d2eb3)
прошёл 7/7 browser/PWA-профилей с `workers=3`, `retries=0`; общий typecheck
прошёл. Точный CI этого commit ожидается.

Локально: 948 unit / 186 файлов, три typecheck, guards/schema/privacy и audit
прошли; 0 известных уязвимостей. Полная матрица `57da2cf`: 219 passed /
3 failed / 9 skips. Все 21 новых achievement E2E прошли; три падения profile/logout сохранены в журнале.
Это историческая проверка исходного компонента, до последующих поправок.
Последующий runtime `724ecf1`: 950 unit / 186 файлов и обязательные проверки
прошли; build и полная матрица — 229 passed / 9 skips, workers=3, retries=0.
Все 21 achievement E2E включены. CI нового HEAD проверяется отдельно.
Предыдущий кандидат прошёл 21 новый E2E после исправления высоты графиков.
Синтетические pagehide/pageshow не подтверждают реальный BFCache/OAuth/devices.
Остальные AI/report/retry/family producers, полный UI разрешения конфликтов
и выпуск остаются в [TASKS](../TASKS.md).
Локальный JSON backup v3 реализован отдельно в [`2aff6c3`](https://github.com/Michael-edel/FitFocus/commit/2aff6c33d638052d9a084902895df822efb269e5);
его текущие результаты и открытая account-scoped очистка — в [статусе проекта](project-status.md).
