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

### Read-only preview smoke: `8dfab60`, 16.10.2026

Текущий branch preview `https://fix-durable-outbox.fitfocus.pages.dev/`
ответил 200. Страница загрузила `/assets/index-B8tzhvK0.js`; bundle содержит
точный SHA `8dfab604c97f90f6720e8185f0366bbe61b9383d`. GET `/api/env` и
анонимный GET `/api/me` ответили 200; `/api/me` вернул `user: null`. `/api/env`
вернул пустые `googleClientIdLocal`/`googleClientIdProd` и `requireInvite: false`.
Анонимные GET `/api/bootstrap`, `/api/profile`, `/api/state` и `/api/push/status` ответили
401 без `Location` и `Set-Cookie`. Проверка выполнялась без cookie/account proof;
API-запросы остались на выбранном preview origin.

Это подтверждает deployed bundle SHA, ответ страницы и перечисленные публичные
GET-маршруты. OAuth start намеренно не вызывался. D1 binding, серверный `APP_URL`,
OAuth callback, edge rules для всех путей, миграции и тестовые аккаунты не
подтверждены; staging и выпуск остаются открытыми.

### Read-only preview smoke: `0af2c30`, 17.10.2026

Branch preview `https://fix-durable-outbox.fitfocus.pages.dev/` ответил 200;
статический bundle `/assets/index-BuAwXyl-.js` содержит точный SHA
`0af2c30401c9893d1b49778111921e10df4ebef4`. Все проверки были GET без cookie,
account proof и записи:

- `/api/env` — 200, оба публичных Google Client ID пусты, `requireInvite=false`;
- `/api/me` — 200 с `user: null`, без redirect и `Set-Cookie`;
- `/api/bootstrap`, `/api/profile`, `/api/state`, `/api/push/status` — 401
  `UNAUTH`, без redirect и `Set-Cookie`.

Свежий Chromium browser smoke загрузил эту же страницу с HTTP 200: `title=FitFocus`,
главная страница отрисована, `pageerror` и ошибки приложения не возникли,
POST/PUT/PATCH/DELETE не отправлялись. Браузер вывел одно предупреждение о
неизвестной ему директиве `ambient-light-sensor` в `Permissions-Policy` из
`public/_headers`; оно не сопровождалось ошибкой страницы или приложения.

Публичный preview обслуживает точный текущий branch bundle, сохраняет origin и
ожидаемо закрывает перечисленные API без сессии. OAuth start не вызывался.
Проверка не подтверждает D1 binding/изоляцию, `APP_URL`, OAuth callback,
реальные edge rules, миграции или корректность аутентифицированных операций;
staging acceptance и выпуск остаются открытыми.

### Read-only preview API smoke: `dfe9b42`, 17.10.2026

Branch preview `https://fix-durable-outbox.fitfocus.pages.dev/` ответил 200;
статический bundle `/assets/index-i0UhY7Pn.js` содержит полный SHA
`dfe9b42c97600e606ad5758672e9cc707f86ac16`. Проверка выполнена `HttpClient` с
отключёнными auto-redirect и cookie и только GET-запросами:

- `/api/env` и `/api/me` — 200;
- `/api/bootstrap`, `/api/profile`, `/api/state`, `/api/push/status` — 401;
- все запросы остались на `fix-durable-outbox.fitfocus.pages.dev`, без `Location`
  и `Set-Cookie`.

Это подтверждает доставку точного bundle и выбранные read-only API-маршруты.
Браузерный smoke текущего SHA, все edge-маршруты, D1 binding/изоляция,
`APP_URL`, OAuth, миграции и аутентифицированные операции не проверены;
staging acceptance и выпуск остаются открытыми.

Проверка конфигурации репозитория показывает один верхнеуровневый D1 binding
`DB` (`database_name = "fitfocus"`, ID `061ae786-9341-4bd7-8efe-025dd1bac6d5`);
`env.preview`/`env.production` overrides в `wrangler.toml` отсутствуют.
[Документация Cloudflare Pages](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
говорит, что Wrangler file становится источником конфигурации Pages после
включения этого режима; preview overrides задаются через `env.preview`, а
branch-specific config Pages не поддерживает. Без чтения текущей конфигурации
Cloudflare аккаунта нельзя утверждать, применён ли этот файл к deployment и
разделена ли preview D1 с production. До подтверждения dashboard/API preview
нельзя считать изолированной серверной средой. D1-запросы к живой базе не
выполнялись.

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
