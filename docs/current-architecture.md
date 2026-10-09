# Текущая архитектура FitFocus

Снимок: 09.10.2026, `810adb1` из PR #90. [Область и навигация](README.md).
Ниже различаются исходная реализация и последующие изменения в PR #93/#94;
оставшиеся задачи вынесены в [TASKS](../TASKS.md).

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

## Хранение и синхронизация исходного снимка

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

Последующее изменение в PR #93: шесть ключей UserStateRepository используют
атомарную value/outbox-транзакцию. Настройки читаются из IDB; managed hydration
проверяет протокол, локальную ревизию и очередь. Показанный выше путь Map
сохраняется для остальных writers. [Sender шести ключей](state-sender.md)
переведён на claim/finish; общая интеграция ещё не завершена.
[Граница и проверки подключения](runtime-state.md).

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

В последующем серверном компоненте `fix/state-generations` физический state
DELETE заменён на очищенный tombstone с возрастающей версией; добавлена
миграция 0019 и opt-in чтение поколений. [Контракт и выпуск P0.7](state-generations.md).
Компонент объединён с клиентской веткой коммитом `93f90c0`. Managed hydration
читает protocol 2; sender шести ключей проверяет ack и server session.
Остальные пути ещё ожидаются. Это не подтверждение выпуска.

## Внешние сервисы и выпуск

Есть AI, Google/Apple, Stripe, web push, Huawei Health и отдельный iOS bridge.
Push вызывает общий `fetchWithTimeout` из `external_fetch.ts`;
AbortController находится в помощнике. Статическая API-проверка ещё ожидает
старую реализацию внутри `push.ts` — это P0.1.

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
