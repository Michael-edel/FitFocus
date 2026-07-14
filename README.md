# FitFocus

FitFocus - PWA-приложение для питания, прогресса, ИИ-плана, семейного меню, push-уведомлений, поддержки и администрирования.

Документ обновлен после локальной проверки проекта и текущего пакета исправлений 14.07.2026.

Текущая проверенная ревизия:

- Ветка: `main`
- Актуальная ревизия: определяется командой `git log -1 --oneline` на текущем `HEAD`
- Версия из `package.json`: `2.0.0-architecture.0`
- Основная среда развертывания: Cloudflare Pages + функции Cloudflare Pages + D1

## Статус проверки

Проверка выполнялась по локальному исходному коду без выдуманных данных продакшена.

Объем проекта без `node_modules`, `dist`, `coverage`:

- 330 файлов.
- 227 файлов `.ts`.
- 40 файлов `.tsx`.
- 20 файлов `.sql`.
- 30 таблиц в `db/schema.sql`.
- 20 файлов миграций D1 в `migrations/`.

Автоматические проверки:

| Проверка | Результат |
|---|---:|
| Текущий пакет изменений | API auth/AI/export/Huawei/support/billing/state/profile/account/logout/support-attachments, privacy-check, E2E smoke и `README.md` |
| `npm run check:api-invariants` | пройдено |
| `npm run check:auth-scope` | пройдено |
| `npm run check:schema` | пройдено, 20 миграций / 30 таблиц |
| `npm run check:privacy` | пройдено, 27 пользовательских таблиц |
| `npm run typecheck` | пройдено |
| `npm run test:unit` | пройдено, 50 файлов / 202 теста |
| `npm run test:e2e -- e2e/onboarding.spec.ts e2e/push-settings.spec.ts` | пройдено, 11 passed / 3 skipped |
| `npm run build` | пройдено |
| `npm audit --omit=dev` | не запускалось в текущем пакете |

Подтвержденных критических ошибок по этим проверкам не найдено. Это не означает, что в продукте нет ошибок выполнения на отдельных устройствах: автоматические E2E-проверки есть, но они покрывают не все реальные браузеры, прошивки и OEM-ограничения мобильных устройств.

## Последний пакет изменений

Пакет от 14.07.2026:

- Публичные ошибки Google/Apple OAuth и `/api/ai` больше не раскрывают названия secrets/env-переменных.
- Apple OAuth callback `form_post` читает body через bounded parser с лимитом 32 KB.
- `/api/export` больше не включает `admin_note`, назначенного админа, `admin_sessions`, `admin_events` и внутренние ключи хранения вложений поддержки.
- Сообщения поддержки в `/api/export` ограничены обращениями самого пользователя.
- Huawei Health status/sync больше не используют `SELECT *`; status не читает зашифрованные token-поля.
- Админский PATCH поддержки больше не использует `SELECT *` для чтения обращения.
- Пользовательский reply в поддержку больше не возвращает имя oversized-вложения в публичной ошибке.
- Stripe webhook больше не возвращает наружу raw детали ошибки проверки подписи.
- `/api/state` и `/api/profile` больше не возвращают запрещенный state key в ответе `FORBIDDEN_KEYSPACE`.
- `/api/logout_all` и `/api/account/delete` больше не возвращают клиенту raw auth/config/delete exception text.
- Вложения поддержки больше не классифицируют oversized-файлы через строковый `Error.message` с именем файла; используется типизированная ошибка.
- `check:privacy` явно различает таблицы, которые нужно очищать при удалении аккаунта, и admin-only таблицы, которые нельзя отдавать в пользовательском экспорте.
- Production E2E smoke для onboarding и push settings синхронизирован с текущими экранами и моками.
- README синхронизирован с текущими проверками: 20 миграций, 30 таблиц, 50 unit-файлов и 202 теста.

Фактически выполненные проверки для этого пакета:

| Проверка | Результат |
|---|---:|
| `npm run check:api-invariants` | пройдено |
| `npm run check:auth-scope` | пройдено |
| `npm run check:schema` | пройдено, 20 миграций / 30 таблиц |
| `npm run check:privacy` | пройдено, 27 пользовательских таблиц |
| `npm run test:unit` | пройдено, 50 файлов / 202 теста |
| `npm run typecheck` | пройдено |
| `npm run test:e2e -- e2e/onboarding.spec.ts e2e/push-settings.spec.ts` | пройдено, 11 passed / 3 skipped |
| `npm run build` | пройдено |

