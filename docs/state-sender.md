# P0.8: отправка операций и подтверждение сессии

Обновлено: 12.10.2026. Ветка fix/durable-outbox, draft PR #93; зависимость
#94 → #90. Это следующий этап после [repository](runtime-state.md),
а не завершение всего P0. Проверки конкретного изменения — [в журнале](stabilization-progress.md).

Исполняемый код отправителя закреплён за
[`2a72801`](https://github.com/Michael-edel/FitFocus/commit/2a728011c1639a600d566528d3030d7906741d4c).
Последующее уточнение браузерного mock не меняет этот снимок runtime.

Следующий этап [подключает 15 управляемых ключей](owned-state-writers.md)
к этому sender, удаляет прежний Map sender новой сборки и заменяет raw
profile state-upload запросом `syncNow`. Ниже сохранён контракт снимка 2a72801;
оставшиеся profile/legacy/lifecycle-задачи уточнены в новом документе.

## Жизненный цикл страницы

Дополнение `dac2de2`: sender принимает readGuard вместе с auth-fence одной
IDB-транзакцией, а profile refresh передаёт этот fence в hydrate.
Увеличение fence даже при прежнем epoch запрещает применение старого ответа.
Общий ограниченный transport используется отправкой и
[guarded bootstrap/state-чтением](bootstrap-hydration.md). Ниже сохранён
контракт lifecycle `b723b7d`; дополнение не закрывает остальные callbacks.

Код последующего исправления:
[`b723b7d`](https://github.com/Michael-edel/FitFocus/commit/b723b7d1c9112df1f854bac7bdce18b3ff39aa1a).
[stateSyncLifecycle](../features/auth/stateSyncLifecycle.ts)
останавливает sender на `pagehide`: таймеры отменяются, активные запросы
прерываются, поздний ответ старого поколения не принимается. При возврате
из BFCache (`pageshow.persisted`) sender запускается для исходного accountId
и заново проверяет сессию. Обычный `pageshow` не создаёт второй запуск;
cleanup эффекта удаляет обработчики прежнего аккаунта. Локальные операции
при закрытии страницы сохраняются. Это не замена logout/auth-fence.

Исправление продолжает [регистрацию](registration-persistence.md) и редактор
профиля. [Тесты lifecycle](../tests/state_sync_lifecycle.test.ts) проверяют
abort и поздний proof, обработчики BFCache и удаление старых слушателей.
Ревизия и браузерные результаты указаны [в журнале](stabilization-progress.md).

## Подключение

[StateSync](../storage/stateSync.ts) запускается приложением для точного
совпадения currentUser.id и Google/Apple server subject. Этого совпадения
недостаточно для HTTP: отправитель отдельно проверяет свежий `/api/me`.
Нужны user.sub, hasAccess=true и stateSync с protocol=2, guard=1,
тем же accountId и строковым sessionId. Старый сервер без capability
оставляет операции локально; текущий экран не назначает владельца legacy.

`stateSync.sessionId` — SHA-256 с разделителем назначения от subject и sid.
Это публичная привязка к одной серверной сессии, не cookie и не raw sid.
PUT/DELETE передают ожидаемые account/session в заголовках. Сервер снова
проверяет реальную сессию и сравнивает привязку перед state-чтением/мутацией.
Смена cookie между `/me` и запросом приводит к 401, без записи другого аккаунта.
Прежние клиенты без обоих заголовков пока допускаются для совместимости.

## Несколько вкладок и поздние ответы

IDB хранит active-session и монотонный auth-fence. `/me` начинается с чтения
fence; его результат принимается транзакцией только при неизменной границе.
При гонке доказательство не переиспользуется: выполняется новое чтение `/me`.
Одинаковые проверенные account/server session используют общий sessionEpoch;
обычное открытие второй вкладки не отменяет первую.

Новая серверная сессия, возобновление паузы и logout меняют границу.
Logout останавливает локальный sender и инвалидирует общую IDB-сессию;
известная вышедшая server session не активируется снова тем же доказательством.
Поздний HTTP-ответ всё равно проходит транзакционный finish с проверкой opId,
account, epoch, attempt, writer, payload и revision. Старая сессия не подтверждает
новую попытку. Sending прежней epoch можно захватить заново сразу;
для той же epoch используется lease 30 секунд.

## HTTP и повторы

Claim коммитится до HTTP. Один запрос отправляет одну операцию; put и delete
не превращаются друг в друга. Успех требует ok=true, protocol=2, guard=1,
совпадающих account/session/key, верной exists и безопасной возрастающей
версии именно из ответа. baseVersion+1 не считается подтверждением.

| Исход | Сохранённое состояние |
|---|---|
| Проверенный ack | Операция удаляется, версия и причинно связанный потомок обновляются атомарно |
| 409 | conflicted; исходный payload/delete-intent остаётся, корректный server snapshot сохраняется |
| 401 | pending и общая auth-пауза; новые локальные записи разрешены |
| 403 ACCESS_REQUIRED | pending и пауза доступа |
| 403 FORBIDDEN_KEYSPACE, другие неповторяемые 4xx | failed с причиной, без удаления данных |
| 408/429/5xx, сеть/timeout | pending с backoff; после восьмой неудачной попытки failed |
| Непроверенный успешный ответ | pending и protocol-пауза, без продвижения версии |

Backoff: экспоненциальный предел до 60 секунд, jitter не менее 250 ms.
Retry-After (секунды или HTTP date) учитывается с общим пределом 15 минут.
Auth/access/protocol/legacy-паузы не расходуют счётчик транспортных повторов.
Свежая успешная проверка `/me` может возобновить соответствующую сессию.
HTTP не повторяется скрыто внутри transport; срок 12 секунд включает чтение
тела, размер ответа ограничен 1 MiB, redirects запрещены.

Lost response может дать 409 при повторе даже при совпадении значений.
Такой ответ сохраняет конфликт; клиент не выдумывает идемпотентный ack.
UI показывает ожидание, auth/access-паузу, ошибку отправки и конфликт отдельно
от отказа локального commit. Интервал чтения IDB также обновляет статус другой
вкладки; Web Locks и BroadcastChannel не нужны для корректного claim.

## Legacy и граница готовности

После свежего `/api/me` runtime импортирует legacy-источник. Владельцем записи
становится только аккаунт подтверждённой сессии, если ключ целиком начинается
с его префикса; остальные записи остаются в карантине. До отправки Service Worker
проверяет каждую вкладку того же origin по build id, затем migration сверяет
source snapshot и ledger. Если worker или любая вкладка не отвечает, операции
сохраняются в IDB, а отправка остаётся на паузе. Legacy-источник не удаляется.
Полный контракт описан [в документации миграции](legacy-migration.md).

Old/new bundle smoke с настоящей legacy-операцией пройден. Остаются остальные
writers/profile callbacks, UI повтора/разрешения, полный экспорт/импорт/очистка
и staging. Эта ветка не готова к выпуску. Browser API mock и fake IDB не
подтверждают реальную OAuth/D1-интеграцию.
Browser API mock и fake IDB не подтверждают реальную OAuth/D1-интеграцию.

Проверки: [sender](../tests/state_sync.test.ts),
[серверная привязка](../tests/state_session_guard.test.ts),
[браузер](../e2e/storage-durability.spec.ts).

## Автоматическая отправка и ручная проверка сессии

Дополнение [`f3930ec`](https://github.com/Michael-edel/FitFocus/commit/f3930ec64f7fa74f3aad352246aa18b92d2542b7): profile debounce вызывает `flushPending(accountId)`.
Он отправляет уже сохранённые операции через текущий sender, не вызывает
`verify` как ручной `syncNow` и не снимает auth-паузу таймером. Владение,
readGuard, epoch, claim/finish и серверный scope остаются обязательными.
Отсутствующая/другая сессия не активируется таким вызовом; старое поколение
не может сообщить об успешном завершении. Ручная синхронизация по-прежнему
вызывает свежий `/me`. Штатная координация sender и legacy не заменяется.

Диагностика выявила profile debounce → `syncNow` → `verify` после
`beforeunload`, до `pagehide`; WebKit выдавал native access-control сообщение.
Повторный proof убран именно из автоматического profile callback.
Глобальный CORS/pageerror фильтр и listener `beforeunload` не добавлены;
background sender и BFCache-контракт не менялись.
Чистый bootstrap/refresh не планирует такой flush: нужен pending intent.
Одноразовый suppress-флаг потребляется и для чистого снимка.
[Unit](../tests/state_sync.test.ts), [E2E](../e2e/profile-durability.spec.ts),
[результаты и границы](stabilization-progress.md).
