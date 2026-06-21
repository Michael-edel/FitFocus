# FitFocus — AI-экосистема контроля метаболизма

FitFocus — это прогрессивное веб-приложение (PWA) для персонализированного управления здоровьем, объединяющее AI-анализ питания по фото и интеллектуальное планирование на основе метаболических циклов.

## Ключевые возможности

*   **AI Food Vision**: Распознавание состава блюд и расчет КБЖУ по фотографии.
*   **Metabolic Engine**: Динамический расчет BMR и TDEE по формуле Миффлина–Сан Жеора.
*   **AI Coach**: Ежедневные персональные советы и задачи на основе текущего прогресса.
*   **Weekly Intelligence (WIS)**: Еженедельные отчеты с анализом адаптации и прогнозом веса.
*   **Hybrid Storage**: быстрый локальный кэш в `localStorage` + серверный источник правды в Cloudflare D1 для Google-профилей, сессий, beta invite, family/shopping данных и синхронизируемого состояния.
*   **Push notifications**: Web Push для напоминаний, тестов уведомлений и будущих пользовательских сценариев.
*   **Premium PDF Engine**: Генерация детальных медицинских отчетов с поддержкой кириллицы.

## Технологический стек

*   **Frontend**: React 19, TypeScript, Tailwind CSS.
*   **AI**: Google Gemini API (Flash/Pro) с гибридным режимом (Direct/Proxy).
*   **Charts**: Recharts для визуализации трендов веса и привычек.
*   **PDF**: jsPDF + autoTable с кастомной интеграцией шрифта Inter.
*   **Backend**: Cloudflare Pages Functions (Serverless) для OAuth, D1 persistence, AI proxy, Stripe webhook и админских API.
*   **Database**: Cloudflare D1, миграции в `migrations/`, binding `DB`.

## Быстрый старт

1.  Установите зависимости: `npm install`
2.  Настройте `GEMINI_API_KEY` и `VITE_PUSH_VAPID_PUBLIC_KEY` в файле `.env.local`.
3.  Запустите сервер разработки: `npm run dev`

## Git workflow

1. Установить хуки:

```powershell
.\scripts\install-githooks.ps1
```

2. Включить авто-пуш после коммита:

```powershell
.\scripts\install-githooks.ps1 -EnableAutoPush
```

3. Разово отправить текущую ветку на `origin`:

```powershell
.\scripts\push-current-branch.ps1
```

Авто-пуш по умолчанию выключен. Это сохраняет защиту `main`, но позволяет включать автоматическую отправку только когда она нужна.

## Локальная разработка (backend + Google OAuth)

Проект использует Cloudflare Pages Functions (Wrangler) и локальную D1 базу.

1) Первый запуск на новом компьютере — примените миграции в локальную D1:

```bash
npx wrangler d1 migrations apply fitfocus --local
```

2) Запуск backend (Pages Functions) и фронта:

```bash
# backend
npx wrangler pages dev dist --port 8788 --ip localhost

# frontend (в отдельном терминале)
npm run dev
```

3) Google OAuth (для local):

В Google Cloud Console добавьте Authorized redirect URI:
`http://localhost:8788/api/auth/google/callback`

В проде добавьте URI вида:
`https://<ваш-домен>/api/auth/google/callback`

## Cloudflare deploy

Production deploy ожидает Cloudflare Pages + D1:

1. Собрать frontend: `npm run build`.
2. Применить D1 миграции: `npx wrangler d1 migrations apply fitfocus`.
3. Проверить binding в `wrangler.toml`: `DB` должен указывать на D1 database `fitfocus`.
4. Настроить secrets/vars в Cloudflare Pages:
   - `AUTH_JWT_SECRET`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GEMINI_API_KEY`
   - `PUSH_VAPID_PUBLIC_KEY`
   - `PUSH_VAPID_PRIVATE_KEY`
   - `PUSH_VAPID_SUBJECT`
   - `VITE_PUSH_VAPID_PUBLIC_KEY`
   - `REQUIRE_INVITE` (`1` для закрытой beta)
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `APP_URL` (должен совпадать с публичным origin приложения, который вы добавляете в Google OAuth redirect URI)
   - Stripe price ids: `PRICE_PRO_MONTHLY`, `PRICE_PRO_YEARLY`, `PRICE_FAMILY_MONTHLY`
5. В Google Cloud Console добавить redirect URI:
   `https://<ваш-домен>/api/auth/google/callback`.

## Безопасность и Приватность

Приложение использует архитектуру "Privacy-by-Design":
*   **HttpOnly sessions**: авторизация через `ff_session`, проверяемую в D1 sessions.
*   **Beta access control**: закрытая beta управляется `REQUIRE_INVITE`, `invite_codes` и `invite_redemptions`.
*   **Защита ключей**: В Production-среде доступ к Gemini осуществляется через прокси с ограничением по IP и хешированием.
*   **Offline-first**: Основной функционал доступен без интернета благодаря Service Worker.
*   **Push delivery**: уведомления работают только после разрешения в браузере и на устройствах, где включена PWA/Web Push поддержка.