## Предыдущие пакеты изменений

Пакет от 02.07.2026:

- Проверены клиентские отправки `fetch`, серверные API-ответы и маршруты поддержки, push, Huawei Health и Stripe checkout.
- Пользовательский `/api/support/feedback/my` больше не возвращает admin-only поля и системную диагностику; используется явный публичный serializer.
- Форма поддержки хранит пользовательский текст отдельно от системной диагностики; диагностика уходит в `admin_note` для админки.
- `/api/push/status` и Huawei routes больше не раскрывают имена Cloudflare env-переменных в пользовательских ответах.
- `/api/billing/checkout` больше не возвращает raw exception message клиенту.
- README синхронизирован с текущими проверками: 20 миграций, 30 таблиц, 49 unit-файлов и 192 теста.

Пакет от 01.07.2026:

- Локальный legacy-снимок `fitfocus_data_<user>_all_users` больше не зеркалится в `/api/state`.
- Серверный keyspace `/api/state` и `/api/profile` больше не принимает `_all_users` как синхронизируемый ключ.
- `GET /api/state?prefix=...` фильтрует старые `_all_users` записи, если они уже были в D1.
- Клиентская очередь state sync дедуплицирует повторные записи одного ключа и делает паузу после `401/403`, чтобы не плодить десятки одинаковых запросов при истекшей сессии.
- README синхронизирован с текущими проверками: 20 миграций, 30 таблиц, 49 unit-файлов и 190 тестов.

Пакет от 28.06.2026:

- Добавлена публичная страница политики конфиденциальности `/privacy.html`.
- Добавлен экран `Конфиденциальность` внутри PWA.
- Ссылки на политику добавлены до отправки пользовательских данных: на экране входа и в онбординге.
- Добавлен Cloudflare Pages файл `public/_headers` для статических PWA-ответов: HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP.
- Shared API JSON helper теперь добавляет `no-store`, `nosniff`, `no-referrer` и `Cross-Origin-Resource-Policy`.
- OAuth-маршруты Google/Apple больше не возвращают клиенту upstream `details` от провайдера и внутренние тексты исключений.
- Экспорт пользователя больше не отдает push credentials `endpoint`, `p256dh`, `auth`.
- Экспорт поддержки переведен с `SELECT *` на явные списки колонок.
- Example env-файлы больше не содержат персональный bootstrap admin email и слабый пример `AUTH_JWT_SECRET`.
- Добавлен unit-тест `tests/security_privacy.test.ts`, который фиксирует security headers, privacy page, суженный экспорт и отсутствие OAuth details.

Фактически выполненные проверки для этого пакета:

| Проверка | Результат |
|---|---:|
| `npm run test:unit -- tests/security_privacy.test.ts tests/google_auth_admin.test.ts tests/apple_auth_admin.test.ts tests/oauth_state.test.ts tests/oauth_start.test.ts` | пройдено, 5 файлов / 14 тестов |
| `npm run check:api-invariants` | пройдено |
| `npm run check:auth-scope` | пройдено |
| `npm run check:schema` | пройдено, 19 миграций / 29 таблиц |
| `npm run check:privacy` | пройдено |
| `npm run test:unit` | пройдено, 46 файлов / 177 тестов |
| `npm run typecheck` | пройдено |
| `npm run build` | пройдено |
| `npm audit --omit=dev` | пройдено, 0 уязвимостей |

## Архитектура

Клиентская часть:

- React 19.
- TypeScript.
- Vite 6.
- Tailwind CSS.
- `vite-plugin-pwa` с режимом `injectManifest`.
- Сервис-воркер PWA в `sw.ts`.

Серверная часть:

- Функции Cloudflare Pages в `functions/api`.
- Привязка D1: `DB`.
- Миграции D1 в `migrations/`.
- Runtime-конфигурация в `wrangler.toml`.
- Security headers для статических Pages assets: `public/_headers`.

Хранилище:

