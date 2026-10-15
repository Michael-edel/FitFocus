# Сессия оплаты и смены тарифа

Документ описывает привязку открытия Stripe Checkout и административной смены
тарифа к login-сессии, из которой пользователь начал действие. Это один
компонент P0.5; он не закрывает остальные callbacks, полный lifecycle или выпуск.

## Capability и серверный scope

`GET /api/me` объявляет `billingSync: { protocol: 1, guard: 1 }`. Paywall
получает свежий `/api/me` proof относительно исходного `OutboxReadGuard`; новая
сессия того же account не принимается вместо исходной. До запроса клиент также
проверяет активность компонента и совпадение аккаунта с профилем.

`POST /api/billing/checkout` и `POST /api/admin/subscription` передают парные
`X-FitFocus-State-Account` и `X-FitFocus-State-Session`. Сервер сверяет их с
cookie-сессией через `requireStateUser` до создания Checkout session или
административной записи. Запросы старых клиентов без обоих заголовков пока
сохраняют прежнюю совместимость; они не получают защиту от смены сессии.

Ответы, кроме 401, получают `X-FitFocus-Billing-Protocol: 1`,
`X-FitFocus-Billing-Guard: 1` и публичный scope исходного запроса. Ответы
маркированы `Cache-Control: no-store`. Новый клиент проверяет оба capability
marker и scope, повторно проверяет IndexedDB auth-fence и текущий callback до
возврата Checkout URL или локального обновления тарифа. Stripe URL принимается
только по HTTPS с хоста `checkout.stripe.com`. Запросы-мутации выполняются один
раз без автоматических повторов.

Закрытие окна тарифа и размонтирование paywall инвалидируют незавершённый
checkout callback. Поздний URL не открывается после входа в другую учётную
запись.

## Проверки и границы

- Транспорт и capability: [billing session tests](../tests/billing_session.test.ts).
- Серверный checkout scope и response markers: [billing checkout tests](../tests/billing_checkout.test.ts).
- Административная смена тарифа: [admin session tests](../tests/admin_sessions_subscription.test.ts).
- Поздний Stripe URL при входе другого аккаунта: [account-switch E2E](../e2e/family-callback-account-switch.spec.ts).
- Исходники: [paywall](../PaywallDialog.tsx), [transport](../services/billingSession.ts), [checkout route](../functions/api/billing/checkout.ts), [admin route](../functions/api/admin/subscription.ts).

Локальная приёмка текущего дерева поверх `9fb0cff`: 18 профильных unit-тестов
в трёх файлах, typecheck, API invariants, auth scope и admin guards прошли.
Новый E2E прошёл 3/3 на desktop Chromium, Firefox и WebKit без retries; четыре
не-desktop проекта пропущены по условию теста. Полный CI `9fb0cff` ещё не
подтверждает этот незакоммиченный код. Старые bundles, staging, реальный Stripe
checkout, полный lifecycle и release acceptance остаются открытыми.
