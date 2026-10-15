# Origin preview и приёмка staging

Сверено: 15.10.2026. Ветка `fix/durable-outbox`, база рабочего компонента —
`aefc46320de11b83ffdb274e7dae1a911e69612e`. Компонент проверяется локально;
опубликованный SHA и CI фиксируются в [статусе](project-status.md).

## Исправляемое поведение

Прежний [entry point](../index.tsx) безусловно переводил любой неканонический
`*.pages.dev` на `https://fitfocus.pages.dev`, сохраняя path/query/hash.
Поэтому открытие preview не проверяло нужную сборку и могло привести
пользователя на production. Переход выполнялся ещё до монтажа приложения.

В текущем компоненте этот клиентский redirect удалён. Приложение остаётся
на origin, с которого загружено. Относительные API-запросы используют этот
origin; UI сохраняет path/query/hash. Новый флаг окружения для этого не нужен.
Серверный OAuth и конфигурация Cloudflare этим изменением не перенастраиваются.

IndexedDB и Service Worker изолированы браузером по origin. Cookies имеют
собственные правила host/domain/path/Secure; сама смена origin не доказывает
изоляцию cookies или серверной сессии. Данные IDB production не появляются
автоматически на другом hostname.
Разные branch/commit preview также не образуют общий IDB-контекст.
Проверка старой и новой сборок для миграции требует **одного origin и browser
context**, как указано в [чек-листе выпуска](../RELEASE_CHECKLIST.md).

## Что проверяет локальная регрессия

[preview-origin.spec.ts](../e2e/preview-origin.spec.ts) загружает actual
production build под тремя перехваченными HTTPS-origin:
branch preview, commit preview и основной hostname. Все статические байты
приходят с локального Vite preview `http://127.0.0.1:4173`; API/SW используют
обычную app-фикстуру. Context route запрещает любые обращения к другому
origin или непокрытому API, поэтому реальные Pages/production не используются.

Проверяются URL с query/hash, заголовок FitFocus, доступный экран настроек,
переключение темы, origin API-запросов, отсутствие framework overlay,
неожиданных запросов и pageerror/console warning/error. Снимок и origin-proof
сохраняются во внешнем каталоге результатов.

RED на исходном `aefc463`: branch preview/desktop Chromium, workers=1/retries=0,
1 failed. Trace содержит preview HTML=200, затем запрещённый переход на
`https://fitfocus.pages.dev/?source=preview-smoke`=502 от самого теста.
После удаления redirect тот же сценарий прошёл: 1 passed, 3,9 с теста.
Это воспроизведение дефекта, а не падение из-за DNS или production-сервера.

Первая полная матрица дала 25 passed / 3 failed: Firefox передавал исходный
Host при получении локальных статических байтов, и Vite возвращал 403.
Исправлен только Host запроса фикстуры к localhost; allowedHosts не ослаблен.
Повтор трёх Firefox-сценариев прошёл 3/3. Итоговая матрица — **28 passed**,
2,8 мин, семь конфигураций, workers=1/retries=0: 21 проверка origin и семь
native PWA-shell. В итоговом логе нет preview ECONNREFUSED/proxy errors.
Результат относится к компоненту поверх указанной базы, а не к CI этой базы.

```text
npm run test:e2e -- e2e/preview-origin.spec.ts e2e/pwa-shell.spec.ts --workers=1 --retries=0
npm run typecheck
```

Локальные логи: `preview-origin-red.log`, `preview-origin-green.log`,
`preview-origin-matrix.log`, `preview-origin-firefox-fixed.log`,
`preview-origin-matrix-final.log`, `preview-origin-final-typecheck.log` во внешнем
`C:\Users\User\Documents\Codex\2026-09-17\yf\outputs`.
Root typecheck и 15 admin guards прошли. Browser plugin not available;
использован существующий Playwright 1.61.1, Node v24.19.0.

Просмотрены итоговые снимки desktop Chromium (1280×720) и iPhone Safari
(390×664, DPR 3). Экран настроек отображается, выбор темы доступен;
мобильный снимок сделан после прокрутки к кнопке темы. Эти снимки не являются
полной визуальной приёмкой остальных экранов или подтверждением доставки
изменения серверу: app-фикстура оставляет запись локально ожидающей.