- Основные облачные данные: Cloudflare D1.
- Быстрый локальный слой: `localStorage`.
- Синхронизируемое состояние: `/api/state`, `/api/bootstrap`, `/api/profile`.
- Локальный legacy-снимок `fitfocus_data_<user>_all_users` не синхронизируется в облако и используется только как локальный кэш.
- Резервное копирование/экспорт: JSON-снимок из `localStorage`.

ИИ:

- Серверный прокси `/api/ai`.
- Модель Gemini по умолчанию: `gemini-2.5-flash`.
- Разрешенные модели: `gemini-2.5-flash`, `gemini-2.5-pro`.
- Логи ИИ пишутся в `ai_events`.
- Есть ограничения частоты запросов, контроль бюджета, резервный режим и аварийный резервный режим.

Push:

- Web Push без Node-only runtime в Worker: отправка реализована через Web Crypto в `functions/api/_lib/push.ts`.
- Пользовательские маршруты: `/api/push/status`, `/api/push/subscribe`, `/api/push/unsubscribe`, `/api/push/test`.
- Админская рассылка: `/api/admin/push/send`.

E2E:

- Playwright-конфигурация в `playwright.config.ts`.
- Контур production E2E в `e2e/`.
- Проверяемые сценарии: PWA shell, onboarding, push settings.
- Целевые профили: desktop Chromium/Firefox/WebKit, Android Chrome/PWA, iPhone Safari, установленный iPhone PWA.

## Основные функции

### Авторизация и аккаунт

Реализовано:

- Старт и callback Google OAuth.
- Старт и callback Apple Sign In.
- HttpOnly cookie `ff_session`.
- D1-сессии с отзывом сессий.
- Mobile bearer token для bridge-клиентов: `/api/mobile/token`.
- Beta invite-коды и их активация.
- Мягкое удаление аккаунта с восстановлением через повторную OAuth-авторизацию.
- Запланированное жесткое удаление через `/api/internal/cleanup_deleted`.
- Защита от удаления последнего администратора.
- Блокировка удаления владельца активной семьи без передачи или удаления семьи.

### Онбординг и ИИ-план

Реализовано:

- Один экран базовых параметров.
- Поля: вес, рост, возраст, пол, цель, целевой вес, активность.
- Нули в числовых полях скрываются как пустое значение.
- Целевой вес рассчитывается автоматически и может быть изменен вручную.
- Создание облачного профиля.
- Создание ИИ-плана через `generatePersonalPlan`.
- Резервный ИИ-план при ошибке ИИ.
- После успешного сохранения профиль переводится в состояние приложения и открывается вкладка `План`.

Ограничение проверки: нет отдельного device-specific E2E именно для Galaxy S23+; есть общий Playwright-сценарий Android onboarding.

### Питание и фото еды

Реализовано:

- Экран `Питание`.
- Загрузка фото.
- Съемка фото через `ui/components/CameraCapture.tsx`.
- Резервные camera constraints для камеры.
- Русские сообщения для `NotAllowedError`, `NotFoundError`, `NotReadableError`, `AbortError`.
- Предупреждение для HEIC/HEIF.
- ИИ-анализ еды по фото.
- Расчет КБЖУ.
- Оценка уверенности и качества изображения.
- История приемов пищи.
- Группировка по приемам пищи.
- Перемещение блюда между `breakfast`, `lunch`, `dinner`, `snack`.
- Корректировка блюда: название, КБЖУ, ингредиенты, заметки, прием пищи.
- Пометка `Не еда`, при которой КБЖУ обнуляется и запись не учитывается.
- Для записи, уже помеченной как `Не еда`, снятие галочки не восстанавливает AI-калории автоматически; чтобы перевести запись в еду, нужно вручную заполнить КБЖУ или состав.

### ИИ Совет и ИИ-функции

Реализовано:

- ИИ Совет.
- ИИ-консилиум.
- Советы тренера.
- Интерпретация еженедельной аналитики.
- Генерация недельного меню.
- Генерация семейного недельного меню.
- Объяснение плато.
- Рецепт по фото.
- Клиентское состояние повтора ИИ-запроса и паузы.
- Серверные ограничения частоты ИИ-запросов.
- Серверное логирование стоимости ИИ.
- Админский контроль бюджета ИИ.

### План

Реализовано:

- Вкладка `План`.
- Персональный ИИ-план.
- Резервный план.
- Целевые показатели на основе профиля.
- Отображение стратегии, фокуса, шаблона питания и задач.
- Ввод и изменение параметров профиля через настройки.

