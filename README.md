# FitFocus

FitFocus — прогрессивное веб-приложение для питания, привычек и личного
прогресса. В проекте есть дневник питания, анализ еды, цели и персональные
рекомендации, рецепты, личное и семейное меню, список покупок, напоминания и
интеграции с поддерживаемыми сервисами. Полный перечень функций и их статус —
в [PRODUCT.md](PRODUCT.md).

Обновлено: 13.10.2026. Текущий этап — стабилизация хранения пользовательских
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
| [docs/ai-callback-sessions.md](docs/ai-callback-sessions.md) | Контракт защиты запросов и повторов coach, плана и плато |
| [docs/weekly-ai-report-session.md](docs/weekly-ai-report-session.md) | Защита недельного AI-отчёта свежей сессией и durable commit |
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

Последний опубликованный HEAD [`c48ce1b`](https://github.com/Michael-edel/FitFocus/commit/c48ce1b543af3a4d1fc57f88c2cb875b4c4fd4dc) включает семейный AI-menu account-switch тест [`bca2eda`](https://github.com/Michael-edel/FitFocus/commit/bca2edaf8c4bee1f465dfc3cb6bfabaa08960ea5) и personal-plan retry тест [`eae1ce1`](https://github.com/Michael-edel/FitFocus/commit/eae1ce18567a967acf9c6e0a2812b48c2a9ef979). Оба сценария локально прошли 3/3 на desktop Chromium, Firefox и WebKit. Точный PR CI `38429247879` завершился success: 1115 unit / 198 файлов, 485 browser passed / 25 skipped, guards, typecheck, build и rollback/CAS прошли; был один flaky в Firefox legacy migration, retry прошёл. Её проверка исправлена локально сравнением стабильных fingerprint полей; новый CI для этого follow-up ожидается.

Предыдущий CI на `2539c8c` отмечал один flaky в desktop WebKit PWA update: уведомление об
обновлении не появилось в первой попытке, retry прошёл. Локально этот сценарий
прошёл 3/3 без retries, поэтому причина пока не воспроизведена. Сам outbox fix
проверен двумя затронутыми Firefox-сценариями 30/30 и полным Firefox spec 8/8.
P0.5 и полный lifecycle P0.8 остаются открытыми из-за семейных/прочих callbacks
и остатка lifecycle-приёмки. Подробный статус и следующие критерии: [статус
проекта](docs/project-status.md) и [план](TASKS.md).

PR #93 не слит в `main`. OAuth, настоящая миграция на staging, реальные устройства
и выпуск проверяются отдельно по [чек-листу релиза](RELEASE_CHECKLIST.md).
