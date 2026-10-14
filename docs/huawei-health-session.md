# Сессия Huawei Health

Обновлено: 15.10.2026. Контракт связывает Settings, Huawei OAuth и профильные
изменения с тем аккаунтом и входом, которые начали действие. Это один callback
P0.5; он не закрывает остальные writers, полный lifecycle, staging или выпуск.
Результаты текущей ревизии зафиксированы в [журнале стабилизации](stabilization-progress.md).

## Клиентский scope

Перед каждым действием Settings вызывает `prepareHuaweiSession` с исходным
`loginGuard`. `/api/me` обязан подтвердить `huaweiSync: { protocol: 1,
guard: 1 }`; новый клиент не угадывает текущий аккаунт и не продолжает работу
при несовпадении account/session, epoch или auth-fence в IndexedDB.

Каждый запрос передаёт `X-FitFocus-State-Account` и публичный
`X-FitFocus-State-Session`. Ответ должен включать `X-FitFocus-Huawei-Protocol: 1`,
`X-FitFocus-Huawei-Guard: 1` и точное эхо обоих scope headers. Чтения и мутации
ограничены по времени и размеру тела; статус, connect, sync и disconnect не
повторяются автоматически.

Попытка принадлежит своей React-сессии и отменяется при смене Settings scope,
размонтировании или `pagehide`. После `pageshow` из BFCache статус загружается
заново. Поздний ответ не меняет UI. Возвращённый профиль записывается только
через `OutboxCommitGuard` с исходным `readGuard`; обычный незащищённый profile
commit не используется.

## Серверные endpoints

| Endpoint | Поведение |
|---|---|
| `GET /api/wearable/huawei/status` | Проверяет scoped session до чтения соединения; legacy-запросы без scope совместимы. |
| `POST /api/wearable/huawei/start` | Проверяет scope и возвращает authorization URL в JSON для безопасного redirect клиентом. |
| `GET /api/wearable/huawei/start` | Сохраняет совместимость старого redirect-потока; его OAuth state также привязывается к исходной сессии. |
| `GET /api/wearable/huawei/callback` | Подписанный OAuth state хранит user id и публичный digest session id. Callback сверяет их до обмена code и повторно проверяет активный вход после внешнего обмена до записи credentials/profile. |
| `POST /api/wearable/huawei/sync` | Проверяет scope до чтения токена и повторно после запроса к Huawei до CAS-записи профиля. |
| `POST /api/wearable/huawei/disconnect` | Проверяет scope до изменения соединения и профиля. |

`requireStateUser` сравнивает переданные account/session с cookie-сессией;
несовпадение или неполная пара отклоняется до прикладного действия. Ответы
scoped endpoints помечаются Huawei protocol/guard и эхо scope. Старые запросы
без scope остаются совместимыми, но не получают эту защиту. OAuth state не
содержит raw sid, токенов или данных здоровья.

## Регрессии и границы

- Задержанный Huawei sync аккаунта A после входа B в соседней вкладке не создаёт
  профильную outbox-запись, не меняет активный профиль и не показывает success.
- Сервер отклоняет несовпадающий scope до обращения к provider API или записи
  профиля; scoped OAuth start возвращает ожидаемый signed session digest.
- OAuth callback с другим session digest отвергается до обмена кода и сохранения
  Huawei credentials.
- Проверки находятся в [transport tests](../tests/huawei_session_transport.test.ts),
  [API/server tests](../tests/huawei_health_api.test.ts) и
  [Huawei route tests](../tests/huawei_health.test.ts). Двухвкладочный сценарий —
  [account-switch E2E](../e2e/ai-callback-account-switch.spec.ts).

На кодовом SHA `455cb01` прошли 26 профильных unit/API-тестов и выбранная
account-switch матрица 15/15 в Chromium, Firefox и WebKit без retries.
Полный точный PR CI завершился success: [run 38656586334](https://github.com/Michael-edel/FitFocus/actions/runs/38656586334),
включая E2E и rollback/CAS; preview опубликован. Подробные счётчики и границы
проверок записаны в [журнале стабилизации](stabilization-progress.md).

Mock E2E не проверяет настоящий Huawei OAuth, отозванные credentials,
устройство, BFCache во всех браузерах, staging или production. Полный PR CI
на `455cb01` прошёл, но не заменяет эти интеграционные проверки. Общий P0.5 и выпуск остаются
открытыми; см. [TASKS](../TASKS.md#p05--защититься-от-запоздавших-ответов).