### Прогресс

Реализовано:

- Вес.
- История веса.
- Замеры тела.
- Давление.
- Пульс.
- Сахар.
- Фото прогресса.
- Архив прогресса.
- Графики через Recharts.
- Обзорные графики без входных Recharts-анимаций, чтобы прокрутка на мобильных не дергалась.
- Карточка `Food Streak` имеет устойчивую мобильную раскладку; длинная серия не расширяет экран.
- Еженедельные отчеты.
- PDF-отчеты через jsPDF.

### Рецепты

Реализовано:

- Экран рецептов.
- Генерация рецепта по фото.
- Избранные рецепты.
- Интеграция с ИИ.

### Зал и курс

Реализовано:

- Вкладка `Зал`.
- Вкладка `Курс`.
- Уроки и модальное окно урока.
- Базовая структура задач и курса.

### Семья

Реализовано:

- Создание семьи.
- Участники семьи.
- Семейные invite-ссылки и коды.
- Сценарий присоединения.
- Проверки тарифа Family.
- Семейное меню.
- Порции.
- Список покупок.
- Группировка списка покупок по отделам магазина.
- Отметки покупок.
- Купленные товары остаются в своём отделе, но уходят ниже некупленных; фильтр `Только некупленное` скрывает их полностью.
- Экспорт списка покупок.

### Push-уведомления

Реализовано:

- Включение и переподключение push на поддерживаемом устройстве.
- Отключение push на устройстве.
- Проверка статуса VAPID-конфигурации.
- Тестовая отправка пользователю.
- Отображение метки устройства и браузера.
- Предупреждение для iPhone/iPad Safari: push-кнопки не работают в обычной вкладке Safari, нужен установленный PWA с домашнего экрана.
- На Android текст помощи указывает, что push работает в браузере и PWA при включенных разрешениях.
- Админская рассылка всем или сегменту.
- Проверка без отправки перед реальной отправкой.
- Очистка устаревших push-подписок при 404/410.
- Фильтры рассылки: поиск, статус, план, wearable, сахар, замеры, роль, familyId, устройство, браузер, userIds.
- Сортировка рассылки: обновление, создание, последняя отправка, email, устройство, браузер, план.
- URL для push выбирается из меню разделов приложения.

### Поддержка

Реализовано:

- Пользовательская форма обращения.
- Категория, раздел, тема, описание, шаги воспроизведения, контакт.
- Автоматическая клиентская диагностика: URL, User-Agent, platform, viewport, screen, PWA mode, service worker, Push API, permission, build.
- Серверная диагностика: User-Agent, Sec-CH-UA, platform, mobile, Cloudflare country/ray, timestamp.
- Вложения: фото, видео, голос, файл.
- Ограничение до 3 вложений.
- Сжатие изображений.
- Встроенное хранение вложений до 2 MB.
- Опциональный R2 bucket `SUPPORT_ATTACHMENTS`.
- Пользовательская история обращений.
- Админская обработка обращений: статус, приоритет, назначение, внутренняя заметка, ответ клиенту.

### Админка

Реализовано:

- Статистика.
- Список пользователей.
- Карточка пользователя.
- Сессии.
- Роли.
- Подписки.
- Feature flags.
- Runtime settings.
- AI logs.
- AI cost.
- AI Budget Guard.
- Invite-коды.
- Push-рассылка.
- Поддержка.
- Admin audit events.
- Account cleanup.

Админские маршруты проверяют:

- `requireUser`.
- `requireRole(user, "admin")`.
- `requireAdminRequest`.

### Тарифы и оплата

Реализовано:

- Тарифы `free`, `pro`, `family`.
- Stripe Checkout для `pro`, `pro_yearly`, `family`.
- Stripe webhook для событий создания, обновления и удаления подписки.
- Обновление D1 `subscriptions`.
- Админское изменение подписки.

Зависит от внешней настройки Stripe secrets и price ids.

### Wearable / Health

Реализовано:

