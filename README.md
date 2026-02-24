# FitFocus — AI-экосистема контроля метаболизма

FitFocus — это прогрессивное веб-приложение (PWA) для персонализированного управления здоровьем, объединяющее AI-анализ питания по фото и интеллектуальное планирование на основе метаболических циклов.

## Ключевые возможности

*   **AI Food Vision**: Распознавание состава блюд и расчет КБЖУ по фотографии.
*   **Metabolic Engine**: Динамический расчет BMR и TDEE по формуле Миффлина–Сан Жеора.
*   **AI Coach**: Ежедневные персональные советы и задачи на основе текущего прогресса.
*   **Weekly Intelligence (WIS)**: Еженедельные отчеты с анализом адаптации и прогнозом веса.
*   **Local-First Architecture**: Все личные данные хранятся исключительно в LocalStorage браузера.
*   **Premium PDF Engine**: Генерация детальных медицинских отчетов с поддержкой кириллицы.

## Технологический стек

*   **Frontend**: React 19, TypeScript, Tailwind CSS.
*   **AI**: Google Gemini API (Flash/Pro) с гибридным режимом (Direct/Proxy).
*   **Charts**: Recharts для визуализации трендов веса и привычек.
*   **PDF**: jsPDF + autoTable с кастомной интеграцией шрифта Inter.
*   **Backend**: Cloudflare Pages Functions (Serverless) для защиты API-ключей.

## Быстрый старт

1.  Установите зависимости: `npm install`
2.  Настройте `GEMINI_API_KEY` в файле `.env.local`.
3.  Запустите сервер разработки: `npm run dev`

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

## Безопасность и Приватность

Приложение использует архитектуру "Privacy-by-Design":
*   **Нулевая серверная база данных**: Профили не привязаны к облачным аккаунтам.
*   **Защита ключей**: В Production-среде доступ к Gemini осуществляется через прокси с ограничением по IP и хешированием.
*   **Offline-first**: Основной функционал доступен без интернета благодаря Service Worker.
