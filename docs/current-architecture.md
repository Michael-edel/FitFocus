# Текущая архитектура FitFocus

Снимок: 09.10.2026, `810adb1` из PR #90. [Область и навигация](README.md).
Ниже различаются исходная реализация и последующие изменения в PR #93/#94;
оставшиеся задачи вынесены в [TASKS](../TASKS.md).

Дополнение 12.10.2026, `dac2de2`: [bootstrap/state-hydration](bootstrap-hydration.md)
используют общий ограниченный transport, свежий `/me` proof, парные scope
headers и атомарный auth-fence в IDB при применении снимков. Этот компонент
расширяет гарантии исходного снимка; не подтверждает весь lifecycle,
runtime legacy или выпуск. Историческое описание ниже сохраняет свою ревизию.

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

Последующие изменения в PR #93: сначала [шесть ключей repository](runtime-state.md)
и [HTTP sender](state-sender.md), затем [15 управляемых state-ключей](owned-state-writers.md).
Они используют атомарную value/outbox-транзакцию. Настройки читаются из IDB;
managed hydration проверяет протокол, локальную ревизию и очередь.
Map sender удалён из текущей сборки. Следующий этап
[подключает редактор профиля](profile-persistence.md) к общей IDB-outbox
и sender с явным HTTP dispatch. Следующая [регистрация](registration-persistence.md)
сохраняет профиль до AI-запроса в эту же outbox без прямого profile PUT;
runtime legacy-импорт, барьер старых сборок и общая приёмка ещё не завершены.

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


## Последующий компонент: личные покупки 4736ff5

Меню и ингредиенты хранятся в profile и доставляются существующей IDB-outbox.
Принятый сервером profile CAS атомарно обновляет personal_menu_projections
через SQL triggers. Личное чтение и CSV используют проекцию, пустая генерация
не поднимает старые данные; отдельный личный items POST отклоняется.
На этой ревизии семейный путь ещё оставался открытым; семейный CAS
реализован последующим компонентом `405238b`, описанным ниже.
[Контракт и приёмка](personal-menu-projection.md), [ADR-007](adr/ADR-007-personal-menu-projection.md).

## Семейные сессии 9c44c21

`useFamilyCloud` получает login guard из hydration, обновляет proof перед
каждым HTTP и сохраняет принадлежность React-state/setters. `familySession`
использует bounded transport; `FamilyActionScope` отменяет прежнюю попытку
того же действия и все попытки при уходе страницы. Сервер проверяет scope
до family/shopping effects. [Контракт и границы](family-session.md).
На `9c44c21` отдельный AI-путь и постоянная доставка меню ещё оставались открытыми.

## Семейное меню и обновление PWA

В `405238b` меню, порции и покупки семьи сохраняются одним family/week CAS;
AI-preview становится намерением `familyMenu` в существующей IDB-outbox.
IDB v3 и SQL-барьеры миграции 0021 закрывают описанные в
[контракте](family-menu-state.md) несовместимые старые пути записи.
Это не завершает runtime legacy-импорт, реальный lifecycle или выпуск.

Следующий компонент после `60c5421` переводит custom SW на явное обновление:
`waiting` сохраняется до нажатия, уведомление просит сохранить все вкладки,
`SKIP_WAITING` активирует worker. [Контракт PWA и границы](pwa-updates.md).