- UI выбора провайдера: Apple Health, Huawei Health, Google Fit, Fitbit, Garmin, Ручной импорт.
- Маршрут `/api/wearable/sync`.
- Mobile bearer auth через `/api/mobile/token`.
- Нормализация snapshot: steps, active minutes, sleep hours, pulse, glucose, weight.
- Запись wearable metrics в профиль.
- Native iOS HealthKit bridge в `mobile/ios-healthkit-bridge`.
- Huawei Health server-side OAuth routes:
  - `/api/wearable/huawei/status`
  - `/api/wearable/huawei/start`
  - `/api/wearable/huawei/callback`
  - `/api/wearable/huawei/sync`
  - `/api/wearable/huawei/disconnect`
- D1-таблица `wearable_connections` для server-side provider tokens. Huawei access/refresh tokens шифруются перед записью.
- Huawei endpoints дополнительно создают `wearable_connections` и индексы через `CREATE ... IF NOT EXISTS`, чтобы рассинхронизация remote D1 не приводила к Cloudflare 1101.

Для Huawei Health нужны Cloudflare variables/secrets:

- `HUAWEI_HEALTH_CLIENT_ID`
- `HUAWEI_HEALTH_CLIENT_SECRET`
- `HUAWEI_HEALTH_SCOPES`
- `HUAWEI_HEALTH_REDIRECT_URI`, если callback отличается от `<APP_URL>/api/wearable/huawei/callback`
- `HUAWEI_HEALTH_TOKEN_SECRET`, опционально; если не задан, используется `AUTH_JWT_SECRET`

Опциональные override-переменные:

- `HUAWEI_HEALTH_AUTH_URL`
- `HUAWEI_HEALTH_TOKEN_URL`
- `HUAWEI_HEALTH_API_BASE_URL`
- `HUAWEI_HEALTH_STEPS_DATA_TYPE`
- `HUAWEI_HEALTH_ACTIVE_MINUTES_DATA_TYPE`
- `HUAWEI_HEALTH_SLEEP_DATA_TYPE`
- `HUAWEI_HEALTH_PULSE_DATA_TYPE`

Не реализовано в репозитории как полноценные интеграции провайдеров:

- Google Fit OAuth/API sync.
- Fitbit OAuth/API sync.
- Garmin OAuth/API sync.

Для Google Fit/Fitbit/Garmin есть UI-выбор и общая snapshot-модель, но нет полного server-side OAuth/provider polling flow. Huawei Health имеет OAuth flow и ручной server-side sync, но фактическая работа в production зависит от одобренного Huawei Health Kit приложения, выданных scopes и корректных Cloudflare secrets.

После добавления новых D1 migrations нужно применять их к remote D1 отдельно:

```bash
npx wrangler d1 migrations apply fitfocus --remote
```

### Резервные копии и PWA-кэш

Реализовано:

- Экспорт JSON backup.
- Импорт JSON backup.
- PWA-кэш для навигации и статических ресурсов.
- Best-effort autosave через File System Access API.
- Cloud-first модель: источником правды для авторизованного пользователя является D1/облако, локальное хранилище используется как быстрый слой и резервный снимок.

### Конфиденциальность и экспорт данных

Реализовано:

- Публичная политика `/privacy.html`.
- Экран `Конфиденциальность` внутри PWA.
- Ссылки на политику до входа и до создания AI-плана.
- Экспорт пользовательских данных через `/api/export`.
- Экспорт не отдает push credentials `endpoint`, `p256dh`, `auth`.
- Экспорт не отдает админские служебные таблицы `admin_sessions` и `admin_events`.
- Экспорт обращений поддержки не отдает `admin_note`, назначенного админа и внутренние ключи хранения вложений.
- Таблицы с пользовательскими данными контролируются проверкой `npm run check:privacy`.
- Пользовательский support API возвращает только публичные поля обращения и не отдает `admin_note`, назначенного админа или системную диагностику.
- Пользовательские status/config API не возвращают имена Cloudflare secrets/vars.

Ограничение:

- Юридические реквизиты оператора и отдельный внешний контакт должны быть заполнены владельцем проекта перед публичным коммерческим запуском.

Ограничения:

- `backup.ts` прямо содержит статус prototype.
- File handle не сохраняется между сессиями.
- Работа без сети как основной режим не заявлена: приложение использует cloud-first модель.

## Оценка готовности функций

Проценты ниже - инженерная оценка полноты реализации по текущему коду, тестам и проверенным маршрутам. Это не SLA и не статистика продакшен-использования.

