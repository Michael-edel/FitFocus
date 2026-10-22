# Session guard выхода и удаления аккаунта

Обновлено: 15.10.2026. Кодовый компонент: [`956cf96`](https://github.com/Michael-edel/FitFocus/commit/956cf967c1d83c0c0d2092210cbb83b905eecee3), ветка `fix/durable-outbox`.

## Удаление аккаунта

Клиент удаляет аккаунт только при наличии `loginGuard`, чей `accountId`
совпадает с текущим Google subject. Перед подтверждением и после ввода `DELETE`
он проверяет тот же guard в IndexedDB. Запрос передаёт парные
`X-FitFocus-State-Account` и `X-FitFocus-State-Session`.

`POST /api/account/delete` требует оба заголовка через `requireScopedStateUser`.
Сервер сверяет их с cookie-сессией до проверки правил и изменения аккаунта.
Старый или запоздавший запрос без proof, с неполной парой либо от другого входа
получает 401 без soft delete. Успешный ответ содержит
`X-FitFocus-Account-Delete-Protocol: 1`, `X-FitFocus-Account-Delete-Guard: 1`
и эхо account/session scope; клиент проверяет эти маркеры до локальной очистки.

HTTP-отказ, неверный protocol reply и network rejection повторно проверяют
исходную сессию перед показом ошибки. Если за время запроса аккаунт или login
session сменились, старый callback не открывает диалог в новом входе. Ошибка
текущей сессии по-прежнему показывается; отказ не запускает logout или cleanup.

Ответ удаления не истекает общую cookie: `softDeleteAccount` отзывает сессии
удалённого аккаунта, а поздний `Set-Cookie` мог бы стереть cookie другого входа,
установленную соседней вкладкой. После подтверждённого удаления клиент выходит
из captured-сессии и очищает локальные данные только удалённого аккаунта. Если
активная сессия успела смениться, старый callback не выполняет logout нового
входа; локальная очистка по-прежнему ограничена удалённым account ID.

Локальная очистка также удаляет account-scoped счётчик генерации рецептов
`fitfocus_usage_counters_v1:<encoded-accountId>`. Сравнивается точный
URL-кодированный владелец, поэтому счётчики соседних аккаунтов сохраняются.
Ранее `clearLocalUserData` не включал этот ключ и мог сообщить о полной очистке,
оставив счётчик в `localStorage`; это исправлено в `8b7fb2c`. Writer и cleanup
используют общий `STORAGE_KEYS.recipeUsagePrefix`, добавленный в `5d3d5b1`.

## Обычный выход

Новый клиент проверяет актуальность IDB read guard перед очисткой состояния,
затем отправляет scope исходной сессии в `POST /api/logout`. Сервер проверяет
scope по подписанному cookie и отзывает только совпавший `sid`.

Отсутствующая или неполная пара proof отклоняется с 401 до чтения cookie и
отзыва; несовпадающая пара также отклоняется. Для успешного ответа cookie не
истекает: отозванный token непригоден, а запоздавший ответ не может удалить
cookie нового входа. Следующий OAuth callback заменяет его. Старые клиенты без
proof должны обновиться до серверного rollout.

## Проверки и границы

На кодовом SHA `956cf96` локально прошли 1215 unit-тестов / 208 файлов, общий,
domain-strict и storage-strict typecheck, production build, `check:auth-scope`,
`check:api-invariants`, `check:admin-guards`, `check:privacy` и `git diff --check`.
Профильные тесты проверяют смену IDB-сессии перед запросом, несовпадающий proof
удаления до side effects, отсутствие `Set-Cookie` для scoped logout и отказ
отзыва чужой сессии. Полный CI этого SHA и реальный OAuth/staging ещё не
подтверждены.

Дополнительный cleanup regression в `8b7fb2c` сначала воспроизвёл оставшийся
recipe usage counter для обычного и URL-кодированного account ID. После фикса
privacy/usage тесты прошли 9/9, полный unit suite — 1423/1423, общий и оба strict
typecheck, production build, privacy coverage и `git diff --check` прошли.
Точный CI этого follow-up ожидает публикации; это не закрывает общий P0.6.
Префикс writer/cleanup вынесен в общий каталог ключей на локальном follow-up
`5d3d5b1`; все указанные unit/typecheck/build проверки прошли на этом HEAD.
