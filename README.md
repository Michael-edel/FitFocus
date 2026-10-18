# FitFocus

FitFocus — прогрессивное веб-приложение для питания, привычек и личного
прогресса. В проекте есть дневник питания, анализ еды, цели и персональные
рекомендации, рецепты, личное и семейное меню, список покупок, напоминания и
интеграции с поддерживаемыми сервисами. Полный перечень функций и их статус —
в [PRODUCT.md](PRODUCT.md).

Обновлено: 18.10.2026. Текущий этап — стабилизация хранения пользовательских
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
Последний кодовый коммит — [`b69935b`](https://github.com/Michael-edel/FitFocus/commit/b69935b1b1163d52ee21967454c9986474d0409f):
тестовый mock недельного меню возвращает корректные same-origin CORS-заголовки
при 503 после reload. Exact [CI #1585](https://github.com/Michael-edel/FitFocus/actions/runs/39088517281)
на опубликованном родителе `e6612bc` прошёл audit, schema/privacy/auth/API,
1363 unit, три typecheck и build, но E2E завершился 995 passed / 299 skipped /
1 failed. Trace показал, что mock возвращал 503 без CORS-заголовков; durable
операция и тот же `opId` сохранились, повтор получил 200. Локально после фикса
сценарий прошёл 5/5 на iPhone PWA, весь `weekly-menu-durability` — 56/56 на
семи проектах без retries; typecheck и diff check прошли. Новый exact CI для
`b69935b` ещё не запущен. В плане остаются 33 пункта:
19 P0, 7 P1 и 7 следующих задач; staging, выпуск и интеграция PR #93 в защищённую
`main` не подтверждены.
Актуальные границы и подробные проверки см. в [статусе проекта](docs/project-status.md),
[журнале](docs/stabilization-progress.md) и [плане](TASKS.md).