| Область | Готовность | Фактическое основание |
|---|---:|---|
| PWA shell, навигация, сборка | 92% | React/Vite/PWA собирается, lazy chunks, сервис-воркер есть, production E2E shell есть |
| Авторизация, сессии, OAuth, invite | 85% | Google/Apple/session/invite/mobile-token маршруты и тесты есть |
| Онбординг и ИИ-план | 84% | Код упрощенного flow есть, unit tests есть, production E2E onboarding есть для desktop Chromium, Android Chrome/PWA и iPhone PWA |
| ИИ-прокси, резервный режим, лимиты, логи | 85% | `/api/ai`, контроль бюджета, `ai_events`, тесты и проверки есть |
| Питание, фото, коррекция блюд | 80% | CameraCapture, AI food, correction helpers, non-food, тесты есть |
| Прогресс, замеры, PDF | 80% | Экраны, графики, PDF engine, история есть; нет E2E PDF/мобильных тестов |
| Семья, меню, покупки | 75% | D1 routes/tests есть; зависит от Family tariff и cloud state |
| Push для пользователя | 86% | VAPID status/subscribe/test/unsubscribe, SW push handler, unit tests и production E2E push settings есть; зависит от разрешений ОС/браузера |
| Админская push-рассылка | 85% | `/api/admin/push/send`, проверка без отправки, фильтры, сортировка, предпросмотр, тесты есть |
| Поддержка и вложения | 88% | User/admin support routes, diagnostics для админки, публичный serializer для клиента, R2/inline attachments, тесты есть |
| Админка | 80% | Основные sections/routes/guards есть; большой компонент требует поддержки |
| Оплата Stripe | 75% | Checkout/webhook/tests есть; зависит от внешних Stripe secrets/prices/webhook setup |
| Wearable/Health | 55% | Snapshot API + iOS HealthKit bridge есть; Huawei OAuth/sync scaffold добавлен; прямые Google/Fitbit/Garmin интеграции не готовы |
| Backup/autosave/PWA-кэш | 45% | JSON backup есть; autosave prototype; источник правды для авторизованного пользователя - D1/облако |
| Тестовое покрытие системных инвариантов | 87% | unit tests + check scripts + Playwright E2E для production PWA shell, onboarding и push settings |
| Privacy/security baseline | 76% | privacy page, API headers, Pages `_headers`, export redaction, support redaction и tests есть; юридические реквизиты владельца не заполнены в коде |

## Критические и системные проблемы

Подтвержденные критические ошибки после локальной проверки:

- Не обнаружены автоматическими проверками.

Системные риски и недоделанные зоны:

1. Android onboarding issue на Galaxy S23+ не может считаться полностью закрытым без проверки на реальном устройстве; Playwright покрывает Android-эмуляцию, но не конкретную прошивку Samsung.
2. Wearable-интеграции Google Fit/Fitbit/Garmin не являются полноценными provider-интеграциями; сейчас есть UI, общий snapshot endpoint и iOS HealthKit bridge. Huawei Health добавлен как server-side OAuth/sync flow, но требует внешней настройки Huawei Health Kit credentials/scopes.
3. Backup/autosave остается prototype-level: JSON export/import есть, но persistent file handle не сохраняется между сессиями; работа без сети как основной режим не входит в заявленную cloud-first модель.
4. Push зависит от разрешений браузера/ОС, VAPID secrets и валидных подписок. Код обрабатывает устаревшие подписки, но доставка не гарантируется для браузеров/ОС, которые блокируют Web Push.
5. Stripe billing зависит от корректных Cloudflare secrets, price ids и webhook secret. Без них checkout/webhook не завершат полный платный цикл.
6. ИИ зависит от `GEMINI_API_KEY` и доступности Gemini. Резервный режим есть, но это не равно качеству полноценного ИИ-ответа.
7. Privacy page добавлена, но юридические реквизиты оператора и отдельный внешний контакт не могут быть заполнены из кода без фактических данных владельца.
8. Большие UI-файлы повышают стоимость сопровождения: `App.tsx`, `AdminScreen.tsx`, `SettingsScreen.tsx`, `ProgressScreen.tsx` больше типичного размера компонентных модулей.
9. Основной backend/API слой уже заметно ужесточен по runtime typing и JSON parsing, но в проекте все еще остаются отдельные `any` и слаботипизированные участки, прежде всего в крупных frontend/UI/runtime-модулях.
10. Скрипт `migrate:local` в `package.json` только печатает сообщение; реальные D1 migrations применяются через `wrangler d1 migrations apply`.

