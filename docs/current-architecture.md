# Текущая архитектура FitFocus

Снимок: 09.10.2026, `810adb1` из PR #90. [Область и навигация](README.md).
Ниже описана реализация; целевые изменения вынесены в [TASKS](../TASKS.md).

## Клиент

React 19, TypeScript, Vite, Tailwind CSS и PWA. Исходники находятся в корне
и тематических каталогах; каталога `src/` как обязательной границы нет.
`App.tsx` и `AppWorkspace.tsx` собирают интерфейс и сценарии.
`features/` уже содержит hooks/API-адаптеры для profile, diary, AI, family,
settings, recipes и других направлений. `domain/` содержит чистые расчёты;
`services/` — обращения к сервисам и общие помощники.

Группы props в `AppWorkspace` местами имеют `Record<string, unknown>`.
Строгая проверка domain/storage выделена в отдельные tsconfig; наличие этих
проверок не означает strict-режим всего приложения.

## Хранение и синхронизация

```text
UI / feature hooks
  → UserStateRepository → IndexedDB values / localStorage
  → hybrid.ts → Map в памяти + legacy localStorage-очередь → /api/state

Profile hooks → profileSync.ts → отдельная Promise-цепочка → /api/profile
Вход / восстановление → sessionHydration.ts → облачный снимок → локальные данные
```

`storage/userStateRepository.ts` даёт типизированный доступ к пользовательским
снимкам. `storage/indexedUserState.ts` хранит объёмные значения в IDB.
`storage/hybrid.ts` обслуживает очередь state. Локальная запись и её outbox
сейчас не составляют одну IDB-транзакцию. Профиль использует отдельный путь;
утверждать, что все записи уже проходят одну durable queue, нельзя.

Подробнее: [данные](data-model.md), [синхронизация](sync-model.md).

## Сервер

Cloudflare Pages Functions в `functions/api/`, D1 с binding `DB`.
`wrangler.toml` описывает существующий binding и `migrations/`;
отдельную staging-БД этот файл сам по себе не подтверждает.

Routes вызывают уже выделенные модули `functions/api/_lib/`: profile/state,
семья и покупки, поддержка, push, billing, OAuth и wearable-сценарии.
`auth.ts`, access и RBAC проверяют пользователя и доступ; наблюдаемость
использует `X-Request-ID` и структурированные события в затронутых маршрутах.

Профиль хранится в `user_profiles`; строковые state-снимки — в `user_kv`.
CAS сравнивает версии. PUT state уже использует условную пакетную запись
одним SQL с `RETURNING`; DELETE физически удаляет строку и её версию.
Форматы ответов: [API_CONTRACTS](../API_CONTRACTS.md).

## Внешние сервисы и выпуск

Есть AI, Google/Apple, Stripe, web push, Huawei Health и отдельный iOS bridge.
Push вызывает общий `fetchWithTimeout` из `external_fetch.ts`;
AbortController находится в помощнике. Статическая API-проверка ещё ожидает
старую реализацию внутри `push.ts` — это P0.1.

Это ограничение относится к исходному снимку `810adb1`. На последующей
ревизии `cc880d9` P0.1 исправлен и проверен CI; интеграция в main остаётся
отдельным шагом. Компоненты новой очереди и импортера проверены на `51a789c`,
но не подключены к показанному выше пути приложения.
[Ревизии и результаты](stabilization-progress.md),
[граница P0.8](outbox-implementation.md).

PWA настроена на `autoUpdate` и `skipWaiting`. Это не гарантирует обновления
JS уже открытой вкладки и закрытия её IDB-соединения.
`index.tsx` перенаправляет неканонические `*.pages.dev` на основной host,
что нужно учесть при staging и тестировании двух сборок на одном origin.

## Граница текущих гарантий

Ещё не обеспечены общая атомарность данных и очереди, безопасное сохранение
409-конфликтов, запись во время auth-паузы, защита всех late responses,
владение очередью аккаунтом и непрерывная версия после delete/recreate.
Набор unit/E2E не заменяет отдельной проверки этих сценариев и реальных сервисов.

Источники: [дерево проверенной ревизии](https://github.com/Michael-edel/FitFocus/tree/810adb11b01447114de9f240c6e2d520f747470b),
[storage](https://github.com/Michael-edel/FitFocus/tree/810adb11b01447114de9f240c6e2d520f747470b/storage),
[серверные модули](https://github.com/Michael-edel/FitFocus/tree/810adb11b01447114de9f240c6e2d520f747470b/functions/api/_lib).