Эта подмена hostname не проверяет реальный DNS/TLS или deployed Cloudflare
redirect rules. Native PWA-shell проверяется отдельно настоящим SW/native
HTTP на localhost; это не проверка SW установленного preview на устройстве.

## Обязательная приёмка целевого окружения

### Read-only preview smoke: `45575d2`, 15.10.2026

Публичный preview `https://fix-durable-outbox.fitfocus.pages.dev/` ответил 200.
Production JS bundle содержит полный SHA `45575d2e75d9abfadbba804d1ac26d2c8a86d467`.
В desktop Chromium страница FitFocus отрисовалась на том же origin; нажатие
«Что нового» открыло changelog, который показал `45575d2e`. `/api/env` и
анонимный `/api/me` запрашивались с `fix-durable-outbox.fitfocus.pages.dev`;
`/api/me` вернул `user: null`, не выполнив redirect. При загрузке не было
POST/PUT/PATCH/DELETE; браузер сообщил только предупреждение, что его сборка не
распознаёт Permissions-Policy `ambient-light-sensor`.

Это подтверждает текущий bundle, первый экран и эти GET-маршруты на preview
origin; оно не доказывает edge-правила для всех путей, D1 binding, `APP_URL`,
OAuth callback, безопасный тестовый аккаунт или миграции. Wrangler не смог
получить deployment metadata в non-interactive shell без
`CLOUDFLARE_API_TOKEN`; конфигурацию Pages/D1 через dashboard не меняли.
Поэтому staging acceptance ниже остаётся незавершённой.

### Read-only API smoke: `9c78726`, 16.10.2026

Проверен commit preview `https://2d2f058c.fitfocus.pages.dev/`: корень ответил
200, а `assets/index-DA9SX_GT.js` содержит полный SHA
`9c78726fd6acb65b12a5ddbeb63e5c2afe9c8545`. В Chromium на этом же origin
отрисовался экран входа FitFocus без console/page errors; ссылка Google OAuth
содержит redirect на этот preview hostname.

Все API-запросы ниже — GET, без cookie или account proof:

- `/api/env` — 200; `requireInvite=false`, публичные Google client IDs не
  настроены.
- `/api/me` — 200 с `user: null`, без redirect.
- `/api/bootstrap`, `/api/profile`, `/api/state`, `/api/push/status` — 401
  `UNAUTH`; bootstrap/profile/state также возвращают ожидаемые protocol/guard
  headers.
- `/api/auth/google/start` — 500 `AUTH_UNAVAILABLE`; ответ не установил cookie.
  OAuth redirect к Google не открывался. Код маршрута возвращает этот ответ,
  если отсутствует `GOOGLE_CLIENT_ID` или `AUTH_JWT_SECRET`; по публичному
  ответу определить, какая именно переменная не задана, нельзя.

Статическая сборка и анонимный отказ API подтверждены. Реальный OAuth, D1,
серверный `APP_URL`, callback и edge rules остаются незавершёнными; preview
сейчас не позволяет пройти OAuth start.

- [ ] Подтвердить адрес и точный build SHA preview; браузер и edge-правила
  не переводят его на production, API-запросы остаются на выбранном origin.
- [ ] Проверить D1 binding конкретного deployment и безопасные тестовые
  аккаунты. Другой hostname сам по себе не создаёт другую серверную базу.
- [ ] Проверить серверный `APP_URL`, если он задан: он должен выбирать нужный
  origin среды. [OAuth start](../functions/api/auth/_oauth_start.ts) использует
  его прежде request origin; production APP_URL может увести OAuth на production
  даже после исправления entry point. Client `VITE_*` его не настраивает.
- [ ] Сверить Google/Apple callback URLs и выполнить реальный login/logout
  в нужной среде. Мок клиента не подтверждает настройки провайдера.
- [ ] Пройти API/protocol, backup/restore, миграции, lifecycle и совместимый
  rollback по [RELEASE_CHECKLIST](../RELEASE_CHECKLIST.md).

До этих проверок staging и выпуск не подтверждены. Сохранение origin —
один критерий общего [плана P0](../TASKS.md), не закрытие всех release gates.