Примечание по последней серии правок:

- Слой `storage`, часть domain/utils и большая часть unit/integration tests уже переведены с широких `any` на более узкие типы и typed context/env mocks.
- Основной остаточный хвост сейчас сосредоточен не в API и не в tests, а в крупных UI/runtime-файлах: `App.tsx`, `AdminScreen.tsx`, `geminiService.ts`, `SettingsScreen.tsx`, `PlanScreen.tsx`, `RecipesScreen.tsx`, `FoodInsightCard.tsx` и связанных helper-модулях.

## Команды разработки

Установка:

```bash
npm install
```

Запуск клиентской части:

```bash
npm run dev
```

Сборка для продакшена:

```bash
npm run build
```

Проверка TypeScript:

```bash
npm run typecheck
```

Unit-тесты:

```bash
npm run test:unit
```

Production E2E:

```bash
npm run test:e2e
```

Проверки API-инвариантов:

```bash
npm run check:api-invariants
npm run check:auth-scope
npm run check:schema
npm run check:privacy
```

Аудит зависимостей:

```bash
npm audit --omit=dev
```

Локальные миграции D1:

```bash
npx wrangler d1 migrations apply fitfocus --local
```

Удаленные миграции D1:

```bash
npx wrangler d1 migrations apply fitfocus
```

## Локальный запуск с функциями Cloudflare Pages

1. Собрать клиентскую часть:

```bash
npm run build
```

2. Запустить функции Cloudflare Pages:

```bash
npx wrangler pages dev dist --port 8788 --ip localhost
```

3. В другом терминале запустить Vite:

```bash
npm run dev
```

Прокси Vite отправляет `/api` на `http://localhost:8788`.

## Настройка Cloudflare production

Cloudflare Pages:

- Команда сборки: `npm run build`
- Каталог сборки: `dist`
- Привязка D1: `DB`
- Имя базы D1: `fitfocus`
- Каталог миграций: `migrations`

Обязательные Cloudflare secrets/vars:

- `AUTH_JWT_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `APPLE_CLIENT_ID`
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY`
- `APPLE_CLIENT_SECRET` опционально
- `GEMINI_API_KEY`
- `PUSH_VAPID_PUBLIC_KEY`
- `PUSH_VAPID_PRIVATE_KEY`
- `PUSH_VAPID_SUBJECT`
- `REQUIRE_INVITE` опционально, `1` для закрытой beta
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `APP_URL`
- `PRICE_PRO_MONTHLY`
- `PRICE_PRO_YEARLY`
- `PRICE_FAMILY_MONTHLY`
- `CRON_SECRET`

Опционально:

- R2 binding `SUPPORT_ATTACHMENTS` для вложений поддержки, которые больше лимита встроенного хранения.
- `GEMINI_TIMEOUT_MS`
- `FREE_AI_DAILY_LIMIT`
- `PRO_AI_DAILY_LIMIT`
- `FAMILY_AI_DAILY_LIMIT`

GitHub Actions secrets/vars:

- `FITFOCUS_CLEANUP_SECRET` должен совпадать с Cloudflare `CRON_SECRET`.
- `FITFOCUS_CLEANUP_URL` опционально; URL workflow по умолчанию: `https://fitfocus.pages.dev/api/internal/cleanup_deleted`.

OAuth redirect URLs:

- Google local: `http://localhost:8788/api/auth/google/callback`
- Google production: `https://<domain>/api/auth/google/callback`
- Apple local: `http://localhost:8788/api/auth/apple/callback`
- Apple production: `https://<domain>/api/auth/apple/callback`

## База данных

Источник схемы:

- `db/schema.sql`
- `migrations/*.sql`

Проверка соответствия схемы:

```bash
npm run check:schema
```

Проверка покрытия приватности:

```bash
npm run check:privacy
```

Текущие известные таблицы:

- users
- sessions
- subscriptions
- user_profiles
- user_kv
- user_roles
- feature_flags
- feature_settings
- ai_events
- ai_rate_limits
- push_subscriptions
- invite_codes
- invite_redemptions
- families
- family_members
- family_invites
- family_menus
- weekly_menus
- weekly_menu_items
- weekly_menu_portions
- shopping_checked
- support_feedback
- support_feedback_messages
- wearable_connections
- admin_events
- admin_sessions
- user_achievements

