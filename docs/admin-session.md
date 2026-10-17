# Сессия административной панели

Административные сетевые действия должны оставаться привязаны к тому входу,
который открыл панель. Это закрывает запоздавшие ответы и случай, когда cookie
успела перейти к другому входу до запроса.

## Клиентский контракт

`AdminScreen` получает `loginGuard` и проверку текущей попытки входа. При
монтировании `prepareAdminSession` подтверждает сохранённые account/session
через `/api/me` и IDB auth-fence. Экран размонтируется и отменяет запросы при
смене guard. Все запросы, включая чтение обращений поддержки, изменение ролей,
тарифов и настроек, push-рассылку, `logout_all` и CSV-аудит, проходят через
`requestAdminResponse`.

Транспорт отправляет публичные `X-FitFocus-State-Account` и
`X-FitFocus-State-Session`, `X-Request-ID`, `credentials: include`,
`cache: no-store` и `redirect: error`. Он не повторяет мутации, ограничивает
ожидание 12 секундами и ответ 5 MiB, отменяет запрос при закрытии страницы и
после чтения тела повторно проверяет IDB auth-fence. Ответ принимается только
при совпадении `X-FitFocus-Admin-Protocol`, `X-FitFocus-Admin-Guard` и обоих
scope headers. CSV загружается тем же транспортом, а не через отдельную вкладку.

## Серверный контракт

`requireAdminRequest` требует полный account/session proof для всех `/api/admin/*`
до запроса admin-роли в D1 и записи admin-session activity. Это действует для
обоих поддерживаемых стилей вызова guard. Отсутствующая или неполная пара
возвращает `STATE_SESSION_REQUIRED`, устаревшая — `STATE_SESSION_CHANGED`;
middleware превращает оба исхода в 401 с admin response markers. Старые
административные bundles без proof должны обновиться до rollout.

Административные GET/PATCH `/api/support/feedback` и `/api/logout_all`, которые
находятся вне `/api/admin/*`, тоже требуют proof. `/api/logout_all` отклоняет
запрос до отзыва сессий и очистки cookie. В заголовки попадает только публичный
hash сессии, не cookie и не сырой session id.

Регрессии покрывают transport markers и late response после смены IDB-сессии,
отсутствующий, частичный и устаревший proof до D1 role lookup, оба стиля вызова
guard, middleware и `logout_all`. Общий критерий P0.5 остаётся открытым, пока не
проверены остальные API callbacks и полный lifecycle.
