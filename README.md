# FitFocus

FitFocus — прогрессивное веб-приложение для питания, привычек и личного
прогресса. В проекте есть дневник питания, анализ еды, цели и персональные
рекомендации, рецепты, личное и семейное меню, список покупок, напоминания и
интеграции с поддерживаемыми сервисами. Полный перечень функций и их статус —
в [PRODUCT.md](PRODUCT.md).

Обновлено: 15.10.2026. Текущий этап — стабилизация хранения пользовательских
данных, синхронизации между вкладками и восстановления после ошибок. Проверенный
статус, точные ревизии и ограничения собраны в [docs/project-status.md](docs/project-status.md).

## Документы

| Файл | Содержание |
|---|---|
| [PRODUCT.md](PRODUCT.md) | Назначение, функции, пользовательские сценарии и приоритеты |
| [docs/project-status.md](docs/project-status.md) | Что проверено, что в работе и ближайшая задача |
| [TASKS.md](TASKS.md) | План P0/P1 и критерии готовности |
| [docs/README.md](docs/README.md) | Полный каталог проектных MD-файлов и порядок работы с ними |
| [docs/code-map.md](docs/code-map.md) | Функция → исходный код → контракт → тесты |
| [docs/current-architecture.md](docs/current-architecture.md) | Архитектура текущей проверенной реализации |
| [docs/data-model.md](docs/data-model.md) и [docs/sync-model.md](docs/sync-model.md) | Хранилища, версии и синхронизация |
| [docs/outbox-implementation.md](docs/outbox-implementation.md) | Durable outbox: реализация и оставшиеся этапы подключения |
| [docs/legacy-migration.md](docs/legacy-migration.md) | Формат legacy-записи, нормализация, карантин и импорт |
| [docs/ai-callback-sessions.md](docs/ai-callback-sessions.md) | Контракт защиты запросов и повторов coach, личного плана, недельного меню и плато |
| [docs/achievement-session.md](docs/achievement-session.md) | Сессия, очередь, scope HTTP и поздние ответы достижений |
| [docs/support-session.md](docs/support-session.md) | Session guard списка, деталей, создания обращений и ответов пользователя |
| [docs/huawei-health-session.md](docs/huawei-health-session.md) | Account/session guard Huawei OAuth, sync и профильных изменений |
| [docs/weekly-ai-report-session.md](docs/weekly-ai-report-session.md) | Защита недельного AI-отчёта свежей сессией и durable commit |
| [docs/account-lifecycle-session.md](docs/account-lifecycle-session.md) | Привязка выхода и удаления аккаунта к исходной login-сессии |
| [docs/stabilization-progress.md](docs/stabilization-progress.md) | Журнал изменений, SHA, тесты и CI |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Локальный запуск, проверки и правила внесения изменений |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | Проверки выпуска и отката |

Архитектурные решения ведутся в [DECISIONS.md](DECISIONS.md) и связанных ADR.
Документы обновляются вместе с кодом: контракт описывает поведение, TASKS —
готовность, а журнал — конкретную проверенную ревизию и её результаты.

## Локальный запуск

Требуются Node.js 24 и Python 3.12. Из корня репозитория:

```bash
npm ci
npm run dev
```

Клиент запускается на `http://localhost:5173`; запросы `/api` проксируются на
`http://localhost:8788`. Для входа и серверных функций нужна настроенная среда;
подробности приведены в [CONTRIBUTING.md](CONTRIBUTING.md).

## Проверки

```bash
npm run test:unit
npm run typecheck
npm run typecheck:domain-strict
npm run typecheck:storage-strict
npm run build
npm run test:e2e
```

Полный набор зависит от типа изменения; обязательные проверки описаны в
[CONTRIBUTING.md](CONTRIBUTING.md) и [матрице P0](docs/verification-matrix.md).
Локальный успех не заменяет CI, staging или приёмку релиза.

## Текущий этап

Основная рабочая ветка — `fix/durable-outbox`, [draft PR #93](https://github.com/Michael-edel/FitFocus/pull/93).
P0.8 включает общую IndexedDB outbox, миграцию legacy-очереди, атомарное
сохранение пользовательских данных, профиль, регистрацию, личное и семейное
меню, а также UI восстановления failed/conflicted операций. Приёмка всего
lifecycle ещё продолжается: оставшиеся пункты и точные ограничения перечислены
в [TASKS.md](TASKS.md) и [статусе проекта](docs/project-status.md).

Кодовый SHA [`956cf96`](https://github.com/Michael-edel/FitFocus/commit/956cf967c1d83c0c0d2092210cbb83b905eecee3)
привязывает logout и удаление аккаунта в текущем клиенте к исходному login
proof, чтобы старый callback не изменил другую сессию. На этом SHA server-side
legacy logout ещё оставался открытым. Follow-up [`b2f6938`](https://github.com/Michael-edel/FitFocus/commit/b2f6938136c6ad6a82624b295c6eb7e2fdaf5ee6)
требует proof для `/api/logout`; запросы без полного proof получают 401 до cookie
lookup/revoke. Guards и три typecheck прошли в изолированном контейнере; точный
CI этого follow-up ожидает push. Реальный OAuth, staging, полный P0.5/P0.8
lifecycle и выпуск в main остаются открытыми. См. [контракт](docs/account-lifecycle-session.md),
[статус](docs/project-status.md) и [журнал](docs/stabilization-progress.md).

Предыдущая кодовая ревизия [`562e20d`](https://github.com/Michael-edel/FitFocus/commit/562e20d210695328bcd17309f9836a2e10c68935)
добавила проверку задержанного ответа личной генерации недельного меню при
смене аккаунта. Изменённый callback spec прошёл 15/15 на desktop Chromium,
Firefox и WebKit; новый сценарий — 3/3, typecheck прошёл. Полный [CI run
38531646756](https://github.com/Michael-edel/FitFocus/actions/runs/38531646756)
завершился success, включая E2E и rollback/CAS.

Последний завершённый полный CI до Firefox-finish исправления проверил HEAD
[a9e3096](https://github.com/Michael-edel/FitFocus/commit/a9e309696be85414a6ca96697beec3d91c19718c),
[run 38540109329](https://github.com/Michael-edel/FitFocus/actions/runs/38540109329):
1132 unit, 535 browser passed / 79 skipped, audit, typechecks, build и rollback/CAS
прошли. Два Firefox weekly-menu теста прошли автоматический retry; причина и
локальный follow-up записаны в статусе проекта.

Локальный follow-up для двух flaky-сценариев прошёл: целевые повторы — 10/10, полные затронутые specs — 10/10 на Android PWA Chrome и 8/8 на iPhone PWA, `npm run typecheck` — успешно. Полный [CI run `38466153712`](https://github.com/Michael-edel/FitFocus/actions/runs/38466153712) для кодовой ревизии [`a99ab7b`](https://github.com/Michael-edel/FitFocus/commit/a99ab7beea367df76154faa53747aed2aa473d98) отменён после отправки следующего документационного коммита; актуальное состояние проверок текущего HEAD смотрите на [странице checks PR #93](https://github.com/Michael-edel/FitFocus/pull/93/checks). Cloudflare preview успешен, но это не production-релиз. Подробности и оставшиеся критерии — в [статусе проекта](docs/project-status.md), [журнале](docs/stabilization-progress.md) и [плане](TASKS.md).

PR #93 не слит в `main`. OAuth, настоящая миграция на staging, реальные устройства
и выпуск проверяются отдельно по [чек-листу релиза](RELEASE_CHECKLIST.md).
