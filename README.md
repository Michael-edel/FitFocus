# FitFocus

FitFocus — прогрессивное веб-приложение для питания, привычек и личного
прогресса. В проекте есть дневник питания, анализ еды, цели и персональные
рекомендации, рецепты, личное и семейное меню, список покупок, напоминания и
интеграции с поддерживаемыми сервисами. Полный перечень функций и их статус —
в [PRODUCT.md](PRODUCT.md).

Обновлено: 14.10.2026. Текущий этап — стабилизация хранения пользовательских
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
| [docs/achievement-session.md](docs/achievement-session.md) | Сессия, очередь, scope HTTP и поздние ответы достижений |
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

Последняя кодовая ревизия [`010805f`](https://github.com/Michael-edel/FitFocus/commit/010805f447d49ff62f18f5e3a17b08d66f5edd63)
прошёл локальную browser acceptance для семейных и личных callbacks (30/30),
шесть новых account-switch сценариев (18/18) и целевые legacy-тесты (124/124).
При последней проверке точный [CI run `38528630120`](https://github.com/Michael-edel/FitFocus/actions/runs/38528630120)
выполнял E2E; полный статус и открытые проверки — в [сводке проекта](docs/project-status.md).

Последний завершённый полный CI на [`9bdeb47`](https://github.com/Michael-edel/FitFocus/commit/9bdeb47dfd21c5e5d5366bb5fe47f8e5862cda11) — [run `38459458051`](https://github.com/Michael-edel/FitFocus/actions/runs/38459458051) — завершился success: unit прошли во всех 198 файлах, 501 browser passed / 29 skipped, два E2E прошли retry как flaky; rollback/CAS-проверка прошла.

Локальный follow-up для двух flaky-сценариев прошёл: целевые повторы — 10/10, полные затронутые specs — 10/10 на Android PWA Chrome и 8/8 на iPhone PWA, `npm run typecheck` — успешно. Полный [CI run `38466153712`](https://github.com/Michael-edel/FitFocus/actions/runs/38466153712) для кодовой ревизии [`a99ab7b`](https://github.com/Michael-edel/FitFocus/commit/a99ab7beea367df76154faa53747aed2aa473d98) отменён после отправки следующего документационного коммита; актуальное состояние проверок текущего HEAD смотрите на [странице checks PR #93](https://github.com/Michael-edel/FitFocus/pull/93/checks). Cloudflare preview успешен, но это не production-релиз. Подробности и оставшиеся критерии — в [статусе проекта](docs/project-status.md), [журнале](docs/stabilization-progress.md) и [плане](TASKS.md).

PR #93 не слит в `main`. OAuth, настоящая миграция на staging, реальные устройства
и выпуск проверяются отдельно по [чек-листу релиза](RELEASE_CHECKLIST.md).