## CI

GitHub Actions `ci.yml` запускает:

- `npm audit`
- `npm run check:schema`
- `npm run check:privacy`
- `npm run check:auth-scope`
- `npm run check:api-invariants`
- `npm run test:unit`
- `npm run typecheck`
- `npm run build`

CI использует Node.js 24 и Python 3.12.

Дополнительно CI запускает:

- установку браузеров Playwright
- `npm run test:e2e`

## Вложения поддержки

Без R2:

- Вложения могут храниться встроенно до 2 MB.
- Более крупные файлы отклоняются.

С R2:

- Создайте bucket, например `fitfocus-support-attachments`.
- Привяжите его к Pages как `SUPPORT_ATTACHMENTS`.

Форма поддержки валидирует обязательные поля на клиенте и сервере. Пользователю показываются только безопасные публичные ошибки без D1/R2/internal route details.

## Условия доставки push

Для доставки push нужны все условия:

- Браузер поддерживает `Notification`, `serviceWorker`, `PushManager`.
- Пользователь авторизован через серверную сессию.
- Разрешение уведомлений браузера/сайта равно `granted`.
- В Cloudflare настроены VAPID secrets.
- Уведомления устройства/ОС не отключены.
- Адрес подписки все еще валиден.

Ограничение iPhone/iPad:

- Обычная вкладка Safari не поддерживает тот же push-поток, который используется установленным PWA.
- Пользовательское предупреждение присутствует в настройках.
- Для push на iPhone/iPad нужно использовать установленный FitFocus с домашнего экрана.

Примечание по Android:

- UI-текст сообщает, что Android push работает в браузере и PWA-режиме при включенных разрешениях.
- Текущий код не может доказать доставку на каждой прошивке Android и в каждом браузере без E2E-теста на устройстве.

## Факты по безопасности

Реализованные контроли:

- Публичная политика конфиденциальности `/privacy.html`.
- Экран `Конфиденциальность` внутри PWA.
- Cloudflare Pages `_headers` для статических PWA-ответов.
- CSP с `frame-ancestors 'none'`, `object-src 'none'` и ограниченными источниками.
- `X-Frame-Options: DENY`.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy`.
- `Permissions-Policy`.
- HSTS для HTTPS.
- HttpOnly `ff_session`.
- Проверка JWT-подписи через `AUTH_JWT_SECRET`.
- Проверка существования, отзыва и срока действия D1-сессии.
- Блокировка неактивных и удаленных пользователей в `requireUser`.
- RBAC-роли из D1.
- Админские маршруты защищены ролью и проверкой админской сессии.
- Ограниченные JSON/FormData readers на чувствительных маршрутах.
- Мягкое удаление аккаунта и запланированное жесткое удаление.
- Защита от удаления последнего администратора.
- Admin audit events.
- Ограничения частоты ИИ-запросов и контроль бюджета.
- Приватный VAPID-ключ push не раскрывается через `/api/push/status`.
- Пользовательский экспорт не возвращает push credentials подписок.
- OAuth error responses не возвращают upstream details от Google/Apple.
- Пользовательские API поддержки не возвращают admin-only поля и системную диагностику.
- Push/Huawei пользовательские status routes не раскрывают имена Cloudflare env-переменных.
- Billing checkout не возвращает клиенту raw exception message.

## Что этот репозиторий не доказывает

Этот репозиторий не доказывает:

- Медицинскую точность ИИ-рекомендаций.
- Точность определения КБЖУ по фото во всех реальных случаях.
- Гарантированную доставку push во всех браузерах, на всех устройствах и на всех Android/iOS прошивках.
- Завершенные прямые интеграции с Google Fit, Fitbit и Garmin API.
- Готовую production-доставку данных Huawei Health без настройки Huawei Developer/Huawei Health Kit credentials и scopes.
- Работу без сети как основной сценарий: источник правды для авторизованного пользователя - D1/облако.
- Полную готовность платежей в продакшене без настройки Stripe dashboard.
- Полную стабильность на мобильных устройствах только на основании эмуляторов Playwright без проверки каждой реальной модели устройства.
