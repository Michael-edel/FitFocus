FitFocus — запуск локально через Docker (Vite)

1) Подготовь ключ (локальный direct режим)
Создай файл .env (рядом с package.json):

VITE_GEMINI_API_KEY=ВАШ_КЛЮЧ
VITE_ALLOW_DIRECT_GEMINI=1

Важно: переменные VITE_* попадают в браузер. Не используй production ключ с широкими правами.
Для продакшена держи ключ только на сервере (Cloudflare env).

2) Запуск
docker compose up --build

Открыть:
http://localhost:5173

3) Если не открывается с хоста
Убедись, что Vite запущен с --host 0.0.0.0 (в Dockerfile уже сделано).

4) Если хочешь server-side /api/ai локально
Текущий docker-старт поднимает только Vite dev server.
Чтобы эмулировать Cloudflare Pages Functions локально — нужно добавить Wrangler и запустить `wrangler pages dev`.
Скажи — и я дам второй docker-compose (vite + wrangler с proxy), чтобы /api/ai работал как на Pages.
